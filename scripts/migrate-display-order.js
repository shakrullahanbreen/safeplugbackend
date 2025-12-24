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

// Migration function to populate displayOrder for existing products
const migrateDisplayOrder = async () => {
  try {
    console.log("🚀 Starting displayOrder migration...");

    // Get all categories
    const categories = await Category.find({}).lean();
    console.log(`📁 Found ${categories.length} categories`);

    let totalUpdated = 0;

    // Process each category
    for (const category of categories) {
      console.log(`\n📂 Processing category: ${category.name} (${category._id})`);

      // Get all products in this category (including subcategories)
      const categoryProducts = await Product.find({
        $or: [
          { category: category._id },
          { subCategory: category._id }
        ],
        published: true, // Only published products
        isDeleted: { $ne: true } // Exclude soft-deleted products
      }).sort({ createdAt: 1 }); // Sort by creation time (oldest first)

      console.log(`   Found ${categoryProducts.length} products in this category`);

      if (categoryProducts.length === 0) {
        continue;
      }

      // Update displayOrder based on creation time
      const updatePromises = categoryProducts.map(async (product, index) => {
        const displayOrder = index + 1; // Start from 1
        
        return Product.findByIdAndUpdate(
          product._id,
          { displayOrder },
          { new: false } // Don't return the updated document for performance
        );
      });

      // Execute all updates for this category
      await Promise.all(updatePromises);
      
      console.log(`   ✅ Updated ${categoryProducts.length} products with displayOrder 1-${categoryProducts.length}`);
      totalUpdated += categoryProducts.length;
    }

    // Handle products without category or with invalid category
    console.log("\n🔍 Processing products without valid category...");
    const orphanProducts = await Product.find({
      $or: [
        { category: { $exists: false } },
        { category: null },
        { category: { $nin: categories.map(c => c._id) } }
      ],
      published: true,
      isDeleted: { $ne: true }
    }).sort({ createdAt: 1 });

    if (orphanProducts.length > 0) {
      console.log(`   Found ${orphanProducts.length} orphan products`);
      
      const orphanUpdatePromises = orphanProducts.map(async (product, index) => {
        const displayOrder = index + 1;
        
        return Product.findByIdAndUpdate(
          product._id,
          { displayOrder },
          { new: false }
        );
      });

      await Promise.all(orphanUpdatePromises);
      console.log(`   ✅ Updated ${orphanProducts.length} orphan products with displayOrder 1-${orphanProducts.length}`);
      totalUpdated += orphanProducts.length;
    }

    console.log(`\n🎉 Migration completed successfully!`);
    console.log(`📊 Total products updated: ${totalUpdated}`);

    // Verify the migration
    const productsWithDisplayOrder = await Product.countDocuments({
      displayOrder: { $exists: true, $ne: null },
      published: true,
      isDeleted: { $ne: true }
    });
    
    const totalPublishedProducts = await Product.countDocuments({
      published: true,
      isDeleted: { $ne: true }
    });

    console.log(`\n🔍 Verification:`);
    console.log(`   Products with displayOrder: ${productsWithDisplayOrder}`);
    console.log(`   Total published products: ${totalPublishedProducts}`);
    
    if (productsWithDisplayOrder === totalPublishedProducts) {
      console.log(`✅ All products have displayOrder assigned!`);
    } else {
      console.log(`⚠️  Some products might be missing displayOrder`);
    }

  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw error;
  }
};

// Main execution
const main = async () => {
  try {
    await connectDB();
    await migrateDisplayOrder();
    console.log("\n✅ Migration script completed successfully!");
  } catch (error) {
    console.error("❌ Migration script failed:", error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log("🔌 Database connection closed");
    process.exit(0);
  }
};

// Run the migration
main();
