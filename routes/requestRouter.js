import express from "express";
import auth from '../middlewares/auth.js';
import { admin } from "../utils/helper.js";
// import { ,  } from "../controllers/refundController.js";
import { getAllRequestsAdmin, refundProduct,getRequestById,refundOrder, replaceOrder, replaceProduct, acceptRequest, rejectRequest, getAllRequests } from "../controllers/requestController.js";

const requestRouter = express.Router();

requestRouter.post('/refund',auth, refundProduct);
requestRouter.post('/repalce',auth, replaceProduct);
requestRouter.get('/customer',auth, getAllRequests);

// requestRouter.post('/refund/order',auth, refundOrder);
// requestRouter.post('/repalce/order',auth, replaceOrder);
requestRouter.post('/accept',auth, acceptRequest);
requestRouter.post('/reject',auth, rejectRequest);
requestRouter.get('/:requestId', auth, getRequestById);

requestRouter.get('/',auth, getAllRequestsAdmin);

export default requestRouter;