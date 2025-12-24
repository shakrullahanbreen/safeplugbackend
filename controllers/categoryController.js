import slugify from 'slugify';
import Category from "../models/categoryModel.js";
import { sendResponse } from '../utils/helper.js';
import { HTTP_STATUS_200, HTTP_STATUS_400, HTTP_STATUS_404, HTTP_STATUS_500 } from '../utils/constants.js';
import Product from '../models/productModel.js';
import mongoose from 'mongoose';

// Simple in-memory cache for public categories list
let categoriesCache = {
  data: null,
  expiresAt: 0
};
const CATEGORIES_CACHE_TTL_MS = 60 * 1000; // 60s cache

// Throttle expensive auto-fix operations to at most once per day
let categoriesLastFixAt = 0;
const CATEGORIES_FIX_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24h

// Helper function to update child levels recursively
const updateChildLevels = async (parentId, parentLevel) => {
  const children = await Category.find({ parentId });

  for (const child of children) {
    const newLevel = parentLevel + 1;
    await Category.findByIdAndUpdate(child._id, { level: newLevel });

    if (child.hasChildren) {
      await updateChildLevels(child._id, newLevel);
    }
  }
};

// Helper function to reorder siblings sequentially
const reorderSiblingsSequentially = async (parentId) => {
  const siblings = await Category.find({ 
    parentId: parentId || null,
    isDeleted: { $ne: true }, // Exclude soft-deleted categories
    _id: { $ne: new mongoose.Types.ObjectId("68a62a1208e4173abbf49e0e") } // Exclude DeletedCategories parent
  }).sort({ displayOrder: 1 });
  
  for (let i = 0; i < siblings.length; i++) {
    if (siblings[i].displayOrder !== i + 1) {
      await Category.findByIdAndUpdate(siblings[i]._id, {
        displayOrder: i + 1,
        updatedAt: Date.now()
      });
    }
  }
};

// Helper function to validate and fix display order gaps
const validateAndFixDisplayOrder = async (parentId) => {
  const siblings = await Category.find({ 
    parentId: parentId || null,
    isDeleted: { $ne: true } // Exclude soft-deleted categories
  }).sort({ displayOrder: 1 });

  // Check for gaps or duplicates
  let hasGaps = false;
  for (let i = 0; i < siblings.length; i++) {
    if (siblings[i].displayOrder !== i + 1) {
      hasGaps = true;
      break;
    }
  }

  if (hasGaps) {
    await reorderSiblingsSequentially(parentId);
  }
};

// Helper function to fix any existing categories with invalid display orders
const fixInvalidDisplayOrders = async () => {
  // Find categories with displayOrder <= 0 or missing displayOrder
  const invalidCategories = await Category.find({
    $or: [
      { displayOrder: { $lte: 0 } },
      { displayOrder: { $exists: false } }
    ]
  });

  for (const category of invalidCategories) {
    // Get siblings and assign proper display order
    const siblings = await Category.find({ 
      parentId: category.parentId || null,
      _id: { $ne: category._id },
      isDeleted: { $ne: true } // Exclude soft-deleted categories
    }).sort({ displayOrder: 1 });
    
    const maxOrder = siblings.length > 0 ? Math.max(...siblings.map(s => s.displayOrder)) : 0;
    const newOrder = maxOrder + 1;
    
    await Category.findByIdAndUpdate(category._id, {
      displayOrder: newOrder,
      updatedAt: Date.now()
    });
  }
};

// export const getCategories = async (req, res) => {
//   try {
//     const categories = await Category.find({ isActive: true }).select("name _id").sort({ level: 1, displayOrder: 1 });
//     sendResponse(res, HTTP_STATUS_200, "Categories retrieved successfully", categories);
//   } catch (err) {
//     return sendResponse(res, HTTP_STATUS_500, err.message);
//   }
// };

export const getCategories = async (req, res) => {
  try {
    const now = Date.now();

    // Serve from cache if fresh
    if (categoriesCache.data && categoriesCache.expiresAt > now) {
      return sendResponse(res, HTTP_STATUS_200, "Categories retrieved successfully", categoriesCache.data);
    }

    // Throttle the expensive auto-fix to at most once per day
    if (now - categoriesLastFixAt > CATEGORIES_FIX_INTERVAL_MS) {
      try {
        await fixInvalidDisplayOrders();
        const parentCategories = await Category.find({
          level: 1,
          isDeleted: { $ne: true }
        }).lean();
        for (const parent of parentCategories) {
          await reorderSiblingsSequentially(parent._id);
        }
        await reorderSiblingsSequentially(null);
        categoriesLastFixAt = now;
      } catch (e) {
        // Don't fail the request if maintenance step fails
        console.error("Category auto-fix skipped due to error:", e);
      }
    }

    // Fetch minimal fields, lean for performance
    const categories = await Category.find({
      isDeleted: { $ne: true },
      _id: { $ne: new mongoose.Types.ObjectId("68a62a1208e4173abbf49e0e") },
      parentId: { $ne: new mongoose.Types.ObjectId("68a62a1208e4173abbf49e0e") }
    })
      .select("name title image level parentId displayOrder hasChildren isRecentlyAdded createdAt updatedAt")
      .sort({ level: 1, displayOrder: 1 })
      .lean();

    // Update cache
    categoriesCache = {
      data: categories,
      expiresAt: now + CATEGORIES_CACHE_TTL_MS
    };

    return sendResponse(res, HTTP_STATUS_200, "Categories retrieved successfully", categories);
  } catch (err) {
    return sendResponse(res, HTTP_STATUS_500, err.message);
  }
};

// New function for admin purposes that includes deleted categories
export const getCategoriesForAdmin = async (req, res) => {
  try {
    // First, fix any existing categories with invalid display orders
    await fixInvalidDisplayOrders();
    
    // Then ensure all categories have sequential display orders starting from 1
    // Get all parent categories (level 1) and reorder their children
    const parentCategories = await Category.find({ 
      level: 1, 
      // isActive: true, // Commented out isActive check
      isDeleted: { $ne: true } 
    });
    
    for (const parent of parentCategories) {
      await reorderSiblingsSequentially(parent._id);
    }
    
    // Also reorder top-level categories (no parent)
    await reorderSiblingsSequentially(null);
    
    // For admin: Include deletedCategories parent and ALL soft-deleted categories, plus other non-deleted categories
    const categories = await Category.find({ 
      $or: [
        // Include DeletedCategories parent explicitly
        { _id: new mongoose.Types.ObjectId("68a62a1208e4173abbf49e0e") },
        // Include all soft-deleted categories (children under DeletedCategories or anywhere else)
        { isDeleted: true },
        // Include other non-deleted categories
        { isDeleted: { $ne: true } }
      ]
    }).sort({ level: 1, displayOrder: 1 });
    
    sendResponse(res, HTTP_STATUS_200, "Categories retrieved successfully", categories);
  } catch (err) {
    return sendResponse(res, HTTP_STATUS_500, err.message);
  }
};

export const createCategory = async (req, res) => {
  try {
    let {
      name,
      title,
      description,
      image,
      parentId,
      isRecentlyAdded,
      hasParts,
      modelNumbers,
      attributes,
      isActive,
      level = 1,
      displayOrder
    } = req.body;

    // Generate slug if not provided
    const slug = slugify(name, { lower: true });

    // Determine level based on parent

    if (level > 5) {
      return sendResponse(res, HTTP_STATUS_400, 'SubCategories level cannot be added!Max level is 4');
    }

    // let level = inputLevel || 1;
    let parent = null
    if (parentId) {
      parent = await Category.findById(parentId);
      if (!parent) {
        parent = null
      }
      else {
        level = parent?.level + 1;
        if (level > 4) {
          return sendResponse(res, HTTP_STATUS_400, 'SubCategories level cannot be added!Max level is 3');
        }
        await Category.findByIdAndUpdate(parentId, { hasChildren: true });
        parent = parentId
        if (parent && parent.name === name) {
          return sendResponse(res, HTTP_STATUS_400, 'Child category name cannot be the same as the parent category');
        }
      }

    }
    const existingCategory = await Category.find({ name: name, level: level });
    if (existingCategory.length > 0) {
      return sendResponse(res, HTTP_STATUS_400, 'There is an existing category on the same name');

    }

    // Handle display order - either use provided order or auto-assign next number
    let finalDisplayOrder;
    if (displayOrder !== undefined) {
      // User provided a specific display order
      const siblings = await Category.find({ parentId: parent || null }).sort({ displayOrder: 1 });
      const maxOrder = siblings.length > 0 ? Math.max(...siblings.map(s => s.displayOrder)) : 0;
      
      if (displayOrder < 1 || displayOrder > maxOrder + 1) {
        return sendResponse(res, HTTP_STATUS_400, `Display order must be between 1 and ${maxOrder + 1}`);
      }
      
      // Shift siblings to make room for the new order
      for (const sibling of siblings) {
        if (sibling.displayOrder >= displayOrder) {
          await Category.findByIdAndUpdate(sibling._id, {
            displayOrder: sibling.displayOrder + 1,
            updatedAt: Date.now()
          });
        }
      }
      
      finalDisplayOrder = displayOrder;
    } else {
      // Auto-assign next available order
      const maxOrderSibling = await Category.findOne({ parentId: parent || null }).sort('-displayOrder');
      finalDisplayOrder = maxOrderSibling ? maxOrderSibling.displayOrder + 1 : 1;
    }

    // Create new category object with schema fields
    const category = await Category.create(
      {
        name,
        title: name, // Use name as title if not provided
        description: description || "",
        image: image || "",
        // slug,
        parentId: parent,
        level,
        // isActive: isActive !== undefined ? isActive : true, // Commented out isActive
        displayOrder: finalDisplayOrder,
        isRecentlyAdded: isRecentlyAdded || false,
        hasParts: hasParts || false,
        modelNumbers: modelNumbers || [],
        attributes: attributes || {
          screenSize: "",
          year: "",
          modelCode: ""
        },
        hasChildren: false
      }
    );

    sendResponse(res, HTTP_STATUS_200, "Category created successfully", category);
  } catch (err) {
    console.error("Error:", err);
    return sendResponse(res, HTTP_STATUS_500, "Internal Server Error");
  }
};

export const getCategoriesAdmin = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      sortOrder = "desc",
      search = "",
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sort = {
      [sortBy]: sortOrder === "desc" ? -1 : 1,
    };

    const matchStage = {
      $match: {
        $or: [
          { name: { $regex: search, $options: "i" } },
          { title: { $regex: search, $options: "i" } },
          { description: { $regex: search, $options: "i" } },
          { "parent.name": { $regex: search, $options: "i" } }, // parent name search
        ],
      },
    };

    const pipeline = [
      {
        $lookup: {
          from: "categories",
          localField: "parentId",
          foreignField: "_id",
          as: "parent",
        },
      },
      {
        $unwind: {
          path: "$parent",
          preserveNullAndEmptyArrays: true,
        },
      },
      ...(search ? [matchStage] : []),
      {
        $sort: sort,
      },
      {
        $skip: skip,
      },
      {
        $limit: parseInt(limit),
      },
      {
        $project: {
          name: 1,
          title: 1,
          description: 1,
          image: 1,
          level: 1,
          // isActive: 1, // Commented out isActive
          displayOrder: 1,
          isRecentlyAdded: 1,
          hasChildren: 1,
          hasParts: 1,
          modelNumbers: 1,
          attributes: 1,
          createdAt: 1,
          updatedAt: 1,
          parentId: "$parent._id",
          parentName: "$parent.name",
        },
      },
    ];

    const [categories, totalResult] = await Promise.all([
      Category.aggregate(pipeline),
      Category.aggregate([
        {
          $lookup: {
            from: "categories",
            localField: "parentId",
            foreignField: "_id",
            as: "parent",
          },
        },
        {
          $unwind: {
            path: "$parent",
            preserveNullAndEmptyArrays: true,
          },
        },
        ...(search ? [matchStage] : []),
        {
          $count: "total",
        },
      ]),
    ]);

    const total = totalResult.length > 0 ? totalResult[0].total : 0;
    const totalPages = Math.ceil(total / limit);

    return sendResponse(res, HTTP_STATUS_200, "Categories retrieved successfully", {
      categories,
      pagination: {
        totalItems: total,
        totalPages,
        currentPage: parseInt(page),
        pageSize: parseInt(limit),
      },
    });
  } catch (err) {
    console.error("Error:", err);
    return sendResponse(res, HTTP_STATUS_500, err.message);
  }
};

export const getCategoriesListAdmin = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      sortOrder = "desc",
      parentId = null,
    } = req.query;


    const pageNumber = parseInt(page);
    const pageSize = parseInt(limit);
    const skip = (pageNumber - 1) * pageSize;
    const sort = {
      [sortBy]: sortOrder === "desc" ? -1 : 1,
    };

    const filter = {};
    if (parentId && parentId !== "null") {
      filter.parentId = parentId;
    }

         const categories = await Category.find(filter)
       .select("name _id displayOrder")


    sendResponse(res, HTTP_STATUS_200, "Categories retrieved successfully", {
      categories
    });
  } catch (err) {
    console.error("Error:", err);
    return sendResponse(res, HTTP_STATUS_500, err.message);
  }
};

export const reorderCategory = async (req, res) => {
  try {
    const { categoryId, direction } = req.body;
    const category = await Category.findById(categoryId);
    if (!category) return sendResponse(res, HTTP_STATUS_404, 'Category not found');

    const siblings = await Category.find({
      parentId: category.parentId || null,
      _id: { $nin: [categoryId, new mongoose.Types.ObjectId("68a62a1208e4173abbf49e0e")] },
      isDeleted: { $ne: true }
    }).sort({ displayOrder: 1 });

    const allSiblings = [...siblings, category].sort((a, b) => a.displayOrder - b.displayOrder);
    const currentIndex = allSiblings.findIndex(c => c._id.toString() === categoryId);

    if (direction === 'up' && currentIndex > 0) {
      const prevSibling = allSiblings[currentIndex - 1];
      const tempOrder = prevSibling.displayOrder;

      await Category.findByIdAndUpdate(prevSibling._id, {
        displayOrder: category.displayOrder,
        updatedAt: Date.now(),
      });

      await Category.findByIdAndUpdate(categoryId, {
        displayOrder: tempOrder,
        updatedAt: Date.now(),
      });

      sendResponse(res, HTTP_STATUS_200, 'Category moved up successfully');
    } else if (direction === 'down' && currentIndex < allSiblings.length - 1) {
      const nextSibling = allSiblings[currentIndex + 1];
      const tempOrder = nextSibling.displayOrder;

      await Category.findByIdAndUpdate(nextSibling._id, {
        displayOrder: category.displayOrder,
        updatedAt: Date.now(),
      });

      await Category.findByIdAndUpdate(categoryId, {
        displayOrder: tempOrder,
        updatedAt: Date.now(),
      });

      sendResponse(res, HTTP_STATUS_200, 'Category moved down successfully');
    } else {
      return sendResponse(res, HTTP_STATUS_400, 'Cannot move category in that direction');
    }
  } catch (err) {
    return sendResponse(res, HTTP_STATUS_500, err.message);
  }
};

export const getChildCategories = async (req, res) => {
  try {
    const parentId = req.params.parentId;
    const children = await Category.find({ 
      parentId, 
      // isActive: true, // Commented out isActive check
      isDeleted: { $ne: true } // Exclude soft-deleted categories
    }).sort({ displayOrder: 1 }).select("name _id displayOrder");
    sendResponse(res, HTTP_STATUS_200, "Child categories retrieved successfully", children);
  } catch (err) {
    return sendResponse(res, HTTP_STATUS_500, err.message);
  }
};

export const getCategoryPath = async (req, res) => {
  try {
    const categoryId = req.params.id;
    const path = [];

    let currentCategory = await Category.findById(categoryId);
    if (!currentCategory || currentCategory.isDeleted) return sendResponse(res, HTTP_STATUS_404, 'Category not found');

    while (currentCategory) {
      path.unshift(currentCategory);
      if (!currentCategory.parentId) break;
      currentCategory = await Category.findById(currentCategory.parentId);
      // Stop if we encounter a soft-deleted category in the path
      if (currentCategory && currentCategory.isDeleted) break;
    }

    sendResponse(res, HTTP_STATUS_200, "Category path retrieved successfully", path);
  } catch (err) {
    return sendResponse(res, HTTP_STATUS_500, err.message);
  }
};

export const updateCategory = async (req, res) => {
  try {
    const {
      id,
      name,
      image,
      level,
      parentId = null,
      updatedDisplayOrder,
    } = req.body;

    // Validate required field
    if (!name) {
      return sendResponse(res, HTTP_STATUS_400, 'Category name is required');
    }

    if (level > 4) {
      return sendResponse(res, HTTP_STATUS_400, 'SubCategories level cannot be added!Max level is 4');
    }
    const category = await Category.findById(id);
    if (!category) {
      return sendResponse(res, HTTP_STATUS_404, 'Category not found');
    }

    let updatedLevel = level;

    // Handle parentId change
    if (parentId && parentId !== category.parentId?.toString()) {
      const newParent = await Category.findById(parentId);
      if (!newParent) {
        return sendResponse(res, HTTP_STATUS_400, 'New parent category not found');
      }

      // Update old parent if needed
      if (category.parentId) {
        const siblingCount = await Category.countDocuments({ parentId: category.parentId });
        if (siblingCount <= 1) {
          await Category.findByIdAndUpdate(category.parentId, { hasChildren: false });
        }
      }

      // Set hasChildren on new parent
      await Category.findByIdAndUpdate(parentId, { hasChildren: true });

      // Update level based on new parent
      updatedLevel = newParent.level + 1;

      // Update child levels if needed
      if (category.hasChildren) {
        await updateChildLevels(id, updatedLevel);
      }
    }

    // Handle display order update
    if (updatedDisplayOrder !== undefined && updatedDisplayOrder !== category.displayOrder) {
      const siblings = await Category.find({
        parentId: category.parentId || null,
        _id: { $nin: [id, new mongoose.Types.ObjectId("68a62a1208e4173abbf49e0e")] },
        isDeleted: { $ne: true }
      }).sort({ displayOrder: 1 });

      const newOrder = parseInt(updatedDisplayOrder);
      const maxOrder = siblings.length > 0 ? Math.max(...siblings.map(s => s.displayOrder)) : 0;

      if (newOrder < 1 || newOrder > maxOrder + 1) {
        return sendResponse(res, HTTP_STATUS_400, `Display order must be between 1 and ${maxOrder + 1}`);
      }

      // Reorder siblings based on new position
      if (newOrder > category.displayOrder) {
        // Moving down - shift siblings up
        for (const sibling of siblings) {
          if (sibling.displayOrder > category.displayOrder && sibling.displayOrder <= newOrder) {
            await Category.findByIdAndUpdate(sibling._id, {
              displayOrder: sibling.displayOrder - 1,
              updatedAt: Date.now()
            });
          }
        }
      } else if (newOrder < category.displayOrder) {
        // Moving up - shift siblings down
        for (const sibling of siblings) {
          if (sibling.displayOrder >= newOrder && sibling.displayOrder < category.displayOrder) {
            await Category.findByIdAndUpdate(sibling._id, {
              displayOrder: sibling.displayOrder + 1,
              updatedAt: Date.now()
            });
          }
        }
      }

      // Update the current category's display order
      await Category.findByIdAndUpdate(id, {
        displayOrder: newOrder,
        updatedAt: Date.now()
      });
    }

    const updateData = {
      name,
      title: name,
      image: image || category.image, // Retain existing images if not provided
      parentId,
      level: updatedLevel,
      updatedAt: Date.now(),
    };

    const updatedCategory = await Category.findByIdAndUpdate(
      id,
      updateData,
      { new: true }
    );

    sendResponse(res, HTTP_STATUS_200, 'Category updated successfully', updatedCategory);
  } catch (err) {
    return sendResponse(res, HTTP_STATUS_500, err.message);
  }
};


export const getCategoryById = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) return sendResponse(res, HTTP_STATUS_404, 'Category not found');
    sendResponse(res, HTTP_STATUS_200, "Category retrieved successfully", category);
  } catch (err) {
    return sendResponse(res, HTTP_STATUS_500, err.message);
  }
};

// export const deleteCategory = async (req, res) => {
//   try {
//     const categoryId = req.body.id;
//     const category = await Category.findById(categoryId);
//     if (!category) return sendResponse(res, HTTP_STATUS_404, 'Category not found');

//     const hasChildren = await Category.findOne({ parentId: categoryId });
//   console.log("has childremn", hasChildren)
//     if (hasChildren) {
//       return sendResponse(res, HTTP_STATUS_400, 'Cannot delete category with children. Delete children first or reassign them.');
//     }

//     if (category.parentId) {
//       const siblingCount = await Category.countDocuments({ parentId: category.parentId });
//       if (siblingCount <= 1) {
//         await Category.findByIdAndUpdate(category.parentId, { hasChildren: false });
//       }
//     }

//     await Category.findByIdAndDelete(categoryId);
//     sendResponse(res, HTTP_STATUS_200, 'Category deleted successfully');
//   } catch (err) {
//     console.error("Error:", err);
//     return sendResponse(res, HTTP_STATUS_500, err.message);
//   }
// };
export const deleteCategory = async (req, res) => {
  try {
    console.log("=== DELETE CATEGORY START ===");
    const categoryId = req.body.id;
    console.log("Category ID to delete:", categoryId);
    
    const category = await Category.findById(categoryId);
    if (!category) return sendResponse(res, HTTP_STATUS_404, 'Category not found');

    // Prevent deleting the deletedCategories parent itself
    if (categoryId === "68a62a1208e4173abbf49e0e") {
      console.log(`ERROR: Cannot delete the deletedCategories parent category`);
      return sendResponse(res, HTTP_STATUS_400, 'Cannot delete the deletedCategories parent category. This is a protected system category.');
    }

    // Check if this is a soft delete from deletedCategories
    const isSoftDelete = category.parentId && category.parentId.toString() === "68a62a1208e4173abbf49e0e";
    
    if (isSoftDelete) {
      console.log(`Soft deleting category "${category.name}" from deletedCategories`);
    }

    console.log("Category found:", {
      name: category.name,
      _id: category._id,
      parentId: category.parentId,
      hasChildren: category.hasChildren,
      level: category.level
    });

    // Store the parentId and displayOrder before deletion for reordering
    const deletedParentId = category.parentId;
    const deletedDisplayOrder = category.displayOrder;

    const newParentId = new mongoose.Types.ObjectId("68a82786992db6bf45ed73ce"); // deletedCategories category ID
    console.log("Target deletedCategories ID:", newParentId.toString());
    
    // Ensure deletedCategories parent category exists
    const deletedCategoriesParent = await Category.findById(newParentId);
    if (!deletedCategoriesParent) {
      console.log("ERROR: deletedCategories parent category not found!");
      return sendResponse(res, HTTP_STATUS_500, 'deletedCategories parent category not found. Please create it first.');
    }
    
    console.log("deletedCategories parent found:", {
      name: deletedCategoriesParent.name,
      _id: deletedCategoriesParent._id
    });

    // Helper function to recursively move all descendants to deletedCategories
    const moveAllDescendantsToDeletedCategories = async (parentId, depth = 0) => {
      // Safety check to prevent infinite recursion
      if (depth > 10) {
        console.error(`Recursion depth limit reached for parent ${parentId}`);
        return;
      }
      
      // Find all direct children
      const children = await Category.find({ parentId });
      console.log(`Found ${children.length} direct children for parent ${parentId} at depth ${depth}`);
      
      for (const child of children) {
        console.log(`Processing child: "${child.name}" (${child._id}) at depth ${depth}`);
        
        // Recursively move grandchildren first
        if (child.hasChildren) {
          console.log(`Child "${child.name}" has children, processing recursively at depth ${depth + 1}`);
          await moveAllDescendantsToDeletedCategories(child._id, depth + 1);
        }
        
        // Move this child to deletedCategories
        console.log(`Moving child "${child.name}" to deletedCategories`);
        const updateResult = await Category.findByIdAndUpdate(child._id, {
          parentId: newParentId,
          level: 1, // Reset to level 1 under deletedCategories
          updatedAt: Date.now()
        });
        
        if (updateResult) {
          console.log(`Successfully moved "${child.name}" to deletedCategories`);
        } else {
          console.error(`Failed to move "${child.name}" to deletedCategories`);
        }
      }
    };

    // Check if category has products
    const productCount = await Product.countDocuments({ 
      $or: [
        { category: categoryId },
        { subCategory: categoryId }
      ]
    });
    console.log(`Category "${category.name}" has ${productCount} products`);

    // Move all descendants to deletedCategories
    if (category.hasChildren) {
      console.log(`Moving descendants of category "${category.name}" (${categoryId}) to deletedCategories`);
      await moveAllDescendantsToDeletedCategories(categoryId);
      console.log(`Finished moving descendants to deletedCategories`);
    } else {
      console.log(`Category "${category.name}" has no children to move`);
    }

    // Handle product reassignment based on delete type
    if (isSoftDelete) {
      // For soft delete, mark products as deleted too
      if (productCount > 0) {
        console.log(`Soft deleting ${productCount} products from category "${category.name}"`);
        await Product.updateMany(
          { category: categoryId },
          {
            isDeleted: true,
            deletedAt: Date.now(),
            updatedAt: Date.now()
          }
        );
        console.log(`Successfully soft deleted products from category "${category.name}"`);
      } else {
        console.log(`No products to soft delete for category "${category.name}"`);
      }
    } else {
      // For regular delete, reassign products to deletedCategories
      if (productCount > 0) {
        console.log(`Reassigning ${productCount} products to deletedCategories`);
        await Product.updateMany(
          { category: categoryId },
          {
            category: newParentId,
            subCategory: null
          }
        );
        console.log(`Successfully reassigned products to deletedCategories`);
      } else {
        console.log(`No products to reassign for category "${category.name}"`);
      }
    }

    // If category has a parent, update its hasChildren flag if necessary
    if (category.parentId) {
      const siblingCount = await Category.countDocuments({ parentId: category.parentId });
      if (siblingCount <= 1) {
        await Category.findByIdAndUpdate(category.parentId, { hasChildren: false });
      }
    }

    // Handle soft delete vs regular move
    if (isSoftDelete) {
      // Soft delete: Mark as deleted but keep in database
      console.log(`Soft deleting category "${category.name}"`);
      const softDeleteResult = await Category.findByIdAndUpdate(categoryId, {
        isDeleted: true,
        deletedAt: Date.now(),
        updatedAt: Date.now()
      });
      
      if (softDeleteResult) {
        console.log(`Successfully soft deleted category "${category.name}"`);
      } else {
        console.error(`Failed to soft delete category "${category.name}"`);
      }
    } else {
      // Regular delete: Move to deletedCategories
      console.log(`Moving category "${category.name}" to deletedCategories`);
      const moveResult = await Category.findByIdAndUpdate(categoryId, {
        parentId: newParentId,
        level: 1, // Reset to level 1 under deletedCategories
        updatedAt: Date.now()
      });
      
      if (moveResult) {
        console.log(`Successfully moved category "${category.name}" to deletedCategories`);
      } else {
        console.error(`Failed to move category "${category.name}" to deletedCategories`);
      }
    }

    // Handle final logging and updates based on delete type
    if (isSoftDelete) {
      console.log(`Soft delete completed for category "${category.name}"`);
      console.log(`Category and ${productCount} products marked as deleted`);
    } else {
      // Update deletedCategories hasChildren flag if we moved any categories
      const movedCategoriesCount = await Category.countDocuments({ parentId: newParentId });
      console.log(`Total categories moved to deletedCategories: ${movedCategoriesCount}`);
      
      // Log all categories currently under deletedCategories
      const allDeletedCategories = await Category.find({ parentId: newParentId });
      console.log("Categories currently under deletedCategories:", allDeletedCategories.map(cat => ({
        name: cat.name,
        _id: cat._id,
        level: cat.level,
        hasProducts: cat.hasProducts || false
      })));
      
      if (movedCategoriesCount > 0) {
        await Category.findByIdAndUpdate(newParentId, { hasChildren: true });
        console.log(`Updated deletedCategories hasChildren flag to true`);
      } else {
        console.log("No categories were moved to deletedCategories");
      }
    }

    // Reorder siblings to maintain sequential display order
    if (deletedParentId) {
      const remainingSiblings = await Category.find({
        parentId: deletedParentId
      }).sort({ displayOrder: 1 });

      // Renumber siblings sequentially starting from 1
      for (let i = 0; i < remainingSiblings.length; i++) {
        if (remainingSiblings[i].displayOrder !== i + 1) {
          await Category.findByIdAndUpdate(remainingSiblings[i]._id, {
            displayOrder: i + 1,
            updatedAt: Date.now()
          });
        }
      }
    }

    // Also reorder categories under deletedCategories
    const deletedCategoriesChildren = await Category.find({ parentId: newParentId }).sort({ displayOrder: 1 });
    for (let i = 0; i < deletedCategoriesChildren.length; i++) {
      if (deletedCategoriesChildren[i].displayOrder !== i + 1) {
        await Category.findByIdAndUpdate(deletedCategoriesChildren[i]._id, {
          displayOrder: i + 1,
          updatedAt: Date.now()
        });
      }
    }

    console.log("=== DELETE CATEGORY COMPLETE ===");
    if (isSoftDelete) {
      console.log("Final state - Category soft deleted, not visible in admin table");
    } else {
      console.log("Final state - Categories under deletedCategories:", await Category.countDocuments({ parentId: newParentId }));
    }
    
    if (isSoftDelete) {
      return sendResponse(res, HTTP_STATUS_200, 'Category soft deleted successfully. Data preserved in database but hidden from admin view.');
    } else {
      return sendResponse(res, HTTP_STATUS_200, 'Category deleted and all descendants moved to "deletedCategories".');
    }
  } catch (err) {
    console.error("=== DELETE CATEGORY ERROR ===");
    console.error("Error:", err);
    return sendResponse(res, HTTP_STATUS_500, err.message);
  }
};



export const categoryProductCount = async (req, res) => {
  try {
    // Get all parent categories (level 1), excluding soft-deleted and deletedCategories
    const parentCategories = await Category.find({ 
      level: 1, 
      // isActive: true, // Commented out isActive check
      isDeleted: { $ne: true }, // Exclude soft-deleted categories
      _id: { $ne: new mongoose.Types.ObjectId("68a62a1208e4173abbf49e0e") } // Exclude deletedCategories parent
    });

    const categoryProductCounts = [];

    for (const parentCategory of parentCategories) {
      // Simple approach: get all categories that have this parent as ancestor
      const getAllDescendants = async (parentId) => {
        const directChildren = await Category.find({ 
          parentId: parentId, 
          // isActive: true, // Commented out isActive check
          isDeleted: { $ne: true } // Exclude soft-deleted categories
        });
        let allDescendants = [...directChildren];

        for (const child of directChildren) {
          const grandChildren = await getAllDescendants(child._id);
          allDescendants = allDescendants.concat(grandChildren);
        }

        return allDescendants;
      };

      // Get all descendant categories
      const descendants = await getAllDescendants(parentCategory._id);
      const allCategoryIds = [parentCategory._id, ...descendants.map(cat => cat._id)];

      console.log(`Debug: Parent category "${parentCategory.name}" has ${descendants.length} descendants`);
      console.log(`Debug: All category IDs for "${parentCategory.name}":`, allCategoryIds);

      // Count products in all these categories, excluding soft-deleted products
      const productCount = await Product.countDocuments({
        category: { $in: allCategoryIds },
        isDeleted: { $ne: true } // Exclude soft-deleted products
      });

      console.log(`Debug: Product count for "${parentCategory.name}": ${productCount}`);

      // Add to result array
      categoryProductCounts.push({
        [parentCategory.name]: productCount
      });
    }

    // Additional debug info
    console.log("Debug: Parent categories found:", parentCategories.length);
    const childCategories = await Category.find({ 
      parentId: { $ne: null }, 
      // isActive: true, // Commented out isActive check
      isDeleted: { $ne: true } // Exclude soft-deleted categories
    });
    console.log("Debug: Child categories found:", childCategories.length);
    const totalProducts = await Product.countDocuments({ isDeleted: { $ne: true } }); // Exclude soft-deleted products
    console.log("Debug: Total products (active):", totalProducts);

    sendResponse(res, HTTP_STATUS_200, "Category product counts retrieved successfully", categoryProductCounts);

  } catch (error) {
    console.error("Error:", error);
    sendResponse(res, HTTP_STATUS_500, error.message);
  }
};

export const fixDisplayOrders = async (req, res) => {
  try {
    console.log("Starting to fix display orders...");
    
    // Fix invalid display orders first
    await fixInvalidDisplayOrders();
    
    // Get all parent categories and reorder their children, excluding soft-deleted
    const parentCategories = await Category.find({ 
      level: 1, 
      // isActive: true, // Commented out isActive check
      isDeleted: { $ne: true } // Exclude soft-deleted categories
    });
    console.log(`Found ${parentCategories.length} parent categories`);
    
    for (const parent of parentCategories) {
      console.log(`Fixing children for parent: ${parent.name}`);
      await reorderSiblingsSequentially(parent._id);
    }
    
    // Also reorder top-level categories (no parent), excluding soft-deleted
    console.log("Fixing top-level categories");
    await reorderSiblingsSequentially(null);
    
    // Verify the fix
    const categoriesWithZeroOrder = await Category.find({ displayOrder: 0 });
    const categoriesWithInvalidOrder = await Category.find({ displayOrder: { $lte: 0 } });
    
    console.log(`Categories with displayOrder 0: ${categoriesWithZeroOrder.length}`);
    console.log(`Categories with invalid displayOrder: ${categoriesWithInvalidOrder.length}`);
    
    sendResponse(res, HTTP_STATUS_200, "Display orders fixed successfully", {
      message: "Display orders have been fixed",
      categoriesWithZeroOrder: categoriesWithZeroOrder.length,
      categoriesWithInvalidOrder: categoriesWithInvalidOrder.length
    });
  } catch (err) {
    console.error("Error fixing display orders:", err);
    return sendResponse(res, HTTP_STATUS_500, err.message);
  }
};