import express from "express";
import auth from '../middlewares/auth.js';
import { admin } from "../utils/helper.js";
import { acceptOrder, getAllOrders, getOrderById, placeOrder, updateOrder, updateOrderStatus, updateTrackingId } from "../controllers/orderController.js";

const orderRouter = express.Router();

orderRouter.post('/',auth, placeOrder);
orderRouter.put('/',auth, updateOrder);
orderRouter.get('/',auth, getAllOrders);
orderRouter.put('/tracking-Id',auth, updateTrackingId);
orderRouter.put('/accept',auth, acceptOrder);
// orderRouter.put('/:id/status', auth,updateOrderStatus);
orderRouter.get('/:id', auth,getOrderById);


export default orderRouter;