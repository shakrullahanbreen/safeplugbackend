
import Request from "../models/requestsModel.js";
// import Request from "../models/requestsModel.js";
import Order from "../models/orderModel.js";
import User from "../models/userModel.js";
import { sendResponse } from "../utils/helper.js";


export const refundProduct = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { orderId, productId, reason } = req.body;
    
    if (!userId) {
      return sendResponse(res, 400, "User ID is required");
    }
    
    console.log("Refund request body:", orderId, productId, reason, userId);

    if (!orderId || !productId) {
      return sendResponse(res, 400, "Order ID and Product ID are required.");
    }

    // 1️⃣ Check if refund already requested for this product
    const existingRequestWithProduct = await Request.findOne({
      order: orderId,
      user: userId,
      "items.product": productId,
      "items.requestType": "refund",
    });

    if (existingRequestWithProduct) {
      return sendResponse(
        res,
        400,
        "Refund request already exists for this product in the order."
      );
    }

    // 2️⃣ Fetch order and product details
    const order = await Order.findById(orderId).select("items");
    if (!order) {
      return sendResponse(res, 404, "Order not found.");
    }

    const orderItem = order.items.find(
      (item) => item.product.toString() === productId
    );
    if (!orderItem) {
      return sendResponse(res, 404, "Product not found in this order.");
    }

    if (orderItem.replaced) {
      return sendResponse(
        res,
        400,
        "This product has already been replaced and cannot be refunded."
      );
    }

    if (orderItem.refunded) {
      return sendResponse(res, 400, "This product has already been refunded.");
    }

    // 3️⃣ Check for existing request for this order and user
    let request = await Request.findOne({ order: orderId, user: userId });

    const refundItem = {
      product: productId,
      quantity: orderItem.quantity,
      price: orderItem.price,
      requestType: "refund",
      reason: reason || "",
      status: "Pending",
    };

    if (request) {
      request.items.push(refundItem);
      request.updatedAt = new Date();
      await request.save();
    } else {
      request = await Request.create({
        order: orderId,
        user: userId,
        items: [refundItem],
        status: "Pending",
      });
    }

    // 4️⃣ Update order item status
    orderItem.refunded = true;
    orderItem.replaced = false; // Be explicit
    await order.save();

    return sendResponse(
      res,
      200,
      request.items.length > 1
        ? "Product added to existing request successfully."
        : "Refund request submitted successfully.",
      request
    );
  } catch (error) {
    console.error("Refund error:", error);
    return sendResponse(res, 500, "Internal server error.");
  }
};




export const replaceProduct = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { orderId, productId, reason } = req.body;
    
    if (!userId) {
      return sendResponse(res, 400, "User ID is required");
    }

    if (!orderId || !productId) {
      return sendResponse(res, 400, "Order ID and Product ID are required.");
    }

    // 1️⃣ Check if a replacement already exists for this product
    const existingRequestWithProduct = await Request.findOne({
      order: orderId,
      user: userId,
      "items.product": productId,
      "items.requestType": "replacement",
    });

    if (existingRequestWithProduct) {
      return sendResponse(
        res,
        400,
        "Replacement request already exists for this product in the order."
      );
    }

    // 2️⃣ Fetch the order and check for the product
    const order = await Order.findById(orderId).select("items");
    if (!order) {
      return sendResponse(res, 404, "Order not found.");
    }

    const orderItem = order.items.find(
      (item) => item.product.toString() === productId
    );
    if (!orderItem) {
      return sendResponse(res, 404, "Product not found in this order.");
    }

    if (orderItem.replaced) {
      return sendResponse(
        res,
        400,
        "This product has already been replaced."
      );
    }

    if (orderItem.refunded) {
      return sendResponse(
        res,
        400,
        "This product has already been refunded and cannot be replaced."
      );
    }

    // 3️⃣ Add/append the item to the request
    const replacementItem = {
      product: productId,
      quantity: orderItem.quantity,
      price: orderItem.price,
      requestType: "replacement",
      reason: reason || "",
      status: "Pending",
    };

    let request = await Request.findOne({ order: orderId, user: userId });

    if (request) {
      request.items.push(replacementItem);
      request.updatedAt = new Date();
      await request.save();
    } else {
      request = await Request.create({
        order: orderId,
        user: userId,
        items: [replacementItem],
        status: "Pending",
      });
    }

    // 4️⃣ Update the product's replaced flag
    orderItem.replaced = true;
    orderItem.refunded = false; // explicitly set
    await order.save();

    return sendResponse(
      res,
      200,
      request.items.length > 1
        ? "Product added to existing request successfully."
        : "Replacement request submitted successfully.",
      request
    );
  } catch (error) {
    console.error("Replacement error:", error);
    return sendResponse(res, 500, "Internal server error.");
  }
};
export const refundOrder = async (req, res) => {
  try {
    const { orderId } = req.body;
    const userId = req.user._id;

    if (!orderId) {
      return sendResponse(res, 400, "Order ID is required.");
    }

    const order = await Order.findById(orderId).select("items");
    if (!order) {
      return sendResponse(res, 404, "Order not found.");
    }

    const refundableItems = order.items.filter(
      (item) => !item.refunded && !item.replaced
    );

    if (refundableItems.length === 0) {
      return sendResponse(
        res,
        400,
        "No refundable items found (already refunded or replaced)."
      );
    }

    const requestItems = refundableItems.map((item) => ({
      product: item.product,
      quantity: item.quantity,
      price: item.price,
      requestType: "refund",
      status: "Pending",
    }));

    let request = await Request.findOne({ order: orderId, user: userId });

    if (request) {
      request.items.push(...requestItems);
      request.updatedAt = new Date();
      await request.save();
    } else {
      request = await Request.create({
        order: orderId,
        user: userId,
        items: requestItems,
        status: "Pending",
      });
    }

    // Mark each of those items as refunded
    refundableItems.forEach((item) => {
      item.refunded = true;
      item.replaced = false;
    });

    await order.save();

    return sendResponse(
      res,
      200,
      "Refund request submitted for all eligible items.",
      request
    );
  } catch (error) {
    console.error("Refund order error:", error);
    return sendResponse(res, 500, "Internal server error.");
  }
};

export const replaceOrder = async (req, res) => {
  try {
    const { orderId } = req.body;
    const userId = req.user._id;

    if (!orderId) {
      return sendResponse(res, 400, "Order ID is required.");
    }

    const order = await Order.findById(orderId).select("items");
    if (!order) {
      return sendResponse(res, 404, "Order not found.");
    }

    const replaceableItems = order.items.filter(
      (item) => !item.refunded && !item.replaced
    );

    if (replaceableItems.length === 0) {
      return sendResponse(
        res,
        400,
        "No replaceable items found (already refunded or replaced)."
      );
    }

    const requestItems = replaceableItems.map((item) => ({
      product: item.product,
      quantity: item.quantity,
      price: item.price,
      requestType: "replacement",
      status: "Pending",
    }));

    let request = await Request.findOne({ order: orderId, user: userId });

    if (request) {
      request.items.push(...requestItems);
      request.updatedAt = new Date();
      await request.save();
    } else {
      request = await Request.create({
        order: orderId,
        user: userId,
        items: requestItems,
        status: "Pending",
      });
    }

    // Mark each of those items as replaced
    replaceableItems.forEach((item) => {
      item.replaced = true;
      item.refunded = false;
    });

    await order.save();

    return sendResponse(
      res,
      200,
      "Replacement request submitted for all eligible items.",
      request
    );
  } catch (error) {
    console.error("Replacement order error:", error);
    return sendResponse(res, 500, "Internal server error.");
  }
};
export const acceptRequest = async (req, res) => {
  try {
    const { requestId, productId } = req.body;

    if (!requestId || !productId) {
      return sendResponse(res, 400, "Both requestId and productId are required.");
    }

    const request = await Request.findById(requestId);
    if (!request) {
      return sendResponse(res, 404, "Request not found.");
    }

    const item = request.items.find(
      (i) => i.product.toString() === productId
    );

    if (!item) {
      return sendResponse(res, 404, "Product not found in the request.");
    }

    if (item.status !== "Pending") {
      return sendResponse(res, 400, `Item is already ${item.status}.`);
    }

    // ✅ Accept logic
    item.status = "Approved";
    item.processedAt = new Date();

    // ✅ Auto-complete request if all items are handled
    const allHandled = request.items.every(i => i.status !== "Pending");
    if (allHandled) {
      request.status = "Completed";
      request.completedAt = new Date();
    }

    await request.save();

    return sendResponse(res, 200, `${item.requestType} request accepted successfully.`, request);
  } catch (error) {
    console.error("Accept request error:", error);
    return sendResponse(res, 500, "Internal server error.");
  }
};

export const rejectRequest = async (req, res) => {
  try {
    const { requestId, productId, reason } = req.body;

    if (!requestId || !productId ) {
      return sendResponse(res, 400, "requestId, productId, and reason are required.");
    }

    const request = await Request.findById(requestId);
    if (!request) {
      return sendResponse(res, 404, "Request not found.");
    }

    const item = request.items.find(
      (i) => i.product.toString() === productId
    );

    if (!item) {
      return sendResponse(res, 404, "Product not found in the request.");
    }

    if (item.status !== "Pending") {
      return sendResponse(res, 400, `Item is already ${item.status}.`);
    }

    // ❌ Reject logic
    item.status = "Rejected";
    item.reason = reason;
    item.processedAt = new Date();

    // ✅ Auto-complete request if all items are handled
    const allHandled = request.items.every(i => i.status !== "Pending");
    if (allHandled) {
      request.status = "Completed";
      request.completedAt = new Date();
    }

    await request.save();

    return sendResponse(res, 200, `${item.requestType} request rejected successfully.`, request);
  } catch (error) {
    console.error("Reject request error:", error);
    return sendResponse(res, 500, "Internal server error.");
  }
};

export const getAllRequestsAdmin = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      sortOrder = "desc"
    } = req.query;

    const { userId, role } = req.user;

    const sortOptions = { [sortBy]: sortOrder === "asc" ? 1 : -1 };
    const skip = (Number(page) - 1) * Number(limit);

    // Build filter based on user role
    let filter = {};
    if (role === "SalesPerson") {
      // For SalesPerson, get requests from customers assigned to them
      const assignedCustomers = await User.find({ assignedSalesPerson: userId }).select("_id");
      const customerIds = assignedCustomers.map(customer => customer._id);
      
      // Find orders from assigned customers
      const assignedOrders = await Order.find({ user: { $in: customerIds } }).select("_id");
      const orderIds = assignedOrders.map(order => order._id);
      
      filter.order = { $in: orderIds };
    }

    // Fetch paginated requests
    const requests = await Request.find(filter)
      .populate({
        path: "order",
        select: "user createdAt",
        populate: {
          path: "user",
          select: "firstName lastName email"
        }
      })
      .populate({
        path: "items.product",
        select: "name images"
      })
      .sort(sortOptions)
      .skip(skip)
      .limit(Number(limit));

    const totalRequests = await Request.countDocuments(filter);

    // Build status from items
    const getOrderLevelStatus = (itemStatuses) => {
      const uniqueStatuses = new Set(itemStatuses);

      if (uniqueStatuses.has("Pending")) return "Pending";
      if (uniqueStatuses.has("Processing")) return "Processing";

      const isAllResolved = [...uniqueStatuses].every(status =>
        ["Completed", "Rejected"].includes(status)
      );

      if (isAllResolved) {
        if (uniqueStatuses.size === 1 && uniqueStatuses.has("Completed")) {
          return "Completed";
        }
        if (uniqueStatuses.has("Completed") && uniqueStatuses.has("Rejected")) {
          return "Partially_Completed";
        }
        return "Rejected";
      }

      return "Partially_Completed";
    };

    // Format response
    const formattedRequests = requests.map((request) => {
      const itemStatuses = request.items.map(item => item.status);
      const orderLevelStatus = getOrderLevelStatus(itemStatuses);

      const requestTypes = [...new Set(request.items.map(item => item.requestType))];

      return {
        orderNo: request.order?._id || "N/A",
        requestQty: request.items.length,
        requestedDate: request.createdAt,
        requestTypes: requestTypes, // could be ['refund'], ['replacement'], or both
        user:
          request.order?.user
            ? `${request.order.user.firstName} ${request.order.user.lastName}`
            : "Unknown User",
        status: orderLevelStatus,
        requestId: request._id
      };
    });

    return sendResponse(res, 200, "Requests fetched successfully", {
      requests: formattedRequests,
      totalPages: Math.ceil(totalRequests / limit),
      currentPage: Number(page),
      totalRequests
    });
  } catch (error) {
    console.error("Admin fetch requests error:", error);
    return sendResponse(res, 500, "Failed to fetch requests");
  }
};
export const getAllRequests = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      sortOrder = "desc"
    } = req.query; 
    const userId = req.body?.user?.userId;

    const sortOptions = { [sortBy]: sortOrder === "asc" ? 1 : -1 };
    const skip = (Number(page) - 1) * Number(limit);

    // Fetch requests with pagination, sorting, and necessary population
    const requests = await Request.find({ user:userId })
      .populate({
        path: "items.product",
        select: "name images"
      })
      .sort(sortOptions)
      .skip(skip)
      .limit(Number(limit));

    const totalRequests = await Request.countDocuments();

    // Function to determine overall status of the request
    const getOrderLevelStatus = (itemStatuses) => {
      const uniqueStatuses = new Set(itemStatuses);

      if (uniqueStatuses.has("Pending")) return "Pending";
      if (uniqueStatuses.has("Processing")) return "Processing";

      const isAllResolved = [...uniqueStatuses].every(status =>
        ["Completed", "Rejected"].includes(status)
      );

      if (isAllResolved) {
        if (uniqueStatuses.size === 1 && uniqueStatuses.has("Completed")) {
          return "Completed";
        }
        if (uniqueStatuses.has("Completed") && uniqueStatuses.has("Rejected")) {
          return "Partially_Completed";
        }
        return "Rejected";
      }

      return "Partially_Completed";
    };

    // Format each request
    const formattedRequests = requests.map(request => {
      const itemStatuses = request.items.map(item => item.status);
      const overallStatus = getOrderLevelStatus(itemStatuses);

      return {
        _id: request._id,
        createdAt: request.createdAt,
        order: request.order,
        items: request.items,
        status: overallStatus
      };
    });

    return sendResponse(res, 200, "Requests fetched successfully", {
      requests: formattedRequests,
      totalPages: Math.ceil(totalRequests / limit),
      currentPage: Number(page),
      totalRequests
    });
  } catch (error) {
    console.error("Admin fetch requests error:", error);
    return sendResponse(res, 500, "Failed to fetch requests");
  }
};

export const getRequestById = async (req, res) => {
  try {
    console.log("Fetching request by ID:", req.params);
    const { requestId } = req.params;

    if (!requestId) {
      return sendResponse(res, 400, "Request ID is required.");
    }

    const request = await Request.findById(requestId)
      .populate({
        path: "order",
        select: "_id createdAt user",
        populate: {
          path: "user",
          select: "firstName lastName email"
        }
      })
      .populate({
        path: "items.product",
        select: "name images price description"
      });

    if (!request) {
      return sendResponse(res, 404, "Request not found.");
    }

    // Format response
    const formatted = {
      requestId: request._id,
      orderNo: request.order?._id,
      requestedDate: request.createdAt,
      user: request.order?.user
        ? {
            name: `${request.order.user.firstName} ${request.order.user.lastName}`,
            email: request.order.user.email
          }
        : null,
      status: request.status,
      priority: request.priority,
      requestItems: request.items.map((item) => ({
        productId: item.product?._id,
        name: item.product?.name,
        image: item.product?.images?.[0] || null,
        price: item.price,
        quantity: item.quantity,
        requestType: item.requestType,
        status: item.status,
        reason: item.reason,
        adminNotes: item.adminNotes,
        processedAt: item.processedAt
      }))
    };

    return sendResponse(res, 200, "Request fetched successfully", formatted);
  } catch (error) {
    console.error("Error fetching request by ID:", error);
    return sendResponse(res, 500, "Failed to fetch request details");
  }
};

