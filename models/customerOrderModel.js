
import mongoose from "mongoose";

const ItemSchema = new mongoose.Schema({
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
  refunded: {
    type: Boolean,
    default: false,
  }
});

const customerOrderSchema = new mongoose.Schema(
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
    orderId:{
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
    },
    items: [ItemSchema],
     paymentMethod: {
      type: String,
      enum: ["Cash on Delivery", "Card", "Wallet"],
      default: "Card",
    },
    paymentMethodId:{
      type: String,
      default: null,
    },
    // status:{
    //   type:String,
    //   enum:["Pending", "Accepted", "Rejected"],
    //   default: "Pending"
    // },
    // paid:{
    //   type:String,
    //   enum:["Paid","Unpaid","Rejected","None"],
    //   default:"None"
    // },
    //    deliveredAt:{
    //   type: Date,
    //   default: null,
    // },
    // isDelivered:{
    //   type:Boolean,
    //   default:false,
    // },
    shippingAddress: {
      type: Object,
      required: true,
    },
    shippingFee: {
      type: Number,
      required: true,
      default: 0,
    },
    discount: {
      type: Number,
      default: 0,
    },
    billingAddress: {
      type: Object,
      required: true,
    },
    // refunded:{
    //   type:Boolean,
    //   default:false,
    // },
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

const CustomerOrder = mongoose.model("Customers Order", customerOrderSchema);
export default CustomerOrder;