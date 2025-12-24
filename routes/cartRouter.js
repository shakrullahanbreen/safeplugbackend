import express from "express";
import auth from '../middlewares/auth.js';
import { addToCart, clearCart, getCart, removeFromCart, updateCart } from "../controllers/cartController.js";

const cartRouter = express.Router();

cartRouter.get('/', auth,getCart);
cartRouter.post('/add',auth,addToCart);
// cartRouter.post('/remove',auth, removeFromCart);
cartRouter.put('/update', auth, updateCart)
// cartRouter.post('/clear',auth, clearCart);

export default cartRouter;