import mongoose from "mongoose";
import {  USERTYPE_ADMIN } from "./constants.js";

export const sendResponse = (res, statusCode, message, data) => {

    return res.status(statusCode).json({
        success: statusCode >= 200 && statusCode < 300,
        message,
        data,
    });

}

export const admin = (req, res, next) => {
  if (!req.user || (req.user.role !== USERTYPE_ADMIN && req.user.role !== "SalesPerson")) {
    return sendResponse(res, 403, "Access denied. Admins and Sales Persons only.");
  }
  next();
};

export const getMongoId = (id) => {
  if (!id) {
    return null;
  }
  try {
    return new mongoose.Types.ObjectId(id);
  } catch (error) {
    console.error("Invalid MongoDB ID:", error);
    return null;
  }
}

export const validateObjectIdOrThrow = (id, paramName = 'ID') => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const error = new Error(`Invalid ${paramName}: "${id}" is not a valid ObjectId`);
    error.statusCode = 400; // You can set this for custom error handling
    throw error;
  }
};


export const getShippingCost = (method, amount) => {
  const amt = Number(amount) || 0;
  if (amt <= 0) return 0;

  const key = String(method || "").toLowerCase().replace(/\s+/g, "");
  const isGround = [
    "ground",
    "upsground",
    "groundups",
    "groundshipping",
    "standard"
  ].includes(key);
  const isOvernight = [
    "overnight",
    "overnite",
    "upsovernight",
    "upsovernite",
    "nextday"
  ].includes(key);

  if (isGround) {
    if (amt <= 50) return 10;
    if (amt <= 250) return 20;
    if (amt <= 499) return 30;
    const increments = Math.floor((amt - 500) / 150) + 1;
    return 30 + increments * 10;
  }

  if (isOvernight) {
    if (amt <= 50) return 20;
    if (amt <= 250) return 30;
    if (amt <= 499) return 40;
    const increments = Math.floor((amt - 500) / 150) + 1;
    return 40 + increments * 15;
  }

  return 0;
};