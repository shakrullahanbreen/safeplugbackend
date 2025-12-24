import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: 10000,
})
.then(async () => {
  console.log("Connected to MongoDB\n");
  
  const db = mongoose.connection.db;
  const collection = db.collection("products");
  
  // Get all indexes
  const indexes = await collection.indexes();
  
  console.log("📊 Current indexes on 'products' collection:\n");
  
  // Check for special products indexes
  const requiredIndexes = [
    { key: { published: 1, mostSold: 1, isDeleted: 1, category: 1 } },
    { key: { published: 1, mostPopular: 1, isDeleted: 1, category: 1 } },
    { key: { published: 1, featured: 1, isDeleted: 1, category: 1 } },
    { key: { published: 1, mostSold: 1, isDeleted: 1, subCategory: 1 } },
    { key: { published: 1, mostPopular: 1, isDeleted: 1, subCategory: 1 } },
    { key: { published: 1, featured: 1, isDeleted: 1, subCategory: 1 } },
  ];
  
  let foundCount = 0;
  
  for (const requiredIdx of requiredIndexes) {
    const requiredKey = JSON.stringify(requiredIdx.key);
    const found = indexes.find(idx => {
      const idxKey = JSON.stringify(idx.key);
      return idxKey === requiredKey;
    });
    
    if (found) {
      console.log(`✅ Found: ${found.name || 'unnamed'}`);
      console.log(`   Key: ${JSON.stringify(found.key)}`);
      foundCount++;
    } else {
      console.log(`❌ Missing: ${JSON.stringify(requiredIdx.key)}`);
    }
  }
  
  console.log(`\n📈 Summary: ${foundCount}/${requiredIndexes.length} special products indexes found`);
  
  if (foundCount === requiredIndexes.length) {
    console.log("\n✅ All required indexes are present! The special products API should be optimized.");
  } else {
    console.log("\n⚠️  Some indexes are missing. They may be created automatically when the model loads.");
    console.log("   If issues persist, try restarting the backend server.");
  }
  
  mongoose.connection.close();
  console.log("\n✅ Done!");
})
.catch((error) => {
  console.error("❌ Error connecting to MongoDB:", error);
  process.exit(1);
});

