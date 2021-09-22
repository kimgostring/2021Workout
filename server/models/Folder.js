const { Schema, model, Types } = require("mongoose");

const folderSchema = new Schema(
  {
    user: { type: Types.ObjectId, required: true, ref: "user", index: true },
    name: { type: String, required: true, minlength: 1 },
    youtubeId: { type: String },
    isDefault: { type: Boolean, required: true, default: false },
    isBookmarked: { type: Boolean, required: true, default: false },
    publicLevel: { type: Number, required: true, min: 0, max: 3, default: 1 }, // 0 - 감춰진 폴더, 1 - 나만보기, 2 - id공개, 3 - 전체공개
    sharedCount: { type: Number, default: 0 },
    tags: [
      {
        type: String,
        maxlength: 10,
      },
    ],
    playInfo: {
      failCount: { type: Number, default: 0 },
      successCount: { type: Number, default: 0 },
      avgStar: { type: Number, min: 0, max: 5 },
      avgPlaytime: String,
    },
    videos: [
      {
        _id: { type: Types.ObjectId, required: true, ref: "video" },
        title: { type: String, required: true },
        duration: { type: Number, required: true },
        thumbnail: { type: String, required: true },
        isBookmarked: { type: Boolean, required: true, default: false },
      },
    ],
  },
  { timestamps: true }
);

folderSchema.index({ name: "text" });

const Folder = model("folder", folderSchema);
module.exports = { Folder };
