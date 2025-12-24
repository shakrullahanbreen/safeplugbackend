// models/Category.js
import mongoose from "mongoose";

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true
    },

    title: {
      type: String,
      required: true,
    },

    description: {
      type: String,
      default: "",
    },

    image: {
      type: String,
      default: "",
    },

    // slug: {
    //   type: String,
    //   required: true,
    //   unique: true,
    // },

    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      default: null,
    },

    level: {
      type: Number,
      required: true,
      default: 1,
    },

    // isActive: { // Commented out isActive field
    //   type: Boolean,
    //   default: true,
    // },

    isDeleted: {
      type: Boolean,
      default: false,
    },

    displayOrder: {
      type: Number,
      default: 1,
    },

    isRecentlyAdded: { // ✅ renamed from isNew
      type: Boolean,
      default: false,
    },

    hasChildren: {
      type: Boolean,
      default: false,
    },

    hasParts: {
      type: Boolean,
      default: false,
    },

    modelNumbers: [String],

    attributes: {
      screenSize: String,
      year: String,
      modelCode: String,
    },
  },
  { timestamps: true }
);

// ✅ Indexes for optimization
categorySchema.index({ parentId: 1, displayOrder: 1 });
categorySchema.index({ level: 1 }); // slug index removed since unique already applies
// categorySchema.index({ isDeleted: 1, isActive: 1 }); // Commented out isActive index
categorySchema.index({ isDeleted: 1 }); // Keep only isDeleted index
// Compound index to speed common queries
categorySchema.index({ isDeleted: 1, level: 1, parentId: 1, displayOrder: 1 });

// ✅ Optional slug generator (no slugify package)
// categorySchema.pre("validate", function (next) {
//   if (this.name && !this.slug) {
//     this.slug = this.name
//       .toLowerCase()
//       .trim()
//       .replace(/\s+/g, "-")      // Replace spaces with -
//       .replace(/[^\w\-]+/g, "")  // Remove all non-word characters
//       .replace(/\-\-+/g, "-")    // Replace multiple - with single -
//       .replace(/^-+/, "")        // Trim - from start
//       .replace(/-+$/, "");       // Trim - from end
//   }
//   next();
// });

const Category = mongoose.model("Category", categorySchema);
export default Category;
