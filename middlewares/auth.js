import jwt from "jsonwebtoken";
import { sendResponse } from "../utils/helper.js";
import { HTTP_STATUS_401, HTTP_STATUS_500 } from "../utils/constants.js";

const auth = (req, res, next) => {
  const token =  req.headers["x-access-token"] || req.headers["X-Access-Token"]||  (req.body && req.body.token) || req.query.token ;
  try {
    
    if (!token) {
      return sendResponse(res, HTTP_STATUS_500, "Authentication token missing");
    }
    const decoded = jwt.verify(token, process.env.TOKEN_SECRET);
    if (!decoded) {
      return sendResponse(res, HTTP_STATUS_500, "Invalid token");
    }

      if (decoded.verfied !== "approved") {
      return sendResponse(
        res,
        HTTP_STATUS_401,
        "Account not verified. Please wait for admin approval."
      );
    }
    req.user = decoded;
    return next();
  } catch (err) {
    console.log("Error:", err); 
    if (err.name === "TokenExpiredError") {
      console.error(err);
      return sendResponse(res, HTTP_STATUS_401, "Your token expired. Please log in again."); 
    }
    console.error(err);
    return sendResponse(res, HTTP_STATUS_500, "Invalid token. Authentication failed.");
  }
};

export default auth;
