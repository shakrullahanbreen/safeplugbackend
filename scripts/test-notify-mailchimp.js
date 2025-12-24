import dotenv from 'dotenv';
import { addOrUpdateMember } from '../utils/mailchimpService.js';
import User from '../models/userModel.js';
import mongoose from 'mongoose';

// Load environment variables
dotenv.config();

async function testNotifyMeMailchimpIntegration() {
  console.log('🧪 Testing Notify Me Mailchimp Integration...\n');

  // Connect to database
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to database');
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    return;
  }

  // Test 1: Test with existing user email
  console.log('1. Testing with existing user email...');
  try {
    const existingUser = await User.findOne({ email: 'anbreen.shakrullah@gmail.com' });
    if (existingUser) {
      console.log('✅ Found existing user:', existingUser.email);
      console.log('   This email should NOT be added to Mailchimp again via notify me');
    } else {
      console.log('❌ No existing user found with this email');
    }
  } catch (error) {
    console.error('❌ Error checking existing user:', error);
  }

  // Test 2: Test with new email (not in database)
  console.log('\n2. Testing with new email (not in database)...');
  const newEmail = 'newcustomer@example.com';
  
  try {
    const existingUser = await User.findOne({ email: newEmail });
    if (!existingUser) {
      console.log('✅ Email not found in database, simulating notify me flow...');
      
      // Simulate the notify me flow
      const mailchimpData = {
        email: newEmail,
        firstName: '', // We don't have this info from notify me
        lastName: '', // We don't have this info from notify me
        role: 'Potential Customer', // Tag as potential customer
        companyName: '',
        phone: '',
        city: '',
        state: '',
        postalCode: ''
      };
      
      const addResult = await addOrUpdateMember(mailchimpData);
      if (addResult.success) {
        console.log('✅ New email added to Mailchimp via notify me!');
        console.log('   Action:', addResult.action);
        console.log('   Tag: Potential Customer');
      } else {
        console.log('❌ Failed to add new email to Mailchimp:', addResult.error);
      }
    } else {
      console.log('❌ Email already exists in database, should not be added to Mailchimp');
    }
  } catch (error) {
    console.error('❌ Error testing new email flow:', error);
  }

  // Test 3: Test with another new email
  console.log('\n3. Testing with another new email...');
  const anotherNewEmail = 'interested.buyer@test.com';
  
  try {
    const existingUser = await User.findOne({ email: anotherNewEmail });
    if (!existingUser) {
      console.log('✅ Email not found in database, simulating notify me flow...');
      
      const mailchimpData = {
        email: anotherNewEmail,
        firstName: '',
        lastName: '',
        role: 'Potential Customer',
        companyName: '',
        phone: '',
        city: '',
        state: '',
        postalCode: ''
      };
      
      const addResult = await addOrUpdateMember(mailchimpData);
      if (addResult.success) {
        console.log('✅ Another new email added to Mailchimp via notify me!');
        console.log('   Action:', addResult.action);
        console.log('   Tag: Potential Customer');
      } else {
        console.log('❌ Failed to add another new email to Mailchimp:', addResult.error);
      }
    } else {
      console.log('❌ Email already exists in database');
    }
  } catch (error) {
    console.error('❌ Error testing another new email flow:', error);
  }

  console.log('\n🎉 Notify Me Mailchimp integration test completed!');
  
  // Close database connection
  await mongoose.connection.close();
  console.log('✅ Database connection closed');
}

// Run the test
testNotifyMeMailchimpIntegration().catch(console.error);

