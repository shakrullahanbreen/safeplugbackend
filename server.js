import express from "express";
import mongoose from "mongoose";
import dotenv from 'dotenv';
import cors from "cors";
import { createServer } from 'node:http';
import helmet from "helmet";
import userRouter from "./routes/userRouters.js";
import recaptchaRouter from "./routes/recaptchaRoute.js";
// import productRouter from "./routes/productRouter.js";
import categoryRouter from "./routes/categoryRouter.js";
import brandRouter from "./routes/brandRouter.js";
import productRouter from "./routes/productRouter.js";
import cartRouter from "./routes/cartRouter.js";
import s3Router from "./routes/s3Router.js";
import orderRouter from "./routes/orderRouter.js";
// import { ref } from "node:process";
// import refundRouter from "./routes/refundRouter.js";
// import replaceRouter from "./routes/replaceRouter.js";
import requestRouter from "./routes/requestRouter.js";

import websiteInfoRouter from "./routes/websiteInfoRouter.js";
import tagRouter from "./routes/tagRouter.js";
import notifyRouter from "./routes/notifyRouter.js";
import videoRouter from "./routes/videoRouter.js";
import blogRouter from "./routes/blogRouter.js";
import dashboardRouter from "./routes/dashboardRouter.js";

dotenv.config();

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 5000;

// MongoDB Connection
const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!MONGO_URI) {
    console.error("MONGODB_URI/MONGO_URI is not set in environment variables. Aborting startup.");
    process.exit(1);
}

mongoose.connect(MONGO_URI, {
    serverSelectionTimeoutMS: 10000,
})
    .then(() => {
        console.log("Connected to MongoDB");
        // Start Server only after successful DB connection
        server.listen(PORT, () => {

             // Log all environment variables
        console.log("\n========== ENVIRONMENT VARIABLES ==========");
        const envVars = {
            NODE_ENV: process.env.NODE_ENV,
            PORT: process.env.PORT,
            MONGODB_URI: process.env.MONGODB_URI ? "[SET]" : "[NOT SET]",
            MONGO_URI: process.env.MONGO_URI ? "[SET]" : "[NOT SET]",
            GMAIL_USER: process.env.GMAIL_USER,
            GMAIL_PASS: process.env.GMAIL_PASS ? "[SET]" : "[NOT SET]",
            ADMIN_EMAIL: process.env.ADMIN_EMAIL,
            AWS_REGION: process.env.AWS_REGION,
            AWS_ACCESS_KEY: process.env.AWS_ACCESS_KEY ? "[SET]" : "[NOT SET]",
            AWS_SECRET_KEY: process.env.AWS_SECRET_KEY ? "[SET]" : "[NOT SET]",
            AWS_BUCKET_NAME: process.env.AWS_BUCKET_NAME,
            MAILCHIMP_API_KEY: process.env.MAILCHIMP_API_KEY ? "[SET]" : "[NOT SET]",
            MAILCHIMP_SERVER_PREFIX: process.env.MAILCHIMP_SERVER_PREFIX,
            MAILCHIMP_LIST_ID: process.env.MAILCHIMP_LIST_ID,
            RECAPTCHA_SECRET_KEY: process.env.RECAPTCHA_SECRET_KEY ? "[SET]" : "[NOT SET]",
            TOKEN_SECRET: process.env.TOKEN_SECRET ? "[SET]" : "[NOT SET]",
            CLIENT_URL: process.env.CLIENT_URL,
            NEXT_PUBLIC_SERVER_BASE_URL: process.env.NEXT_PUBLIC_SERVER_BASE_URL,
            STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
        };
        
        Object.entries(envVars).forEach(([key, value]) => {
            console.log(`${key}: ${value}`);
        });
        console.log("==========================================\n");
        
                      console.log("gmailuser:",process.env.GMAIL_USER)

            console.log(`Server is running on port ${PORT}`);
        });
    })
    .catch((err) => {
        console.error("Failed to connect to MongoDB:", err.message);
        process.exit(1);
    });

app.disable('etag');
app.set('trust proxy', 1);

// Enable compression (exclude images and already compressed files)
import compression from "compression";
app.use(compression({
  filter: (req, res) => {
    // Don't compress images, videos, or already compressed files
    if (req.url.match(/\.(jpg|jpeg|png|gif|webp|svg|ico|mp4|mp3|zip|gz|pdf)$/i)) {
      return false;
    }
    // Use compression for other content
    return compression.filter(req, res);
  },
  level: 6, // Balanced compression level
  threshold: 1024, // Only compress files larger than 1KB
}));

// Security headers
app.use(helmet({
  crossOriginOpenerPolicy: { policy: "same-origin" },
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: false, // keep flexible; tighten later if needed
  hsts: process.env.NODE_ENV === 'production' ? { maxAge: 15552000, includeSubDomains: true, preload: false } : false,
}));

// Increase JSON payload limit for large requests
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Permissive CORS (temporary revert to unblock live)
app.use(cors({
  origin: true, // Reflect request Origin
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "x-access-token",
    "x-user-role",
  ],
  maxAge: 86400,
  optionsSuccessStatus: 204,
}));
// Preflight will be handled by the CORS middleware above; no explicit options routes

// Request Logger (reduce noise in production)
app.use((req, res, next) => {
    if (process.env.NODE_ENV !== 'production') {
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
    }
    next();
});

// Cache-control: do not cache dynamic API responses by default
// Must be before routes so it executes for all API requests
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    // Default: dynamic API should not be cached by browsers or CDN unless overridden in route
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});

// Routes
app.use("/api/users", userRouter);
app.use('/api/recaptcha', recaptchaRouter); 
app.use("/api/products", productRouter);
app.use("/api/categories", categoryRouter);
app.use("/api/brands", brandRouter);
app.use("/api/cart", cartRouter); // Assuming cart routes are in productRouter
app.use("/api/orders", orderRouter);
app.use("/api/tags", tagRouter);
app.use("/api/notify", notifyRouter);

// app.use("/api/refunds", refundRouter); // Assuming refund routes are in refundRouter
// app.use("/api/replaces", replaceRouter);
app.use("/api/requests", requestRouter);
app.use("/api/webinfo", websiteInfoRouter);
app.use("/api/videos", videoRouter);
app.use("/api/blogs", blogRouter);
app.use("/api/dashboard", dashboardRouter);





app.use("/api/s3", s3Router); // Dynamic import for S3 routes


// Error Handler
app.use((err, req, res, next) => {
    const statusCode = err.statusCode || 500;
    const message = err.message || 'Internal server error';
    return res.status(statusCode).json({
        success: false,
        message,
        statusCode
    });
});

// Server is started after DB connection above
