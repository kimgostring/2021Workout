const { Schema, model, Types } = require("mongoose");

const videoSchema = new Schema(
  {
    folder: {
      _id: { type: Types.ObjectId, required: true, ref: "folder", index: true },
      title: { type: String, required: true },
      publicLevel: {
        type: Number,
        required: true,
        min: 0,
        max: 3,
      },
    },
    user: { type: Types.ObjectId, required: true, ref: "user", index: true },
    title: { type: String, required: true, index: true, minlength: 1 },
    youtubeId: { type: String, required: true },
    bookmark: { type: Boolean, required: true, default: false },
    tags: [
      {
        type: String,
        maxlength: 10,
      },
    ],
    start: Number,
    end: Number,
    originDuration: { type: Number, required: true },
    duration: { type: Number, required: true },
    playInfo: {
      playedCount: { type: Number, default: 0 },
      successCount: { type: Number, default: 0 },
      avgStar: { type: Number, min: 0, max: 5 },
    },
    thumbnail: { type: String, required: true },
  },
  { timestamps: true }
);

videoSchema.index({ title: "text" });

const Video = model("video", videoSchema);
module.exports = { Video };
