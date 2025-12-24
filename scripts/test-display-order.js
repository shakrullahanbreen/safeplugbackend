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

// Test display order functionality
const testDisplayOrder = async () => {
  try {
    console.log("🧪 Testing display order functionality...\n");

    // Find a category with multiple products
    const categoryWithProducts = await Product.aggregate([
      { $match: { published: true, isDeleted: { $ne: true } } },
      { $group: { _id: "$category", count: { $sum: 1 } } },
      { $match: { count: { $gte: 3 } } },
      { $limit: 1 }
    ]);

    if (categoryWithProducts.length === 0) {
      console.log("❌ No category found with at least 3 products for testing");
      return;
    }

    const categoryId = categoryWithProducts[0]._id;
    const category = await Category.findById(categoryId);
    console.log(`📂 Testing with category: ${category.name} (${categoryId})`);

    // Get products in this category
    const products = await Product.find({
      category: categoryId,
      published: true,
      isDeleted: { $ne: true }
    }).sort({ displayOrder: 1 }).limit(5);

    console.log(`\n📋 Current products (showing first 5):`);
    products.forEach((product, index) => {
      console.log(`   ${index + 1}. ${product.name} - Display Order: ${product.displayOrder}`);
    });

    if (products.length < 3) {
      console.log("❌ Not enough products for testing");
      return;
    }

    // Test 1: Move a product to a different position
    console.log(`\n🔄 Test 1: Moving product "${products[0].name}" from position ${products[0].displayOrder} to position 3`);
    
    const productToMove = products[0];
    const newPosition = 3;
    
    // Update the product's display order
    await Product.findByIdAndUpdate(productToMove._id, { displayOrder: newPosition });
    
    // Get updated products
    const updatedProducts = await Product.find({
      category: categoryId,
      published: true,
      isDeleted: { $ne: true }
    }).sort({ displayOrder: 1 }).limit(5);

    console.log(`\n📋 After moving to position ${newPosition}:`);
    updatedProducts.forEach((product, index) => {
      const isMoved = product._id.toString() === productToMove._id.toString();
      console.log(`   ${index + 1}. ${product.name} - Display Order: ${product.displayOrder} ${isMoved ? '(MOVED)' : ''}`);
    });

    // Test 2: Verify no duplicate display orders
    console.log(`\n🔍 Test 2: Checking for duplicate display orders...`);
    const duplicateCheck = await Product.aggregate([
      { 
        $match: { 
          category: categoryId, 
          published: true, 
          isDeleted: { $ne: true } 
        } 
      },
      { 
        $group: { 
          _id: "$displayOrder", 
          count: { $sum: 1 },
          products: { $push: "$name" }
        } 
      },
      { $match: { count: { $gt: 1 } } }
    ]);

    if (duplicateCheck.length === 0) {
      console.log("✅ No duplicate display orders found");
    } else {
      console.log("❌ Duplicate display orders found:");
      duplicateCheck.forEach(dup => {
        console.log(`   Display Order ${dup._id}: ${dup.count} products - ${dup.products.join(', ')}`);
      });
    }

    // Test 3: Test deletion and reordering
    console.log(`\n🗑️  Test 3: Testing product deletion and reordering...`);
    
    // Get a product to delete (not the first one)
    const productToDelete = products[1];
    console.log(`   Deleting product: ${productToDelete.name} (Display Order: ${productToDelete.displayOrder})`);
    
    // Store original order for comparison
    const originalOrder = await Product.find({
      category: categoryId,
      published: true,
      isDeleted: { $ne: true }
    }).sort({ displayOrder: 1 }).select('name displayOrder');
    
    // Delete the product
    await Product.findByIdAndDelete(productToDelete._id);
    
    // Get products after deletion
    const afterDeletion = await Product.find({
      category: categoryId,
      published: true,
      isDeleted: { $ne: true }
    }).sort({ displayOrder: 1 }).select('name displayOrder');
    
    console.log(`\n📋 Before deletion:`);
    originalOrder.forEach((product, index) => {
      console.log(`   ${index + 1}. ${product.name} - Display Order: ${product.displayOrder}`);
    });
    
    console.log(`\n📋 After deletion:`);
    afterDeletion.forEach((product, index) => {
      console.log(`   ${index + 1}. ${product.name} - Display Order: ${product.displayOrder}`);
    });

    // Check if display orders are sequential
    const isSequential = afterDeletion.every((product, index) => product.displayOrder === index + 1);
    if (isSequential) {
      console.log("✅ Display orders are sequential after deletion");
    } else {
      console.log("❌ Display orders are not sequential after deletion");
    }

    console.log(`\n🎉 Display order testing completed!`);

  } catch (error) {
    console.error("❌ Test failed:", error);
    throw error;
  }
};

// Main execution
const main = async () => {
  try {
    await connectDB();
    await testDisplayOrder();
    console.log("\n✅ Test script completed successfully!");
  } catch (error) {
    console.error("❌ Test script failed:", error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log("🔌 Database connection closed");
    process.exit(0);
  }
};

// Run the test
main();
