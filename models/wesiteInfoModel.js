import mongoose from "mongoose";
const wesiteInfoSchema = new mongoose.Schema({
    content: {
        type: Object,
        required: false,
   },
   status: {
        type: String,
        enum: ["Active", "Inactive"],
        default: "Active"
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});
const WebsiteInfo = mongoose.model("Webisite Info", wesiteInfoSchema);
export default WebsiteInfo;
