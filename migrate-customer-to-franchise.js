import mongoose from 'mongoose';
import Product from './models/productModel.js';

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect('mongodb://eseek:Mami1122%40Babo%401122@31.220.89.146:27017/eseek?authSource=admin');
    console.log('Connected to MongoDB');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

const migrateCustomerToFranchise = async () => {
  try {
    console.log('🔍 Searching for products with Customer pricing...');
    
    // Find all products that have Customer pricing
    const productsWithCustomer = await Product.find({
      'pricing.Customer': { $exists: true }
    });
    
    console.log(`📊 Found ${productsWithCustomer.length} products with Customer pricing`);
    
    if (productsWithCustomer.length === 0) {
      console.log('✅ No products found with Customer pricing. Migration not needed.');
      return;
    }
    
    console.log('\n📋 Products to be migrated:');
    productsWithCustomer.forEach((product, index) => {
      console.log(`${index + 1}. ${product.name} (SKU: ${product.sku})`);
      console.log(`   Current Customer price: ${product.pricing.Customer?.price || 'N/A'}`);
    });
    
    console.log('\n🔄 Starting migration...');
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const product of productsWithCustomer) {
      try {
        // Create new pricing object with Franchise instead of Customer
        const newPricing = { ...product.pricing };
        
        // Move Customer price to Franchise
        if (newPricing.Customer) {
          newPricing.Franchise = { ...newPricing.Customer };
          delete newPricing.Customer;
        }
        
        // Update the product
        await Product.findByIdAndUpdate(
          product._id,
          { 
            pricing: newPricing,
            updatedAt: new Date()
          },
          { new: true }
        );
        
        console.log(`✅ Migrated: ${product.name} (SKU: ${product.sku})`);
        successCount++;
        
      } catch (error) {
        console.error(`❌ Error migrating ${product.name} (SKU: ${product.sku}):`, error.message);
        errorCount++;
      }
    }
    
    console.log('\n📊 Migration Summary:');
    console.log(`✅ Successfully migrated: ${successCount} products`);
    console.log(`❌ Failed migrations: ${errorCount} products`);
    
    // Verify migration
    console.log('\n🔍 Verifying migration...');
    const remainingCustomerProducts = await Product.find({
      'pricing.Customer': { $exists: true }
    });
    
    if (remainingCustomerProducts.length === 0) {
      console.log('✅ Migration completed successfully! No products with Customer pricing remain.');
    } else {
      console.log(`⚠️  Warning: ${remainingCustomerProducts.length} products still have Customer pricing`);
      remainingCustomerProducts.forEach(product => {
        console.log(`   - ${product.name} (SKU: ${product.sku})`);
      });
    }
    
    // Check for Franchise pricing
    const franchiseProducts = await Product.find({
      'pricing.Franchise': { $exists: true }
    });
    console.log(`📈 Products with Franchise pricing: ${franchiseProducts.length}`);
    
  } catch (error) {
    console.error('Migration error:', error);
    throw error;
  }
};

const main = async () => {
  try {
    await connectDB();
    await migrateCustomerToFranchise();
    console.log('\n🎉 Migration process completed!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
};

main();
