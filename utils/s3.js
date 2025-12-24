import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
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
const bucketName = process.env.AWS_BUCKET_NAME;

// Generate Pre-Signed URL for Uploading
export const generateUploadUrl = async (fileName, fileType) => {
  let folderPath;

  if (fileType.indexOf('image/') === 0) {
    folderPath = 'images';
  } else {
    throw new Error('Unsupported file type. Only images and PDFs are allowed.');
  }

  const params = {
    Bucket: bucketName,
    Key: `${Date.now()}-${encodeURIComponent(fileName)}`,
    ContentType: fileType,
    ACL: "public-read",
  };
  return await getSignedUrl(s3, new PutObjectCommand(params), { expiresIn: 3600 });
};

// Generate a Pre-Signed URL for Downloading
export const generateDownloadUrl = async (fileName, fileType) => {
  let folderPath;

  if (fileType.indexOf('image/') === 0) {
    folderPath = 'images';
  } else {
    throw new Error('Unsupported file type. Only images and PDFs are allowed.');
  }

  const params = {
    Bucket: bucketName,
    Key: `${folderPath}/${fileName}`,
  };
  return await getSignedUrl(s3, new GetObjectCommand(params), { expiresIn: 3600 });
};

export const deleteFile = async (fileName, fileType) => {
  try {
    let folderPath;

    if (fileType.indexOf('image/') === 0) {
      folderPath = 'images';
    } else {
      throw new Error('Unsupported file type. Only images and PDFs are allowed.');
    }

    const params = {
      Bucket: bucketName,
      Key: `${folderPath}/${fileName}`,
    };

    const command = new DeleteObjectCommand(params);
    await s3.send(command);
    console.log(`File deleted successfully: ${fileName}`);
  } catch (error) {
    console.error("Error deleting file:", error);
    throw new Error(`Failed to delete file from S3: ${error.message}`);
  }
};