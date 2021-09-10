const { Schema, model, Types } = require("mongoose");

const videoSchema = new Schema(
  {
    folder: {
      _id: { type: Types.ObjectId, required: true, ref: "folder", index: true },
      name: { type: String, required: true },
      sharingLevel: {
        type: Number,
        required: true,
        min: 1,
        max: 3,
        default: 1,
      },
    },
    user: { type: Types.ObjectId, required: true, ref: "user", index: true },
    title: { type: String, required: true, index: true, minlength: 1 },
    youtubeId: { type: String, required: true },
    isBookmarked: { type: Boolean, required: true, default: false },
    sharedCount: { type: Number, default: 0 },
    tags: [
      {
        type: String,
        maxlength: 10,
      },
    ],
    start: Number,
    end: Number,
    originDuration: { type: String, required: true },
    duration: { type: String, required: true },
    playInfo: {
      failCount: { type: Number, default: 0 },
      successCount: { type: Number, default: 0 },
      avgStar: { type: Number, min: 0, max: 5 },
      avgPlaytime: String,
    },
    thumbnail: { type: String, required: true },
  },
  { timestamps: true }
);

videoSchema.index({ title: "text" });

const Video = model("video", videoSchema);
module.exports = { Video };
