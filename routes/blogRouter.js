import express from "express";
import {
  createBlog,
  getAllBlogs,
  getBlogBySlug,
  getBlogBySlugAdmin,
  getBlogById,
  updateBlog,
  deleteBlog,
  getBlogCategories,
  getBlogTags,
  getRelatedBlogs
} from "../controllers/blogController.js";
import auth from "../middlewares/auth.js";
import { admin } from "../utils/helper.js";

const blogRouter = express.Router();

// Public routes
blogRouter.get("/", getAllBlogs);
blogRouter.get("/categories", getBlogCategories);
blogRouter.get("/tags", getBlogTags);
blogRouter.get("/related", getRelatedBlogs);
blogRouter.get("/:slug", getBlogBySlug);

// Protected routes (require authentication)
blogRouter.post("/", auth, createBlog);
blogRouter.get("/admin/:id", auth, getBlogById);
blogRouter.put("/:id", auth, updateBlog);
blogRouter.delete("/:id", auth, deleteBlog);

export default blogRouter;
