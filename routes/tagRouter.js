import express from "express";
import auth from '../middlewares/auth.js';
import { admin } from "../utils/helper.js";
import { createTag, getTags, getAllTags, updateTag, deleteTag, getFeaturedTags } from "../controllers/tagController.js";

const tagRouter = express.Router();

// Public route for getting tag names (used in product forms)
tagRouter.get('/', getTags);
// Public route for featured tags (homepage)
tagRouter.get('/featured', getFeaturedTags);

// Admin routes
tagRouter.post('/', auth, admin, createTag);
tagRouter.get('/admin', auth, admin, getAllTags);
tagRouter.put('/:id', auth, admin, updateTag);
tagRouter.delete('/:id', auth, admin, deleteTag);

export default tagRouter;