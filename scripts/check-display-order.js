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

// Check display order distribution
const checkDisplayOrderDistribution = async () => {
  try {
    console.log("🔍 Checking display order distribution...\n");

    // Get all categories
    const categories = await Category.find({}).lean();
    console.log(`📁 Found ${categories.length} categories\n`);

    for (const category of categories) {
      console.log(`📂 Category: ${category.name} (${category._id})`);
      
      // Check main category products
      const mainCategoryProducts = await Product.find({
        category: category._id,
        published: true,
        isDeleted: { $ne: true }
      }).sort({ displayOrder: 1 }).select('name displayOrder createdAt');

      if (mainCategoryProducts.length > 0) {
        console.log(`   Main Category Products (${mainCategoryProducts.length}):`);
        const displayOrderCounts = {};
        mainCategoryProducts.forEach(product => {
          const order = product.displayOrder || 0;
          displayOrderCounts[order] = (displayOrderCounts[order] || 0) + 1;
          console.log(`     - ${product.name}: Display Order ${order} (Created: ${product.createdAt})`);
        });
        
        console.log(`   Display Order Distribution:`);
        Object.entries(displayOrderCounts).forEach(([order, count]) => {
          console.log(`     Order ${order}: ${count} products`);
        });
        
        // Check for duplicates
        const duplicates = Object.entries(displayOrderCounts).filter(([order, count]) => count > 1);
        if (duplicates.length > 0) {
          console.log(`   ⚠️  DUPLICATE DISPLAY ORDERS FOUND:`);
          duplicates.forEach(([order, count]) => {
            console.log(`     Order ${order}: ${count} products (SHOULD BE 1)`);
          });
        } else {
          console.log(`   ✅ No duplicate display orders`);
        }
      }

      // Check subcategory products
      const subCategoryProducts = await Product.find({
        subCategory: category._id,
        published: true,
        isDeleted: { $ne: true }
      }).sort({ displayOrder: 1 }).select('name displayOrder createdAt');

      if (subCategoryProducts.length > 0) {
        console.log(`   SubCategory Products (${subCategoryProducts.length}):`);
        const subDisplayOrderCounts = {};
        subCategoryProducts.forEach(product => {
          const order = product.displayOrder || 0;
          subDisplayOrderCounts[order] = (subDisplayOrderCounts[order] || 0) + 1;
          console.log(`     - ${product.name}: Display Order ${order} (Created: ${product.createdAt})`);
        });
        
        console.log(`   SubCategory Display Order Distribution:`);
        Object.entries(subDisplayOrderCounts).forEach(([order, count]) => {
          console.log(`     Order ${order}: ${count} products`);
        });
        
        // Check for duplicates
        const subDuplicates = Object.entries(subDisplayOrderCounts).filter(([order, count]) => count > 1);
        if (subDuplicates.length > 0) {
          console.log(`   ⚠️  DUPLICATE DISPLAY ORDERS IN SUBCATEGORY:`);
          subDuplicates.forEach(([order, count]) => {
            console.log(`     Order ${order}: ${count} products (SHOULD BE 1)`);
          });
        } else {
          console.log(`   ✅ No duplicate display orders in subcategory`);
        }
      }

      console.log(""); // Empty line for readability
    }

    // Overall statistics
    console.log("📊 OVERALL STATISTICS:");
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
      console.log(`\n❌ FOUND ${totalDuplicates} DISPLAY ORDERS WITH DUPLICATES!`);
    } else {
      console.log(`\n✅ No duplicate display orders found across all products`);
    }

  } catch (error) {
    console.error("❌ Error checking display order:", error);
    throw error;
  }
};

// Main execution
const main = async () => {
  try {
    await connectDB();
    await checkDisplayOrderDistribution();
    console.log("\n✅ Display order check completed!");
  } catch (error) {
    console.error("❌ Check failed:", error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log("🔌 Database connection closed");
    process.exit(0);
  }
};

// Run the check
main();
