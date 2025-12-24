import { title } from "node:process";
import Cart from "../models/cartModel.js";
import Product from "../models/productModel.js";
import {
  HTTP_STATUS_200,
  HTTP_STATUS_400,
  HTTP_STATUS_404,
  HTTP_STATUS_500,
  USERTYPE_CHAINSTORE,
  USERTYPE_FRANCHISE,
  USERTYPE_RETAILER,
  USERTYPE_WHOLESALER,
} from "../utils/constants.js";
import { getMongoId, sendResponse } from "../utils/helper.js";

// GET /api/cart
// export const getCart = async (req, res) => {
//   try {
//     const {user} = req.body;

//     const cart = await Cart.findOne({ userId:user.userId }).populate("items.productId", "name price image");

//     if (!cart) {
//       return sendResponse(res, HTTP_STATUS_200, "Cart fetched", { items: [], total: 0 });
//     }

//     const total = cart.items.reduce((sum, item) => {
//       return sum + item.quantity * (item.productId?.price || 0);
//     }, 0);

//     sendResponse(res, HTTP_STATUS_200, "Cart fetched successfully", {
//       items: cart.items,
//       total
//     });
//   } catch (error) {
//     console.error("Error fetching cart:", error);
//     sendResponse(res, HTTP_STATUS_500, "Internal server error");
//   }
// };
export const getCart = async (req, res) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return sendResponse(res, 400, "User ID is required");
    }

    const cart = await Cart.findOne({ userId: userId, isActive: true });

    console.log("Raw cart:", cart);

    if (!cart || !cart.items || cart.items.length === 0) {
      return sendResponse(res, HTTP_STATUS_200, "Cart fetched", {
        items: [],
        grandTotal: 0,
      });
    }

    // Check if items have productId field or if _id represents productId
    const hasProductIdField = cart.items.length > 0 && cart.items[0].productId;

    let populatedCart;

    if (hasProductIdField) {
      // If items have productId field, use populate
      populatedCart = await Cart.findOne({ userId: userId, isActive: true }).populate(
        "items.productId",
        "name pricing price images stock slug sku"
      );
    } else {
      // If items don't have productId field, assume _id is productId and fetch manually
      const productIds = cart.items.map((item) => item._id);
      const products = await Product.find(
        { _id: { $in: productIds } },
        "name pricing price images stock slug sku"
      );

      // Create a map for quick product lookup
      const productMap = products.reduce((map, product) => {
        map[product._id.toString()] = product;
        return map;
      }, {});

      // Manually attach products to cart items
      populatedCart = {
        ...cart.toObject(),
        items: cart.items.map((item) => ({
          ...item.toObject(),
          productId: productMap[item._id.toString()],
        })),
      };
    }

    const role = req.user?.role?.toLowerCase() || USERTYPE_FRANCHISE;

    // Map role to pricing key
    // const roleMapping = {
    //   retail: 'retail',
    //   wholesale: 'wholesale',
    //   onlinereseller: 'onlineseller',
    //   other: 'other'
    // };

    const roleMapping = {
      wholesale: USERTYPE_WHOLESALER,
      retailer: USERTYPE_RETAILER,
      chainstore: USERTYPE_CHAINSTORE,
      franchise: USERTYPE_FRANCHISE,
    };

    const pricingKey = roleMapping[role] || USERTYPE_FRANCHISE;

    let grandTotal = 0;

    const items = populatedCart.items.map((item) => {
      const product = item.productId;

      // console.log("Processing item:", item);
      if (!product) {
        console.log("Product not found for item:", item._id);
        return {
          _id: item._id,
          // cartId:
          quantity: item.quantity,
          itemTotal: 0,
          productId: null,
          error: "Product not found",
        };
      }

      // Get role-based price, fallback to base price if role pricing doesn't exist
      const rolePrice =
        product?.pricing?.[pricingKey]?.price ?? product?.price ?? 0;
      const itemTotal = item.quantity * rolePrice;

      grandTotal += itemTotal;

      return {
        id: item.productId._id,
        quantity: item.quantity,
        // itemTotal,
        cartId: populatedCart._id,
        // productId: item.productId,
        title: product.name,
        slug: product.slug,
        sku: product.sku || "",
        price: rolePrice,
        thumbnail: product?.images?.[0]?.preview || "",
        images: product.images,
        stock: product.stock,
        //  {

        // }
      };
    });

    // console.log("Cart items:", JSON.stringify(items, null, 2));
    sendResponse(res, HTTP_STATUS_200, "Cart fetched successfully", {
      items,
      grandTotal,
    });
  } catch (error) {
    console.error("Error fetching cart:", error);
    sendResponse(res, HTTP_STATUS_500, "Internal server error");
  }
};

// Previous implementation of updateCart (preserved for reference)
// export const updateCart = async (req, res) => {
//   try {
//     
//     const { user, items } = req.body;
//     console.log("gdsgfjhgd", items);
//     if (!user || !Array.isArray(items)) {
//       return sendResponse(res, HTTP_STATUS_400, "Invalid payload");
//     }
//
//     const activeCart = await Cart.findOne({ userId: user.userId, isActive: true });
//     if (!activeCart) {
//       return sendResponse(res, HTTP_STATUS_404, "Cart not found");
//     }
//     // :white_check_mark: FIX: use 'new' with ObjectId
//     const convertedItems = items.map((item) => ({
//       productId: getMongoId(item.id),
//       quantity: item.qty,
//     }));
//     console.log("Converted items:", convertedItems);
//     const updatedCart = await Cart.findOneAndUpdate(
//       { userId: user.userId },
//       { $set: { items: convertedItems } },
//       { upsert: true, new: true }
//     ).populate("items.productId");
//     if (!updatedCart)
//       return sendResponse(res, HTTP_STATUS_404, "Cart not found");
//     sendResponse(res, HTTP_STATUS_200, "Cart updated", updatedCart);
//   } catch (err) {
//     console.error("Error updating cart:", err);
//     sendResponse(res, HTTP_STATUS_500, "Internal Server Error");
//   }
// };

export const updateCart = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { items } = req.body;
    
    if (!userId) {
      return sendResponse(res, 400, "User ID is required");
    }
    
    if (!Array.isArray(items)) {
      return sendResponse(res, HTTP_STATUS_400, "Invalid payload");
    }

    // Replace entire cart with incoming payload (upsert if missing)
    const convertedItems = items.map((item) => ({
      productId: getMongoId(item.id),
      quantity: item.qty,
    }));

    const updatedCart = await Cart.findOneAndUpdate(
      { userId: userId, isActive: true },
      {
        $set: { items: convertedItems, lastActivityAt: new Date() },
        $setOnInsert: { userId: userId, isActive: true },
      },
      { upsert: true, new: true, runValidators: true }
    ).populate("items.productId", "name pricing price images stock slug sku");

    if (!updatedCart) return sendResponse(res, HTTP_STATUS_404, "Cart not found");

    // Build normalized response with role-based pricing
    const role = req.user?.role?.toLowerCase() || USERTYPE_FRANCHISE;
    const roleMapping = {
      wholesale: USERTYPE_WHOLESALER,
      retailer: USERTYPE_RETAILER,
      ChainStore: USERTYPE_CHAINSTORE,
      franchise: USERTYPE_FRANCHISE,
    };
    const pricingKey = roleMapping[role] || USERTYPE_FRANCHISE;

    let grandTotal = 0;
    const responseItems = (updatedCart.items || []).map((item) => {
      const product = item.productId;
      const rolePrice = product?.pricing?.[pricingKey]?.price ?? product?.price ?? 0;
      const itemTotal = (item.quantity || 0) * rolePrice;
      grandTotal += itemTotal;
      return {
        id: product?._id,
        quantity: item.quantity,
        cartId: updatedCart._id,
        title: product?.name,
        slug: product?.slug,
        sku: product?.sku || "",
        price: rolePrice,
        thumbnail: product?.images?.[0]?.preview || "",
        images: product?.images,
        stock: product?.stock,
      };
    });

    sendResponse(res, HTTP_STATUS_200, "Cart updated", {
      items: responseItems,
      grandTotal,
    });
  } catch (err) {
    console.error("Error updating cart:", err);
    sendResponse(res, HTTP_STATUS_500, "Internal Server Error");
  }
};


// POST /api/cart/add
export const addToCart = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { productId, quantity } = req.body;
    
    if (!userId) {
      return sendResponse(res, 400, "User ID is required");
    }
    
    console.log("add to cart", productId, quantity, userId);
    // Validate productId
    if (!productId)
      return sendResponse(res, HTTP_STATUS_400, "Product ID is required");
    // Validate quantity
    if (quantity === undefined || quantity === null) {
      return sendResponse(res, HTTP_STATUS_400, "Quantity is required");
    }
    if (typeof quantity !== "number") {
      return sendResponse(res, HTTP_STATUS_400, "Quantity must be a number");
    }
    if (!Number.isInteger(quantity)) {
      return sendResponse(res, HTTP_STATUS_400, "Quantity must be an integer");
    }
    if (quantity <= 0) {
      return sendResponse(
        res,
        HTTP_STATUS_400,
        "Quantity must be greater than 0"
      );
    }
    const product = await Product.findById(productId);

    if (!product)
      return sendResponse(res, HTTP_STATUS_404, "Product not found");


    let cart = await Cart.findOne({ userId: userId, isActive: true });

    if (!cart) {
      // Create new cart if none exists
      cart = new Cart({ userId: userId, items: [] });
      await cart.save();
    }

    const existingItem = cart.items.find(
      (item) => item.productId.toString() === productId
    );

    if (existingItem) {
      console.log("existing item", existingItem);
      // Use findOneAndUpdate for atomic operation
      const updatedCart = await Cart.findOneAndUpdate(
        { 
          userId: userId, 
          isActive: true,
          "items.productId": productId 
        },
        { 
          $inc: { "items.$.quantity": quantity },
          $set: { lastActivityAt: new Date() }
        },
        { 
          new: true,
          runValidators: true 
        }
      );
      
      if (updatedCart) {
        console.log("Cart updated successfully with new quantity");
        // Populate the cart with product details before sending response
        const populatedCart = await Cart.findById(updatedCart._id).populate("items.productId", "name pricing price images stock slug sku");
        sendResponse(res, HTTP_STATUS_200, "Product quantity updated in cart", populatedCart);
      } else {
        sendResponse(res, HTTP_STATUS_500, "Failed to update cart");
      }
    } else {
      console.log("new item", productId, quantity);
      // Add new item to cart
      const updatedCart = await Cart.findOneAndUpdate(
        { userId: userId, isActive: true },
        { 
          $push: { items: { productId, quantity } },
          $set: { lastActivityAt: new Date() }
        },
        { 
          new: true,
          runValidators: true,
          upsert: true 
        }
      );
      
      console.log("New item added to cart");
      // Populate the cart with product details before sending response
      const populatedCart = await Cart.findById(updatedCart._id).populate("items.productId", "name pricing price images stock slug sku");
      sendResponse(res, HTTP_STATUS_200, "Product added to cart", populatedCart);
    }
  } catch (error) {
    console.error("Error adding to cart:", error);
    sendResponse(res, HTTP_STATUS_500, "Internal server error");
  }
};




// POST /api/cart/remove
export const removeFromCart = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { productId } = req.body;
    
    if (!userId) {
      return sendResponse(res, 400, "User ID is required");
    }

    if (!productId)
      return sendResponse(res, HTTP_STATUS_400, "Product ID is required");

    const cart = await Cart.findOne({ userId: userId, isActive: true });
    if (!cart) return sendResponse(res, HTTP_STATUS_404, "Cart not found");

    const updatedItems = cart.items.filter(
      (item) => item.productId.toString() !== productId
    );
    cart.items = updatedItems;

    cart.lastActivityAt = new Date();
    await cart.save();

    sendResponse(res, HTTP_STATUS_200, "Product removed from cart", cart);
  } catch (error) {
    console.error("Error removing from cart:", error);
    sendResponse(res, HTTP_STATUS_500, "Internal server error");
  }
};

// POST /api/cart/clear
export const clearCart = async (req, res) => {
  try {
    const userId = req.user?.userId;
    
    if (!userId) {
      return sendResponse(res, 400, "User ID is required");
    }

    const cart = await Cart.findOne({ userId: userId, isActive: true });
    if (!cart) return sendResponse(res, HTTP_STATUS_404, "Cart not found");

    cart.items = [];
    cart.lastActivityAt = new Date();
    await cart.save();

    sendResponse(res, HTTP_STATUS_200, "Cart cleared successfully", cart);
  } catch (error) {
    console.error("Error clearing cart:", error);
    sendResponse(res, HTTP_STATUS_500, "Internal server error");
  }
};
