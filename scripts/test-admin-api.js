import axios from "axios";

const API_BASE_URL = "http://localhost:5000/api";

// Test admin API endpoints
async function testAdminAPI() {
    try {
        console.log("Testing Admin Video API...\n");

        // Test 1: Get all videos (admin endpoint - requires auth)
        console.log("1. Testing GET /api/videos (admin endpoint)");
        try {
            const response = await axios.get(`${API_BASE_URL}/videos`, {
                headers: {
                    "x-access-token": "dummy-token", // This will fail but we can see the response
                    "Content-Type": "application/json"
                }
            });
            console.log("✅ Success:", response.data);
        } catch (error) {
            console.log("❌ Expected auth error:", error.response?.data?.message || error.message);
        }

        // Test 2: Get public videos (no auth required)
        console.log("\n2. Testing GET /api/videos/public");
        try {
            const response = await axios.get(`${API_BASE_URL}/videos/public`);
            console.log("✅ Success:", response.data);
        } catch (error) {
            console.log("❌ Error:", error.response?.data?.message || error.message);
        }

        // Test 3: Create a new video (admin endpoint - requires auth)
        console.log("\n3. Testing POST /api/videos (admin endpoint)");
        const newVideo = {
            title: "Test Video from API",
            description: "This is a test video created via API",
            url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            category: "Tutorial",
            isActive: true,
            order: 4
        };

        try {
            const response = await axios.post(`${API_BASE_URL}/videos`, newVideo, {
                headers: {
                    "x-access-token": "dummy-token", // This will fail but we can see the response
                    "Content-Type": "application/json"
                }
            });
            console.log("✅ Success:", response.data);
        } catch (error) {
            console.log("❌ Expected auth error:", error.response?.data?.message || error.message);
        }

        console.log("\n✅ API testing completed!");
        console.log("\n📝 Note: Admin endpoints require valid authentication token.");
        console.log("   Public endpoints work without authentication.");

    } catch (error) {
        console.error("❌ Test failed:", error.message);
    }
}

testAdminAPI();
