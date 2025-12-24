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
  
  // Compound indexes optimized for special products queries
  const specialProductsIndexes = [
    // These match the exact query pattern: published + mostSold/mostPopular/featured + isDeleted + category
    { 
      key: { published: 1, mostSold: 1, isDeleted: 1, category: 1 },
      name: "published_mostSold_isDeleted_category"
    },
    { 
      key: { published: 1, mostPopular: 1, isDeleted: 1, category: 1 },
      name: "published_mostPopular_isDeleted_category"
    },
    { 
      key: { published: 1, featured: 1, isDeleted: 1, category: 1 },
      name: "published_featured_isDeleted_category"
    },
    { 
      key: { published: 1, mostSold: 1, isDeleted: 1, subCategory: 1 },
      name: "published_mostSold_isDeleted_subCategory"
    },
    { 
      key: { published: 1, mostPopular: 1, isDeleted: 1, subCategory: 1 },
      name: "published_mostPopular_isDeleted_subCategory"
    },
    { 
      key: { published: 1, featured: 1, isDeleted: 1, subCategory: 1 },
      name: "published_featured_isDeleted_subCategory"
    },
  ];
  
  try {
    console.log("Creating special products indexes...");
    await db.collection("products").createIndexes(specialProductsIndexes);
    console.log("✅ Special products indexes created successfully");
    console.log("\nIndexes created:");
    specialProductsIndexes.forEach(idx => {
      console.log(`  - ${idx.name}`);
    });
  } catch (error) {
    console.error("❌ Error creating special products indexes:", error);
  }
  
  mongoose.connection.close();
  console.log("\n✅ Done!");
})
.catch((error) => {
  console.error("❌ Error connecting to MongoDB:", error);
  process.exit(1);
});
