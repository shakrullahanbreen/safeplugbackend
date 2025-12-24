import express from "express";
import {
  createProduct,
  updateProduct,
  deleteProduct,
  getProduct,
  getProducts,
  togglePublished,
  getProductsByCategory,
  getProductsByBrand,
  getProductsadmin,
  getSpecialProducts,
  bulkUploadProducts,
  exportProductsCsv,
  updateProductsDisplayOrder,
  getCategoryProductCount
} from "../controllers/productController.js";
import auth from '../middlewares/auth.js';
import { admin } from "../utils/helper.js";
import publicAuth from "../middlewares/publicAuth.js";
import multer from "multer";

const productRouter = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

productRouter.post("/", auth, admin,createProduct);
productRouter.delete("/", auth,admin, deleteProduct);
productRouter.put("/", auth,admin, updateProduct);
productRouter.get("/", publicAuth ,getProducts);
productRouter.get("/special", publicAuth ,getSpecialProducts);
productRouter.post("/bulk-upload", auth, admin, upload.single("file"), bulkUploadProducts);
productRouter.get("/export", auth, admin, exportProductsCsv);
productRouter.patch("/:id/toggle-published", auth, admin,togglePublished);
productRouter.patch("/display-order", auth, admin, updateProductsDisplayOrder);
productRouter.get("/category-count", auth, admin, getCategoryProductCount);
productRouter.get("/admin", auth,admin,getProductsadmin);
productRouter.get("/category/:categoryId", getProductsByCategory);
productRouter.get("/brand/:brandId", getProductsByBrand);
productRouter.get("/:id",publicAuth, getProduct);

export default productRouter;