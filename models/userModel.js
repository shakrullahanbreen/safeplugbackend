import mongoose from "mongoose";
import { USERTYPES } from "../utils/constants.js";


const PaymentMethodSchema = new mongoose.Schema({
  stripePaymentMethodId: { type: String, required: true },
  brand: String,
  last4: String,
  exp_month: Number,
  exp_year: Number,
  isDefault: { type: Boolean, default: false },
});
const userSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: true,
    },
    lastName: {
      type: String,
      required: false,
    },
    stripeCustomerId: {
      type: String,
      required: false, // This can be optional if not all users will have a Stripe customer ID
    },

    email: {
      type: String,
      required: true,
      unique: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Invalid email format"],
    },
    password: {
      type: String,
      required: true,
      minlength: [6, "Password must be at least 6 characters long"],
    },
    phone: {
      type: String,
      required: false,
      unique: true,
      sparse: true, // Allows multiple null values but ensures uniqueness for non-null values
    },
    role: {
      type: String,
      required: true,
      enum: USERTYPES,
    },
    verfied: {
      type: String,
      enum: ["pending", "rejected", "approved"],
      required: false,
      default: "pending",
    },
    rejectionReason: {
      type: String,
      required: false,
      default: "",
    },
    companyName: {
      type: String,
      required: false,
    },
    postalCode: {
      type: String,
      required: false,
    },
    addressLine1: {
      type: String,
      required: false,
    },
    addressLine2: {
      type: String,
      required: false,
    },
    city: {
      type: String,
      required: false,
    },
    state: {
      type: String,
      required: false,
    },
    businessType: {
      type: String,
      required: false,
      enum: USERTYPES, // you can update this list
    },
    assignedSalesPerson: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false,
    },
    businessLicenseUrl: {
      type: String,
      required: false, // Can be used to store a file path or S3 URL
    },
    agreeTermsAndConditions: {
      type: Boolean,
      required: true,
      default: false,
    },
    // Additional fields that may be used:
    file:  {
      type: [Object],
      default: [],
    },
    gRecaptchaToken: {
      type: String,
      required: false,
    },
    re_password: {
      type: String,
      required: false,
    },
    otp: {
      type: String,
      required: false,
    },
    paymentMethods: [PaymentMethodSchema],
    otpExpiry: {
      type: Date,
      required: false,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);
export default User;
