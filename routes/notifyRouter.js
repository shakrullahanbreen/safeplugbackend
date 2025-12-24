import express from "express";
import { subscribeRestock, sendContactForm } from "../controllers/notifyController.js";

const router = express.Router();

router.post("/subscribe", subscribeRestock);
router.post("/contact", sendContactForm);

export default router;


