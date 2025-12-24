import { generateUploadUrl, generateDownloadUrl, deleteFile } from "../utils/s3.js";
import { S3Client } from "@aws-sdk/client-s3";
import dotenv from "dotenv";

dotenv.config();

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY,
  },
  forcePathStyle: true,
});

// Controller: Generate Upload Pre-Signed URL
export const getUploadUrl = async (req, res) => {
  try {
    const { fileName, fileType } = req.body;
    console.log('Upload request:', { fileName, fileType });
    
    if (!fileName) {
      return res.status(400).json({ error: "fileName is required." });
    }
    if (!fileType) {
      return res.status(400).json({ error: "fileType is required." });
    }
    const url = await generateUploadUrl(fileName, fileType);
    console.log('Generated URL:', url);
    res.json({ url });
  } catch (error) {
    console.error("Error generating upload URL:", error);
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
};

// Controller: Generate Download Pre-Signed URL
export const getDownloadUrl = async (req, res) => {
  try {
    const { fileName, fileType } = req.body;
    if (!fileName) {
      return res.status(400).json({ error: "fileName is required." });
    }
    if (!fileType) {
      return res.status(400).json({ error: "fileType is required." });
    }
    const url = await generateDownloadUrl(fileName, fileType);
    res.json({ url });
  } catch (error) {
    console.error("Error generating download URL:", error);
    res.status(500).json({ error: "Failed to generate download URL" });
  }
};

export const deleteImage = async (req, res) => {
  try {
    const { fileName, fileType } = req.body;
    if (!fileName) {
      return res.status(400).json({ error: "fileName is required." });
    }
    if (!fileType) {
      return res.status(400).json({ error: "fileType is required." });
    }
    await deleteFile(fileName, fileType);
    res.json({ message: "Image deleted successfully" });
  } catch (error) {
    console.error("Error deleting image:", error);
    res.status(500).json({ error: "Failed to delete image" });
  }
};

// Controller: Delete image from all products and S3
export const deleteImageCompletely = async (req, res) => {
  try {
    const { fileName, fileType, imageUrl } = req.body;
    
    if (!fileName) {
      return res.status(400).json({ error: "fileName is required." });
    }
    if (!fileType) {
      return res.status(400).json({ error: "fileType is required." });
    }
    if (!imageUrl) {
      return res.status(400).json({ error: "imageUrl is required." });
    }

    // Import models dynamically to avoid circular dependencies
    const { default: Product } = await import("../models/productModel.js");
    const { default: Category } = await import("../models/categoryModel.js");

    let deletedFromProducts = 0;
    let deletedFromCategories = 0;

    // Find and update all products that use this image
    const products = await Product.find({
      $or: [
        { image: imageUrl },
        { "images.preview": imageUrl },
        { "images.url": imageUrl }
      ]
    });

    for (const product of products) {
      let updated = false;

      // Remove from main image
      if (product.image === imageUrl) {
        product.image = "";
        updated = true;
      }

      // Remove from images array
      if (product.images && Array.isArray(product.images)) {
        const originalLength = product.images.length;
        product.images = product.images.filter(img => 
          img.preview !== imageUrl && img.url !== imageUrl
        );
        if (product.images.length !== originalLength) {
          updated = true;
        }
      }

      if (updated) {
        await product.save();
        deletedFromProducts++;
      }
    }

    // Find and update all categories that use this image
    const categories = await Category.find({ image: imageUrl });

    for (const category of categories) {
      category.image = "";
      await category.save();
      deletedFromCategories++;
    }

    // Delete from S3
    await deleteFile(fileName, fileType);

    res.json({ 
      message: "Image deleted completely from all products, categories, and S3",
      deletedFromProducts,
      deletedFromCategories,
      totalAffected: deletedFromProducts + deletedFromCategories
    });
  } catch (error) {
    console.error("Error deleting image completely:", error);
    res.status(500).json({ error: "Failed to delete image completely" });
  }
};

// Controller: Test S3 connection
export const testS3Connection = async (req, res) => {
  try {
    const { ListObjectsV2Command } = await import("@aws-sdk/client-s3");
    const params = {
      Bucket: process.env.AWS_BUCKET_NAME,
      MaxKeys: 1, // Just check if we can access the bucket
    };
    
    const command = new ListObjectsV2Command(params);
    const response = await s3.send(command);
    
    res.json({ 
      success: true, 
      message: "S3 connection successful",
      bucketName: process.env.AWS_BUCKET_NAME,
      hasContents: !!response.Contents,
      contentsCount: response.Contents?.length || 0
    });
  } catch (error) {
    console.error("S3 connection test failed:", error);
    res.status(500).json({ 
      success: false, 
      error: "S3 connection failed", 
      details: error.message,
      bucketName: process.env.AWS_BUCKET_NAME
    });
  }
};