import mongoose from "mongoose";
import Product from "../models/productModel.js";
import Category from "../models/categoryModel.js";

// Database connection
const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || "mongodb://eseek:Mami1122%40Babo%401122@31.220.89.146:27017/eseek?authSource=admin";
    console.log("🔌 Connecting to MongoDB...");
    await mongoose.connect(mongoUri);
    console.log("✅ Connected to MongoDB");
    console.log(`📊 Database: ${mongoose.connection.db.databaseName}`);
  } catch (error) {
    console.error("❌ MongoDB connection error:", error);
    process.exit(1);
  }
};

// Fix display order for all products
const fixDisplayOrder = async () => {
  try {
    console.log("🔧 Starting display order fix...\n");

    // Get all categories
    const categories = await Category.find({}).lean();
    console.log(`📁 Found ${categories.length} categories\n`);

    let totalFixed = 0;

    for (const category of categories) {
      console.log(`📂 Processing Category: ${category.name} (${category._id})`);
      
      // Fix main category products
      const mainCategoryProducts = await Product.find({
        category: category._id,
        published: true,
        isDeleted: { $ne: true }
      }).sort({ createdAt: 1 }); // Sort by creation date

      if (mainCategoryProducts.length > 0) {
        console.log(`   Main Category Products: ${mainCategoryProducts.length}`);
        
        // Reassign display order sequentially starting from 1
        for (let i = 0; i < mainCategoryProducts.length; i++) {
          const product = mainCategoryProducts[i];
          const newDisplayOrder = i + 1;
          
          await Product.findByIdAndUpdate(product._id, { 
            displayOrder: newDisplayOrder 
          });
          
          console.log(`     - ${product.name}: ${product.displayOrder} → ${newDisplayOrder}`);
        }
        
        totalFixed += mainCategoryProducts.length;
        console.log(`   ✅ Fixed ${mainCategoryProducts.length} main category products`);
      }

      // Fix subcategory products
      const subCategoryProducts = await Product.find({
        subCategory: category._id,
        published: true,
        isDeleted: { $ne: true }
      }).sort({ createdAt: 1 }); // Sort by creation date

      if (subCategoryProducts.length > 0) {
        console.log(`   SubCategory Products: ${subCategoryProducts.length}`);
        
        // Reassign display order sequentially starting from 1
        for (let i = 0; i < subCategoryProducts.length; i++) {
          const product = subCategoryProducts[i];
          const newDisplayOrder = i + 1;
          
          await Product.findByIdAndUpdate(product._id, { 
            displayOrder: newDisplayOrder 
          });
          
          console.log(`     - ${product.name}: ${product.displayOrder} → ${newDisplayOrder}`);
        }
        
        totalFixed += subCategoryProducts.length;
        console.log(`   ✅ Fixed ${subCategoryProducts.length} subcategory products`);
      }

      console.log(""); // Empty line for readability
    }

    console.log(`🎉 Display order fix completed!`);
    console.log(`📊 Total products fixed: ${totalFixed}`);

    // Verify the fix
    console.log("\n🔍 Verification...");
    const allProducts = await Product.find({
      published: true,
      isDeleted: { $ne: true }
    }).select('displayOrder category subCategory');

    const overallCounts = {};
    allProducts.forEach(product => {
      const order = product.displayOrder || 0;
      overallCounts[order] = (overallCounts[order] || 0) + 1;
    });

    console.log("Display Order Distribution (All Products):");
    Object.entries(overallCounts)
      .sort(([a], [b]) => parseInt(a) - parseInt(b))
      .forEach(([order, count]) => {
        console.log(`  Order ${order}: ${count} products`);
      });

    const totalDuplicates = Object.entries(overallCounts).filter(([order, count]) => count > 1).length;
    if (totalDuplicates > 0) {
      console.log(`\n❌ STILL FOUND ${totalDuplicates} DISPLAY ORDERS WITH DUPLICATES!`);
    } else {
      console.log(`\n✅ No duplicate display orders found! All products properly ordered within categories.`);
    }

  } catch (error) {
    console.error("❌ Error fixing display order:", error);
    throw error;
  }
};

// Main execution
const main = async () => {
  try {
    await connectDB();
    await fixDisplayOrder();
    console.log("\n✅ Display order fix completed successfully!");
  } catch (error) {
    console.error("❌ Fix failed:", error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log("🔌 Database connection closed");
    process.exit(0);
  }
};

// Run the fix
main();
