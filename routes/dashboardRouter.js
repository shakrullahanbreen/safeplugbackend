import express from "express";
import { 
  getDashboardStats, 
  getRecentOrders, 
  getReturnReplaceRequests, 
  getUsersProductOrders, 
  getProductSellingRanking,
  getLowStockProducts,
  getSalespersonCustomers,
  getSalespersonOrdersByUser
} from "../controllers/dashboardController.js";
import auth from "../middlewares/auth.js";

const router = express.Router();

// All dashboard routes require authentication
router.use(auth);

// Dashboard statistics
router.get("/stats", getDashboardStats);

// Recent orders
router.get("/orders", getRecentOrders);

// Return/replace requests
router.get("/requests", getReturnReplaceRequests);

// Users and their product orders
router.get("/users-orders", getUsersProductOrders);

// Product selling ranking
router.get("/product-ranking", getProductSellingRanking);

// Low stock products
router.get("/low-stock-products", getLowStockProducts);

// Salesperson specific
router.get("/salesperson/customers", getSalespersonCustomers);
router.get("/salesperson/orders-by-user", getSalespersonOrdersByUser);

export default router;
