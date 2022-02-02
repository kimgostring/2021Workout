const { Router } = require("express");
const { isValidObjectId } = require("mongoose");
const { Video, Folder, User } = require("../../models");
const {
  mkVideoFromYoutubeVideoId,
  mkVideosFromYoutubePlaylistId,
  mkVideoFromVideoId,
  checkExistedVideo,
  checkExistedVideos,
  checkVideoValidation,
  mkPromisesThatSaveVideo,
  mkPromisesThatSaveVideos,
} = require("../../middlewares");

const videoRouter = Router({ mergeParams: true }); // folderRouter.js에서 설정한 /:folderId 이용 가능

// folder 안의 모든 video 읽기
videoRouter.get("/", async (req, res) => {
  try {
    let { keyword, sort = "ascTitle", strict = "false" } = req.query;
    const { folderId } = req.params;

    if (!isValidObjectId(folderId))
      return res.status(400).send({ err: "invaild folder id. " });

    if (keyword && isValidObjectId(keyword))
      // keyword로 id 넘어온 경우
      keyword = { _id: keyword };
    // id가 아닌 경우, 키워드 검색
    else if (keyword && strict === "true")
      // strict 옵션 있을 경우, 입력된 문장과 띄어쓰기까지 완전히 일치하는 것 골라옴
      keyword = { $text: { $search: `"${keyword}"` } };
    else if (keyword) keyword = { $text: { $search: keyword } };
    else keyword = {}; // 기본 검색

    if (sort)
      switch (sort) {
        case "ascTitle": // 오름차순
          sort = { title: 1 };
          break;
        case "desTitle": // 내림차순
          sort = { title: -1 };
          break;
        case "desPlayed": // 플레이많은순
          sort = { "playInfo.playedCount": -1 };
          break;
        case "desSuccess":
          sort = { "playInfo.successCount": -1 };
          break;
        case "ascDuration": // 영상짧은순
          sort = { duration: 1 };
          break;
        case "desDuration":
          sort = { duration: -1 };
          break;
        case "latest": // 최신순
          sort = { createdAt: -1 };
          break;
        case "oldest":
          sort = { createdAt: 1 };
          break;
        default:
          return res.status(400).send({ err: "invalid sort. " });
      }
    else sort = { title: 1 }; // 기본 정렬

    const [videos, folder] = await Promise.all([
      Video.find({
        "folder._id": folderId,
        ...keyword,
      }).sort(sort),
      Folder.findOne({ _id: folderId }),
    ]);

    if (!folder)
      return res.status(404).send({ err: "folder does not exist. " });

    res.send({ success: true, videos });
  } catch (err) {
    return res.status(400).send({ err: err.message });
  }
});

// folder에 video 추가
videoRouter.post(
  "/",
  async (req, res, next) => {
    try {
      const { folderId } = req.params;
      const {
        userId,
        youtubeVideoId,
        youtubePlaylistId,
        willChangeYoutubePlaylistId = false,
      } = req.body;

      // Id 형식 확인
      if (!isValidObjectId(folderId))
        return res.status(400).send({ err: "invalid folder id. " });
      if (!userId || !isValidObjectId(userId))
        return res.status(400).send({ err: "invalid user id. " });

      const [folder, user] = await Promise.all([
        Folder.findOne({ _id: folderId }),
        User.findOne({ _id: userId }),
      ]);

      if (!folder)
        return res.status(404).send({ err: "folder does not exist. " });
      if (!user) return res.status(404).send({ err: "user does not exist. " });
      if (folder.user.toString() !== userId)
        return res
          .status(403)
          .send({ err: "this user is not the owner of this folder. " });

      if (!youtubeVideoId && youtubePlaylistId && willChangeYoutubePlaylistId)
        folder.youtubeId = youtubePlaylistId;
      req.folder = folder;

      if (youtubeVideoId) next();
      else if (youtubePlaylistId) next("route");
      // 다음 라우트로 넘어감
      else
        return res.status(400).send({
          err: "youtubeVideoId or youtubePlaylistId must be required. ",
        });
    } catch (err) {
      return res.status(400).send({ err: err.message });
    }
  },
  mkVideoFromYoutubeVideoId,
  checkExistedVideo,
  checkVideoValidation,
  mkPromisesThatSaveVideo,
  async (req, res) => {
    try {
      const { promises, video, folder, resObj } = req;

      await promises;

      res.send({ success: true, video, folder, ...resObj });
    } catch (err) {
      return res.status(400).send({ err: err.message });
    }
  }
);

// youtubePlaylistId 입력한 경우
videoRouter.post(
  "/",
  mkVideosFromYoutubePlaylistId,
  checkExistedVideos,
  mkPromisesThatSaveVideos,
  async (req, res) => {
    try {
      const { promises, videos, folder, resObj } = req;

      await promises;

      res.send({ success: true, videos, folder, ...resObj });
    } catch (err) {
      return res.status(400).send({ err: err.message });
    }
  }
);

// 특정 id의 video 읽기
videoRouter.get("/:videoId", async (req, res) => {
  try {
    const { videoId, folderId } = req.params;
    const { userId } = req.body;

    if (!isValidObjectId(videoId))
      return res.status(400).send({ err: "invaild video id. " });
    if (!userId || !isValidObjectId(folderId))
      return res.status(400).send({ err: "invaild folder id. " });

    const video = await Video.findOne({ _id: videoId });
    if (!video) return res.status(404).send({ err: "video does not exist. " });

    if (video.folder._id.toString() !== folderId)
      return res
        .status(403)
        .send({ err: "this video is not in this folder. " });
    if (video.folder.publicLevel <= 1 && video.user.toString() !== userId)
      return res
        .status(403)
        .send({ err: "this video is disabled for reading. " });

    res.send({ success: true, video });
  } catch (err) {
    return res.status(400).send({ err: err.message });
  }
});

// video 정보 수정
videoRouter.patch(
  "/:videoId",
  async (req, res, next) => {
    try {
      const { videoId, folderId } = req.params;
      const { title, tags, start, end } = req.body;

      if (!isValidObjectId(videoId))
        return res.status(400).send({ err: "invalid video id. " });
      if (!isValidObjectId(folderId))
        return res.status(400).send({ err: "invalid folder id. " });

      const [video, folder] = await Promise.all([
        Video.findOne({ _id: videoId }),
        Folder.findOne({ _id: folderId }),
      ]);

      if (!video)
        return res.status(404).send({ err: "video does not exist. " });
      if (!folder)
        return res.status(404).send({ err: "folder does not exist. " });
      if (video.folder._id.toString() !== folderId)
        return res
          .status(403)
          .send({ err: "this video is not in this folder.  " });

      // 수정사항 없는 경우
      if (!title && !tags && start === undefined && end === undefined)
        return res
          .status(400)
          .send({ err: "at least one of information must be required. " });

      req.video = video;

      next();
    } catch (err) {
      return res.status(400).send({ err: err.message });
    }
  },
  checkVideoValidation,
  async (req, res) => {
    try {
      const { video } = req;
      const { videoId, folderId } = req.params;
      const { title } = req.body;

      let promises = Promise.all([video.save()]);
      if (title)
        // *** title 수정해야 할 경우, folder, playlist 등에 내장된 정보도 수정 필요
        promises = Promise.all([
          promises,
          Folder.updateOne(
            { _id: folderId, "videos._id": videoId },
            { "videos.$.title": title }
          ),
        ]);

      await promises;

      res.send({ success: true, video });
    } catch (err) {
      return res.status(400).send({ err: err.message });
    }
  }
);

// video 삭제
videoRouter.delete("/:videoId", async (req, res) => {
  try {
    const { videoId, folderId } = req.params;

    if (!isValidObjectId(videoId))
      return res.status(400).send({ err: "invaild video id. " });
    if (!isValidObjectId(folderId))
      return res.status(400).send({ err: "invaild folder id. " });

    // *** 삭제하려면 playlist 및 미래 day에 존재하면 안 됨
    const video = await Video.findOne({ _id: videoId });

    if (!video) return res.status(404).send({ err: "video does not exist. " });
    if (video.folder._id.toString() !== folderId)
      return res
        .status(403)
        .send({ err: "this video is not in this folder. " });

    const [folder] = await Promise.all([
      Folder.findOneAndUpdate(
        { _id: folderId },
        { $pull: { videos: { _id: videoId } } },
        { new: true }
      ),
      video.deleteOne(),
    ]);

    res.send({ success: true, video, folder });
  } catch (err) {
    return res.status(400).send({ err: err.message });
  }
});

// video 폴더 이동, controller resource
videoRouter.post("/:videoId/move", async (req, res) => {
  try {
    const { videoId, folderId: originFolderId } = req.params;
    const { newFolderId } = req.body;

    if (!isValidObjectId(videoId))
      return res.status(400).send({ err: "invalid video id. " });
    if (!isValidObjectId(originFolderId))
      return res.status(400).send({ err: "invalid origin folder id. " });
    if (!newFolderId || !isValidObjectId(newFolderId))
      return res.status(400).send({ err: "invalid new folder id. " });

    let [video, newFolder] = await Promise.all([
      Video.findOne({ _id: videoId }),
      Folder.findOne({ _id: newFolderId }),
    ]);
    let originFolder;

    if (!video) return res.status(404).send({ err: "video does not exist. " });
    if (!newFolder)
      return res.status(404).send({ err: "new folder does not exist. " });
    if (video.folder._id.toString() !== originFolderId)
      return res
        .status(403)
        .send({ err: "this video is not in origin folder.  " });
    if (newFolderId === originFolderId)
      return res
        .status(403)
        .send({ err: "this video is already in this folder. " });

    video.folder = newFolder;

    [newFolder, originFolder] = await Promise.all([
      Folder.findOneAndUpdate(
        { _id: newFolderId },
        { $push: { videos: video } },
        { new: true }
      ),
      Folder.findOneAndUpdate(
        { _id: originFolderId },
        { $pull: { videos: { _id: videoId } } },
        { new: true }
      ),
      video.save(),
    ]);

    res.send({ success: true, video, originFolder, newFolder });
  } catch (err) {
    return res.status(400).send({ err: err.message });
  }
});

// 영상 북마크, controller resource
videoRouter.post("/:videoId/bookmark", async (req, res) => {
  try {
    const { videoId, folderId } = req.params;

    if (!isValidObjectId(videoId))
      return res.status(400).send({ err: "invalid video id. " });
    if (!isValidObjectId(folderId))
      return res.status(400).send({ err: "invaild folder id. " });

    let [video, folder] = await Promise.all([
      Video.findOne({ _id: videoId }),
      Folder.findOne({ _id: folderId }),
    ]);

    if (!video) return res.status(404).send({ err: "video does not exist. " });
    if (!folder)
      return res.status(404).send({ err: "folder does not exist. " });
    if (video.folder._id.toString() !== folderId)
      return res
        .status(403)
        .send({ err: "this video is not in this folder. " });
    if (folder.publicLevel === 0)
      return res
        .status(403)
        .send({ err: "video in secret folder cannot bookmark. " });

    [video, folder] = await Promise.all([
      Video.findOneAndUpdate(
        { _id: videoId },
        { isBookmarked: true },
        { new: true }
      ),
      Folder.findOneAndUpdate(
        { _id: folderId, "videos._id": videoId },
        { "videos.$.isBookmarked": true },
        { new: true }
      ),
    ]);

    res.send({ success: true, video, folder });
  } catch (err) {
    return res.status(400).send({ err: err.message });
  }
});

// 영상 북마크 해제, controller resource
videoRouter.post("/:videoId/unbookmark", async (req, res) => {
  try {
    const { videoId, folderId } = req.params;

    if (!isValidObjectId(videoId))
      return res.status(400).send({ err: "invalid video id. " });
    if (!isValidObjectId(folderId))
      return res.status(400).send({ err: "invaild folder id. " });

    let [video, folder] = await Promise.all([
      Video.findOne({ _id: videoId }),
      Folder.findOne({ _id: folderId }),
    ]);

    if (!video) return res.status(404).send({ err: "video does not exist. " });
    if (!folder)
      return res.status(404).send({ err: "folder does not exist. " });

    if (video.folder._id.toString() !== folderId)
      return res
        .status(403)
        .send({ err: "this video is not in this folder. " });
    if (folder.publicLevel === 0)
      return res
        .status(403)
        .send({ err: "video in secret folder cannot unbookmark. " });

    [video, folder] = await Promise.all([
      Video.findOneAndUpdate(
        { _id: videoId },
        { isBookmarked: false },
        { new: true }
      ),
      Folder.findOneAndUpdate(
        { _id: folderId, "videos._id": videoId },
        { "videos.$.isBookmarked": false },
        { new: true }
      ),
    ]);

    res.send({ success: true, video, folder });
  } catch (err) {
    return res.status(400).send({ err: err.message });
  }
});

// 영상 복제, controller resource
videoRouter.post(
  "/:videoId/copy",
  mkVideoFromVideoId,
  checkExistedVideo,
  async (req, res, next) => {
    try {
      const { video, originVideo } = req;
      const { folderId: originFolderId } = req.params;
      const { newFolderId, userId } = req.body;

      if (!isValidObjectId(originFolderId))
        return res.status(400).send({ err: "invalid origin folder id. " });
      if (!newFolderId || !isValidObjectId(newFolderId))
        return res.status(400).send({ err: "invalid new folder id. " });

      // 다른 유저로부터 복사하려는 영상이 이미 폴더에 있는 경우
      if (video.isExisted && video.folder._id.toString() === newFolderId)
        return res
          .status(403)
          .send({ err: "this video is already in this folder. " });

      const [newFolder, user] = await Promise.all([
        Folder.findOne({ _id: newFolderId }),
        User.findOne({ _id: userId }),
      ]);

      if (!newFolder)
        return res.status(404).send({ err: "new folder does not exist. " });
      if (!user) return res.status(404).send({ err: "user does not exist. " });

      if (newFolder.user.toString() !== userId)
        return res
          .status(403)
          .send({ err: "this user is not the owner of new folder. " });
      if (originVideo.folder._id.toString() !== originFolderId)
        return res
          .status(403)
          .send({ err: "this video is not in origin folder. " });

      if (originVideo.user.toString() === userId)
        return res.status(403).send({ err: "video owner cannot copy video. " });
      if (originVideo.folder.publicLevel <= 1)
        return res
          .status(403)
          .send({ err: "this video is disabled for coyping. " });

      req.folder = newFolder;

      next();
    } catch (err) {
      return res.status(400).send({ err: err.message });
    }
  },
  checkVideoValidation,
  mkPromisesThatSaveVideo,
  async (req, res) => {
    try {
      const { promises, video, folder, resObj } = req;

      await promises;

      res.send({ success: true, video, folder, ...resObj });
    } catch (err) {
      return res.status(400).send({ err: err.message });
    }
  }
);

module.exports = { videoRouter };
