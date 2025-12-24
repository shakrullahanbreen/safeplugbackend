import jwt from "jsonwebtoken";
import { sendResponse } from "../utils/helper.js";
import { HTTP_STATUS_401, HTTP_STATUS_500 } from "../utils/constants.js";

// const auth = (req, res, next) => {
//   const token =  req.headers["x-access-token"] || req.headers["X-Access-Token"]||  req.body.token || req.query.token ;
//   req.body = req.body || {};
//   try {
    
//     if (!token) {
//       sendResponse(res, "Authentication token missing", HTTP_STATUS_500);
//       return false;
//     }
//     const decoded = jwt.verify(token, process.env.TOKEN_SECRET);
//     if (!decoded) {
//       sendResponse(res, "Invalid token", HTTP_STATUS_500);
//       return false;
//     }
//     req.body.user = decoded;
//   } catch (err) {
//     console.log("Error:", err); 
//     if (err.name === "TokenExpiredError") {
//       console.error(err);
//       sendResponse(res, "Your token expired. Please log in again.", HTTP_STATUS_401); 
//       console.error(err);
//       sendResponse(res, "Invalid token. Authentication failed.", HTTP_STATUS_500);
//     }
//     return false;
//   }
  
//   return next();
// };

// export default auth;

const publicAuth = (req, res, next) => {
  const token =
    req.headers["x-access-token"] ||
    req.headers["X-Access-Token"] ||
    req.body?.token ||
    req.query?.token;

  req.body = req.body || {};

  // ✅ Allow if no token (public access)
  if (!token) {
    return next();
  }

  try {
    const decoded = jwt.verify(token, process.env.TOKEN_SECRET);
    req.body.user = decoded; // ✅ Attach user if token is valid
  } catch (err) {
    console.error("JWT error:", err);

    // ❌ Token was provided but is invalid or expired — reject it
    if (err.name === "TokenExpiredError") {
      return sendResponse(res, HTTP_STATUS_401, "Token expired. Please log in again.");
    }

    return sendResponse(res, HTTP_STATUS_401, "Invalid token. Authentication failed.");
  }

  return next(); // ✅ Continue either way
};

export default publicAuth;
