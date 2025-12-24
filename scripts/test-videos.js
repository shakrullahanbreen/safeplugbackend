import mongoose from "mongoose";
import Video from "../models/videoModel.js";
import dotenv from "dotenv";

dotenv.config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log("Connected to MongoDB"))
    .catch((err) => console.error(err));

// Sample videos data
const sampleVideos = [
    {
        title: "Build Your Own YouTube Studio",
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        isActive: true,
        order: 1,
        createdBy: new mongoose.Types.ObjectId(), // Dummy user ID
    },
    {
        title: "Save Up to 70% on Equipment",
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        isActive: true,
        order: 2,
        createdBy: new mongoose.Types.ObjectId(), // Dummy user ID
    },
    {
        title: "Professional Camera Setup Guide",
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        isActive: false, // This one will not appear in public videos
        order: 3,
        createdBy: new mongoose.Types.ObjectId(), // Dummy user ID
    }
];

async function addSampleVideos() {
    try {
        // Clear existing videos
        await Video.deleteMany({});
        console.log("Cleared existing videos");

        // Add sample videos
        const videos = await Video.insertMany(sampleVideos);
        console.log(`Added ${videos.length} sample videos:`);
        
        videos.forEach((video, index) => {
            console.log(`${index + 1}. ${video.title} - ${video.isActive ? 'Published' : 'Draft'}`);
        });

        // Test the public API
        console.log("\nTesting public API...");
        const publicVideos = await Video.find({ isActive: true }).sort({ order: 1 }).limit(2);
        console.log(`Found ${publicVideos.length} active videos for public display`);

        process.exit(0);
    } catch (error) {
        console.error("Error adding sample videos:", error);
        process.exit(1);
    }
}

addSampleVideos();
