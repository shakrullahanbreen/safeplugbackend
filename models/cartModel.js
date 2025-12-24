// models/Cart.js
import mongoose from "mongoose";

const cartItemSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true,
  },
  quantity: {
    type: Number,
    default: 1,
    min: 1,
  },
});

const cartSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    items: [cartItemSchema],
    isActive: {
      type: Boolean,
      default: true,
    },
    // Tracks last meaningful customer activity (adding/removing items, toggling active)
    lastActivityAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    // Reminder bookkeeping to avoid duplicate emails
    reminderSentAt: {
      type: Date,
      default: null,
      index: true,
    },
    abandonedReminderCount: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true }
);

// Keep lastActivityAt fresh whenever the cart is modified in a meaningful way
cartSchema.pre("save", function(next) {
  if (this.isModified("items") || this.isModified("isActive")) {
    this.lastActivityAt = new Date();
  }
  next();
});

const Cart = mongoose.model("Cart", cartSchema);
export default Cart;
