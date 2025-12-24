import express from "express";
import { deleteImage, deleteImageCompletely, getDownloadUrl, getUploadUrl, testS3Connection } from "../controllers/s3Controller.js";
import auth from '../middlewares/auth.js';
import { admin } from '../utils/helper.js';

const s3Router = express.Router();

s3Router.post("/upload", getUploadUrl);
s3Router.post("/get-url", getDownloadUrl);
s3Router.delete("/delete", deleteImage);
s3Router.delete("/delete-completely", deleteImageCompletely);
s3Router.get("/test", testS3Connection);

export default s3Router;