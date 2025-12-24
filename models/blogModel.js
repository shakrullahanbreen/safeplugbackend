import mongoose from "mongoose";

const blogSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    content: {
      type: String,
      required: true,
    },
    excerpt: {
      type: String,
      required: false,
      maxlength: 300,
    },
    featuredImage: {
      type: String,
      required: false, // Optional as per requirements
    },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    status: {
      type: String,
      enum: ['draft', 'published', 'archived'],
      default: 'draft',
    },
    publishedAt: {
      type: Date,
      required: false,
    },
    tags: [{
      type: String,
      trim: true,
    }],
    categories: [{
      type: String,
      required: false,
      trim: true,
    }],
    metaTitle: {
      type: String,
      required: false,
      maxlength: 120, // Increased from 60 to 120 for better SEO
    },
    metaDescription: {
      type: String,
      required: false,
      maxlength: 300, // Increased from 160 to 300 for better SEO
    },
    viewCount: {
      type: Number,
      default: 0,
    },
    isFeatured: {
      type: Boolean,
      default: false,
    },
    displayOrder: {
      type: Number,
      default: 0,
    },
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Index for better performance
// slug already has a unique index via field definition; avoid duplicate schema.index
blogSchema.index({ status: 1, publishedAt: -1 });
blogSchema.index({ author: 1 });
blogSchema.index({ categories: 1 });
blogSchema.index({ tags: 1 });

// Virtual for reading time estimation
blogSchema.virtual('readingTime').get(function() {
  if (!this.content || typeof this.content !== 'string') return 0;
  const wordsPerMinute = 200;
  const wordCount = this.content.split(/\s+/).length;
  return Math.ceil(wordCount / wordsPerMinute);
});

// Pre-save middleware to generate slug from title
blogSchema.pre('save', function(next) {
  // Generate slug if title is modified or slug doesn't exist
  if (this.isModified('title') || !this.slug) {
    this.slug = this.title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim('-');
  }
  
  // Set publishedAt when status changes to published
  if (this.isModified('status') && this.status === 'published' && !this.publishedAt) {
    this.publishedAt = new Date();
  }
  
  next();
});

const Blog = mongoose.model("Blog", blogSchema);
export default Blog;
