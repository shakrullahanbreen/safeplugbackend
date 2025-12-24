import Product from "../models/productModel.js";
import Tag from "../models/tagsModel.js";
import { HTTP_STATUS_200, HTTP_STATUS_201, HTTP_STATUS_400, HTTP_STATUS_404, HTTP_STATUS_500 } from "../utils/constants.js";
import { sendResponse } from "../utils/helper.js";

export const createTag = async (req, res) => {
  try {
    const { name, featured = false, image = null } = req.body;
    if (!name) {
      return sendResponse(res, HTTP_STATUS_400, "Tag name is required");
    }
    
    // Check if tag already exists
    const existingTag = await Tag.find({ name: name.trim() });
    if (existingTag.length > 0) {
      return sendResponse(res, HTTP_STATUS_400, "Tag already exists");
    }

    // Check featured limit if trying to create a featured tag
    if (featured) {
      const featuredCount = await Tag.countDocuments({ featured: true });
      if (featuredCount >= 10) {
        return sendResponse(res, HTTP_STATUS_400, "Maximum 10 tags can be featured at a time");
      }
    }

    const newTag = new Tag({
      name: name.trim(),
      featured: Boolean(featured),
      image: image || null,
    });
    await newTag.save();
    return sendResponse(res, HTTP_STATUS_201, "Tag created successfully", newTag);
  } catch (err) {
    console.error("Error:", err);
    return sendResponse(res, HTTP_STATUS_500, err.message);
  }
};
export const getTags = async (req, res) => {
  try {
    const { search = "" } = req.query;

    const query = search
      ? { name: { $regex: search, $options: "i" } }
      : {};

    const tags = await Tag.find(query, { _id: 0, name: 1 }).lean();
    const tagNames = tags.map(tag => tag.name);

    return sendResponse(res, HTTP_STATUS_200, "Tags fetched successfully", tagNames);
  } catch (err) {
    console.error("Error:", err);
    return sendResponse(res, HTTP_STATUS_500, "Internal server error", null);
  }
};

export const getAllTags = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = "", sortBy = "createdAt", sortOrder = "desc" } = req.query;

    const parsedPage = Math.max(Number(page), 1);
    const parsedLimit = Math.min(parseInt(limit), 50);
    const skip = (parsedPage - 1) * parsedLimit;

    const query = search
      ? { name: { $regex: search, $options: "i" } }
      : {};

    // Allow sorting by safe fields only
    const allowedSortFields = new Set(["name", "createdAt", "featured"]);
    const sortField = allowedSortFields.has(String(sortBy)) ? String(sortBy) : "createdAt";
    const sortDir = String(sortOrder).toLowerCase() === "asc" ? 1 : -1;
    const sortSpec = { [sortField]: sortDir };

    const [tags, total, featuredTotal] = await Promise.all([
      Tag.find(query)
        .sort(sortSpec)
        .skip(skip)
        .limit(parsedLimit)
        .lean(),
      Tag.countDocuments(query),
      Tag.countDocuments({ featured: true })
    ]);

    return sendResponse(res, HTTP_STATUS_200, "Tags retrieved successfully", {
      tags,
      pagination: {
        currentPage: parsedPage,
        totalPages: Math.ceil(total / parsedLimit),
        totalItems: total,
        pageSize: parsedLimit,
        sortBy: sortField,
        sortOrder: sortDir === 1 ? "asc" : "desc",
      },
      counts: {
        featured: featuredTotal,
      }
    });
  } catch (err) {
    console.error("Error:", err);
    return sendResponse(res, HTTP_STATUS_500, "Internal server error", null);
  }
};

// Public: get featured tags (for homepage)
export const getFeaturedTags = async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const parsedLimit = Math.min(parseInt(limit), 50);

    const tags = await Tag.find({ featured: true })
      .sort({ createdAt: -1 })
      .limit(parsedLimit)
      .select({ name: 1, image: 1, _id: 0 })
      .lean();

    return sendResponse(res, HTTP_STATUS_200, "Featured tags fetched successfully", tags);
  } catch (err) {
    console.error("Error:", err);
    return sendResponse(res, HTTP_STATUS_500, "Internal server error", null);
  }
};

export const updateTag = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, featured, image } = req.body;

    // Check if tag exists
    const existingTag = await Tag.findById(id);
    if (!existingTag) {
      return sendResponse(res, HTTP_STATUS_404, "Tag not found");
    }

    // Build update object
    const updateData = {};
    
    if (name !== undefined) {
      if (!name || !name.trim()) {
        return sendResponse(res, HTTP_STATUS_400, "Tag name is required");
      }
      
      // Check if another tag with the same name exists
      const duplicateTag = await Tag.findOne({ 
        name: name.trim(), 
        _id: { $ne: id } 
      });
      if (duplicateTag) {
        return sendResponse(res, HTTP_STATUS_400, "Tag with this name already exists");
      }
      
      updateData.name = name.trim();
    }
    
    if (featured !== undefined) {
      // Check featured limit if trying to make a tag featured
      if (featured && !existingTag.featured) {
        const featuredCount = await Tag.countDocuments({ featured: true });
        if (featuredCount >= 10) {
          return sendResponse(res, HTTP_STATUS_400, "Maximum 10 tags can be featured at a time");
        }
      }
      updateData.featured = Boolean(featured);
    }

    if (image !== undefined) {
      updateData.image = image || null;
    }

    // Update the tag
    const updatedTag = await Tag.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );


    // update the tag in all products
    const products = await Product.find({ tags: existingTag.name });
    for (const product of products) {
      product.tags = product.tags.filter(tag => tag !== existingTag.name);
      product.tags.push(updatedTag.name);
      product.updatedAt = Date.now();
      await product.save();
    }

    return sendResponse(res, HTTP_STATUS_200, "Tag updated successfully", updatedTag);
  } catch (err) {
    console.error("Error:", err);
    return sendResponse(res, HTTP_STATUS_500, err.message);
  }
};

export const deleteTag = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if tag exists
    const existingTag = await Tag.findById(id);
    if (!existingTag) {
      return sendResponse(res, HTTP_STATUS_404, "Tag not found");
    }

    console.log(`Deleting tag: ${existingTag.name} (ID: ${id})`);

    // Import Product model to remove tag from all products
    const Product = (await import("../models/productModel.js")).default;

    // Find products that have this tag
    const productsWithTag = await Product.find({ tags: existingTag.name });
    console.log(`Found ${productsWithTag.length} products with tag: ${existingTag.name}`);

    // Remove this tag from all products that have it
    const updateResult = await Product.updateMany(
      { tags: existingTag.name },
      { $pull: { tags: existingTag.name } }
    );

    console.log(`Updated ${updateResult.modifiedCount} products to remove tag: ${existingTag.name}`);

    // Delete the tag
    const deleteResult = await Tag.findByIdAndDelete(id);
    
    if (!deleteResult) {
      return sendResponse(res, HTTP_STATUS_404, "Tag not found or already deleted");
    }

    console.log(`Successfully deleted tag: ${existingTag.name}`);

    return sendResponse(res, HTTP_STATUS_200, {
      message: "Tag deleted successfully and removed from all products",
      deletedTag: existingTag.name,
      productsUpdated: updateResult.modifiedCount
    });
  } catch (err) {
    console.error("Error deleting tag:", err);
    return sendResponse(res, HTTP_STATUS_500, err.message);
  }
};
