import mongoose from "mongoose";

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

// Debug function to check database contents
const debugDatabase = async () => {
  try {
    console.log("🔍 Debugging database contents...\n");

    // List all collections
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log("📁 Available collections:");
    collections.forEach(collection => {
      console.log(`   - ${collection.name}`);
    });

    // Check products collection
    const Product = mongoose.model("Product", new mongoose.Schema({}, { strict: false }));
    const productCount = await Product.countDocuments();
    console.log(`\n📦 Products collection: ${productCount} documents`);

    if (productCount > 0) {
      // Sample a few products
      const sampleProducts = await Product.find({}).limit(3).lean();
      console.log("\n📋 Sample products:");
      sampleProducts.forEach((product, index) => {
        console.log(`   ${index + 1}. ${product.name || 'No name'} (ID: ${product._id})`);
        console.log(`      - Published: ${product.published}`);
        console.log(`      - Category: ${product.category}`);
        console.log(`      - Created: ${product.createdAt}`);
        console.log(`      - DisplayOrder: ${product.displayOrder}`);
      });
    }

    // Check categories collection
    const Category = mongoose.model("Category", new mongoose.Schema({}, { strict: false }));
    const categoryCount = await Category.countDocuments();
    console.log(`\n📂 Categories collection: ${categoryCount} documents`);

    if (categoryCount > 0) {
      // Sample a few categories
      const sampleCategories = await Category.find({}).limit(3).lean();
      console.log("\n📋 Sample categories:");
      sampleCategories.forEach((category, index) => {
        console.log(`   ${index + 1}. ${category.name || 'No name'} (ID: ${category._id})`);
        console.log(`      - Level: ${category.level}`);
        console.log(`      - Parent: ${category.parentId}`);
        console.log(`      - DisplayOrder: ${category.displayOrder}`);
      });
    }

    // Check for published products specifically
    const publishedProducts = await Product.countDocuments({ published: true });
    console.log(`\n✅ Published products: ${publishedProducts}`);

    // Check for products with displayOrder
    const productsWithDisplayOrder = await Product.countDocuments({ displayOrder: { $exists: true } });
    console.log(`📊 Products with displayOrder: ${productsWithDisplayOrder}`);

    // Check database name
    console.log(`\n🗄️  Database name: ${mongoose.connection.db.databaseName}`);

  } catch (error) {
    console.error("❌ Debug failed:", error);
    throw error;
  }
};

// Main execution
const main = async () => {
  try {
    await connectDB();
    await debugDatabase();
    console.log("\n✅ Debug completed successfully!");
  } catch (error) {
    console.error("❌ Debug failed:", error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log("🔌 Database connection closed");
    process.exit(0);
  }
};

// Run the debug
main();
