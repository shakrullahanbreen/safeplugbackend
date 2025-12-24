import Video from "../models/videoModel.js";
import {
  HTTP_STATUS_200,
  HTTP_STATUS_201,
  HTTP_STATUS_400,
  HTTP_STATUS_404,
  HTTP_STATUS_500,
} from "../utils/constants.js";
import {
  sendResponse,
  validateObjectIdOrThrow,
} from "../utils/helper.js";

// Get all videos (admin)
export const getAllVideos = async (req, res) => {
  try {
    const {
      search,
      page = 1,
      limit = 10,
      sortBy = "order",
      sortOrder = "asc",
      category,
      isActive,
    } = req.query;

    // Build query
    const query = {};
    
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
      ];
    }
    
    if (isActive !== undefined) {
      query.isActive = isActive === "true";
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === "desc" ? -1 : 1;

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Execute query
    const videos = await Video.find(query)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .populate("createdBy", "name email")
      .populate("updatedBy", "name email");

    const total = await Video.countDocuments(query);

    const response = {
      videos,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalItems: total,
        itemsPerPage: parseInt(limit),
      },
    };

    sendResponse(res, HTTP_STATUS_200, "Videos fetched successfully", response);
  } catch (error) {
    console.error("Error fetching videos:", error);
    sendResponse(res, HTTP_STATUS_500, {
      success: false,
      message: "Error fetching videos",
      error: error.message,
    });
  }
};

// Get video by ID
export const getVideoById = async (req, res) => {
  try {
    const { id } = req.params;
    validateObjectIdOrThrow(id);

    const video = await Video.findById(id)
      .populate("createdBy", "name email")
      .populate("updatedBy", "name email");

    if (!video) {
      return sendResponse(res, HTTP_STATUS_404, {
        success: false,
        message: "Video not found",
      });
    }

    sendResponse(res, HTTP_STATUS_200, "Video fetched successfully", video);
  } catch (error) {
    console.error("Error fetching video:", error);
    sendResponse(res, HTTP_STATUS_500, {
      success: false,
      message: "Error fetching video",
      error: error.message,
    });
  }
};

// Create new video
export const createVideo = async (req, res) => {
  try {
    const { title, url, isActive, order } = req.body;
    const userId = req.user.userId;

    // Validate required fields
    if (!title || !url) {
      return sendResponse(res, HTTP_STATUS_400, {
        success: false,
        message: "Title and URL are required",
      });
    }

    // Validate YouTube URL
    const youtubeRegex = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    if (!youtubeRegex.test(url)) {
      return sendResponse(res, HTTP_STATUS_400, {
        success: false,
        message: "Please provide a valid YouTube URL",
      });
    }

    // Get next order if not provided
    let videoOrder = order;
    if (!videoOrder) {
      const maxOrder = await Video.findOne({}, { order: 1 }).sort({ order: -1 });
      videoOrder = maxOrder ? maxOrder.order + 1 : 1;
    }

    // If order is provided, shift existing videos with same or higher order
    if (order) {
      await Video.updateMany(
        { order: { $gte: videoOrder } },
        { $inc: { order: 1 } }
      );
    }

    const videoData = {
      title,
      url,
      isActive: isActive !== undefined ? isActive : true,
      order: videoOrder,
      createdBy: userId,
    };

    const video = new Video(videoData);
    await video.save();

    // Populate the created video
    await video.populate("createdBy", "name email");

    sendResponse(res, HTTP_STATUS_201, {
      success: true,
      message: "Video created successfully",
      data: video,
    });
  } catch (error) {
    console.error("Error creating video:", error);
    sendResponse(res, HTTP_STATUS_500, {
      success: false,
      message: "Error creating video",
      error: error.message,
    });
  }
};

// Update video
export const updateVideo = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    validateObjectIdOrThrow(id);

    const { title, url, isActive, order } = req.body;

    const video = await Video.findById(id);
    if (!video) {
      return sendResponse(res, HTTP_STATUS_404, {
        success: false,
        message: "Video not found",
      });
    }

    // Validate YouTube URL if provided
    if (url) {
      const youtubeRegex = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
      if (!youtubeRegex.test(url)) {
        return sendResponse(res, HTTP_STATUS_400, {
          success: false,
          message: "Please provide a valid YouTube URL",
        });
      }
    }

    // Handle order changes
    if (order !== undefined && order !== video.order) {
      const oldOrder = video.order;
      const newOrder = order;
      
      if (newOrder > oldOrder) {
        // Moving down: shift videos between old and new position up
        await Video.updateMany(
          { 
            _id: { $ne: id },
            order: { $gt: oldOrder, $lte: newOrder }
          },
          { $inc: { order: -1 } }
        );
      } else {
        // Moving up: shift videos between new and old position down
        await Video.updateMany(
          { 
            _id: { $ne: id },
            order: { $gte: newOrder, $lt: oldOrder }
          },
          { $inc: { order: 1 } }
        );
      }
    }

    // Update fields
    const updateData = {
      updatedBy: userId,
    };

    if (title) updateData.title = title;
    if (url) updateData.url = url;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (order !== undefined) updateData.order = order;

    const updatedVideo = await Video.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    ).populate("createdBy", "name email").populate("updatedBy", "name email");

    sendResponse(res, HTTP_STATUS_200, {
      success: true,
      message: "Video updated successfully",
      data: updatedVideo,
    });
  } catch (error) {
    console.error("Error updating video:", error);
    sendResponse(res, HTTP_STATUS_500, {
      success: false,
      message: "Error updating video",
      error: error.message,
    });
  }
};

// Delete video
export const deleteVideo = async (req, res) => {
  try {
    const { id } = req.params;
    validateObjectIdOrThrow(id);

    const video = await Video.findById(id);
    if (!video) {
      return sendResponse(res, HTTP_STATUS_404, {
        success: false,
        message: "Video not found",
      });
    }

    // Check if this is a published video and we would have less than 2 published videos
    if (video.isActive) {
      const publishedCount = await Video.countDocuments({ isActive: true });
      if (publishedCount <= 2) {
        return sendResponse(res, HTTP_STATUS_400, {
          success: false,
          message: "Cannot delete video. At least 2 videos must be published at all times.",
        });
      }
    }

    const deletedOrder = video.order;
    
    await Video.findByIdAndDelete(id);

    // Reorder remaining videos to fill the gap
    await Video.updateMany(
      { order: { $gt: deletedOrder } },
      { $inc: { order: -1 } }
    );

    sendResponse(res, HTTP_STATUS_200, {
      success: true,
      message: "Video deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting video:", error);
    sendResponse(res, HTTP_STATUS_500, {
      success: false,
      message: "Error deleting video",
      error: error.message,
    });
  }
};

// Update video order
export const updateVideoOrder = async (req, res) => {
  try {
    const { videoIds } = req.body;

    if (!Array.isArray(videoIds)) {
      return sendResponse(res, HTTP_STATUS_400, {
        success: false,
        message: "videoIds must be an array",
      });
    }

    // Update order for each video
    const updatePromises = videoIds.map((videoId, index) => {
      return Video.findByIdAndUpdate(
        videoId,
        { order: index + 1 },
        { new: true }
      );
    });

    await Promise.all(updatePromises);

    sendResponse(res, HTTP_STATUS_200, {
      success: true,
      message: "Video order updated successfully",
    });
  } catch (error) {
    console.error("Error updating video order:", error);
    sendResponse(res, HTTP_STATUS_500, {
      success: false,
      message: "Error updating video order",
      error: error.message,
    });
  }
};

// Toggle video status
export const toggleVideoStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;
    const userId = req.user.userId;
    validateObjectIdOrThrow(id);

    const video = await Video.findById(id);
    if (!video) {
      return sendResponse(res, HTTP_STATUS_404, {
        success: false,
        message: "Video not found",
      });
    }

    // If trying to unpublish, check if we would have less than 2 published videos
    if (!isActive) {
      const publishedCount = await Video.countDocuments({ isActive: true });
      if (publishedCount <= 2) {
        return sendResponse(res, HTTP_STATUS_400, {
          success: false,
          message: "Cannot unpublish video. At least 2 videos must be published at all times.",
        });
      }
    }

    const updatedVideo = await Video.findByIdAndUpdate(
      id,
      { isActive, updatedBy: userId },
      { new: true, runValidators: true }
    ).populate("createdBy", "name email").populate("updatedBy", "name email");

    sendResponse(res, HTTP_STATUS_200, {
      success: true,
      message: `Video ${isActive ? "published" : "unpublished"} successfully`,
      data: updatedVideo,
    });
  } catch (error) {
    console.error("Error toggling video status:", error);
    sendResponse(res, HTTP_STATUS_500, {
      success: false,
      message: "Error toggling video status",
      error: error.message,
    });
  }
};

// Get public videos (for homepage)
export const getPublicVideos = async (req, res) => {
  try {
    const { limit = 2, category } = req.query;

    const query = { isActive: true };
    

    const videos = await Video.find(query)
      .sort({ order: 1 })
      .limit(parseInt(limit))
      .select("title url thumbnail views order");

    sendResponse(res, HTTP_STATUS_200, "Public videos fetched successfully", videos);
  } catch (error) {
    console.error("Error fetching public videos:", error);
    sendResponse(res, HTTP_STATUS_500, {
      success: false,
      message: "Error fetching public videos",
      error: error.message,
    });
  }
};

// Increment video views
export const incrementVideoViews = async (req, res) => {
  try {
    const { id } = req.params;
    validateObjectIdOrThrow(id);

    await Video.findByIdAndUpdate(id, { $inc: { views: 1 } });

    sendResponse(res, HTTP_STATUS_200, {
      success: true,
      message: "Video views incremented",
    });
  } catch (error) {
    console.error("Error incrementing video views:", error);
    sendResponse(res, HTTP_STATUS_500, {
      success: false,
      message: "Error incrementing video views",
      error: error.message,
    });
  }
};
