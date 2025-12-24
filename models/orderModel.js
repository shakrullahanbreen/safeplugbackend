
import mongoose from "mongoose";

const cartItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true,
  },
  quantity: {
    type: Number,
    default: 1,
    min: 1,
  },
  price: {
    type: Number,
    required: true,
  },
  replaced: {
    type: Boolean,
    default: false,
  },
  refunded: {
    type: Boolean,
    default: false,
  }
});

const orderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    amount: {
      type: Number,
      required: false,
      default: 0
    },
    paymentMethod: {
      type: String,
      enum: ["Cash on Delivery", "Card", "Wallet"],
      default: "Card",
    },
    paymentMethodId:{
      type: String,
      default: null,
    },
      paymentIntentId:{
      type: String,
      default: null,
    },
    cart:{
      type: mongoose.Schema.Types.ObjectId,
      ref: "Cart",
      required: true,
    },
    items: [cartItemSchema],
    status:{
      type:String,
      enum:["Pending", "Processing","Delivered", "Cancelled"],
      default: "Pending"
    },
    paid:{
      type:String,
      enum:["Paid","Unpaid","Rejected","None"],
      default:"None"
    },
       deliveredAt:{
      type: Date,
      default: null,
    },
    approvedAt:{
      type: Date,
      default: null,
    },
    isDelivered:{
      type:Boolean,
      default:false,
    },
    shippingAddress: {
      type: Object,
      required: true,
    },
    trackingId: {
      type: String,
      required: false,
      default: null,
    },
    shippingFee: {
      type: Number,
      required: false,
      default: 0,
    },
    shippingMethod: {
      type: String,
      // enum: ["Standard", "Express"],
      default: "",
    },
    discount: {
      type: Number,
      default: 0,
    },
    billingAddress: {
      type: Object,
      required: true,
    },
    refunded:{
      type:Boolean,
      default:false,
    },
      trackingId: {
      type: String,
      default: null  // or empty string "" if you prefer
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    }
  },
  { timestamps: true }
);

const Order = mongoose.model("Order", orderSchema);
export default Order;
