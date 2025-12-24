import mongoose from "mongoose";

const notifyRequestSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true
    },
    notified: {
      type: Boolean,
      default: false,
      index: true
    }
  },
  { timestamps: true }
);

notifyRequestSchema.index({ product: 1, email: 1 }, { unique: true });

const NotifyRequest = mongoose.model("NotifyRequest", notifyRequestSchema);
export default NotifyRequest;


