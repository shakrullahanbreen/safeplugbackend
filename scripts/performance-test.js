import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const BASE_URL = process.env.NEXT_PUBLIC_SERVER_BASE_URL || 'http://localhost:5000';

// Performance test function
async function testApiPerformance() {
  console.log("🚀 Starting API Performance Test...\n");
  
  const tests = [
    {
      name: "Get All Products (Public)",
      url: "/api/products",
      method: "GET",
      params: { page: 1, limit: 20 }
    },
    {
      name: "Get Admin Products",
      url: "/api/products/admin",
      method: "GET", 
      params: { page: 1, limit: 10, sort: "createdAt", order: "desc" }
    },
    {
      name: "Get Categories",
      url: "/api/categories",
      method: "GET"
    },
    {
      name: "Get Brands",
      url: "/api/brands",
      method: "GET"
    }
  ];

  for (const test of tests) {
    console.log(`Testing: ${test.name}`);
    
    try {
      const startTime = Date.now();
      
      const response = await axios({
        url: `${BASE_URL}${test.url}`,
        method: test.method,
        params: test.params,
        timeout: 30000
      });
      
      const endTime = Date.now();
      const responseTime = endTime - startTime;
      
      console.log(`✅ Status: ${response.status}`);
      console.log(`⏱️  Response Time: ${responseTime}ms`);
      console.log(`📊 Data Size: ${JSON.stringify(response.data).length} bytes`);
      
      if (responseTime > 2000) {
        console.log(`⚠️  WARNING: Slow response time (${responseTime}ms)`);
      }
      
    } catch (error) {
      console.log(`❌ Error: ${error.message}`);
      if (error.response) {
        console.log(`   Status: ${error.response.status}`);
        console.log(`   Data: ${JSON.stringify(error.response.data)}`);
      }
    }
    
    console.log("─".repeat(50));
  }
  
  console.log("\n🎯 Performance Test Complete!");
}

// Run the test
testApiPerformance().catch(console.error);
