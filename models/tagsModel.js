import mongoose from "mongoose";

const tagsSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    featured: {
      type: Boolean,
      default: false,
    },
    image: {
      type: String, // URL to the tag image/icon
      default: null,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    }
  }
);


const Tag = mongoose.model("Tag", tagsSchema);
export default Tag;