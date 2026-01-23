import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },

    productId: {
      type: String,
      required: true,
      unique: true,
    },

    description: {
      type: String,
      default: "",
    },
    price: {
      type: Number,
      required: true,
    },
    costPrice: {
      type: Number,
      required: true,
    },

    createdAt: {
      type: Date,
      default: Date.now
    },
    pricing: {
      Retailer: {
        price: {
          type: Number,
          required: true
        }
      },
      Wholesale: {
        price: {
          type: Number,
          required: true
        }
      },

      ChainStore: {
        price: {
          type: Number,
          required: true
        }
      },
      Franchise: {
        price: {
          type: Number,
          required: true
        }
      }

    },

    images: {
      // type: [
      //   {
      //     preview: {
      //       type: String,
      //       required: false,
      //       trim: true,
      //     },
      //     name: {
      //       type: String,
      //       default: "",
      //       trim: false,
      //     }
      //   }
      // ],
      // validate: {
      //   validator: function (value) {
      //     return Array.isArray(value) && value.length > 0;
      //   },
      //   message: "At least one image is required.",
      // },
      // required: false,
      type: [Object],
      default: [],
    },

    discountImage: {
      type: {
        name: {
          type: String,
          default: "",
        },
        preview: {
          type: String,
          default: "",
        }
      },
      default: null,
    },


    published: {
      type: Boolean,
      default: false,
    },

    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },

    subCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      default: null,
      required: false,
    },

    brand: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Brand",
      default: null,
      required: false,
    },

    stock: {
      type: Number,
      default: 0,
    },

    sku: {
      type: String,
      default: "",
      trim: true,
    },
    bin: {
      type: String,
      default: "",
      trim: true,
    },
    models: {
      type: [String],
      default: [],
      required: false
    },

    tags: [{
      type: String,
      trim: true,
    }],


    // slug: {
    //   type: String,
    //   unique: true,
    // },

    attributes: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    variations: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
    }],

    isVariation: {
      type: Boolean,
      default: false,
    },

    // parentId: {
    //   type: mongoose.Schema.Types.ObjectId,
    //   ref: "Product",
    //   default: null,
    // },


    mostPopular: {
      type: Boolean,
      default: false
    },
    mostSold: {
      type: Boolean,
      default: false
    },
    featured: {
      type: Boolean,
      default: false
    },
    isNew: {
      type: Boolean,
      default: false,
    },

    metaTitle: {
      type: String,
      default: "",
    },

    metaDescription: {
      type: String,
      default: "",
    },

    displayOrder: {
      type: Number,
      default: 1,
    },
  },
  { timestamps: true, suppressReservedKeysWarning: true }
);

// Indexes for optimization
productSchema.index({ category: 1 });
productSchema.index({ subCategory: 1 });
productSchema.index({ brand: 1 });
productSchema.index({ price: 1 });
productSchema.index({ published: 1 });
productSchema.index({ featured: 1 });
productSchema.index({ mostPopular: 1 });
productSchema.index({ mostSold: 1 });
productSchema.index({ displayOrder: 1 });

// Compound indexes optimized for special products queries
// These match the exact query pattern: published + mostSold/mostPopular/featured + isDeleted + category exclusion
productSchema.index({ 
  published: 1, 
  mostSold: 1, 
  isDeleted: 1,
  category: 1 
});
productSchema.index({ 
  published: 1, 
  mostPopular: 1, 
  isDeleted: 1,
  category: 1 
});
productSchema.index({ 
  published: 1, 
  featured: 1, 
  isDeleted: 1,
  category: 1 
});
productSchema.index({ 
  published: 1, 
  mostSold: 1, 
  isDeleted: 1,
  subCategory: 1 
});
productSchema.index({ 
  published: 1, 
  mostPopular: 1, 
  isDeleted: 1,
  subCategory: 1 
});
productSchema.index({ 
  published: 1, 
  featured: 1, 
  isDeleted: 1,
  subCategory: 1 
});

// Note: compound displayOrder indexes are defined below with uniqueness/partials

// Sparse unique compound indexes to ensure display order uniqueness within categories
productSchema.index(
  { category: 1, displayOrder: 1 }, 
  { 
    unique: true, 
    sparse: true,
    partialFilterExpression: { 
      published: true, 
      isDeleted: { $ne: true },
      subCategory: null 
    }
  }
);

productSchema.index(
  { subCategory: 1, displayOrder: 1 }, 
  { 
    unique: true, 
    sparse: true,
    partialFilterExpression: { 
      published: true, 
      isDeleted: { $ne: true },
      subCategory: { $ne: null }
    }
  }
);

productSchema.index({ tags: 1 });

// Critical compound indexes for category-based product queries
// These optimize the most common query pattern: published + isDeleted + category/subCategory + displayOrder
productSchema.index({ 
  published: 1, 
  isDeleted: 1, 
  category: 1, 
  displayOrder: 1 
});
productSchema.index({ 
  published: 1, 
  isDeleted: 1, 
  subCategory: 1, 
  displayOrder: 1 
});

// Compound indexes for $in queries with category arrays
productSchema.index({ 
  category: 1, 
  published: 1, 
  isDeleted: 1 
});
productSchema.index({ 
  subCategory: 1, 
  published: 1, 
  isDeleted: 1 
});

// Enforce unique SKU across products (ignore empty strings/null)
productSchema.index(
  { sku: 1 },
  {
    unique: true,
    partialFilterExpression: { sku: { $type: "string", $ne: "" } }
  }
);

// Normalize SKU before save
productSchema.pre("save", function(next) {
  if (this.isModified("sku") && typeof this.sku === "string") {
    this.sku = this.sku.trim();
  }
  next();
});

// Helper function to calculate price based on percentage
// function calculatePriceFromPercentage(basePrice, percentage) {
//   return Math.round((basePrice * (1 + percentage / 100)) * 100) / 100;
// }

// // Generate slug and calculate prices based on percentages
// productSchema.pre("validate", function (next) {
//   // Generate slug from name
//   // if (this.name && !this.slug) {
//   //   this.slug = this.name
//   //     .toLowerCase()
//   //     .trim()
//   //     .replace(/\s+/g, "-")      // Replace spaces with -
//   //     .replace(/[^\w\-]+/g, "")  // Remove all non-word characters
//   //     .replace(/\-\-+/g, "-")    // Replace multiple - with single -
//   //     .replace(/^-+/, "")        // Trim - from start
//   //     .replace(/-+$/, "");       // Trim - from end
//   // }

//   // Calculate prices based on basePrice and percentages
//   if (this.basePrice && this.pricing) {
//     // Calculate regular price
//     if (this.pricing.regular) {
//       this.pricing.regular.price = calculatePriceFromPercentage(
//         this.basePrice, 
//         this.pricing.regular.percentage || 0
//       );
//       this.price = this.pricing.regular.price; // Set main price
//     }

//     // Calculate reseller price
//     if (this.pricing.reseller && this.pricing.reseller.percentage !== undefined) {
//       this.pricing.reseller.price = calculatePriceFromPercentage(
//         this.basePrice, 
//         this.pricing.reseller.percentage
//       );
//     }

//     // Calculate wholesale price
//     if (this.pricing.wholesale && this.pricing.wholesale.percentage !== undefined) {
//       this.pricing.wholesale.price = calculatePriceFromPercentage(
//         this.basePrice, 
//         this.pricing.wholesale.percentage
//       );
//     }

//     // Calculate retail price
//     if (this.pricing.retail && this.pricing.retail.percentage !== undefined) {
//       this.pricing.retail.price = calculatePriceFromPercentage(
//         this.basePrice, 
//         this.pricing.retail.percentage
//       );
//     }

//     // Calculate online reseller price
//     if (this.pricing.onlineReseller && this.pricing.onlineReseller.percentage !== undefined) {
//       this.pricing.onlineReseller.price = calculatePriceFromPercentage(
//         this.basePrice, 
//         this.pricing.onlineReseller.percentage
//       );
//     }
//   }

//   next();
// });

// // Instance method to recalculate all prices
// productSchema.methods.recalculatePrices = function() {
//   if (this.basePrice && this.pricing) {
//     // Recalculate all tier prices
//     Object.keys(this.pricing).forEach(tier => {
//       if (this.pricing[tier] && this.pricing[tier].percentage !== undefined) {
//         this.pricing[tier].price = calculatePriceFromPercentage(
//           this.basePrice, 
//           this.pricing[tier].percentage
//         );
//       }
//     });

//     // Update main price with regular price
//     if (this.pricing.regular) {
//       this.price = this.pricing.regular.price;
//     }
//   }
// };

const Product = mongoose.model("Product", productSchema);
export default Product;