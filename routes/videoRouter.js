import express from "express";
import {
  getAllVideos,
  getVideoById,
  createVideo,
  updateVideo,
  deleteVideo,
  updateVideoOrder,
  toggleVideoStatus,
  getPublicVideos,
  incrementVideoViews,
} from "../controllers/videoController.js";
import auth from "../middlewares/auth.js";
import publicAuth from "../middlewares/publicAuth.js";

const router = express.Router();

// Public routes (no authentication required)
router.get("/public", getPublicVideos);
router.post("/:id/view", incrementVideoViews);

// Admin routes (authentication required)
router.get("/", auth, getAllVideos);
router.get("/:id", auth, getVideoById);
router.post("/", auth, createVideo);
router.put("/:id", auth, updateVideo);
router.delete("/:id", auth, deleteVideo);
router.put("/order", auth, updateVideoOrder);
router.patch("/:id/toggle-status", auth, toggleVideoStatus);

export default router;
