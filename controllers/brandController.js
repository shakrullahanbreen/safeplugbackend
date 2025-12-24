
import Category from "../models/categoryModel.js";
import Brand from "../models/brandModel.js";
import { sendResponse } from '../utils/helper.js';
import { HTTP_STATUS_200, HTTP_STATUS_400, HTTP_STATUS_404, HTTP_STATUS_500 } from '../utils/constants.js';

/**
 * Create a new brand
 * @route POST /api/brands
 */
export const createBrand = async (req, res) => {
  try {
    const { name, title, image, categories, isActive,isFeatured } = req.body;

    // Validate that all category IDs exist
    const categoryIds = categories?.map(cat => cat._id) || [];

    const foundCategories = await Category.find({
      _id: { $in: categoryIds }
    });

    if (foundCategories.length !== categoryIds.length) {
      return sendResponse(res, HTTP_STATUS_400, 'One or more categories not found');
    }

    // Create the brand
    const brand = await Brand.create({
      name,
      title: title || name,
      image: image || "",
      categories: categories,
      isActive: isActive !== undefined ? isActive : true,
      isFeatured: isFeatured !== undefined ? isFeatured : false
    });

    sendResponse(res, HTTP_STATUS_200, "Brand created successfully", brand);
  } catch (err) {
    console.error("Error:", err);
    return sendResponse(res, HTTP_STATUS_500, "Internal Server Error");
  }
};


/**
 * Get all brands
 * @route GET /api/brands
 */
export const getBrands = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      categoryId,
      isActive,
      sort = 'createdAt',
      order = 'desc',
      search
    } = req.query;

    const query = {};

    // Filter by categoryId (since categories is now an array)
    if (categoryId) {
      query.categories = categoryId; // Matches if categoryId exists in array
    }

    // Filter by isActive
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }

    // Search by name or title
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { title: { $regex: search, $options: 'i' } }
      ];
    }

    const sortOrder = order === 'asc' ? 1 : -1;
    const sortObj = {};
    sortObj[sort] = sortOrder;

    const skip = (Number(page) - 1) * Number(limit);

    const [brands, totalCount] = await Promise.all([
      Brand.find(query)
        .sort(sortObj)
        .skip(skip)
        .limit(Number(limit)),
      Brand.countDocuments(query)
    ]);

    const totalPages = Math.ceil(totalCount / Number(limit));

    sendResponse(res, HTTP_STATUS_200, "Brands retrieved successfully", {
      brands,
      pagination: {
        totalItems: totalCount,
        totalPages,
        currentPage: Number(page),
        pageSize: Number(limit)
      }
    });
  } catch (err) {
    console.error("Error:", err);
    return sendResponse(res, HTTP_STATUS_500, "Internal Server Error");
  }
};




/**
 * Get brand by ID
 * @route GET /api/brands/:id
 */
export const getBrandById = async (req, res) => {
  try {
    const brand = await Brand.findById(req.params.id);
    if (!brand) return sendResponse(res, HTTP_STATUS_404, 'Brand not found');
    
    sendResponse(res, HTTP_STATUS_200, "Brand retrieved successfully", brand);
  } catch (err) {
    return sendResponse(res, HTTP_STATUS_500, err.message);
  }
};

/**
 * Get brands by category ID
 * @route GET /api/brands/category/:categoryId
 */
export const getBrandsByCategory = async (req, res) => {
  try {
    const categoryId = req.params.categoryId;
    
    // Verify the category exists
    const category = await Category.findById(categoryId);
    if (!category) {
      return sendResponse(res, HTTP_STATUS_404, 'Category not found');
    }
    
    const brands = await Brand.find({ 
      categoryId: categoryId,
      isActive: true 
    }).sort({ name: 1 });
    
    sendResponse(res, HTTP_STATUS_200, "Brands retrieved successfully", brands);
  } catch (err) {
    return sendResponse(res, HTTP_STATUS_500, err.message);
  }
};

/**
 * Update a brand
 * @route PUT /api/brands/:id
 */
export const updateBrand = async (req, res) => {
  try {
    const { name, title, image, categories, isActive,isFeatured } = req.body;
    const brandId = req.params.id;

    // Check if the brand exists
    const brand = await Brand.findById(brandId);
    if (!brand) return sendResponse(res, HTTP_STATUS_404, 'Brand not found');

    // If categories are being updated, validate all new category IDs exist
    let categoryIds = [];
    if (categories) {
      categoryIds = categories.map(cat => cat._id);

      const foundCategories = await Category.find({
        _id: { $in: categoryIds }
      });

      if (foundCategories.length !== categoryIds.length) {
        return sendResponse(res, HTTP_STATUS_400, 'One or more categories not found');
      }
    }

    // Prepare updated fields
    const updateData = {
      ...(name && { name }),
      ...(title ? { title } : name ? { title: name } : {}),
      ...(image && { image }),
      ...(categories && { categories: categoryIds }),
      ...(typeof isActive === 'boolean' && { isActive }),
      ...(typeof isFeatured === 'boolean' && { isFeatured }),
      updatedAt: Date.now(),
    };

    // Update the brand
    const updatedBrand = await Brand.findByIdAndUpdate(brandId, updateData, { new: true });

    sendResponse(res, HTTP_STATUS_200, "Brand updated successfully", updatedBrand);
  } catch (err) {
    console.error("Error:", err);
    return sendResponse(res, HTTP_STATUS_500, "Internal Server Error");
  }
};


/**
 * Delete a brand
 * @route DELETE /api/brands/:id
 */
export const deleteBrand = async (req, res) => {
  try {
    const brandId = req.params.id;
    
    // Check if the brand exists
    const brand = await Brand.findById(brandId);
    if (!brand) return sendResponse(res, HTTP_STATUS_404, 'Brand not found');

    // Check if the brand is used in any products before deletion
    // This is a placeholder - you'll need to replace this with your actual relationship check
    // const productCount = await Product.countDocuments({ brandId });
    // if (productCount > 0) {
    //   return sendResponse(res, HTTP_STATUS_400, 'Cannot delete brand that is used in products');
    // }

    await Brand.findByIdAndDelete(brandId);
    sendResponse(res, HTTP_STATUS_200, 'Brand deleted successfully');
  } catch (err) {
    return sendResponse(res, HTTP_STATUS_500, err.message);
  }
};

/**
 * Toggle brand active status
 * @route PATCH /api/brands/:id/toggle-status
 */
export const toggleBrandStatus = async (req, res) => {
  try {
    const brandId = req.params.id;
    
    const brand = await Brand.findById(brandId);
    if (!brand) return sendResponse(res, HTTP_STATUS_404, 'Brand not found');

    // Toggle the isActive status
    brand.isActive = !brand.isActive;
    await brand.save();

    const statusMessage = brand.isActive ? 'activated' : 'deactivated';
    sendResponse(res, HTTP_STATUS_200, `Brand ${statusMessage} successfully`, brand);
  } catch (err) {
    return sendResponse(res, HTTP_STATUS_500, err.message);
  }
};