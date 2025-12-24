import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: 10000,
})
.then(async () => {
  console.log("Connected to MongoDB");
  
  const db = mongoose.connection.db;
  
  // Add indexes for Product collection
  const productIndexes = [
    // Basic query indexes
    { key: { published: 1, isDeleted: 1 } },
    { key: { category: 1, published: 1, isDeleted: 1 } },
    { key: { subCategory: 1, published: 1, isDeleted: 1 } },
    { key: { brand: 1, published: 1, isDeleted: 1 } },
    
    // Sorting indexes
    { key: { displayOrder: 1 } },
    { key: { createdAt: -1 } },
    { key: { price: 1 } },
    { key: { name: 1 } },
    { key: { stock: 1 } },
    
    // Search indexes
    { key: { name: "text", description: "text", sku: "text" } },
    { key: { tags: 1 } },
    
    // Filtering indexes
    { key: { featured: 1, published: 1 } },
    { key: { mostSold: 1, published: 1 } },
    { key: { mostPopular: 1, published: 1 } },
    
    // Compound indexes for common queries
    { key: { category: 1, published: 1, displayOrder: 1 } },
    { key: { published: 1, displayOrder: 1, createdAt: -1 } },
    { key: { category: 1, brand: 1, published: 1 } },
    
    // Price range queries
    { key: { price: 1, published: 1, isDeleted: 1 } },
  ];
  
  try {
    console.log("Creating Product indexes...");
    await db.collection("products").createIndexes(productIndexes);
    console.log("✅ Product indexes created successfully");
  } catch (error) {
    console.error("❌ Error creating Product indexes:", error);
  }
  
  // Add indexes for Category collection
  const categoryIndexes = [
    { key: { name: 1 } },
    { key: { parentId: 1 } },
    { key: { published: 1 } },
  ];
  
  try {
    console.log("Creating Category indexes...");
    await db.collection("categories").createIndexes(categoryIndexes);
    console.log("✅ Category indexes created successfully");
  } catch (error) {
    console.error("❌ Error creating Category indexes:", error);
  }
  
  // Add indexes for Brand collection
  const brandIndexes = [
    { key: { name: 1 } },
    { key: { published: 1 } },
  ];
  
  try {
    console.log("Creating Brand indexes...");
    await db.collection("brands").createIndexes(brandIndexes);
    console.log("✅ Brand indexes created successfully");
  } catch (error) {
    console.error("❌ Error creating Brand indexes:", error);
  }
  
  console.log("🎉 All indexes created successfully!");
  process.exit(0);
})
.catch((err) => {
  console.error("Failed to connect to MongoDB:", err.message);
  process.exit(1);
});
