import mongoose from "mongoose";

const orderItems = new mongoose.Schema({
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
    requestType: {
      type: String,
      enum: ["refund", "replacement"],
      required: true,
    },
  price: {
    type: Number,
    required: true,
  },
  status: {
    type: String,
    enum: ["Pending", "Approved", "Rejected", "Processing", "Completed"],
    default: "Pending",
  },
  processedAt: {
    type: Date,
    default: null,
  },
  reason: {
    type: String,
    trim: true,
  },
  adminNotes: {
    type: String,
    trim: true,
  }
});

const requestSchema = new mongoose.Schema(
  {
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  
    items: [orderItems],
    status: {
      type: String,
      enum: ["Pending", "Processing", "Partially_Completed", "Completed", "Rejected"],
      default: "Pending",
    },
    customerReason: {
      type: String,
      trim: true,
    },
    adminNotes: {
      type: String,
      trim: true,
    },
    priority: {
      type: String,
      enum: ["Low", "Medium", "High"],
      default: "Medium",
    },
    completedAt: {
      type: Date,
      default: null,
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
  { 
    timestamps: true,
    // Add indexes for better query performance
    indexes: [
      { order: 1, requestType: 1 },
      { user: 1, requestType: 1 },
      { overallStatus: 1 },
      { createdAt: -1 }
    ]
  }
);

// Virtual to get total amount for the request
requestSchema.virtual('totalAmount').get(function() {
  return this.items.reduce((total, item) => total + (item.price * item.quantity), 0);
});

// Virtual to get item count
requestSchema.virtual('itemCount').get(function() {
  return this.items.length;
});

// Pre-save middleware to update overallStatus based on item statuses
requestSchema.pre('save', function(next) {
  if (this.items && this.items.length > 0) {
    const statuses = this.items.map(item => item.status);
    const uniqueStatuses = [...new Set(statuses)];
    
    if (uniqueStatuses.includes('Pending')) {
      this.overallStatus = 'Pending';
    } else if (uniqueStatuses.includes('Processing')) {
      this.overallStatus = 'Processing';
    } else if (uniqueStatuses.every(status => ['Completed', 'Rejected'].includes(status))) {
      if (uniqueStatuses.includes('Completed')) {
        this.overallStatus = uniqueStatuses.includes('Rejected') ? 'Partially_Completed' : 'Completed';
        if (this.overallStatus === 'Completed') {
          this.completedAt = new Date();
        }
      } else {
        this.overallStatus = 'Rejected';
      }
    } else {
      this.overallStatus = 'Partially_Completed';
    }
  }
  
  this.updatedAt = new Date();
  next();
});

// Static method to get requests by type
requestSchema.statics.getByType = function(requestType, filters = {}) {
  return this.find({ requestType, ...filters });
};

// Static method to get user requests
requestSchema.statics.getUserRequests = function(userId, requestType = null) {
  const query = { user: userId };
  if (requestType) {
    query.requestType = requestType;
  }
  return this.find(query);
};

// Instance method to add item to request
requestSchema.methods.addItem = function(itemData) {
  this.items.push(itemData);
  return this.save();
};

// Instance method to update item status
requestSchema.methods.updateItemStatus = function(itemId, status, adminNotes = null) {
  const item = this.items.id(itemId);
  if (item) {
    item.status = status;
    if (adminNotes) {
      item.adminNotes = adminNotes;
    }
    if (['Completed', 'Rejected'].includes(status)) {
      item.processedAt = new Date();
    }
    return this.save();
  }
  throw new Error('Item not found');
};

const Request = mongoose.model("Request", requestSchema);
export default Request;