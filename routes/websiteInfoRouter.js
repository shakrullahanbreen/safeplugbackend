import express from "express";
import auth from "../middlewares/auth.js";
import { admin } from "../utils/helper.js";
import { addWebsiteInfo, getWebsiteInfo } from "../controllers/websiteInfoController.js";


const websiteInfoRouter = express.Router();
websiteInfoRouter.post('/',auth,admin, addWebsiteInfo);
websiteInfoRouter.get('/', getWebsiteInfo);



export default websiteInfoRouter;