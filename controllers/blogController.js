import Blog from "../models/blogModel.js";
import User from "../models/userModel.js";
import { HTTP_STATUS_200, HTTP_STATUS_201, HTTP_STATUS_400, HTTP_STATUS_404, HTTP_STATUS_500 } from "../utils/constants.js";
import { sendResponse } from "../utils/helper.js";

// Create a new blog post
export const createBlog = async (req, res) => {
  try {
    const {
      title,
      content,
      excerpt,
      featuredImage,
      status = 'draft',
      tags = [],
      categories,
      metaTitle,
      metaDescription,
      isFeatured = false,
      displayOrder = 0
    } = req.body;

    const authorId = req.user?.userId;

    if (!title || !content) {
      return sendResponse(res, HTTP_STATUS_400, "Title and content are required");
    }

    if (!authorId) {
      return sendResponse(res, HTTP_STATUS_400, "Author ID is required");
    }

    // Check if author exists
    const author = await User.findById(authorId);
    if (!author) {
      return sendResponse(res, HTTP_STATUS_404, "Author not found");
    }

    // Generate slug from title
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim('-');

    // Check if slug already exists
    const existingBlog = await Blog.findOne({ slug });
    if (existingBlog) {
      return sendResponse(res, HTTP_STATUS_400, "A blog post with this title already exists");
    }

    const blogData = {
      title,
      slug,
      content,
      excerpt,
      featuredImage,
      author: authorId,
      status,
      tags: Array.isArray(tags) ? tags : [],
      categories: Array.isArray(categories) ? categories : [],
      metaTitle,
      metaDescription,
      isFeatured,
      displayOrder
    };

    // Set publishedAt if status is published
    if (status === 'published') {
      blogData.publishedAt = new Date();
    }

    const blog = await Blog.create(blogData);

    // Populate author details
    await blog.populate('author', 'firstName lastName email');

    return sendResponse(res, HTTP_STATUS_201, "Blog post created successfully", { blog });
  } catch (error) {
    console.error("Create blog error:", error);
    return sendResponse(res, HTTP_STATUS_500, "Internal Server Error");
  }
};

// Get all blog posts with pagination and filtering
export const getAllBlogs = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status = 'published',
      category,
      tag,
      search = '',
      sortBy = 'publishedAt',
      sortOrder = 'desc',
      featured
    } = req.query;

    const skip = (Number(page) - 1) * Number(limit);

    // Build filter object
    const filter = {};

    if (status && status !== 'all' && status !== '') {
      filter.status = status;
    }

    if (category) {
      filter.categories = new RegExp(category, 'i');
    }

    if (tag) {
      filter.tags = { $in: [new RegExp(tag, 'i')] };
    }

    if (search) {
      filter.$or = [
        { title: new RegExp(search, 'i') },
        { excerpt: new RegExp(search, 'i') },
        { content: new RegExp(search, 'i') }
      ];
    }

    if (featured === 'true') {
      filter.isFeatured = true;
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const totalBlogs = await Blog.countDocuments(filter);

    const blogs = await Blog.find(filter)
      .populate('author', 'firstName lastName email')
      .sort(sort)
      .skip(skip)
      .limit(Number(limit))
      .select('-content'); // Exclude full content for listing

    return sendResponse(res, HTTP_STATUS_200, "Blogs fetched successfully", {
      blogs,
      pagination: {
        currentPage: Number(page),
        totalPages: Math.ceil(totalBlogs / Number(limit)),
        totalBlogs,
        hasNext: Number(page) < Math.ceil(totalBlogs / Number(limit)),
        hasPrev: Number(page) > 1
      }
    });
  } catch (error) {
    console.error("Get all blogs error:", error);
    return sendResponse(res, HTTP_STATUS_500, "Internal Server Error");
  }
};

// Get a single blog post by slug (public - only published)
export const getBlogBySlug = async (req, res) => {
  try {
    const { slug } = req.params;
    console.log("Looking for published blog with slug:", slug);

    const blog = await Blog.findOne({ slug, status: 'published' })
      .populate('author', 'firstName lastName email');

    if (!blog) {
      console.log("Published blog not found with slug:", slug);
      return sendResponse(res, HTTP_STATUS_404, "Blog post not found");
    }

    // Increment view count
    blog.viewCount += 1;
    await blog.save();

    return sendResponse(res, HTTP_STATUS_200, "Blog post fetched successfully", { blog });
  } catch (error) {
    console.error("Get blog by slug error:", error);
    return sendResponse(res, HTTP_STATUS_500, "Internal Server Error");
  }
};

// Get a single blog post by slug (admin - any status)
export const getBlogBySlugAdmin = async (req, res) => {
  try {
    const { slug } = req.params;
    console.log("Looking for blog with slug (admin):", slug);

    const blog = await Blog.findOne({ slug })
      .populate('author', 'firstName lastName email');

    if (!blog) {
      console.log("Blog not found with slug:", slug);
      return sendResponse(res, HTTP_STATUS_404, "Blog post not found");
    }

    // Increment view count
    blog.viewCount += 1;
    await blog.save();

    return sendResponse(res, HTTP_STATUS_200, "Blog post fetched successfully", { blog });
  } catch (error) {
    console.error("Get blog by slug (admin) error:", error);
    return sendResponse(res, HTTP_STATUS_500, "Internal Server Error");
  }
};

// Get a single blog post by ID (for admin)
export const getBlogById = async (req, res) => {
  try {
    const { id } = req.params;

    const blog = await Blog.findById(id)
      .populate('author', 'firstName lastName email');

    if (!blog) {
      return sendResponse(res, HTTP_STATUS_404, "Blog post not found");
    }

    return sendResponse(res, HTTP_STATUS_200, "Blog post fetched successfully", { blog });
  } catch (error) {
    console.error("Get blog by ID error:", error);
    return sendResponse(res, HTTP_STATUS_500, "Internal Server Error");
  }
};

// Update a blog post
export const updateBlog = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    const userId = req.user?.userId;

    const blog = await Blog.findById(id);
    if (!blog) {
      return sendResponse(res, HTTP_STATUS_404, "Blog post not found");
    }

    // Check if user is the author or admin
    if (blog.author.toString() !== userId && req.user?.role !== 'admin') {
      return sendResponse(res, HTTP_STATUS_400, "You don't have permission to update this blog post");
    }

    // Generate new slug if title is being updated
    if (updateData.title && updateData.title !== blog.title) {
      const newSlug = updateData.title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim('-');

      // Check if new slug already exists
      const existingBlog = await Blog.findOne({ slug: newSlug, _id: { $ne: id } });
      if (existingBlog) {
        return sendResponse(res, HTTP_STATUS_400, "A blog post with this title already exists");
      }

      updateData.slug = newSlug;
    }

    // Set publishedAt if status is being changed to published
    if (updateData.status === 'published' && blog.status !== 'published') {
      updateData.publishedAt = new Date();
    }

    const updatedBlog = await Blog.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    ).populate('author', 'firstName lastName email');

    return sendResponse(res, HTTP_STATUS_200, "Blog post updated successfully", { blog: updatedBlog });
  } catch (error) {
    console.error("Update blog error:", error);
    return sendResponse(res, HTTP_STATUS_500, "Internal Server Error");
  }
};

// Delete a blog post
export const deleteBlog = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    const blog = await Blog.findById(id);
    if (!blog) {
      return sendResponse(res, HTTP_STATUS_404, "Blog post not found");
    }

    // Check if user is the author or admin
    if (blog.author.toString() !== userId && req.user?.role !== 'admin') {
      return sendResponse(res, HTTP_STATUS_400, "You don't have permission to delete this blog post");
    }

    await Blog.findByIdAndDelete(id);

    return sendResponse(res, HTTP_STATUS_200, "Blog post deleted successfully");
  } catch (error) {
    console.error("Delete blog error:", error);
    return sendResponse(res, HTTP_STATUS_500, "Internal Server Error");
  }
};

// Get blog categories
export const getBlogCategories = async (req, res) => {
  try {
    const categories = await Blog.distinct('categories', { status: 'published' });
    const categoryCounts = await Blog.aggregate([
      { $match: { status: 'published' } },
      { $unwind: '$categories' },
      { $group: { _id: '$categories', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    return sendResponse(res, HTTP_STATUS_200, "Categories fetched successfully", {
      categories: categoryCounts
    });
  } catch (error) {
    console.error("Get blog categories error:", error);
    return sendResponse(res, HTTP_STATUS_500, "Internal Server Error");
  }
};

// Get blog tags
export const getBlogTags = async (req, res) => {
  try {
    const tags = await Blog.aggregate([
      { $match: { status: 'published' } },
      { $unwind: '$tags' },
      { $group: { _id: '$tags', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    return sendResponse(res, HTTP_STATUS_200, "Tags fetched successfully", { tags });
  } catch (error) {
    console.error("Get blog tags error:", error);
    return sendResponse(res, HTTP_STATUS_500, "Internal Server Error");
  }
};

// Get related blog posts
export const getRelatedBlogs = async (req, res) => {
  try {
    const { slug, limit = 3 } = req.query;

    const currentBlog = await Blog.findOne({ slug, status: 'published' });
    if (!currentBlog) {
      return sendResponse(res, HTTP_STATUS_404, "Blog post not found");
    }

    const relatedBlogs = await Blog.find({
      _id: { $ne: currentBlog._id },
      status: 'published',
      $or: [
        { categories: { $in: currentBlog.categories } },
        { tags: { $in: currentBlog.tags } }
      ]
    })
      .populate('author', 'firstName lastName')
      .sort({ publishedAt: -1 })
      .limit(Number(limit))
      .select('-content');

    return sendResponse(res, HTTP_STATUS_200, "Related blogs fetched successfully", { blogs: relatedBlogs });
  } catch (error) {
    console.error("Get related blogs error:", error);
    return sendResponse(res, HTTP_STATUS_500, "Internal Server Error");
  }
};
