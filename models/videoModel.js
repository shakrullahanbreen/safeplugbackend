import mongoose from "mongoose";

const videoSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    url: {
      type: String,
      required: true,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
          order: {
            type: Number,
            default: 1,
          },
    thumbnail: {
      type: String,
      default: "",
    },
    views: {
      type: Number,
      default: 0,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

// Index for better query performance
videoSchema.index({ isActive: 1, order: 1 });
videoSchema.index({ createdBy: 1 });

// Virtual for YouTube video ID
videoSchema.virtual("videoId").get(function () {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = this.url.match(regExp);
  return match && match[2].length === 11 ? match[2] : null;
});

// Virtual for YouTube thumbnail
videoSchema.virtual("thumbnailUrl").get(function () {
  const videoId = this.videoId;
  return videoId ? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg` : null;
});

// Pre-save middleware to set thumbnail if not provided
videoSchema.pre("save", function (next) {
  if (!this.thumbnail && this.videoId) {
    this.thumbnail = `https://img.youtube.com/vi/${this.videoId}/mqdefault.jpg`;
  }
  next();
});

const Video = mongoose.model("Video", videoSchema);

export default Video;
