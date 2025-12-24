import dotenv from 'dotenv';
import { testConnection, addOrUpdateMember, updateUserRole } from '../utils/mailchimpService.js';

// Load environment variables
dotenv.config();

async function testMailchimpIntegration() {
  console.log('🧪 Testing Mailchimp Integration...\n');

  // Test 1: Connection Test
  console.log('1. Testing Mailchimp Connection...');
  const connectionTest = await testConnection();
  if (connectionTest.success) {
    console.log('✅ Connection successful!');
    console.log('Response:', connectionTest.response);
  } else {
    console.log('❌ Connection failed:', connectionTest.error);
    return;
  }

  console.log('\n2. Testing Member Addition...');
  
  // Test 2: Add Test Member
  const testUser = {
    email: 'anbreen.shakrullah@gmail.com',
    firstName: 'Anbreen',
    lastName: 'Shakrullah',
    role: 'Retailer',
    companyName: 'Test Company',
    phone: '123-456-7890',
    city: 'Test City',
    state: 'Test State',
    postalCode: '12345'
  };

  const addResult = await addOrUpdateMember(testUser);
  if (addResult.success) {
    console.log('✅ Test member added successfully!');
    console.log('Action:', addResult.action);
  } else {
    console.log('❌ Failed to add test member:', addResult.error);
  }

  console.log('\n3. Testing Role Update...');
  
  // Test 3: Update Role
  const roleUpdateResult = await updateUserRole('anbreen.shakrullah@gmail.com', 'Wholesale');
  if (roleUpdateResult.success) {
    console.log('✅ Role updated successfully!');
    console.log('Action:', roleUpdateResult.action);
  } else {
    console.log('❌ Failed to update role:', roleUpdateResult.error);
  }

  console.log('\n🎉 Mailchimp integration test completed!');
}

// Run the test
testMailchimpIntegration().catch(console.error);
