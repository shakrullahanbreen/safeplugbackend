import User from "../models/userModel.js";
import Product from "../models/productModel.js";
import Category from "../models/categoryModel.js";
import Order from "../models/orderModel.js";
import Request from "../models/requestsModel.js";
import { HTTP_STATUS_200, HTTP_STATUS_403, HTTP_STATUS_500 } from "../utils/constants.js";
import { sendResponse } from "../utils/helper.js";

// Get dashboard statistics
export const getDashboardStats = async (req, res) => {
  try {
    // Get counts for users, products, categories
    const [userCount, productCount, categoryCount] = await Promise.all([
      User.countDocuments({ role: { $ne: "admin" } }), // Exclude admin users
      Product.countDocuments({ published: true }),
      Category.countDocuments({ isDeleted: false })
    ]);

    // Get recent orders count (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentOrdersCount = await Order.countDocuments({
      createdAt: { $gte: thirtyDaysAgo }
    });

    // Get pending requests count
    const pendingRequestsCount = await Request.countDocuments({
      status: "Pending"
    });

    return sendResponse(res, HTTP_STATUS_200, "Dashboard stats retrieved successfully", {
      users: userCount,
      products: productCount,
      categories: categoryCount,
      recentOrders: recentOrdersCount,
      pendingRequests: pendingRequestsCount
    });
  } catch (error) {
    console.error("Error getting dashboard stats:", error);
    return sendResponse(res, HTTP_STATUS_500, "Internal server error", null);
  }
};

// Get recent orders with status
export const getRecentOrders = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;
    // If SalesPerson, restrict to orders from assigned customers
    let orderQuery = {};
    if (req?.user?.role === 'SalesPerson' && req?.user?._id) {
      const assignedUsers = await User.find({ assignedSalesPerson: req.user._id }).select('_id');
      const assignedUserIds = assignedUsers.map(u => u._id);
      orderQuery.user = { $in: assignedUserIds };
    }

    const orders = await Order.find(orderQuery)
      .populate('user', 'firstName lastName email')
      .populate('items.product', 'name images')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const totalOrders = await Order.countDocuments(orderQuery);

    return sendResponse(res, HTTP_STATUS_200, "Recent orders retrieved successfully", {
      orders,
      totalOrders,
      currentPage: parseInt(page),
      totalPages: Math.ceil(totalOrders / limit)
    });
  } catch (error) {
    console.error("Error getting recent orders:", error);
    return sendResponse(res, HTTP_STATUS_500, "Internal server error", null);
  }
};

// Get return/replace requests
export const getReturnReplaceRequests = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;
    // If SalesPerson, restrict to requests from assigned customers
    let requestQuery = {};
    if (req?.user?.role === 'SalesPerson' && req?.user?._id) {
      const assignedUsers = await User.find({ assignedSalesPerson: req.user._id }).select('_id');
      const assignedUserIds = assignedUsers.map(u => u._id);
      requestQuery.user = { $in: assignedUserIds };
    }

    const requests = await Request.find(requestQuery)
      .populate('user', 'firstName lastName email')
      .populate('order', 'amount status')
      .populate('items.product', 'name images')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const totalRequests = await Request.countDocuments(requestQuery);

    return sendResponse(res, HTTP_STATUS_200, "Return/replace requests retrieved successfully", {
      requests,
      totalRequests,
      currentPage: parseInt(page),
      totalPages: Math.ceil(totalRequests / limit)
    });
  } catch (error) {
    console.error("Error getting return/replace requests:", error);
    return sendResponse(res, HTTP_STATUS_500, "Internal server error", null);
  }
};

// Get users and their product orders count
export const getUsersProductOrders = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    // Aggregate to get users with their order counts and total products ordered
    const matchStage = { role: { $ne: "admin" } };
    if (req?.user?.role === 'SalesPerson' && req?.user?._id) {
      matchStage.assignedSalesPerson = req.user._id;
    }

    const usersWithOrders = await User.aggregate([
      {
        $match: matchStage
      },
      {
        $lookup: {
          from: "orders",
          localField: "_id",
          foreignField: "user",
          as: "orders"
        }
      },
      {
        $addFields: {
          orderCount: { $size: "$orders" },
          totalProductsOrdered: {
            $sum: {
              $map: {
                input: "$orders",
                as: "order",
                in: { $size: "$$order.items" }
              }
            }
          },
          totalAmount: {
            $sum: "$orders.amount"
          }
        }
      },
      {
        $project: {
          firstName: 1,
          lastName: 1,
          email: 1,
          role: 1,
          orderCount: 1,
          totalProductsOrdered: 1,
          totalAmount: 1,
          createdAt: 1
        }
      },
      {
        $sort: { totalProductsOrdered: -1 }
      },
      {
        $skip: skip
      },
      {
        $limit: parseInt(limit)
      }
    ]);

    const totalUsers = await User.countDocuments(matchStage);

    return sendResponse(res, HTTP_STATUS_200, "Users product orders retrieved successfully", {
      users: usersWithOrders,
      totalUsers,
      currentPage: parseInt(page),
      totalPages: Math.ceil(totalUsers / limit)
    });
  } catch (error) {
    console.error("Error getting users product orders:", error);
    return sendResponse(res, HTTP_STATUS_500, "Internal server error", null);
  }
};

// Get product selling ranking
export const getProductSellingRanking = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    // Aggregate to get products with their sales data
    let matchOrderStage = {};
    if (req?.user?.role === 'SalesPerson' && req?.user?._id) {
      const assignedUsers = await User.find({ assignedSalesPerson: req.user._id }).select('_id');
      const assignedUserIds = assignedUsers.map(u => u._id);
      matchOrderStage = { user: { $in: assignedUserIds } };
    }

    const productSales = await Order.aggregate([
      Object.keys(matchOrderStage).length ? { $match: matchOrderStage } : { $match: {} },
      {
        $unwind: "$items"
      },
      {
        $lookup: {
          from: "products",
          localField: "items.product",
          foreignField: "_id",
          as: "product"
        }
      },
      {
        $unwind: "$product"
      },
      {
        $group: {
          _id: "$items.product",
          productName: { $first: "$product.name" },
          productImages: { $first: "$product.images" },
          totalUnitsSold: { $sum: "$items.quantity" },
          totalRevenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } },
          orderCount: { $sum: 1 }
        }
      },
      {
        $sort: { totalUnitsSold: -1 }
      },
      {
        $skip: skip
      },
      {
        $limit: parseInt(limit)
      }
    ]);

    const totalProducts = await Product.countDocuments({ published: true });

    return sendResponse(res, HTTP_STATUS_200, "Product selling ranking retrieved successfully", {
      products: productSales,
      totalProducts,
      currentPage: parseInt(page),
      totalPages: Math.ceil(totalProducts / limit)
    });
  } catch (error) {
    console.error("Error getting product selling ranking:", error);
    return sendResponse(res, HTTP_STATUS_500, "Internal server error", null);
  }
};

// SalesPerson: Get customers assigned to the salesperson
export const getSalespersonCustomers = async (req, res) => {
  try {
    if (!(req?.user?.role === 'SalesPerson' && req?.user?._id)) {
      return sendResponse(res, HTTP_STATUS_403, "Forbidden", null);
    }
    const { page = 1, limit = 10, search = '' } = req.query;
    const skip = (page - 1) * limit;

    const searchQuery = search
      ? {
          $or: [
            { firstName: { $regex: search, $options: 'i' } },
            { lastName: { $regex: search, $options: 'i' } },
            { email: { $regex: search, $options: 'i' } },
            { companyName: { $regex: search, $options: 'i' } },
          ],
        }
      : {};

    const query = {
      assignedSalesPerson: req.user._id,
      role: { $ne: 'SalesPerson' },
      ...searchQuery,
    };

    const customers = await User.find(query)
      .select('firstName lastName email phone role companyName createdAt')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await User.countDocuments(query);

    return sendResponse(res, HTTP_STATUS_200, "Salesperson customers retrieved successfully", {
      customers,
      total,
      currentPage: parseInt(page),
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("Error getting salesperson customers:", error);
    return sendResponse(res, HTTP_STATUS_500, "Internal server error", null);
  }
};

// SalesPerson: Orders grouped by user (assigned customers only)
export const getSalespersonOrdersByUser = async (req, res) => {
  try {
    if (!(req?.user?.role === 'SalesPerson' && req?.user?._id)) {
      return sendResponse(res, HTTP_STATUS_403, "Forbidden", null);
    }
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    const assignedUsers = await User.find({ assignedSalesPerson: req.user._id }).select('_id firstName lastName email');
    const assignedUserIds = assignedUsers.map(u => u._id);

    const grouped = await Order.aggregate([
      { $match: { user: { $in: assignedUserIds } } },
      {
        $group: {
          _id: "$user",
          orderCount: { $sum: 1 },
          totalAmount: { $sum: "$amount" },
          totalItems: { $sum: { $size: "$items" } },
          lastOrderAt: { $max: "$createdAt" },
        },
      },
      { $sort: { lastOrderAt: -1 } },
      { $skip: skip },
      { $limit: parseInt(limit) },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user',
        }
      },
      { $unwind: '$user' },
      {
        $project: {
          _id: 1,
          orderCount: 1,
          totalAmount: 1,
          totalItems: 1,
          lastOrderAt: 1,
          'user.firstName': 1,
          'user.lastName': 1,
          'user.email': 1,
        }
      }
    ]);

    const total = await Order.distinct('user', { user: { $in: assignedUserIds } });

    return sendResponse(res, HTTP_STATUS_200, "Salesperson orders by user retrieved successfully", {
      users: grouped,
      total: total.length,
      currentPage: parseInt(page),
      totalPages: Math.ceil(total.length / limit),
    });
  } catch (error) {
    console.error("Error getting salesperson orders by user:", error);
    return sendResponse(res, HTTP_STATUS_500, "Internal server error", null);
  }
};

// Get low stock products
export const getLowStockProducts = async (req, res) => {
  try {
    const { page = 1, limit = 10, threshold = 10 } = req.query;
    const skip = (page - 1) * limit;

    const products = await Product.find({
      stock: { $lte: parseInt(threshold) },
      published: true,
      isDeleted: { $ne: true }
    })
      .populate("category", "name")
      .populate("brand", "name")
      .sort({ stock: 1 }) // Sort by stock ascending (lowest first)
      .skip(skip)
      .limit(parseInt(limit));

    const totalProducts = await Product.countDocuments({
      stock: { $lte: parseInt(threshold) },
      published: true,
      isDeleted: { $ne: true }
    });

    return sendResponse(res, HTTP_STATUS_200, "Low stock products retrieved successfully", {
      products,
      totalProducts,
      currentPage: parseInt(page),
      totalPages: Math.ceil(totalProducts / limit)
    });
  } catch (error) {
    console.error("Error getting low stock products:", error);
    return sendResponse(res, HTTP_STATUS_500, "Internal server error", null);
  }
};
