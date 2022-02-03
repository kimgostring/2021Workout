const { Schema, model, Types } = require("mongoose");

const playlistSchema = Schema(
  {
    user: { type: Types.ObjectId, required: true, ref: "user", index: true },
    title: { type: String, required: true, minlength: 1 },
    folder: { type: Types.ObjectId, ref: "folder" },
    bookmark: { type: Boolean, required: true, default: false },
    publicLevel: { type: Number, required: true, min: 1, max: 3, default: 1 }, // 1 - 감춰진 플리, 1 - 나만보기, 2 - id공개, 3 - 전체공개
    tags: [
      {
        type: String,
        maxlength: 10,
      },
    ],
    duration: { type: Number, required: true, default: 0 }, // 총 길이
    playInfo: {
      // video 기준으로 평균 내서 저장
      playedCount: { type: Number, default: 0 },
      successCount: { type: Number, default: 0 },
      avgStar: { type: Number, min: 0, max: 5 },
    },
    routines: [
      {
        youtubeId: String,
        videos: [
          {
            _id: { type: Types.ObjectId, required: true, ref: "video" },
            youtubeId: { type: String, required: true },
            title: { type: String, required: true },
            start: Number, // playlist에서 따로 지정한 경우
            end: Number,
            originDuration: { type: Number, required: true },
            duration: { type: Number, required: true },
            thumbnail: { type: String, required: true },
            repeatition: { type: Number, min: 1, default: 1 },
          },
        ],
      },
    ],
    successNotification: { type: String, minlength: 1, maxlength: 50 },
    failNotification: { type: String, minlength: 1, maxlength: 50 },
  },
  { timestamps: true }
);

playlistSchema.index({ title: "text" });

const Playlist = model("playlist", playlistSchema);
module.exports = { Playlist };
