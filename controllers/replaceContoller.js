// import Replace from "../models/replacedModel.js";
// import Order from "../models/orderModel.js";
// import { sendResponse } from "../utils/helper.js";


// // 1️⃣ Replace Single Product
// export const replaceProduct = async (req, res) => {
//   try {
//     const { orderId, productId } = req.body;

//     if (!orderId || !productId) {
//       return sendResponse(res, 400, "Order ID and Product ID are required.");
//     }

//     const existingReplace = await Replace.findOne({
//       order: orderId,
//       "items.product": productId,
//     });

//     if (existingReplace) {
//       return sendResponse(res, 400, "Replacement already requested for this product.");
//     }

//     const order = await Order.findById(orderId).select("items");
//     if (!order) return sendResponse(res, 404, "Order not found.");

//     const orderItem = order.items.find(item => item.product.toString() === productId);
//     if (!orderItem) return sendResponse(res, 404, "Product not found in order.");

//     if (orderItem.refunded) {
//       return sendResponse(res, 400, "This product has already been refunded.");
//     }

//     if (orderItem.replaced) {
//       return sendResponse(res, 400, "This product has already been replaced.");
//     }

//     let replacement = await Replace.findOne({ order: orderId });

//     const newItem = {
//       product: productId,
//       price: orderItem.price,
//       quantity: orderItem.quantity,
//     };

//     if (replacement) {
//       replacement.items.push(newItem);
//       replacement.updatedAt = new Date();
//       await replacement.save();
//     } else {
//       replacement = await Replace.create({
//         order: orderId,
//         items: [newItem],
//       });
//     }

//     orderItem.replaced = true;
//     orderItem.refunded = false;
//     await order.save();

//     return sendResponse(res, 200, "Replacement requested successfully", replacement);
//   } catch (error) {
//     console.error("Replace product error:", error);
//     return sendResponse(res, 500, "Internal server error.");
//   }
// };

// // 2️⃣ Replace All Eligible Items in Order
// export const replaceOrder = async (req, res) => {
//   try {
//     const { orderId } = req.body;
//     if (!orderId) return sendResponse(res, 400, "Order ID is required.");

//     const order = await Order.findById(orderId).select("items");
//     if (!order) return sendResponse(res, 404, "Order not found.");

//     const replaceableItems = order.items.filter(
//       item => !item.replaced && !item.refunded
//     );

//     if (replaceableItems.length === 0) {
//       return sendResponse(res, 400, "No replaceable items found.");
//     }

//     const replaceItems = replaceableItems.map(item => ({
//       product: item.product,
//       price: item.price,
//       quantity: item.quantity,
//     }));

//     let replacement = await Replace.findOne({ order: orderId });

//     if (replacement) {
//       replacement.items.push(...replaceItems);
//       await replacement.save();
//     } else {
//       replacement = await Replace.create({
//         order: orderId,
//         items: replaceItems,
//       });
//     }

//     replaceableItems.forEach(item => {
//       item.replaced = true;
//       item.refunded = false;
//     });
//     await order.save();

//     return sendResponse(res, 200, "Replacement requested for eligible items", replacement);
//   } catch (error) {
//     console.error("Replace order error:", error);
//     return sendResponse(res, 500, "Internal server error.");
//   }
// };

// // 3️⃣ Get Replacement By ID
// export const getReplaceOrderById = async (req, res) => {
//   try {
//     const { id } = req.params;

//     if (!id) return sendResponse(res, 400, "Replace ID is required.");

//     const replacement = await Replace.findById(id)
//       .populate({
//         path: "order",
//         select: "user amount refunded shippingAddress billingAddress createdAt updatedAt status paid cart",
//         populate: {
//           path: "user",
//           select: "firstName lastName email",
//         },
//       })
//       .populate({
//         path: "items.product",
//         select: "name images",
//       });

//     if (!replacement) {
//       return sendResponse(res, 404, "Replacement not found.");
//     }

//     const formatted = {
//       _id: replacement._id,
//       createdAt: replacement.createdAt,
//       updatedAt: replacement.updatedAt,
//       items: replacement.items.map(item => ({
//         _id: item.product?._id,
//         name: item.product?.name,
//         images: item.product?.images || [],
//         quantity: item.quantity,
//         price: item.price,
//         status: item.status
//       })),
//       order: {
//         _id: replacement.order?._id,
//         cart: replacement.order?.cart,
//         amount: replacement.order?.amount,
//         refunded: replacement.order?.refunded,
//         paid: replacement.order?.paid,
//         shippingAddress: replacement.order?.shippingAddress,
//         billingAddress: replacement.order?.billingAddress,
//         createdAt: replacement.order?.createdAt,
//         user: {
//           _id: replacement.order?.user?._id,
//           firstName: replacement.order?.user?.firstName,
//           lastName: replacement.order?.user?.lastName,
//           email: replacement.order?.user?.email,
//         },
//       },
//     };

//     return sendResponse(res, 200, "Replacement fetched successfully", formatted);
//   } catch (err) {
//     console.error("Error fetching replacement:", err);
//     return sendResponse(res, 500, "Failed to fetch replacement");
//   }
// };

// // 4️⃣ Admin View All Replacements
// export const getAllReplacementsAdmin = async (req, res) => {
//   try {
//     const {
//       page = 1,
//       limit = 10,
//       sortBy = "createdAt",
//       sortOrder = "desc"
//     } = req.query;

//     const sortOptions = { [sortBy]: sortOrder === "asc" ? 1 : -1 };
//     const skip = (Number(page) - 1) * Number(limit);

//     const replacements = await Replace.find({})
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

//     const totalReplacements = await Replace.countDocuments();

//     const getOrderLevelStatus = (itemStatuses) => {
//       const statusSet = new Set(itemStatuses);

//       if (statusSet.has("Pending")) return "Pending";
//       if (statusSet.has("Approved")) return "Processing";

//       const resolved = new Set(["Completed", "Rejected"]);
//       const allResolved = [...statusSet].every(s => resolved.has(s));
//       if (allResolved) return "Completed";

//       return "Partially_Completed";
//     };

//     const formatted = replacements.map(rep => {
//       const itemStatuses = rep.items.map(i => i.status);
//       const orderLevelStatus = getOrderLevelStatus(itemStatuses);

//       return {
//         orderNo: rep.order?._id,
//         requestQty: rep.items.length,
//         requestedDate: rep.createdAt,
//         requestType: "Replacement",
//         user: rep.order?.user
//           ? `${rep.order.user.firstName} ${rep.order.user.lastName}`
//           : "Unknown User",
//         status: orderLevelStatus
//       };
//     });

//     return sendResponse(res, 200, "Replacements fetched successfully", {
//       replacements: formatted,
//       totalPages: Math.ceil(totalReplacements / limit),
//       currentPage: Number(page),
//       totalReplacements
//     });
//   } catch (err) {
//     console.error("Error fetching replacements:", err);
//     return sendResponse(res, 500, "Failed to fetch replacements");
//   }
// };
