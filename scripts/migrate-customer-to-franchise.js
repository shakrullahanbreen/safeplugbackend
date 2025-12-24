#!/usr/bin/env node

/**
 * Migration Script: Replace "Customer" user type with "Franchise"
 * 
 * This script updates all users in the database who have the role "Customer"
 * to have the role "Franchise" instead.
 * 
 * Usage: node scripts/migrate-customer-to-franchise.js
 */

import mongoose from "mongoose";
import User from "../models/userModel.js";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/eseek";

async function migrateCustomerToFranchise() {
  try {
    console.log("🔄 Starting migration: Customer → Franchise");
    
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log("✅ Connected to MongoDB");

    // Find all users with role "Customer"
    const customers = await User.find({ 
      $or: [
        { role: "Customer" },
        { businessType: "Customer" }
      ]
    });

    console.log(`📊 Found ${customers.length} users with "Customer" role`);

    if (customers.length === 0) {
      console.log("ℹ️  No users found with 'Customer' role. Migration not needed.");
      return;
    }

    // Update all customers to franchise
    const updateResult = await User.updateMany(
      { 
        $or: [
          { role: "Customer" },
          { businessType: "Customer" }
        ]
      },
      { 
        $set: { 
          role: "Franchise",
          businessType: "Franchise"
        }
      }
    );

    console.log(`✅ Successfully updated ${updateResult.modifiedCount} users from "Customer" to "Franchise"`);

    // Verify the migration
    const remainingCustomers = await User.find({ 
      $or: [
        { role: "Customer" },
        { businessType: "Customer" }
      ]
    });

    if (remainingCustomers.length === 0) {
      console.log("✅ Migration completed successfully! No users with 'Customer' role remain.");
    } else {
      console.log(`⚠️  Warning: ${remainingCustomers.length} users still have 'Customer' role`);
    }

    // Show some statistics
    const franchiseCount = await User.countDocuments({ role: "Franchise" });
    console.log(`📈 Total users with 'Franchise' role: ${franchiseCount}`);

  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  } finally {
    // Close database connection
    await mongoose.disconnect();
    console.log("🔌 Disconnected from MongoDB");
  }
}

// Run the migration
migrateCustomerToFranchise()
  .then(() => {
    console.log("🎉 Migration script completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("💥 Migration script failed:", error);
    process.exit(1);
  });
