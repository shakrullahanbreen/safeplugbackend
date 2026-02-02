import Category from "../models/categoryModel.js";
import Product from "../models/productModel.js";
import Brand from "../models/brandModel.js";
import {
  HTTP_STATUS_200,
  HTTP_STATUS_400,
  HTTP_STATUS_404,
  HTTP_STATUS_500,
  USERTYPE,
  USERTYPE_CHAINSTORE,
  USERTYPE_FRANCHISE,
  USERTYPE_RETAILER,
  USERTYPE_WHOLESALER,
} from "../utils/constants.js";
import {
  getMongoId,
  sendResponse,
  validateObjectIdOrThrow,
} from "../utils/helper.js";
import mongoose from "mongoose";
import { triggerRestockEmails } from "./notifyController.js";
// import { createError } from "../utils/error.js";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";

// Cache for checking if a text index exists on products
let productsTextIndexAvailableCache = undefined;
const isProductsTextIndexAvailable = async () => {
  if (productsTextIndexAvailableCache !== undefined) return productsTextIndexAvailableCache;
  try {
    const indexes = await Product.collection.indexes();
    productsTextIndexAvailableCache = Array.isArray(indexes)
      && indexes.some(idx => idx.key && Object.values(idx.key).some(v => v === "text"));
  } catch (e) {
    productsTextIndexAvailableCache = false;
  }
  return productsTextIndexAvailableCache;
};

// In-memory cache for category children (5 minute TTL)
const categoryChildrenCache = new Map();
const CATEGORY_CHILDREN_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Helper function to get category children with caching
const getCategoryChildren = async (categoryId) => {
  const cacheKey = `category_children_${categoryId.toString()}`;
  const cached = categoryChildrenCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CATEGORY_CHILDREN_CACHE_TTL_MS) {
    return cached.children;
  }
  
  const children = await Category.find({ parentId: categoryId }).select('_id').lean();
  const childIds = children.map(c => c._id);
  
  categoryChildrenCache.set(cacheKey, {
    children: childIds,
    timestamp: Date.now()
  });
  
  return childIds;
};

// Helper function to handle display order conflicts and cascading updates
const handleDisplayOrderUpdate = async (productId, newDisplayOrder, categoryId, subCategoryId = null) => {
  try {
    let oldDisplayOrder = 1;
    
    // Get the product being updated (if productId is provided)
    if (productId) {
      const product = await Product.findById(productId);
      if (!product) {
        throw new Error("Product not found");
      }
      oldDisplayOrder = product.displayOrder || 1;
      
      // If display order hasn't changed, no need to update
      if (oldDisplayOrder === newDisplayOrder) {
        return;
      }
    }

    // Build category filter
    const categoryFilter = subCategoryId 
      ? { subCategory: subCategoryId }
      : { category: categoryId };

    // Get all products in the same category with display order >= newDisplayOrder
    const productsToUpdate = await Product.find({
      ...categoryFilter,
      _id: { $ne: productId }, // Exclude the current product
      isDeleted: { $ne: true }
    }).sort({ displayOrder: 1 });

    // If moving to a higher number (e.g., 1 -> 5) or inserting a new product
    if (newDisplayOrder > oldDisplayOrder || !productId) {
      // Shift products with display order >= newDisplayOrder up by 1
      const productsToShiftUp = productsToUpdate.filter(p => 
        p.displayOrder >= newDisplayOrder
      );
      
      for (const p of productsToShiftUp) {
        await Product.findByIdAndUpdate(p._id, { displayOrder: p.displayOrder + 1 });
      }
    } 
    // If moving to a lower number (e.g., 5 -> 1) and it's an existing product
    else if (newDisplayOrder < oldDisplayOrder && productId) {
      // Shift products with display order >= newDisplayOrder and < oldDisplayOrder up by 1
      const productsToShiftUp = productsToUpdate.filter(p => 
        p.displayOrder >= newDisplayOrder && p.displayOrder < oldDisplayOrder
      );
      
      for (const p of productsToShiftUp) {
        await Product.findByIdAndUpdate(p._id, { displayOrder: p.displayOrder + 1 });
      }
    }

    // Update the current product's display order (only if productId is provided)
    if (productId) {
      await Product.findByIdAndUpdate(productId, { displayOrder: newDisplayOrder });
    }

    return {
      success: true,
      message: `Display order updated successfully. ${productsToUpdate.length} other products were reordered.`
    };

  } catch (error) {
    console.error("Error handling display order update:", error);
    throw error;
  }
};

// Helper function to reorder products after deletion
const reorderProductsAfterDeletion = async (categoryId, subCategoryId = null) => {
  try {
    // Build category filter
    const categoryFilter = subCategoryId 
      ? { subCategory: subCategoryId }
      : { category: categoryId };

    // Get all remaining products in the category, sorted by display order
    const remainingProducts = await Product.find({
      ...categoryFilter,
      isDeleted: { $ne: true }
    }).sort({ displayOrder: 1 });

    // Reassign display order sequentially (1, 2, 3, ...)
    const updatePromises = remainingProducts.map(async (product, index) => {
      const newDisplayOrder = index + 1;
      if (product.displayOrder !== newDisplayOrder) {
        return Product.findByIdAndUpdate(product._id, { displayOrder: newDisplayOrder });
      }
    });

    await Promise.all(updatePromises.filter(Boolean));

    return {
      success: true,
      message: `Reordered ${remainingProducts.length} products after deletion.`
    };

  } catch (error) {
    console.error("Error reordering products after deletion:", error);
    throw error;
  }
};

export const createProduct = async (req, res) => {
  try {
    const {
      name,
      description,
      pricing,
      images,
      discountImage,
      published,
      category,
      subCategory,
      brand,
      stock,
      sku,
      bin,
      bin,
      tags,
      attributes,
      isNew,
      featured,
      mostPopular,
      mostSold,
      price,
      costPrice, //this is manufacturing cost... price should always be 300% of costprice
      metaTitle,
      metaDescription,
      // models, // Commented out as requested
      displayOrder
    } = req.body;

    // 1. Basic field validations
    const requiredFields = {
      name: "Product name is required",
      description: "Product description is required",
      category: "Category is required",
    };

    for (const [field, message] of Object.entries(requiredFields)) {
      const value = req.body[field];
      if (value === undefined || value === null || value === "") {
        return sendResponse(res, HTTP_STATUS_400, message);
      }
    }

    // Validate images array
    // if (!Array.isArray(images) || images.length === 0) {
    //   return sendResponse(res, HTTP_STATUS_400, "At least one image is required");
    // }

    // Validate stock
    if (stock === undefined || stock === null) {
      return sendResponse(res, HTTP_STATUS_400, "Stock quantity is required");
    }

    // Validate price
    const mainPrice = Number(price);
    if (!mainPrice || isNaN(mainPrice) || mainPrice <= 0) {
      return sendResponse(res, HTTP_STATUS_400, "Valid main price is required");
    }

    // Validate optional costPrice
    let finalCostPrice = undefined;
    if (costPrice !== undefined && costPrice !== null) {
      const parsedCost = Number(costPrice);
      if (isNaN(parsedCost) || parsedCost <= 0) {
        return sendResponse(res, HTTP_STATUS_400, "Valid cost price is required");
      }
      finalCostPrice = parsedCost;
    }

    // Normalize SKU (trim only; keep case sensitivity as-is)
    const normalizedSku = typeof sku === "string" ? sku.trim() : sku;

    // 2. Check if product with same name exists
    const existingProduct = await Product.findOne({ name });
    if (existingProduct) {
      return sendResponse(res, HTTP_STATUS_400, "Product with this name already exists");
    }

    // 3. Validate category
    if (!mongoose.Types.ObjectId.isValid(category)) {
      return sendResponse(res, HTTP_STATUS_400, "Invalid category ID");
    }
    const categoryExists = await Category.findById(category);
    if (!categoryExists) {
      return sendResponse(res, HTTP_STATUS_404, "Category not found");
    }

    // 4. Validate brand (if provided)
    if (brand) {
      if (!mongoose.Types.ObjectId.isValid(brand)) {
        return sendResponse(res, HTTP_STATUS_400, "Invalid brand ID");
      }
      const brandExists = await Brand.findById(brand);
      if (!brandExists) {
        return sendResponse(res, HTTP_STATUS_404, "Brand not found");
      }
    }

    // 5. Generate unique productId
    let productId;
    while (true) {
      const tempId = `#${Math.random().toString(36).substring(2, 8)}`;
      const isUnique = await Product.findOne({ productId: tempId });
      if (!isUnique) {
        productId = tempId;
        break;
      }
    }

    // 6. Handle display order for new product
    let finalDisplayOrder = displayOrder ? Number(displayOrder) : 1;

    // If display order is provided, handle conflicts
    if (displayOrder) {
      // Use handleDisplayOrderUpdate to properly handle conflicts
      await handleDisplayOrderUpdate(null, finalDisplayOrder, category, subCategory);
    } else {
      // If no display order provided, append to end using count+1 (robust against nulls)
      const categoryFilter = subCategory
        ? { subCategory: subCategory }
        : { category: category };

      const productCountInScope = await Product.countDocuments({
        ...categoryFilter,
        isDeleted: { $ne: true }
      });

      finalDisplayOrder = productCountInScope + 1;
    }

    // 7. Prevent duplicate SKU if provided
    if (normalizedSku) {
      const existingSku = await Product.findOne({ sku: normalizedSku });
      if (existingSku) {
        return sendResponse(res, HTTP_STATUS_400, "Product with this SKU already exists");
      }
    }

    // 8. Create the product
    const newProduct = new Product({
      name,
      description,
      productId,
      price: mainPrice,
      costPrice: finalCostPrice,
      pricing,
      images,
      discountImage: discountImage || null,
      published: !!published,
      category,
      subCategory: subCategory || null,
      brand: brand || null,
      stock: Number(stock),
      sku: normalizedSku,
      bin: typeof bin === "string" ? bin.trim() : (bin || ""),
      tags: Array.isArray(tags) ? tags : [],
      attributes: typeof attributes === "object" ? attributes : {},

      isNew: !!isNew,
      featured: !!featured,
      mostPopular: !!mostPopular,
      mostSold: !!mostSold,
      metaTitle,
      metaDescription,
      // models, // Commented out as requested
      displayOrder: finalDisplayOrder
    });

    const savedProduct = await newProduct.save();

    // Invalidate special products cache if this product affects special products
    if (featured || mostPopular || mostSold) {
      invalidateSpecialProductsCache();
    }

    // Populate for response
    const populatedProduct = await Product.findById(savedProduct._id)
      .populate("category", "name")
      .populate("brand", "name logo");

    return sendResponse(res, 200, "Product created successfully", populatedProduct);
  } catch (err) {
    console.error("❌ Error creating product:", err);
    return sendResponse(res, HTTP_STATUS_500, "Internal Server Error");
  }
};

// export const updateProduct = async (req, res) => {
//   try {
//     const {
//       id,
//       name,
//       description,
//       // basePrice,
//       price, // this is actual  cost
//       images,
//       published,
//       category,
//       subCategory,
//       brand,
//       stock,
//       costPrice,
//       sku,
//       tags,
//       attributes,
//       isNew,
//       featured,
//       metaTitle,
//       mostSold,
//       models,
//       mostPopular,
//       metaDescription,
//       pricing
//     } = req.body;

//     console.log(req.body)
//     // 1. Check if product exists
//     const product = await Product.findById(id);
//     if (!product)
//       return sendResponse(res, HTTP_STATUS_404, "Product not found");

//     // 2. Validate category and brand if provided
//     if (category) {
//       const categoryExists = await Category.findById(category);
//       if (!categoryExists)
//         return sendResponse(res, HTTP_STATUS_404, "Category not found");
//     }
//     const existingProduct = await Product.findOne({ name, _id: { $ne: id } });
//     if (existingProduct) {
//       return sendResponse(
//         res,
//         HTTP_STATUS_400,
//         "Product with this name already exists"
//       );
//     }

//     if (brand) {
//       const brandExists = await Brand.findById(brand);
//       if (!brandExists)
//         return sendResponse(res, HTTP_STATUS_404, "Brand not found");
//     }

//     // 3. Pricing calculation if basePrice and percentage are provided
//     // let pricing = {};
//     // if ( price && typeof pricing === "object") {
//     //   const requiredPricingKeys = [
//     //     // "regular",
//     //     "reseller",
//     //     "wholesale",
//     //     "retail",
//     //     "onlineReseller",
//     //   ];

//     //   for (const key of requiredPricingKeys) {
//     //     if (!(key in price) || typeof price[key].percentage !== "number") {
//     //       return sendResponse(
//     //         res,
//     //         HTTP_STATUS_400,
//     //         `Pricing for ${key} must include a valid percentage`
//     //       );
//     //     }
//     //   }

//     //   for (const [key, { percentage }] of Object.entries(price)) {
//     //     const calculatedPrice = basePrice + (basePrice * percentage) / 100;
//     //     pricing[key] = {
//     //       percentage,
//     //       price: Math.round(calculatedPrice),
//     //     };
//     //   }
//     // }

//     // 4. Build update object
//     const updateData = {
//       ...(name && { name }),
//       ...(description && { description }),
//       ...(costPrice && { costPrice }),
//       // ...(basePrice && { basePrice }),
//       ...(price && { price }),
//       ...(pricing && Object.keys(pricing).length && { pricing }),
//       ...(Array.isArray(images) && { images }),
//       ...(typeof published === "boolean" && { published }),
//       ...(category && { category }),
//       ...(subCategory && { subCategory }),
//       ...(brand && { brand }),
//       ...(typeof stock === "number" && { stock }),
//       ...(sku && { sku }),
//       ...(Array.isArray(tags) && { tags }),
//       ...(Array.isArray(models) && { models }),
//       ...(typeof attributes === "object" &&
//         attributes !== null && { attributes }),

//       ...(typeof mostSold === "boolean" && { mostSold }),
//       ...(typeof mostPopular === "boolean" && { mostPopular }),
//       ...(typeof featured === "boolean" && { featured }),

//       ...(typeof isNew === "boolean" && { isNew }),
//       ...(metaTitle && { metaTitle }),
//       ...(metaDescription && { metaDescription }),
//       updatedAt: Date.now(),
//     };

//     // 5. Update the product
//     const updatedProduct = await Product.findByIdAndUpdate(id, updateData, {
//       new: true,
//       runValidators: true,
//     })
//       .populate("category", "name")
//       .populate("brand", "name logo");

//     if (!updatedProduct)
//       return sendResponse(res, HTTP_STATUS_404, "Product not found");

//     // If stock transitioned from 0 to >0, trigger restock emails
//     try {
//       if (typeof stock === "number") {
//         const previousStock = product.stock || 0;
//         const newStock = updatedProduct?.stock || 0;
//         if (previousStock <= 0 && newStock > 0) {
//           await triggerRestockEmails(id);
//         }
//       }
//     } catch (e) {
//       console.error("Failed triggering restock emails:", e);
//     }

//     sendResponse(
//       res,
//       HTTP_STATUS_200,
//       "Product updated successfully",
//       updatedProduct
//     );
//   } catch (err) {
//     console.error("Error updating product:", err);
//     sendResponse(res, HTTP_STATUS_500, "Internal Server Error");
//   }
// };


export const updateProduct = async (req, res) => {
  try {
    const {
      id,
      name,
      description,
      price, // main price field
      images,
      discountImage,
      published,
      category,
      subCategory,
      brand,
      stock,
      costPrice,
      sku,
      bin,
      tags,
      attributes,
      isNew,
      featured,
      metaTitle,
      mostSold,
      models,
      mostPopular,
      metaDescription,
      pricing, // tier pricing object
      displayOrder
    } = req.body;

    console.log("Update product request - ID:", id);
    console.log("Update product request - Fields received:", Object.keys(req.body).filter(key => req.body[key] !== undefined));

    // 1. Check if product exists
    const product = await Product.findById(id);
    if (!product) {
      return sendResponse(res, HTTP_STATUS_404, "Product not found");
    }

    // 2. Check for duplicate product name only if it's changing
    if (name && name !== product.name) {
      const existingProduct = await Product.findOne({ name });
      if (existingProduct) {
        return sendResponse(
          res,
          HTTP_STATUS_400,
          "Product with this name already exists"
        );
      }
    }

    // 3. Check for duplicate SKU only if it's changing
    if (sku !== undefined && sku !== product.sku) {
      const normalizedSku = typeof sku === "string" ? sku.trim() : sku;
      const existingSku = await Product.findOne({ sku: normalizedSku });
      if (existingSku) {
        return sendResponse(
          res,
          HTTP_STATUS_400,
          "Product with this SKU already exists"
        );
      }
    }

    // 4. Validate category if provided
    if (category) {
      const categoryExists = await Category.findById(category);
      if (!categoryExists) {
        return sendResponse(res, HTTP_STATUS_404, "Category not found");
      }
    }

    // 5. Validate subCategory if provided
    if (subCategory) {
      const subCategoryExists = await Category.findById(subCategory);
      if (!subCategoryExists) {
        return sendResponse(res, HTTP_STATUS_404, "Subcategory not found");
      }
    }

    // 6. Validate brand if provided
    if (brand) {
      const brandExists = await Brand.findById(brand);
      if (!brandExists) {
        return sendResponse(res, HTTP_STATUS_404, "Brand not found");
      }
    }

    // 7. Validate pricing structure if provided
    if (pricing && typeof pricing === "object") {
      const requiredPricingKeys = ["Franchise", "Retailer", "Wholesale", "ChainStore"];
      
      for (const key of requiredPricingKeys) {
        if (!pricing[key] || typeof pricing[key].price !== "number") {
          return sendResponse(
            res,
            HTTP_STATUS_400,
            `Pricing for ${key} must include a valid price`
          );
        }
      }
    }

    // 8. Handle display order update if provided
    if (displayOrder !== undefined) {
      const newDisplayOrder = Number(displayOrder);
      const finalCategory = category || product.category;
      const finalSubCategory = subCategory !== undefined ? subCategory : product.subCategory;
      
      // Handle display order conflicts and cascading updates
      await handleDisplayOrderUpdate(id, newDisplayOrder, finalCategory, finalSubCategory);
    }

    // 8.5. Check if relevant fields will change (for cache invalidation)
    // Use the product we already fetched at the beginning
    const relevantFieldsChanged = 
      (featured !== undefined && featured !== product.featured) ||
      (mostPopular !== undefined && mostPopular !== product.mostPopular) ||
      (mostSold !== undefined && mostSold !== product.mostSold) ||
      (published !== undefined && published !== product.published);

    // 9. Build update object
    const updateData = {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(costPrice !== undefined && { costPrice }),
      ...(price !== undefined && { price }),
      ...(pricing !== undefined && pricing !== null && typeof pricing === 'object' && Object.keys(pricing).length > 0 && { pricing }),
      ...(images !== undefined && { images }),
      ...(discountImage !== undefined && { discountImage: discountImage || null }),
      ...(published !== undefined && { published }),
      ...(category !== undefined && { category }),
      ...(subCategory !== undefined && { subCategory: subCategory || null }),
      ...(brand !== undefined && { brand: brand || null }),
      ...(stock !== undefined && { stock }),
      ...(sku !== undefined && { sku: (typeof sku === "string" ? sku.trim() : sku) }),
      ...(bin !== undefined && { bin: (typeof bin === "string" ? bin.trim() : bin) }),
      ...(tags !== undefined && { tags }),
      ...(models !== undefined && { models }),
      ...(attributes !== undefined && { attributes }),
      ...(mostSold !== undefined && { mostSold }),
      ...(mostPopular !== undefined && { mostPopular }),
      ...(featured !== undefined && { featured }),
      ...(isNew !== undefined && { isNew }),
      ...(metaTitle !== undefined && { metaTitle }),
      ...(metaDescription !== undefined && { metaDescription }),
      ...(displayOrder !== undefined && { displayOrder: Number(displayOrder) }),
      updatedAt: Date.now(),
    };

    console.log("Update data being applied:", Object.keys(updateData).filter(key => key !== 'updatedAt'));

    // 10. Update the product
    const updatedProduct = await Product.findByIdAndUpdate(
      id, 
      updateData, 
      {
        new: true,
        runValidators: true,
      }
    )
      .populate("category", "name")
      .populate("subCategory", "name")
      .populate("brand", "name logo");

    if (!updatedProduct) {
      return sendResponse(res, HTTP_STATUS_404, "Product not found");
    }

    // Invalidate special products cache if relevant fields changed
    if (relevantFieldsChanged) {
      invalidateSpecialProductsCache();
    }

    // 10. If stock transitioned from 0 to >0, trigger restock emails
    try {
      if (stock !== undefined) {
        const previousStock = product.stock || 0;
        const newStock = updatedProduct.stock || 0;
        if (previousStock <= 0 && newStock > 0) {
          await triggerRestockEmails(id);
        }
      }
    } catch (e) {
      console.error("Failed triggering restock emails:", e);
    }

    sendResponse(
      res,
      HTTP_STATUS_200,
      "Product updated successfully",
      updatedProduct
    );
  } catch (err) {
    console.error("Error updating product:", err);
    
    // Handle specific MongoDB errors
    if (err.name === 'MongooseError' && err.message.includes('buffering timed out')) {
      return sendResponse(res, HTTP_STATUS_500, "Database connection timeout. Please try again.");
    }
    
    sendResponse(res, HTTP_STATUS_500, "Internal Server Error");
  }
};



export const deleteProduct = async (req, res, next) => {
  try {
    const productId = req.body.id;
    const product = await Product.findById(productId);

    if (!product) {
      return sendResponse(res, HTTP_STATUS_404, "Product not found");
    }

    // Store category info before deletion for reordering
    const categoryId = product.category;
    const subCategoryId = product.subCategory;

    // Check if product affects special products cache
    const affectsSpecialProducts = product.featured || product.mostPopular || product.mostSold;

    // Delete the product
    const deletedProduct = await Product.findByIdAndDelete(productId);

    if (!deletedProduct) {
      return sendResponse(res, HTTP_STATUS_404, "Product not found");
    }

    // Invalidate special products cache if deleted product was in special products
    if (affectsSpecialProducts) {
      invalidateSpecialProductsCache();
    }

    // Also delete any variations if this is a parent product
    if (!deletedProduct.isVariation) {
      await Product.deleteMany({ parentId: productId });
    }

    // Reorder remaining products in the same category
    try {
      await reorderProductsAfterDeletion(categoryId, subCategoryId);
    } catch (reorderError) {
      console.error("Error reordering products after deletion:", reorderError);
      // Don't fail the deletion if reordering fails
    }

    sendResponse(res, HTTP_STATUS_200, "Product has been deleted successfully");
  } catch (err) {
    console.error("Error deleting product:", err);
    sendResponse(res, HTTP_STATUS_500, "Internal Server Error");
  }
};

export const getProduct = async (req, res, next) => {
  try {
    const user = req.user || req.body?.user;
    console.log("User from req.user:", req.user)
    console.log("User from req.body.user:", req.body?.user)
    console.log("Final user:", user)
    const product = await Product.findById(req.params.id)
      .populate("category", "name")
      .populate("brand", "name logo")
      .populate("variations", "name price pricing images");

    if (!product) {
      return sendResponse(res, HTTP_STATUS_404, "Product not found");
    }

    // Determine user tier

    let userTier = "Franchise";

    if (user?.role) {
      const role = user.role.toLowerCase();
      const roleMap = {
        wholesale: "Wholesale",
        retailer: "Retailer",
        chainstore: "ChainStore",
        franchise: "Franchise",
      };
      userTier = roleMap[role] || "Franchise";
    }

    // Determine final price for product
    const tierPricing = product.pricing?.[userTier];
    const finalPrice = tierPricing?.price ?? product.price;

    // Also calculate price for each variation
    const variations = product.variations?.map(variation => {
      const varTierPrice = variation.pricing?.[userTier]?.price ?? variation.price;
      return {
        _id: variation._id,
        name: variation.name,
        images: variation.images,
        price: variation.price,
        pricing: varTierPrice,
      };
    });

    // Determine the pricing to return based on user role
    let pricingToReturn;
    if (!user) {
      // No user logged in, return Franchise price
      pricingToReturn = product.pricing["Franchise"].price;
    } else if (user.role === "Admin") {
      // Admin sees all pricing tiers
      pricingToReturn = product.pricing;
    } else {
      // Regular users see their role-based price
      pricingToReturn = finalPrice;
    }

    sendResponse(
      res,
      HTTP_STATUS_200,
      "Product retrieved successfully",
      {
        ...product.toObject(),
        pricing: pricingToReturn,
        // pricing: !user  ? product.pricing["Franchise"].price : theFinalPrice,
        userTier,
        variations
      }
    );

  } catch (err) {
    console.error("Error retrieving product:", err);
    sendResponse(res, HTTP_STATUS_500, "Internal Server Error");
  }
};
// export const getProducts = async (req, res) => {
//   try {
//     const {
//       category,
//       brand,
//       models,
//       minPrice,
//       maxPrice,
//       published,
//       featured,
//       mostSold,
//       mostPopular,
//       sort = "createdAt",
//       order = "desc",
//       search,
//       tag,
//       page = 1,
//       limit = 16,
//     } = req.query;

//     const { user } = req.body;

//     const parsedPage = Math.max(Number(page <= 0 ? 1 : page), 1);
//     const parsedLimit = Math.min(parseInt(limit), 50);
//     const skip = (parsedPage - 1) * parsedLimit;

//     let userTier = "Franchise";
//     if (user?.role) {
//       const role = user.role.toLowerCase();
//       const roleMap = {
//         wholesale: "Wholesale",
//         retailer: "Retailer",
//         chainstore: "ChainStore",
//         franchise: "Franchise",
//       };
//       userTier = roleMap[role] || "Franchise";
//     }

//     // Always filter for published products only, exclude deletedCategories, and exclude soft-deleted products
//     let match = { 
//       published: true,
//       isDeleted: { $ne: true }, // Exclude soft-deleted products
//       category: { $ne: new mongoose.Types.ObjectId("68a62a1208e4173abbf49e0e") },
//       subCategory: { $ne: new mongoose.Types.ObjectId("68a62a1208e4173abbf49e0e") }
//     };

//     // Category filtering
//     if (category) {
//       validateObjectIdOrThrow(category, "Category ID");
//       const categoryDoc = await Category.findById(category);
//       if (categoryDoc) {
//         const children = await Category.find({ parentId: categoryDoc._id });
//         const categoryIds = [categoryDoc._id, ...children.map(c => c._id)];

//         match.$or = [
//           { category: { $in: categoryIds } },
//           { subCategory: { $in: categoryIds } },
//         ];
//       }
//     }

//     // Models filtering
//     if (models) {
//       const modelArray = models.split(",").map(m => m.trim()).filter(m => m);
//       if (modelArray.length > 0) {
//         match.models = { $in: modelArray };
//       }
//     }

//     // Brand filtering
//     if (brand) {
//       const brandDoc = await Brand.findOne({
//         name: { $regex: new RegExp(brand, "i") },
//       });
//       if (brandDoc) {
//         match.brand = brandDoc._id;
//       }
//     }



//     // Tag filtering
//     if (tag) {
//       const tagRegex = new RegExp(tag, "i");
//       const tagCondition = { tags: { $elemMatch: { $regex: tagRegex } } };

//       if (match.$and) {
//         match.$and.push(tagCondition);
//       } else if (match.$or) {
//         match.$and = [{ $or: match.$or }, tagCondition];
//         delete match.$or;
//       } else {
//         Object.assign(match, tagCondition);
//       }
//     }

//     // Featured, Most Sold, Most Popular filtering
//     if (featured === "true") match.featured = true;
//     if (mostSold === "true") match.mostSold = true;
//     if (mostPopular === "true") match.mostPopular = true;

//     // Search filtering
//     if (search) {
//       const searchFilter = [
//         { name: { $regex: search, $options: "i" } },
//         { sku: { $regex: search, $options: "i" } },
//       ];
      
//       if (match.$and) {
//         match.$and.push({ $or: searchFilter });
//       } else if (match.$or) {
//         match.$and = [{ $or: match.$or }, { $or: searchFilter }];
//         delete match.$or;
//       } else {
//         match.$or = searchFilter;
//       }
//     }

//     // Sort field validation
//     const allowedSortFields = [
//       "createdAt", "price", "pricing", "mostPopular", "mostSold", "name", "displayOrder", "stock"
//     ];
//     const sortField = allowedSortFields.includes(sort) ? sort : "displayOrder";
//     const sortOrder = order === "asc" ? 1 : -1;
// console.log("match 111",match)
//     // Build aggregation pipeline
//     const pipeline = [
//       { $match: match },
//       {
//         $addFields: {
//           finalPrice: {
//             $cond: {
//               if: { 
//                 $and: [
//                   { $ne: [`$pricing.${userTier}`, null] },
//                   { $ne: [`$pricing.${userTier}.price`, null] },
//                   { $ne: [`$pricing.${userTier}.price`, undefined] }
//                 ]
//               },
//               then: `$pricing.${userTier}.price`,
//               else: { $ifNull: ["$price", 0] }
//             }
//           },
//           userTier: userTier
//         }
//       }
//     ];

//     // Price filtering after calculating finalPrice
//     if (minPrice || maxPrice) {
//       const priceCondition = {};
//       if (minPrice && !isNaN(Number(minPrice))) {
//         priceCondition.$gte = Number(minPrice);
//       }
//       if (maxPrice && !isNaN(Number(maxPrice))) {
//         priceCondition.$lte = Number(maxPrice);
//       }

//       if (Object.keys(priceCondition).length > 0) {
//         pipeline.push({
//           $match: {
//             finalPrice: priceCondition
//           }
//         });
//       }
//     }

//     // Determine sort field
//     let mongoSortField;
//     switch (sortField) {
//       case "price":
//       case "pricing":
//         mongoSortField = "finalPrice";
//         break;
//       case "displayOrder":
//         mongoSortField = "displayOrder";
//         break;
//       default:
//         mongoSortField = sortField;
//     }

//     // Add remaining pipeline stages
//     // For displayOrder, handle null values by putting them at the end
//     if (mongoSortField === "displayOrder") {
//       pipeline.push({
//         $addFields: {
//           sortDisplayOrder: {
//             $ifNull: ["$displayOrder", 999999] // Put null values at the end
//           }
//         }
//       });
//       pipeline.push({ $sort: { sortDisplayOrder: sortOrder } });
//     } else {
//       pipeline.push({ $sort: { [mongoSortField]: sortOrder } });
//     }
    
//     pipeline.push(
//       { $skip: skip },
//       { $limit: parsedLimit },
//       {
//         $lookup: {
//           from: "categories",
//           localField: "category",
//           foreignField: "_id",
//           as: "category"
//         }
//       },
//       { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
//       {
//         $lookup: {
//           from: "categories",
//           localField: "subCategory",
//           foreignField: "_id",
//           as: "subCategory"
//         }
//       },
//       { $unwind: { path: "$subCategory", preserveNullAndEmptyArrays: true } },
//       {
//         $lookup: {
//           from: "brands",
//           localField: "brand",
//           foreignField: "_id",
//           as: "brand"
//         }
//       },
//       { $unwind: { path: "$brand", preserveNullAndEmptyArrays: true } },
//       {
//         $project: {
//           name: 1,
//           description: 1,
//           images: 1,
//           published: 1,
//           category: { name: 1, _id: 1 },
//           subCategory: { name: 1, _id: 1 },
//           brand: { name: 1, logo: 1 },
//           stock: 1,
//           sku: 1,
//           tags: 1,
//           attributes: 1,
//           isNew: 1,
//           mostPopular: 1,
//           mostSold: 1,
//           featured: 1,
//           metaTitle: 1,
//           metaDescription: 1,
//           createdAt: 1,
//           updatedAt: 1,
//           models: 1,
//           price: 1,
//           pricing: "$finalPrice",
//           userTier: 1,
//           displayOrder: 1
//         }
//       }
//     );

//     // Count pipeline with same filtering logic
//     const countPipeline = [
//       { $match: match },
//       {
//         $addFields: {
//           finalPrice: {
//             $cond: {
//               if: { 
//                 $and: [
//                   { $ne: [`$pricing.${userTier}`, null] },
//                   { $ne: [`$pricing.${userTier}.price`, null] },
//                   { $ne: [`$pricing.${userTier}.price`, undefined] }
//                 ]
//               },
//               then: `$pricing.${userTier}.price`,
//               else: { $ifNull: ["$price", 0] }
//             }
//           }
//         }
//       }
//     ];
// console.log("countPipeline 111",countPipeline)
//     // Apply same price filtering to count pipeline
//     if (minPrice || maxPrice) {
//       const priceCondition = {};
//       if (minPrice && !isNaN(Number(minPrice))) {
//         priceCondition.$gte = Number(minPrice);
//       }
//       if (maxPrice && !isNaN(Number(maxPrice))) {
//         priceCondition.$lte = Number(maxPrice);
//       }

//       if (Object.keys(priceCondition).length > 0) {
//         countPipeline.push({
//           $match: {
//             finalPrice: priceCondition
//           }
//         });
//       }
//     }

//     countPipeline.push({ $count: "total" });

//     // Execute aggregations
//     const [products, totalCountArr] = await Promise.all([
//       Product.aggregate(pipeline),
//       Product.aggregate(countPipeline),
//     ]);
// console.log("products 222",products)
//     const totalProducts = totalCountArr[0]?.total || 0;

//     sendResponse(res, 200, "Products retrieved successfully", {
//       products,
//       pagination: {
//         currentPage: parsedPage,
//         totalPages: Math.ceil(totalProducts / parsedLimit),
//         totalItems: totalProducts,
//       },
//     });

//   } catch (err) {
//     console.error("Error retrieving products:", err);
//     sendResponse(res, 500, "Internal Server Error");
//   }
// };

export const getProducts = async (req, res) => {
  const startTime = Date.now();
  const perfLog = { category: req.query.category, page: req.query.page };
  
  try {
    const {
      category,
      brand,
      models,
      minPrice,
      maxPrice,
      published,
      featured,
      mostSold,
      mostPopular,
      sort = "createdAt",
      order = "desc",
      search,
      tag,
      page = 1,
      limit = 16,
    } = req.query;

    const { user } = req.body;

    const parsedPage = Math.max(Number(page <= 0 ? 1 : page), 1);
    const parsedLimit = Math.min(parseInt(limit), 50);
    const skip = (parsedPage - 1) * parsedLimit;

    let userTier = "Franchise";
    if (user?.role) {
      const role = user.role.toLowerCase();
      const roleMap = {
        wholesale: "Wholesale",
        retailer: "Retailer",
        chainstore: "ChainStore",
        franchise: "Franchise",
      };
      userTier = roleMap[role] || "Franchise";
    }

    // Base match conditions - simplified
    const deletedCategoryId = new mongoose.Types.ObjectId("68a62a1208e4173abbf49e0e");
    let match = { 
      published: true,
      isDeleted: { $ne: true },
      category: { $ne: deletedCategoryId },
      subCategory: { $ne: deletedCategoryId }
    };
    let usedTextSearch = false;

    // Category filtering with caching
    if (category) {
      try {
        const categoryStartTime = Date.now();
        // Trim whitespace from category ID
        const trimmedCategory = String(category).trim();
        
        // Validate ObjectId format
        if (!mongoose.Types.ObjectId.isValid(trimmedCategory)) {
          console.error("Invalid category ID format:", trimmedCategory);
          return sendResponse(res, 400, `Invalid category ID format: "${trimmedCategory}"`);
        }
        
        const categoryId = new mongoose.Types.ObjectId(trimmedCategory);
        
        // Get all child categories with caching
        const childIds = await getCategoryChildren(categoryId);
        const allCategoryIds = [categoryId, ...childIds];
        
        perfLog.categoryLookupTime = Date.now() - categoryStartTime;
        
        // Simplified match - optimized for category filtering
        // Combine $or with $and for proper MongoDB query structure
        match = {
          published: true,
          isDeleted: { $ne: true },
          $and: [
            {
              $or: [
                { category: { $in: allCategoryIds } },
                { subCategory: { $in: allCategoryIds } }
              ]
            },
            // Exclude deleted category
            { category: { $ne: deletedCategoryId } },
            { subCategory: { $ne: deletedCategoryId } }
          ]
        };
      } catch (error) {
        console.error("Error processing category filter:", {
          error: error.message,
          stack: error.stack,
          category: category,
          trimmedCategory: String(category).trim()
        });
        return sendResponse(res, 400, `Invalid category ID: ${error.message || "Unknown error"}`);
      }
    }

    // Tag filtering
    if (tag) {
      const tagRegex = new RegExp(tag, "i");
      const tagCondition = { tags: { $elemMatch: { $regex: tagRegex } } };

      if (match.$and) {
        match.$and.push(tagCondition);
      } else if (match.$or) {
        match.$and = [{ $or: match.$or }, tagCondition];
        delete match.$or;
      } else {
        Object.assign(match, tagCondition);
      }
    }
// Search filtering (apply when a search term is provided)
if (search) {
  const keywords = search.trim().split(/\s+/).filter(keyword => keyword.length > 0);
  const textAvailable = await isProductsTextIndexAvailable();

  if (textAvailable) {
    // Use native text search when index is available
    const textCondition = { $text: { $search: search } };
    usedTextSearch = true;

    if (match.$and) {
      match.$and.push(textCondition);
    } else if (match.$or) {
      match.$and = [{ $or: match.$or }, textCondition];
      delete match.$or;
    } else {
      Object.assign(match, textCondition);
    }
  } else if (keywords.length > 0) {
    // Fallback: phrase + all-keyword regex matching across fields
    const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const phraseRegex = new RegExp(escape(search), "i");
    const phraseCondition = {
      $or: [
        { name: { $regex: phraseRegex } },
        { sku: { $regex: phraseRegex } },
        { description: { $regex: phraseRegex } },
        { tags: { $elemMatch: { $regex: phraseRegex } } },
        { models: { $elemMatch: { $regex: phraseRegex } } },
      ],
    };

    const keywordConditions = keywords.map((word) => {
      const regex = new RegExp(escape(word), "i");
      return {
        $or: [
          { name: { $regex: regex } },
          { sku: { $regex: regex } },
          { description: { $regex: regex } },
          { tags: { $elemMatch: { $regex: regex } } },
          { models: { $elemMatch: { $regex: regex } } },
        ],
      };
    });

    const combinedSearch = {
      $and: keywords.map((word) => {
        const regex = new RegExp(word, "i");
        return {
          $or: [
            { name: { $regex: regex } },
            { sku: { $regex: regex } },
            { description: { $regex: regex } },
            { tags: { $elemMatch: { $regex: regex } } },
            { models: { $elemMatch: { $regex: regex } } },
          ],
        };
      }),
    };

    if (match.$and) {
      match.$and.push(combinedSearch);
    } else if (match.$or) {
      match.$and = [{ $or: match.$or }, combinedSearch];
      delete match.$or;
    } else {
      Object.assign(match, combinedSearch);
    }
  }
}

    // Search filtering (apply when a search term is provided)
    // if (search) {
    //   // Split search term into individual keywords and filter out empty strings
    //   const keywords = search.trim().split(/\s+/).filter(keyword => keyword.length > 0);
      
    //   if (keywords.length > 0) {
    //     // Original search: single regex pattern for exact phrase matching
    //     const originalSearchRegex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), "i");
    //     const originalSearchConditions = [
    //       { name: { $regex: originalSearchRegex } },
    //       { sku: { $regex: originalSearchRegex } },
    //       { description: { $regex: originalSearchRegex } },
    //       { tags: { $elemMatch: { $regex: originalSearchRegex } } },
    //       { models: { $elemMatch: { $regex: originalSearchRegex } } }
    //     ];

    //     // Enhanced search: individual keyword matching (all keywords must be present)
    //     const keywordConditions = keywords.map(keyword => {
    //       const keywordRegex = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), "i");
    //       return {
    //         $or: [
    //           { name: { $regex: keywordRegex } },
    //           { sku: { $regex: keywordRegex } },
    //           { description: { $regex: keywordRegex } },
    //           { tags: { $elemMatch: { $regex: keywordRegex } } },
    //           { models: { $elemMatch: { $regex: keywordRegex } } }
    //         ]
    //       };
    //     });

    //     // Combine both search approaches: original OR enhanced keyword matching
    //     const combinedSearchCondition = {
    //       $or: [
    //         { $or: originalSearchConditions }, // Original search behavior
    //         { $and: keywordConditions }        // Enhanced keyword matching
    //       ]
    //     };

    //     if (match.$and) {
    //       match.$and.push(combinedSearchCondition);
    //     } else if (match.$or) {
    //       match.$and = [{ $or: match.$or }, combinedSearchCondition];
    //       delete match.$or;
    //     } else {
    //       Object.assign(match, combinedSearchCondition);
    //     }
    //   }
    // }

    // console.log("Initial match query:", JSON.stringify(match, null, 2));

    // Build aggregation pipeline
    const pipeline = [
      { $match: match },
      {
        $addFields: {
          finalPrice: {
            $cond: {
              if: { 
                $and: [
                  { $ne: [`$pricing.${userTier}`, null] },
                  { $ne: [`$pricing.${userTier}.price`, null] },
                  { $ne: [`$pricing.${userTier}.price`, undefined] }
                ]
              },
              then: `$pricing.${userTier}.price`,
              else: { $ifNull: ["$price", 0] }
            }
          },
          userTier: userTier
        }
      }
    ];

    // Price filtering removed - not needed per requirements

    // Sort field validation
    const allowedSortFields = [
      "createdAt", "price", "pricing", "mostPopular", "mostSold", "name", "displayOrder", "stock"
    ];
    const sortField = allowedSortFields.includes(sort) ? sort : "displayOrder";
    const sortOrder = order === "asc" ? 1 : -1;

    // Determine sort field
    let mongoSortField;
    switch (sortField) {
      case "price":
      case "pricing":
        mongoSortField = "finalPrice";
        break;
      case "displayOrder":
        mongoSortField = "displayOrder";
        break;
      default:
        mongoSortField = sortField;
    }

    // Add remaining pipeline stages
    if (mongoSortField === "displayOrder") {
      pipeline.push({
        $addFields: {
          sortDisplayOrder: {
            $ifNull: ["$displayOrder", 999999]
          }
        }
      });
      pipeline.push({ $sort: { sortDisplayOrder: sortOrder } });
    } else {
      if (usedTextSearch) {
        // Prefer text relevance score when text search is used
        // IMPORTANT: $match with $text must be the FIRST stage; add score AFTER it
        pipeline.push({ $addFields: { score: { $meta: "textScore" } } });
        pipeline.push({ $sort: { score: { $meta: "textScore" }, [mongoSortField]: sortOrder } });
      } else {
        pipeline.push({ $sort: { [mongoSortField]: sortOrder } });
      }
    }
    
    // Build lookup stages
    const lookupStages = [
      {
        $lookup: {
          from: "categories",
          localField: "category",
          foreignField: "_id",
          as: "category",
          pipeline: [{ $project: { name: 1, _id: 1 } }] // Only fetch needed fields
        }
      },
      { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "categories",
          localField: "subCategory",
          foreignField: "_id",
          as: "subCategory",
          pipeline: [{ $project: { name: 1, _id: 1 } }] // Only fetch needed fields
        }
      },
      { $unwind: { path: "$subCategory", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "brands",
          localField: "brand",
          foreignField: "_id",
          as: "brand",
          pipeline: [{ $project: { name: 1, logo: 1 } }] // Only fetch needed fields
        }
      },
      { $unwind: { path: "$brand", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          name: 1,
          description: 1,
          images: 1,
          discountImage: 1,
          bin: 1,
          published: 1,
          category: { name: 1, _id: 1 },
          subCategory: { name: 1, _id: 1 },
          brand: { name: 1, logo: 1 },
          stock: 1,
          sku: 1,
          bin: 1,
          tags: 1,
          attributes: 1,
          isNew: 1,
          mostPopular: 1,
          mostSold: 1,
          featured: 1,
          metaTitle: 1,
          metaDescription: 1,
          createdAt: 1,
          updatedAt: 1,
          models: 1,
          price: 1,
          pricing: "$finalPrice",
          userTier: 1,
          displayOrder: 1
        }
      }
    ];

    // Use $facet to combine products and count in a single pipeline for better performance
    const aggregationStartTime = Date.now();
    pipeline.push({
      $facet: {
        products: [
          { $skip: skip },
          { $limit: parsedLimit },
          ...lookupStages
        ],
        totalCount: [
          { $count: "total" }
        ]
      }
    });

    // Execute single aggregation
    const aggregationResult = await Product.aggregate(pipeline);
    perfLog.aggregationTime = Date.now() - aggregationStartTime;

    const result = aggregationResult[0] || { products: [], totalCount: [] };
    const products = result.products || [];
    const totalProducts = result.totalCount[0]?.total || 0;

    // Performance logging
    perfLog.totalTime = Date.now() - startTime;
    if (process.env.NODE_ENV === 'development' || perfLog.totalTime > 1000) {
      console.log('[PERF] getProducts:', {
        ...perfLog,
        totalTime: `${perfLog.totalTime}ms`,
        productsReturned: products.length,
        totalProducts
      });
    }

    sendResponse(res, 200, "Products retrieved successfully", {
      products,
      pagination: {
        currentPage: parsedPage,
        totalPages: Math.ceil(totalProducts / parsedLimit),
        totalItems: totalProducts,
      },
    });

  } catch (err) {
    console.error("Error retrieving products:", err);
    sendResponse(res, 500, "Internal Server Error");
  }
};


// In-memory cache for special products
let specialProductsCache = {
  data: null,
  expiresAt: 0,
  userTier: null
};
const SPECIAL_PRODUCTS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache

export const getSpecialProducts = async (req, res) => {
  try {
    const { user } = req.body;

    // Determine user tier
    let userTier = USERTYPE_FRANCHISE;
    if (user && user.role) {
      const role = user.role.toLowerCase();
      const tierMapping = {
        wholesale: USERTYPE_WHOLESALER,
        retailer: USERTYPE_RETAILER,
        chainstore: USERTYPE_CHAINSTORE,
        franchise: USERTYPE_FRANCHISE,
      };
      userTier = tierMapping[role] || USERTYPE_FRANCHISE;
    }

    // Check cache (only for franchise tier to keep it simple, or cache per tier if needed)
    const now = Date.now();
    if (
      specialProductsCache.data &&
      specialProductsCache.expiresAt > now &&
      specialProductsCache.userTier === userTier
    ) {
      return sendResponse(res, 200, "Products fetched successfully", specialProductsCache.data);
    }

    const limit = 10;
    const excludedCategoryId = new mongoose.Types.ObjectId("68a62a1208e4173abbf49e0e");

    // Optimized pipeline: $limit early, optimized $lookup, reduced fields
    const basePipeline = (matchCondition) => [
      // Match stage - uses compound indexes for fast filtering
      { $match: matchCondition },
      // Limit early to reduce documents processed in subsequent stages
      { $limit: limit * 2 }, // Get slightly more to account for category filtering
      // Optimized lookup - only fetch needed category fields
      {
        $lookup: {
          from: "categories",
          localField: "category",
          foreignField: "_id",
          as: "category",
          pipeline: [
            { $project: { name: 1, _id: 1 } } // Only fetch needed fields
          ]
        },
      },
      { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
      // Filter out excluded category after lookup (more efficient than in $match)
      {
        $match: {
          category: { $ne: excludedCategoryId },
          subCategory: { $ne: excludedCategoryId }
        }
      },
      // Limit again after filtering
      { $limit: limit },
      // Add fields for pricing calculation
      {
        $addFields: {
          userTier,
          finalPrice: {
            $cond: {
              if: { $ifNull: [`$pricing.${userTier}`, false] },
              then: `$pricing.${userTier}.price`,
              else: "$price",
            },
          },
        },
      },
      // Project only needed fields (reduces data transfer)
      {
        $project: {
          name: 1,
          description: 1,
          images: 1,
          discountImage: 1,
          published: 1,
          category: { name: 1, _id: 1 },
          subCategory: 1,
          brand: 1,
          stock: 1,
          sku: 1,
          bin: 1,
          tags: 1,
          attributes: 1,
          isNew: 1,
          mostPopular: 1,
          mostSold: 1,
          featured: 1,
          metaTitle: 1,
          metaDescription: 1,
          createdAt: 1,
          updatedAt: 1,
          price: 1,
          models: 1,
          pricing: "$finalPrice",
          userTier: 1,
          displayOrder: 1, // Include for sorting
        },
      },
      // Sort by displayOrder for consistent ordering
      { $sort: { displayOrder: 1 } },
    ];

    // Execute all three queries in parallel
    const [mostSold, mostPopular, featured] = await Promise.all([
      Product.aggregate(basePipeline({ 
        published: true, 
        mostSold: true,
        isDeleted: { $ne: true }
      })),
      Product.aggregate(basePipeline({ 
        published: true, 
        mostPopular: true,
        isDeleted: { $ne: true }
      })),
      Product.aggregate(basePipeline({ 
        published: true, 
        featured: true,
        isDeleted: { $ne: true }
      })),
    ]);

    const responseData = {
      products: {
        mostSold,
        mostPopular,
        featured,
      },
    };

    // Cache the result
    specialProductsCache = {
      data: responseData,
      expiresAt: now + SPECIAL_PRODUCTS_CACHE_TTL_MS,
      userTier
    };

    return sendResponse(res, 200, "Products fetched successfully", responseData);
  } catch (error) {
    console.error("Error fetching special products:", error);
    return sendResponse(res, 500, "Internal Server Error");
  }
};

// Function to invalidate special products cache (call this when products are updated)
export const invalidateSpecialProductsCache = () => {
  specialProductsCache = {
    data: null,
    expiresAt: 0,
    userTier: null
  };
};


export const getProductsadmin = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      category,
      brand,
      minPrice,
      maxPrice,
      sort = "createdAt",
      order = "desc",
      search,
      userTier = "regular",
      tag,
    } = req.query;

    // Debug logging for sorting
    console.log("Admin Products API - Sort parameters:", { sort, order, page, limit });

    const query = {};

    // Filter by category
    if (category) {
      query.category = category;
    }

    // Filter by brand
    if (brand) {
      query.brand = brand;
    }

    // Filter by price range
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = Number(minPrice);
      if (maxPrice) query.price.$lte = Number(maxPrice);
    }

    // Filter by tag
    if (tag) {
      const tagRegex = new RegExp(tag, "i");
      query.tags = { $elemMatch: { $regex: tagRegex } };
    }

    // Search by name with enhanced keyword matching (preserving original functionality)
    if (search) {
      // Split search term into individual keywords and filter out empty strings
      const keywords = search.trim().split(/\s+/).filter(keyword => keyword.length > 0);
      
      if (keywords.length > 0) {
        // Original search: single regex pattern for exact phrase matching
        const originalSearchRegex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), "i");
        const originalSearchConditions = [
          { name: { $regex: originalSearchRegex } },
          { sku: { $regex: originalSearchRegex } },
          { description: { $regex: originalSearchRegex } },
          { tags: { $elemMatch: { $regex: originalSearchRegex } } },
          { models: { $elemMatch: { $regex: originalSearchRegex } } }
        ];

        // Enhanced search: individual keyword matching (all keywords must be present)
        const keywordConditions = keywords.map(keyword => {
          const keywordRegex = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), "i");
          return {
            $or: [
              { name: { $regex: keywordRegex } },
              { sku: { $regex: keywordRegex } },
              { description: { $regex: keywordRegex } },
              { tags: { $elemMatch: { $regex: keywordRegex } } },
              { models: { $elemMatch: { $regex: keywordRegex } } }
            ]
          };
        });

        // // Combine both search approaches: original OR enhanced keyword matching
        // query.$or = [
        //   { $or: originalSearchConditions }, // Original search behavior
        //   { $and: keywordConditions }        // Enhanced keyword matching
        // ];
        // Combine all keyword OR conditions into a single AND structure
query.$and = keywords.map(keyword => {
  const regex = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), "i");
  return {
    $or: [
      { name: { $regex: regex } },
      { sku: { $regex: regex } },
      { description: { $regex: regex } },
      { tags: { $elemMatch: { $regex: regex } } },
      { models: { $elemMatch: { $regex: regex } } }
    ]
  };
});
      }
    }

    // Pagination
    const skip = (Number(page) - 1) * Number(limit);

    // Allowed sort fields
    const allowedSortFields = [
      "createdAt",
      "name",
      "category",
      "price",
      "stock",
      "published",
      "mostPopular",
      "mostSold",
      "featured",
      "displayOrder",
    ];
    const sortKey = allowedSortFields.includes(sort) ? sort : "displayOrder";

    const sortObj = {};
    
    // Handle category sorting specially since it's a populated field
    if (sort === "category") {
      // For category sorting, we'll sort by category name after population
      // We'll use a different approach with aggregation pipeline
    } else {
      // Special handling for displayOrder - default to ascending for better UX
      if (sortKey === "displayOrder") {
        sortObj[sortKey] = order === "desc" ? -1 : 1; // Default to asc (1) unless explicitly desc
      } else {
        sortObj[sortKey] = order === "asc" ? 1 : -1;
      }
    }

    let products;
    
    if (sort === "category") {
      // Use aggregation pipeline for category sorting
      const pipeline = [
        { $match: query },
        {
          $lookup: {
            from: "categories",
            localField: "category",
            foreignField: "_id",
            as: "category"
          }
        },
        { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "brands",
            localField: "brand",
            foreignField: "_id",
            as: "brand"
          }
        },
        { $unwind: { path: "$brand", preserveNullAndEmptyArrays: true } },
        { $sort: { "category.name": order === "asc" ? 1 : -1, "_id": 1 } }, // Add _id as secondary sort for deterministic ordering
        { $skip: skip },
        { $limit: Number(limit) }
      ];
      
      products = await Product.aggregate(pipeline);
    } else if (sortKey === "displayOrder") {
      // Use aggregation pipeline for displayOrder sorting to handle null values properly
      const pipeline = [
        { $match: query },
        {
          $lookup: {
            from: "categories",
            localField: "category",
            foreignField: "_id",
            as: "category"
          }
        },
        { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "brands",
            localField: "brand",
            foreignField: "_id",
            as: "brand"
          }
        },
        { $unwind: { path: "$brand", preserveNullAndEmptyArrays: true } },
        {
          $addFields: {
            sortDisplayOrder: {
              $ifNull: ["$displayOrder", 999999] // Put null values at the end
            }
          }
        },
        { $sort: { sortDisplayOrder: order === "desc" ? -1 : 1, "_id": 1 } }, // Add _id as secondary sort for deterministic ordering
        { $skip: skip },
        { $limit: Number(limit) }
      ];
      
      products = await Product.aggregate(pipeline);
    } else {
      // Regular sorting for other fields
      // Add secondary sort by _id to ensure deterministic ordering when primary sort values are equal
      sortObj._id = 1; // Always sort by _id as secondary sort for consistency
      products = await Product.find(query)
        .populate("category", "name")
        .populate("brand", "name logo")
        .sort(sortObj)
        .skip(skip)
        .limit(Number(limit));
    }

    const total = await Product.countDocuments(query);

    sendResponse(res, HTTP_STATUS_200, "Products retrieved successfully", {
      products,
      totalPages: Math.ceil(total / Number(limit)),
      currentPage: Number(page),
      total,
    });
  } catch (err) {
    console.error("Error retrieving products:", err);
    sendResponse(res, HTTP_STATUS_500, "Internal Server Error");
  }
};

export const togglePublished = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return next(createError(404, "Product not found"));
    }

    product.published = !product.published;
    await product.save();

    const populatedProduct = await Product.findById(product._id)
      .populate("category", "name")
      .populate("brand", "name logo");

    sendResponse(
      res,
      HTTP_STATUS_200,
      "Product publish status updated",
      populatedProduct
    );
  } catch (err) {
    console.error("Error toggling product publish status:", err);
    next(err);
  }
};

export const getProductsByCategory = async (req, res, next) => {
  try {
    const { categoryId } = req.params;
    const { page = 1, limit = 10, userTier = "regular" } = req.query;

    const category = await Category.findById(categoryId);
    if (!category) {
      return next(createError(404, "Category not found"));
    }

    const skip = (Number(page) - 1) * Number(limit);

    // Check if category is deletedCategories
    if (categoryId === "68a62a1208e4173abbf49e0e") {
      return next(createError(404, "Category restricted"));
    }

    const products = await Product.find({
      category: categoryId,
      published: true,
      isDeleted: { $ne: true }, // Exclude soft-deleted products
    })
      .populate("brand", "name logo")
      .skip(skip)
      .limit(Number(limit));
console.log("products 111",products)
    // Add user-specific pricing
    const productsWithUserPricing = products.map((product) => ({
      ...product.toObject(),
      userPrice: product.pricing[userTier]?.price || product.price,
      userSalePrice: product.pricing[userTier]?.salePrice || null,
      userTier,
    }));

    const total = await Product.countDocuments({
      category: categoryId,
      published: true,
      isDeleted: { $ne: true }, // Exclude soft-deleted products
    });

    sendResponse(
      res,
      HTTP_STATUS_200,
      "Products by category retrieved successfully",
      {
        products: productsWithUserPricing,
        totalPages: Math.ceil(total / Number(limit)),
        currentPage: Number(page),
        total,
        category: category.name,
      }
    );
  } catch (err) {
    console.error("Error retrieving products by category:", err);
    next(err);
  }
};

export const getProductsByBrand = async (req, res, next) => {
  try {
    const { brandId } = req.params;
    const { page = 1, limit = 10, userTier = "regular" } = req.query;

    const brand = await Brand.findById(brandId);
    if (!brand) {
      return next(createError(404, "Brand not found"));
    }

    const skip = (Number(page) - 1) * Number(limit);

    const products = await Product.find({ 
      brand: brandId, 
      published: true,
      isDeleted: { $ne: true }, // Exclude soft-deleted products
      category: { $ne: new mongoose.Types.ObjectId("68a62a1208e4173abbf49e0e") },
      subCategory: { $ne: new mongoose.Types.ObjectId("68a62a1208e4173abbf49e0e") }
    })
      .populate("category", "name")
      .skip(skip)
      .limit(Number(limit));

    // Add user-specific pricing
    const productsWithUserPricing = products.map((product) => ({
      ...product.toObject(),
      userPrice: product.pricing[userTier]?.price || product.price,
      userSalePrice: product.pricing[userTier]?.salePrice || null,
      userTier,
    }));

    const total = await Product.countDocuments({
      brand: brandId,
      published: true,
      isDeleted: { $ne: true }, // Exclude soft-deleted products
      category: { $ne: new mongoose.Types.ObjectId("68a62a1208e4173abbf49e0e") },
      subCategory: { $ne: new mongoose.Types.ObjectId("68a62a1208e4173abbf49e0e") }
    });

    sendResponse(
      res,
      HTTP_STATUS_200,
      "Products by brand retrieved successfully",
      {
        products: productsWithUserPricing,
        totalPages: Math.ceil(total / Number(limit)),
        currentPage: Number(page),
        total,
        brand: brand.name,
      }
    );
  } catch (err) {
    console.error("Error retrieving products by brand:", err);
    next(err);
  }
};

// New endpoint to get pricing tiers for a product
export const getProductPricingTiers = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return next(createError(404, "Product not found"));
    }

    const pricingInfo = {
      costPrice: product.costPrice,
      pricing: product.pricing,
      mainPrice: product.price,
    };

    sendResponse(
      res,
      HTTP_STATUS_200,
      "Product pricing tiers retrieved successfully",
      pricingInfo
    );
  } catch (err) {
    console.error("Error retrieving product pricing tiers:", err);
    next(err);
  }
};

// Bulk update pricing percentages
export const bulkUpdatePricingPercentages = async (req, res, next) => {
  try {
    const { productIds, pricingUpdates } = req.body;

    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
      return next(createError(400, "Product IDs array is required"));
    }

    if (!pricingUpdates || typeof pricingUpdates !== "object") {
      return next(createError(400, "Pricing updates object is required"));
    }

    const updatePromises = productIds.map(async (productId) => {
      const product = await Product.findById(productId);
      if (product) {
        Object.keys(pricingUpdates).forEach((tier) => {
          if (product.pricing[tier] && pricingUpdates[tier]) {
            if (pricingUpdates[tier].percentage !== undefined) {
              product.pricing[tier].percentage =
                pricingUpdates[tier].percentage;
            }
          }
        });
        product.recalculatePrices();
        return product.save();
      }
    });

    await Promise.all(updatePromises);

    sendResponse(
      res,
      HTTP_STATUS_200,
      "Bulk pricing update completed successfully"
    );
  } catch (err) {
    console.error("Error in bulk pricing update:", err);
    next(err);
  }
};

// Helper to parse common boolean/number/list fields from CSV
const toBoolean = (val) => {
  if (typeof val === "boolean") return val;
  if (typeof val !== "string") return false;
  const v = val.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
};

const toNumber = (val) => {
  if (val === undefined || val === null) return undefined;
  let raw = typeof val === "string" ? val.trim() : String(val);
  if (raw === "") return undefined;
  // Strip common currency symbols, spaces, and thousands separators
  // Keep minus and decimal point
  raw = raw.replace(/[\s,$€£₹]/g, "").replace(/,/g, "");
  // If value includes a trailing percent sign, drop it here; percent-based
  // calculations are handled by separate percent fields
  raw = raw.replace(/%$/g, "");
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
};

const toList = (val) => {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  // Support commas, pipes, semicolons, and whitespace variations
  return String(val)
    .split(/\s*[|;,]\s*/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
};

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");


// POST /products/bulk-upload (multipart/form-data with field `file`)
// upload bulk new products
// export const bulkUploadProducts = async (req, res) => {
//   try {
//     if (!req.file || !req.file.buffer) {
//       return sendResponse(res, HTTP_STATUS_400, "CSV file is required (field: file)");
//     }

//     // Parse CSV using headers
//     let records;
//     try {
//       records = parse(req?.file.buffer.toString("utf8"), {
//         columns: true,
//         skip_empty_lines: true,
//         trim: true,
//       });
//     } catch (e) {
//       return sendResponse(res, HTTP_STATUS_400, "Invalid CSV format");
//     }

//     if (!Array.isArray(records) || records.length === 0) {
//       return sendResponse(res, HTTP_STATUS_400, "No rows found in CSV");
//     }

//     const results = {
//       successCount: 0,
//       failCount: 0,
//       created: [],
//       failures: [],
//     };

//     for (let i = 0; i < records?.length; i++) {
//       const rowIndex = i + 2; // considering header row is 1
//       const row = records[i];

//       try {
//         // Map incoming fields by the specified CSV headers
//         const name = (row.name || row["Product Name"] || row["productName"] || "").toString().trim();
//         const categoryName = (row.category || row["Category"] || row["Category Name"] || "").toString().trim();
//         const subCategoryNameRaw = row.subCategory || row["Subcategory"] || row["Subcategory Name (Optional)"] || "";
//         const subCategoryName = subCategoryNameRaw ? subCategoryNameRaw.toString().trim() : "";
//         const descriptionRaw = row.description || row["Product Description"] || "";
//         const description = descriptionRaw ? descriptionRaw.toString().trim() : "";
//         const stock = toNumber(row.stock);
//         const skuRaw = row.skuCode || row.sku || row["SKU"] || undefined;
//         const sku = typeof skuRaw === "string" ? skuRaw.trim() : skuRaw;
//         const costPrice = toNumber(row.costPrice);
        
//         // MAIN PRICE FIELD (separate from tier prices)
//         const price = toNumber(row.price);
        
//         // All pricing tiers are REQUIRED as per your model
//         const customerPrice = toNumber(row.customerPrice);
//         const retailerPrice = toNumber(row.retailerPrice);
//         const wholesalePrice = toNumber(row.wholesalePrice);
//         const chainStorePrice = toNumber(row.chainStorePrice);
        
//         const models = toList(row.models);
//         const tags = toList(row.tags);
//         // Default to published when the CSV column is missing
//         const published = row.published === undefined ? true : toBoolean(row.published);
//         const mostPopular = toBoolean(row.mostPopular);
//         const mostSold = toBoolean(row.mostSold);
//         const featured = toBoolean(row.featured);

//         // Basic validations - ALL PRICING FIELDS ARE REQUIRED
//         if (!name) throw new Error("Missing product name");
//         if (!categoryName) throw new Error("Missing category name");
//         if (stock === undefined) throw new Error("Missing or invalid stock");
//         if (!sku) throw new Error("Missing SKU");
//         if (costPrice === undefined) throw new Error("Missing or invalid costPrice");
//         if (price === undefined) throw new Error("Missing or invalid price");
//         if (customerPrice === undefined) throw new Error("Missing or invalid customerPrice");
//         if (retailerPrice === undefined) throw new Error("Missing or invalid retailerPrice");
//         if (wholesalePrice === undefined) throw new Error("Missing or invalid wholesalePrice");
//         if (chainStorePrice === undefined) throw new Error("Missing or invalid chainStorePrice");
//         if (!tags || tags.length === 0) throw new Error("Missing tags");

//         // Find category and (optional) subCategory by name
//         const categoryDoc = await Category.findOne({
//           name: { $regex: new RegExp(`^${escapeRegex(String(categoryName))}$`, "i") },
//         });
//         if (!categoryDoc) throw new Error("Category not found");

//         let subCategoryId = undefined;
//         if (subCategoryName) {
//           const subCategoryDoc = await Category.findOne({
//             name: { $regex: new RegExp(`^${escapeRegex(String(subCategoryName))}$`, "i") },
//           });
//           if (!subCategoryDoc) throw new Error("Subcategory not found");
//           subCategoryId = subCategoryDoc._id;
//         }

//         // Prevent duplicate product name
//         const existingProduct = await Product.findOne({ name });
//         if (existingProduct) throw new Error("Product with this name already exists");

//         // Prevent duplicate SKU
//         const existingSku = await Product.findOne({ sku });
//         if (existingSku) throw new Error("Product with this SKU already exists");

//         // Build pricing tiers - ALL ARE REQUIRED as per your model schema
//         const pricing = {
//           [USERTYPE_RETAILER]: { price: Number(retailerPrice) },
//           [USERTYPE_WHOLESALER]: { price: Number(wholesalePrice) },
//           [USERTYPE_CHAINSTORE]: { price: Number(chainStorePrice) },
//           [USERTYPE_FRANCHISE]: { price: Number(customerPrice) }
//         };

//         // Create new product
//         let productId;
//         while (true) {
//           const tempId = `#${Math.random().toString(36).substring(2, 8)}`;
//           const isUnique = await Product.findOne({ productId: tempId });
//           if (!isUnique) {
//             productId = tempId;
//             break;
//           }
//         }

//         const newProduct = new Product({
//           name,
//           description,
//           productId,
//           price: Number(price), // MAIN PRICE FIELD (separate from tier prices)
//           costPrice: Number(costPrice),
//           pricing: pricing,
//           images: [],
//           published: !!published,
//           category: categoryDoc._id,
//           subCategory: subCategoryId || null,
//           brand: null,
//           stock: Number(stock),
//           sku,
//           tags,
//           attributes: {},
//           isNew: false,
//           featured: !!featured,
//           mostPopular: !!mostPopular,
//           mostSold: !!mostSold,
//           models,
//         });

//         const saved = await newProduct.save();
//         results.successCount += 1;
//         results.created.push({ row: rowIndex, id: saved._id, name });
//       } catch (rowErr) {
//         results.failCount += 1;
//         results.failures.push({ row: rowIndex, name: records[i]?.name || null, reason: rowErr.message || String(rowErr) });
//       }
//     }

//     return sendResponse(res, HTTP_STATUS_200, "Bulk upload processed", results);
//   } catch (err) {
//     console.error("Error in bulkUploadProducts:", err);
//     return sendResponse(res, HTTP_STATUS_500, "Internal Server Error");
//   }
// };

// upload bulk new/update products
export const bulkUploadProducts = async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return sendResponse(res, HTTP_STATUS_400, "CSV file is required (field: file)");
    }

    // Parse CSV using headers
    let records;
    try {
      records = parse(req?.file.buffer.toString("utf8"), {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });
    } catch (e) {
      return sendResponse(res, HTTP_STATUS_400, "Invalid CSV format");
    }

    if (!Array.isArray(records) || records.length === 0) {
      return sendResponse(res, HTTP_STATUS_400, "No rows found in CSV");
    }

    const results = {
      successCount: 0,
      failCount: 0,
      updated: [],
      created: [],
      failures: [],
    };

    // Track duplicate SKUs within the same CSV
    const seenSkus = new Map(); // sku -> firstRowIndex

    for (let i = 0; i < records?.length; i++) {
      const rowIndex = i + 2; // considering header row is 1
      const row = records[i];

      try {
        // Map incoming fields by the specified CSV headers
        const name = (row.name || row["Product Name"] || row["productName"] || "").toString().trim();
        const categoryName = (row.category || row["Category"] || row["Category Name"] || "").toString().trim();
        const subCategoryNameRaw = row.subCategory || row["Subcategory"] || row["Subcategory Name (Optional)"] || "";
        const subCategoryName = subCategoryNameRaw ? subCategoryNameRaw.toString().trim() : "";
        const descriptionRaw = row.description || row["Product Description"] || "";
        const description = descriptionRaw ? descriptionRaw.toString().trim() : "";
        const stock = toNumber(row.stock);
        const skuRaw = row.skuCode || row.sku || row["SKU"] || undefined;
        const sku = typeof skuRaw === "string" ? skuRaw.trim() : skuRaw;
        let costPrice = toNumber(row.costPrice);

        // Allow price fields to be provided either directly or as percentages of costPrice
        // MAIN PRICE FIELD (separate from tier prices)
        let price = toNumber(row.price);
        const retailPercent = toNumber(row.retailPercent) ?? toNumber(row["retail%"]);

        // Tier prices (Franchise = Tier4, Retailer = Tier3, ChainStore = Tier2, Wholesale = Tier1)
        let customerPrice = toNumber(row.customerPrice);
        let retailerPrice = toNumber(row.retailerPrice);
        let wholesalePrice = toNumber(row.wholesalePrice);
        let chainStorePrice = toNumber(row.chainStorePrice);

        const customerPercent = toNumber(row.customerPercent) ?? toNumber(row["customer%"]);
        const retailerPercent = toNumber(row.retailerPercent) ?? toNumber(row["retailer%"]);
        const wholesalePercent = toNumber(row.wholesalePercent) ?? toNumber(row["wholesale%"]);
        const chainStorePercent = toNumber(row.chainStorePercent) ?? toNumber(row["chainStore%"]);

        const calcFromPercent = (cp, p) => {
          if (cp === undefined || p === undefined) return undefined;
          const val = (Number(cp) * Number(p)) / 100;
          return Number.isFinite(val) ? Number(val.toFixed(2)) : undefined;
        };

        // We'll compute from percents after we determine if this is a create or update
        
        const models = toList(row.models);
        const tags = toList(row.tags);
        const bin = (row.bin || row["Bin"] || row["BIN"] || "").toString().trim();
        // Default to published when the CSV column is missing
        const published = row.published === undefined ? true : toBoolean(row.published);
        const mostPopular = toBoolean(row.mostPopular);
        const mostSold = toBoolean(row.mostSold);
        const featured = toBoolean(row.featured);
        const displayOrder = toNumber(row.displayOrder);

        if (!sku) throw new Error("Missing SKU");
        // Detect duplicates within the same CSV (case-sensitive after trim)
        if (seenSkus.has(sku)) {
          const firstRow = seenSkus.get(sku);
          throw new Error(`Duplicate SKU in CSV: ${sku} (first seen at row ${firstRow})`);
        } else {
          seenSkus.set(sku, rowIndex);
        }
        // Determine if this is an update (existing SKU) or a create
        const existingProduct = await Product.findOne({ sku });

        // Compute from percents only after we know what costPrice to use (incoming or existing)
        if (existingProduct && (costPrice === undefined || costPrice === null)) {
          costPrice = existingProduct.costPrice;
        }

        if (price === undefined && retailPercent !== undefined) {
          price = calcFromPercent(costPrice, retailPercent);
        }
        if (customerPrice === undefined && customerPercent !== undefined) {
          customerPrice = calcFromPercent(costPrice, customerPercent);
        }
        if (retailerPrice === undefined && retailerPercent !== undefined) {
          retailerPrice = calcFromPercent(costPrice, retailerPercent);
        }
        if (wholesalePrice === undefined && wholesalePercent !== undefined) {
          wholesalePrice = calcFromPercent(costPrice, wholesalePercent);
        }
        if (chainStorePrice === undefined && chainStorePercent !== undefined) {
          chainStorePrice = calcFromPercent(costPrice, chainStorePercent);
        }

        // Category resolution (optional for updates)
        let categoryDoc = null;
        if (!existingProduct) {
          // Creating: require key fields
          if (!name) throw new Error("Missing product name");
          if (!categoryName) throw new Error("Missing category name");
          if (stock === undefined) throw new Error("Missing or invalid stock");
          if (costPrice === undefined) throw new Error("Missing or invalid costPrice");
          if (price === undefined) throw new Error("Missing or invalid price (or retailPercent)");
          if (customerPrice === undefined) throw new Error("Missing or invalid customerPrice (or customerPercent)");
          if (retailerPrice === undefined) throw new Error("Missing or invalid retailerPrice (or retailerPercent)");
          if (wholesalePrice === undefined) throw new Error("Missing or invalid wholesalePrice (or wholesalePercent)");
          if (chainStorePrice === undefined) throw new Error("Missing or invalid chainStorePrice (or chainStorePercent)");

          categoryDoc = await Category.findOne({
            name: { $regex: new RegExp(`^${escapeRegex(String(categoryName))}$`, "i") },
          });
          if (!categoryDoc) throw new Error("Category not found");

          let subCategoryId = undefined;
          if (subCategoryName) {
            const subCategoryDoc = await Category.findOne({
              name: { $regex: new RegExp(`^${escapeRegex(String(subCategoryName))}$`, "i") },
            });
            if (!subCategoryDoc) throw new Error("Subcategory not found");
            subCategoryId = subCategoryDoc._id;
          }

          const pricing = {
            Retailer: { price: Number(retailerPrice) },
            Wholesale: { price: Number(wholesalePrice) },
            ChainStore: { price: Number(chainStorePrice) },
            Franchise: { price: Number(customerPrice) }
          };

          // Create new product
          let productId;
          while (true) {
            const tempId = `#${Math.random().toString(36).substring(2, 8)}`;
            const isUnique = await Product.findOne({ productId: tempId });
            if (!isUnique) {
              productId = tempId;
              break;
            }
          }

          // Determine displayOrder for new product
          let finalDisplayOrder = 1;
          if (displayOrder !== undefined && displayOrder !== null) {
            await handleDisplayOrderUpdate(null, displayOrder, categoryDoc._id, subCategoryId);
            finalDisplayOrder = displayOrder;
          } else {
            const maxDisplayOrder = await Product.findOne({
              $or: [
                { category: categoryDoc._id, subCategory: null },
                { subCategory: subCategoryId || null }
              ],
              isDeleted: { $ne: true }
            }).sort({ displayOrder: -1 }).select('displayOrder');
            finalDisplayOrder = (maxDisplayOrder?.displayOrder || 0) + 1;
          }

          const newProduct = new Product({
            name,
            description,
            productId,
            price: Number(price),
            costPrice: Number(costPrice),
            pricing,
            images: [],
            published: !!published,
            category: categoryDoc._id,
            subCategory: subCategoryId || null,
            brand: null,
            stock: Number(stock),
            sku,
            bin,
            tags,
            attributes: {},
            isNew: false,
            featured: !!featured,
            mostPopular: !!mostPopular,
            mostSold: !!mostSold,
            models,
            displayOrder: finalDisplayOrder,
          });

          const saved = await newProduct.save();
          results.successCount += 1;
          results.created.push({ row: rowIndex, id: saved._id, name, sku });
        } else {
          // Updating existing: allow partial updates. Require at least one updatable field
          const hasAnyPriceInput = [price, customerPrice, retailerPrice, wholesalePrice, chainStorePrice,
            customerPercent, retailerPercent, wholesalePercent, chainStorePercent, retailPercent].some(v => v !== undefined);

          if (!hasAnyPriceInput && name === "" && !description && stock === undefined && !models.length && !tags.length && categoryName === "" && subCategoryName === "" && published === undefined && featured === undefined && mostPopular === undefined && mostSold === undefined && displayOrder === undefined && costPrice === undefined) {
            throw new Error("No updatable fields provided for existing SKU");
          }

          // Compute prices from percents if provided, otherwise keep existing
          const finalPrice = price !== undefined ? Number(price) : existingProduct.price;
          const finalCostPrice = costPrice !== undefined ? Number(costPrice) : existingProduct.costPrice;
          const finalCustomerPrice = customerPrice !== undefined ? Number(customerPrice) : existingProduct?.pricing?.Franchise?.price;
          const finalRetailerPrice = retailerPrice !== undefined ? Number(retailerPrice) : existingProduct?.pricing?.Retailer?.price;
          const finalWholesalePrice = wholesalePrice !== undefined ? Number(wholesalePrice) : existingProduct?.pricing?.Wholesale?.price;
          const finalChainStorePrice = chainStorePrice !== undefined ? Number(chainStorePrice) : existingProduct?.pricing?.ChainStore?.price;

          const computedPrice = price === undefined && retailPercent !== undefined ? calcFromPercent(finalCostPrice, retailPercent) : undefined;
          const computedCustomer = customerPrice === undefined && customerPercent !== undefined ? calcFromPercent(finalCostPrice, customerPercent) : undefined;
          const computedRetailer = retailerPrice === undefined && retailerPercent !== undefined ? calcFromPercent(finalCostPrice, retailerPercent) : undefined;
          const computedWholesale = wholesalePrice === undefined && wholesalePercent !== undefined ? calcFromPercent(finalCostPrice, wholesalePercent) : undefined;
          const computedChain = chainStorePrice === undefined && chainStorePercent !== undefined ? calcFromPercent(finalCostPrice, chainStorePercent) : undefined;

          const pricing = {
            Retailer: { price: Number(computedRetailer ?? finalRetailerPrice) },
            Wholesale: { price: Number(computedWholesale ?? finalWholesalePrice) },
            ChainStore: { price: Number(computedChain ?? finalChainStorePrice) },
            Franchise: { price: Number(computedCustomer ?? finalCustomerPrice) }
          };

          // Optional category update by name
          let targetCategoryId = existingProduct.category;
          let targetSubCategoryId = existingProduct.subCategory;
          if (categoryName) {
            const cat = await Category.findOne({ name: { $regex: new RegExp(`^${escapeRegex(String(categoryName))}$`, "i") } });
            if (!cat) throw new Error("Category not found");
            targetCategoryId = cat._id;
          }
          if (subCategoryName) {
            const subCat = await Category.findOne({ name: { $regex: new RegExp(`^${escapeRegex(String(subCategoryName))}$`, "i") } });
            if (!subCat) throw new Error("Subcategory not found");
            targetSubCategoryId = subCat._id;
          }

          // Assign only provided fields; preserve others
          if (name) existingProduct.name = name;
          if (description !== undefined) existingProduct.description = description;
          if (finalPrice !== undefined || computedPrice !== undefined) existingProduct.price = Number(computedPrice ?? finalPrice);
          if (finalCostPrice !== undefined) existingProduct.costPrice = Number(finalCostPrice);
          if (hasAnyPriceInput) existingProduct.pricing = pricing;
          if (published !== undefined) existingProduct.published = !!published;
          if (categoryName) existingProduct.category = targetCategoryId;
          if (subCategoryName) existingProduct.subCategory = targetSubCategoryId || null;
          if (stock !== undefined) existingProduct.stock = Number(stock);
          if (bin) existingProduct.bin = bin;
          if (tags && tags.length > 0) existingProduct.tags = tags;
          if (featured !== undefined) existingProduct.featured = !!featured;
          if (mostPopular !== undefined) existingProduct.mostPopular = !!mostPopular;
          if (mostSold !== undefined) existingProduct.mostSold = !!mostSold;
          if (models && models.length > 0) existingProduct.models = models;

          if (displayOrder !== undefined && displayOrder !== null) {
            await handleDisplayOrderUpdate(existingProduct._id, displayOrder, targetCategoryId, targetSubCategoryId);
            existingProduct.displayOrder = displayOrder;
          }

          const updated = await existingProduct.save();
          results.successCount += 1;
          results.updated.push({ row: rowIndex, id: updated._id, name: updated.name, sku });
        }
      } catch (rowErr) {
        results.failCount += 1;
        results.failures.push({ row: rowIndex, name: records[i]?.name || null, reason: rowErr.message || String(rowErr) });
      }
    }

    return sendResponse(res, HTTP_STATUS_200, "Bulk upload processed", results);
  } catch (err) {
    console.error("Error in bulkUploadProducts:", err);
    return sendResponse(res, HTTP_STATUS_500, "Internal Server Error");
  }
};

// Update display order for multiple products
export const updateProductsDisplayOrder = async (req, res) => {
  try {
    const { products } = req.body;

    if (!Array.isArray(products) || products.length === 0) {
      return sendResponse(res, HTTP_STATUS_400, "Products array is required");
    }

    // Validate all products first
    const validationPromises = products.map(async (product) => {
      const { id, displayOrder } = product;
      
      if (!id || displayOrder === undefined) {
        throw new Error("Product ID and displayOrder are required");
      }

      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new Error("Invalid product ID");
      }

      const productDoc = await Product.findById(id);
      if (!productDoc) {
        throw new Error("Product not found");
      }

      return { productDoc, newDisplayOrder: Number(displayOrder) };
    });

    const validatedProducts = await Promise.all(validationPromises);

    // Group products by category for proper reordering
    const categoryGroups = {};
    validatedProducts.forEach(({ productDoc, newDisplayOrder }) => {
      const categoryKey = productDoc.subCategory 
        ? `sub_${productDoc.subCategory}` 
        : `cat_${productDoc.category}`;
      
      if (!categoryGroups[categoryKey]) {
        categoryGroups[categoryKey] = [];
      }
      
      categoryGroups[categoryKey].push({
        id: productDoc._id,
        oldDisplayOrder: productDoc.displayOrder || 1,
        newDisplayOrder,
        category: productDoc.category,
        subCategory: productDoc.subCategory
      });
    });

    // Process each category group
    const updateResults = [];
    for (const [categoryKey, productsInCategory] of Object.entries(categoryGroups)) {
      // Sort by new display order
      productsInCategory.sort((a, b) => a.newDisplayOrder - b.newDisplayOrder);
      
      // Update display orders sequentially to avoid conflicts
      for (let i = 0; i < productsInCategory.length; i++) {
        const product = productsInCategory[i];
        const finalDisplayOrder = i + 1;
        
        await Product.findByIdAndUpdate(
          product.id,
          { displayOrder: finalDisplayOrder }
        );
        
        updateResults.push({
          id: product.id,
          oldDisplayOrder: product.oldDisplayOrder,
          newDisplayOrder: finalDisplayOrder
        });
      }
    }

    return sendResponse(
      res,
      HTTP_STATUS_200,
      "Display order updated successfully",
      { updatedProducts: updateResults }
    );
  } catch (err) {
    console.error("Error updating display order:", err);
    return sendResponse(res, HTTP_STATUS_500, "Internal Server Error");
  }
};

// Get product count for a category
export const getCategoryProductCount = async (req, res) => {
  try {
    const { categoryId, subCategoryId } = req.query;

    if (!categoryId) {
      return sendResponse(res, HTTP_STATUS_400, "Category ID is required");
    }

    // Build category filter
    const categoryFilter = subCategoryId 
      ? { subCategory: subCategoryId }
      : { category: categoryId };

    // Count products in the category
    const productCount = await Product.countDocuments({
      ...categoryFilter,
      isDeleted: { $ne: true }
    });

    return sendResponse(res, HTTP_STATUS_200, "Product count retrieved successfully", {
      categoryId,
      subCategoryId: subCategoryId || null,
      productCount,
      nextDisplayOrder: productCount + 1
    });
  } catch (error) {
    console.error("Error getting category product count:", error);
    return sendResponse(res, HTTP_STATUS_500, "Internal Server Error");
  }
};

// GET /products/export?categoryId=... or ?tag=... or ?search=...
export const exportProductsCsv = async (req, res) => {
  try {
    const { categoryId, tag, search } = req.query;

    const match = { isDeleted: { $ne: true } };
    if (categoryId) {
      validateObjectIdOrThrow(categoryId, "Category ID");
      match.$or = [
        { category: new mongoose.Types.ObjectId(categoryId) },
        { subCategory: new mongoose.Types.ObjectId(categoryId) },
      ];
    }
    if (tag) {
      match.tags = { $elemMatch: { $regex: new RegExp(tag, "i") } };
    }
    if (search) {
      const searchRegex = new RegExp(search, "i");
      const searchConditions = [
        { name: { $regex: searchRegex } },
        { sku: { $regex: searchRegex } },
        { description: { $regex: searchRegex } },
        { tags: { $elemMatch: { $regex: searchRegex } } }
      ];

      if (match.$and) {
        match.$and.push({ $or: searchConditions });
      } else if (match.$or) {
        match.$and = [{ $or: match.$or }, { $or: searchConditions }];
        delete match.$or;
      } else {
        match.$or = searchConditions;
      }
    }

    const products = await Product.find(match)
      .populate("category", "name")
      .populate("subCategory", "name")
      .lean();

    const headers = [
      "name",
      "category",
      "subCategory",
      "description",
      "stock",
      "sku",
      "bin",
      "costPrice",
      "price",
      "retailPercent",
      "customerPrice",
      "customerPercent",
      "retailerPrice",
      "retailerPercent",
      "wholesalePrice",
      "wholesalePercent",
      "chainStorePrice",
      "chainStorePercent",
      "models",
      "tags",
      "published",
      "mostPopular",
      "mostSold",
      "featured",
      "displayOrder",
    ];

    const rows = products.map((p) => {
      const pricing = p?.pricing || {};
      const customerPrice = pricing?.Franchise?.price ?? 0;
      const retailerPrice = pricing?.Retailer?.price ?? 0;
      const wholesalePrice = pricing?.Wholesale?.price ?? 0;
      const chainStorePrice = pricing?.ChainStore?.price ?? 0;

      return {
        name: p.name ?? "",
        category: p.category?.name ?? "",
        subCategory: p.subCategory?.name ?? "",
        description: p.description ?? "",
        stock: p.stock ?? "",
        sku: p.sku ?? "",
        bin: p.bin ?? "",
        costPrice: p.costPrice ?? "",
        price: p.price ?? "",
        retailPercent: p.costPrice ? (((Number(p.price) - Number(p.costPrice)) / Number(p.costPrice)) * 100).toFixed(2) : "",
        customerPrice,
        customerPercent: p.costPrice && customerPrice > 0 ? (((Number(customerPrice) - Number(p.costPrice)) / Number(p.costPrice)) * 100).toFixed(2) : "",
        retailerPrice,
        retailerPercent: p.costPrice && retailerPrice > 0 ? (((Number(retailerPrice) - Number(p.costPrice)) / Number(p.costPrice)) * 100).toFixed(2) : "",
        wholesalePrice,
        wholesalePercent: p.costPrice && wholesalePrice > 0 ? (((Number(wholesalePrice) - Number(p.costPrice)) / Number(p.costPrice)) * 100).toFixed(2) : "",
        chainStorePrice,
        chainStorePercent: p.costPrice && chainStorePrice > 0 ? (((Number(chainStorePrice) - Number(p.costPrice)) / Number(p.costPrice)) * 100).toFixed(2) : "",
        models: Array.isArray(p.models) ? p.models.join(", ") : "",
        tags: Array.isArray(p.tags) ? p.tags.join(", ") : "",
        published: p.published ? "true" : "false",
        mostPopular: p.mostPopular ? "true" : "false",
        mostSold: p.mostSold ? "true" : "false",
        featured: p.featured ? "true" : "false",
        displayOrder: p.displayOrder ?? "",
      };
    });

    const csv = stringify(rows, { header: true, columns: headers });

    const fileNameBase = categoryId
      ? `products_by_category_${categoryId}`
      : tag
      ? `products_by_tag_${String(tag).replace(/\W+/g, "_")}`
      : search
      ? `products_by_search_${String(search).replace(/\W+/g, "_")}`
      : `products_export`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=\"${fileNameBase}.csv\"`);
    return res.status(200).send(csv);
  } catch (err) {
    console.error("Error exporting products CSV:", err);
    return sendResponse(res, HTTP_STATUS_500, "Internal Server Error");
  }
};