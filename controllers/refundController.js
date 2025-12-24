// import { error } from "node:console";
// import Order from "../models/orderModel.js";
// import Refund from "../models/refundModel.js";
// import { sendResponse } from "../utils/helper.js";

// export const refundProduct = async (req, res) => {
//   try {
//     const { orderId, productId } = req.body;

//     if (!orderId || !productId) {
//       return sendResponse(res, 400, "Order ID and Product ID are required.");
//     }

//     // 1️⃣ Already‑refunded‑for‑this‑product check
//     const existingRefundWithProduct = await Refund.findOne({
//       order: orderId,
//       "items.product": productId,
//     });
//     if (existingRefundWithProduct) {
//       return sendResponse(
//         res,
//         400,
//         "Refund request already exists for this product in the order."
//       );
//     }

//     // 2️⃣ Grab the order / item
//     const order = await Order.findById(orderId).select("items");
//     if (!order) {
//       return sendResponse(res, 404, "Order not found.");
//     }

//     const orderItem = order.items.find(
//       (item) => item.product.toString() === productId
//     );
//     if (!orderItem) {
//       return sendResponse(res, 404, "Product not found in this order.");
//     }

//     // ⛔ NEW: replaced check
//     if (orderItem.replaced) {
//       return sendResponse(
//         res,
//         400,
//         "This product has already been replaced and cannot be refunded."
//       );
//     }

//     if (orderItem.refunded) {
//       return sendResponse(res, 400, "This product has already been refunded.");
//     }

//     // 3️⃣ Create / extend the refund document
//     let refund = await Refund.findOne({ order: orderId });

//     if (refund) {
//       refund.items.push({
//         product: productId,
//         price: orderItem.price,
//         quantity: orderItem.quantity,
//       });
//       refund.updatedAt = new Date();
//       await refund.save();
//     } else {
//       refund = await Refund.create({
//         order: orderId,
//         items: [
//           {
//             product: productId,
//             price: orderItem.price,
//             quantity: orderItem.quantity,
//           },
//         ],
//         status: "Pending",
//       });
//     }

//     // 4️⃣ Mark item as refunded (and implicitly *not* replaced)
//     orderItem.refunded = true;
//     orderItem.replaced = false; // optional but explicit
//     await order.save();

//     return sendResponse(
//       res,
//       200,
//       refund.items.length > 1
//         ? "Product added to existing refund request successfully."
//         : "Refund request submitted successfully.",
//       refund
//     );
//   } catch (error) {
//     console.error("Refund error:", error);
//     return sendResponse(res, 500, "Internal server error.");
//   }
// };


// export const refundOrder = async (req, res) => {
//   try {
//     const { orderId } = req.body;
//     if (!orderId) {
//       return sendResponse(res, 400, "Order ID is required.");
//     }

//     const order = await Order.findById(orderId).select("items");
//     if (!order) {
//       return sendResponse(res, 404, "Order not found.");
//     }

//     /* ⛔ NEW:
//        Only include items that are *neither* refunded *nor* replaced */
//     const refundableItems = order.items.filter(
//       (item) => !item.refunded && !item.replaced
//     );

//     if (refundableItems.length === 0) {
//       return sendResponse(
//         res,
//         400,
//         "No refundable items found (already refunded or replaced)."
//       );
//     }

//     const refundItems = refundableItems.map((item) => ({
//       product: item.product,
//       price: item.price,
//       quantity: item.quantity,
//     }));

//     let refund = await Refund.findOne({ order: orderId });

//     if (refund) {
//       refund.items.push(...refundItems);
//       await refund.save();
//     } else {
//       refund = await Refund.create({
//         order: orderId,
//         items: refundItems,
//         status: "Pending",
//       });
//     }

//     // Mark each of those items as refunded (and not replaced)
//     refundableItems.forEach((item) => {
//       item.refunded = true;
//       item.replaced = false;
//     });
//     await order.save();

//     return sendResponse(
//       res,
//       200,
//       "Refund processed for eligible items.",
//       refund
//     );
//   } catch (error) {
//     console.error("Refund order error:", error);
//     return sendResponse(res, 500, "Internal server error.");
//   }
// };

// export const getRefundOrderById = async (req, res) => {
//   try {
//     const { id } = req.params;           // e.g.  /refunds/:refundId

//     if (!id) {
//       return sendResponse(res, 400, "Refund ID is required.");
//     }

//     // ── Fetch refund and deeply populate ────────────────────────────────
//     const refund = await Refund.findById(id)
//       .populate({
//         path: "order",
//         select:
//           "user amount refunded shippingAddress billingAddress createdAt updatedAt status paid cart",
//         populate: {
//           path: "user",
//           select: "firstName lastName email",
//         },
//       })
//       .populate({
//         path: "items.product",
//         select: "name images",
//       });

//     if (!refund) {
//       return sendResponse(res, 404, "Refund not found.");
//     }

//     // ── Shape the response exactly like the list endpoint ──────────────
//     const formattedRefund = {
//       _id: refund._id,
//       status: refund.status,
//       createdAt: refund.createdAt,
//       updatedAt: refund.updatedAt,
//       items: refund.items.map((item) => ({
//         _id: item.product?._id,
//         name: item.product?.name,
//         images: item.product?.images || [],
//         quantity: item.quantity,
//         price: item.price,
//       })),
//       order: {
//         _id: refund.order?._id,
//         cart: refund.order?.cart,
//         amount: refund.order?.amount,
//         refunded: refund.order?.refunded,
//         paid: refund.order?.paid,
//         status: refund.order?.status,
//         shippingAddress: refund.order?.shippingAddress,
//         billingAddress: refund.order?.billingAddress,
//         createdAt: refund.order?.createdAt,
//         user: {
//           _id: refund.order?.user?._id,
//           firstName: refund.order?.user?.firstName,
//           lastName: refund.order?.user?.lastName,
//           email: refund.order?.user?.email,
//         },
//       },
//     };

//     return sendResponse(res, 200, "Refund fetched successfully", formattedRefund);
//   } catch (err) {
//     console.error("Error fetching refund:", err);
//     return sendResponse(res, 500, "Failed to fetch refund");
//   }
// };
// export const getAllRefundsAdmin = async (req, res) => {
//   try {
//     const {
//       page = 1,
//       limit = 10,
//       sortBy = "createdAt",
//       sortOrder = "desc"
//     } = req.query;
//     const user = req.body; // Assuming user is set by auth middleware

//     const sortOptions = { [sortBy]: sortOrder === "asc" ? 1 : -1 };
//     const skip = (Number(page) - 1) * Number(limit);

//     const refunds = await Refund.find({user:user.userId})
//       .populate({
//         path: "order",
//         select: "user createdAt",
//         populate: {
//           path: "user",
//           select: "firstName lastName email"
//         }
//       })
//       .populate({
//         path: "items.product",
//         select: "name images"
//       })
//       .sort(sortOptions)
//       .skip(skip)
//       .limit(Number(limit));
//        const replacements = await Refund.find({user:user.userId})
//       .populate({
//         path: "order",
//         select: "user createdAt",
//         populate: {
//           path: "user",
//           select: "firstName lastName email"
//         }
//       })
//       .populate({
//         path: "items.product",
//         select: "name images"
//       })
//       .sort(sortOptions)
//       .skip(skip)
//       .limit(Number(limit));

//     const totalRefunds = await Refund.countDocuments();

//     // Function to determine dynamic order-level status
//     const getOrderLevelStatus = (itemStatuses) => {
//       const statusSet = new Set(itemStatuses);

//       if (statusSet.has("Pending")) {
//         return "Pending";
//       }

//       if (statusSet.has("Approved")) {
//         return "Processing";
//       }

//       const resolvedStatuses = new Set(["Completed", "Rejected"]);
//       const allResolved = [...statusSet].every(status => resolvedStatuses.has(status));
//       if (allResolved) {
//         return "Completed";
//       }

//       return "Partially_Completed";
//     };

//     // Format refunds
//     const formattedRefunds = refunds.map(refund => {
//       const itemStatuses = refund.items.map(item => item.status);
//       const orderLevelStatus = getOrderLevelStatus(itemStatuses);

//       return {
//         orderNo: refund.order?._id,
//         requestQty: refund.items.length,
//         requestedDate: refund.createdAt,
//         requestType: "Refund", // Can be extended later
//         user: refund.order?.user
//           ? `${refund.order.user.firstName} ${refund.order.user.lastName}`
//           : "Unknown User",
//         status: orderLevelStatus
//       };
//     });

//     return sendResponse(res, 200, "Refunds fetched successfully", {
//       refunds: formattedRefunds,
//       totalPages: Math.ceil(totalRefunds / limit),
//       currentPage: Number(page),
//       totalRefunds
//     });

//   } catch (err) {
//     console.error("Error fetching refunds:", err);
//     return sendResponse(res, 500, "Failed to fetch refunds");
//   }
// };



// // export const getAllRefundsAdmin = async (req, res) => {
// //   try {
// //     const {
// //       page = 1,
// //       limit = 10,
// //       sortBy = "createdAt",
// //       sortOrder = "desc"
// //     } = req.query;

// //     const sortOptions = { [sortBy]: sortOrder === "asc" ? 1 : -1 };
// //     const skip = (Number(page) - 1) * Number(limit);

// //     const refunds = await Refund.find({})
// //       .populate({
// //         path: "order",
// //         select: "user amount refunded shippingAddress billingAddress createdAt updatedAt status paid cart",
// //         populate: {
// //           path: "user",
// //           select: "firstName lastName email"
// //         }
// //       })
// //       .populate({
// //         path: "items.product",
// //         select: "name images"
// //       })
// //       .sort(sortOptions)
// //       .skip(skip)
// //       .limit(Number(limit));

// //     const totalRefunds = await Refund.countDocuments();

// //     // Format refunds to match expected structure
// //     const formattedRefunds = refunds.map(refund => ({
// //       _id: refund._id,
// //       status: refund.status,
// //       createdAt: refund.createdAt,
// //       updatedAt: refund.updatedAt,
// //       items: refund.items.map(item => ({
// //         _id: item.product?._id,
// //         name: item.product?.name,
// //         images: item.product?.images || [],
// //         quantity: item.quantity,
// //         price: item.price,
// //         refunded: item.refunded
// //       })),
// //       order: {
// //         _id: refund.order?._id,
// //         cart: refund.order?.cart,
// //         amount: refund.order?.amount,
// //         refunded: refund.order?.refunded,
// //         paid: refund.order?.paid,
// //         status: refund.order?.status,
// //         shippingAddress: refund.order?.shippingAddress,
// //         billingAddress: refund.order?.billingAddress,
// //         createdAt: refund.order?.createdAt,
// //         user: {
// //           _id: refund.order?.user?._id,
// //           firstName: refund.order?.user?.firstName,
// //           lastName: refund.order?.user?.lastName,
// //           email: refund.order?.user?.email
// //         }
// //       }
// //     }));

// //     return sendResponse(res, 200, "Refunds fetched successfully", {
// //       refunds: formattedRefunds,
// //       totalPages: Math.ceil(totalRefunds / limit),
// //       currentPage: Number(page),
// //       totalRefunds
// //     });
// //   } catch (err) {
// //     console.error("Error fetching refunds:", err);
// //     return sendResponse(res, 500, "Failed to fetch refunds");
// //   }
// // };
// // export const refundOrder = async (req, res) => {
// //   try {
// //     const { orderId } = req.body;

// //     if (!orderId) {
// //       return sendResponse(res, 400, "Order ID is required.");
// //     }

// //     // Fetch the order and select items
// //     const order = await Order.findById(orderId).select("items");
// //     if (!order) {
// //       return sendResponse(res, 404, "Order not found.");
// //     }

// //     let refundsCreated = [];

// //     for (const item of order.items) {
// //       if (item.refunded) {
// //         // Skip already refunded items
// //         continue;
// //       }

// //       const existingRefund = await Refund.findOne({
// //         order: orderId,
// //         product: item.product,
// //       });

// //       if (existingRefund) {
// //         continue; // Skip if refund already exists
// //       }

// //       const refund = new Refund({
// //         order: orderId,
// //         product: item.product,
// //         price: item.price,
// //         quantity: item.quantity,
// //         status: "Pending",
// //       });

// //       await refund.save();

// //       item.refunded = true; // Mark item as refunded
// //       refundsCreated.push(refund);
// //     }

// //     // Save the updated order items
// //     await order.save();

// //     if (refundsCreated.length === 0) {
// //       return sendResponse(res, 400, "No refundable items found in the order.");
// //     }

// //     return sendResponse(res, 200, "Refund requests submitted for all eligible products.", refundsCreated);
// //   } catch (error) {
// //     console.error("Refund order error:", error);
// //     return sendResponse(res, 500, "Internal server error.");
// //   }
// // };


// // export const getAllRefundsAdmin = async (req, res) => {
// //   try {
// //     const {
// //       page = 1,
// //       limit = 10,
// //       sortBy = "createdAt",
// //       sortOrder = "desc"
// //     } = req.query;

// //     const sortOptions = { [sortBy]: sortOrder === "asc" ? 1 : -1 };
// //     const skip = (Number(page) - 1) * Number(limit);

// //     const refunds = await Refund.find({})
// //       .populate({
// //         path: "order",
// //         select: "user amount refunded shippingAddress billingAddress createdAt updatedAt status paid cart",
// //         populate: {
// //           path: "user",
// //           select: "firstName lastName email"
// //         }
// //       })
// //       .populate({
// //         path: "product",
// //         select: "name images"
// //       })
// //       .sort(sortOptions)
// //       .skip(skip)
// //       .limit(Number(limit));

// //     const totalRefunds = await Refund.countDocuments();

// //     // const formattedRefunds = refunds.map(refund => ({
// //     //   _id: refund._id,
// //     //   status: refund.status,
// //     //   createdAt: refund.createdAt,
// //     //   updatedAt: refund.updatedAt,
// //     //   refundedItem: {
// //     //     _id: refund.product?._id,
// //     //     name: refund.product?.name,
// //     //     images: refund.product?.images || [],
// //     //     quantity: refund.quantity,
// //     //     price: refund.price
// //     //   },
// //     //   order: {
// //     //     _id: refund.order?._id,
// //     //     cart: refund.order?.cart,
// //     //     amount: refund.order?.amount,
// //     //     refunded: refund.order?.refunded,
// //     //     paid: refund.order?.paid,
// //     //     status: refund.order?.status,
// //     //     shippingAddress: refund.order?.shippingAddress,
// //     //     billingAddress: refund.order?.billingAddress,
// //     //     createdAt: refund.order?.createdAt,
// //     //     user: {
// //     //       _id: refund.order?.user?._id,
// //     //       firstName: refund.order?.user?.firstName,
// //     //       lastName: refund.order?.user?.lastName,
// //     //       email: refund.order?.user?.email
// //     //     }
// //     //   }
// //     // }));

// //     return sendResponse(res, {error:"Refunds fetched successfully"}, {
// //       refunds: refunds,
// //       totalPages: Math.ceil(totalRefunds / limit),
// //       currentPage: Number(page),
// //       totalRefunds
// //     });
// //   } catch (err) {
// //     console.error("Error fetching refunds:", err);
// //     return sendResponse(res, 500, "Failed to fetch refunds");
// //   }
// // };




// // export const getAllRefundsAdmin = async (req, res) => {
// //   try {
// //     const { page = 1, limit = 10, sortBy = "createdAt", sortOrder = "desc" } = req.query;

// //     const sortOptions = { [sortBy]: sortOrder === "asc" ? 1 : -1 };
// //     const skip = (Number(page) - 1) * Number(limit);

// //     const refunds = await Refund.find({})
// //       .populate({
// //         path: "order",
// //         select: "orderId user totalAmount refunded createdAt",
// //         populate: {
// //           path: "user",
// //           select: "firstName lastName email",
// //         },
// //       })
// //       .populate({
// //         path: "items.product",
// //         select: "name price images",
// //       })
// //       .sort(sortOptions)
// //       .skip(skip)
// //       .limit(Number(limit));

// //     const totalRefunds = await Refund.countDocuments();

// //     return sendResponse(res, 200, "Refunds fetched successfully", {
// //       refunds,
// //       totalPages: Math.ceil(totalRefunds / limit),
// //       currentPage: Number(page),
// //       totalRefunds,
// //     });
// //   } catch (err) {
// //     console.error("Error fetching refunds:", err);
// //     return sendResponse(res, 500, "Failed to fetch refunds");
// //   }
// // };







