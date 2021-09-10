const moment = require("moment");
const { Router } = require("express");
const { isValidObjectId } = require("mongoose");
const { Video, Folder } = require("../models");
const {
  getVideoFromId,
  getVideosFromPlaylistId,
  rmSameVideos,
} = require("../middlewares/youtube");

const videoRouter = Router();

// video 추가
let duration;
videoRouter.post(
  "/",
  getVideoFromId,
  getVideosFromPlaylistId,
  rmSameVideos,
  async (req, res) => {
    try {
      const { video, videos } = req;
      const { folderId, title, tags, start, end } = req.body;
      // youtubeVideoId와 youtubePlaylistId 둘 다 입력 안 된 경우
      if (!video && videos.length === 0)
        return res.status(400).send({
          err: "youtubeVideoId or youtubePlaylistId must be required. ",
        });

      // Id 형식 확인
      if (!folderId || !isValidObjectId(folderId))
        return res.status(400).send({ err: "invalid folder id. " });

      const folder = await Folder.findOne({ _id: folderId });
      if (!folder)
        return res.status(400).send({ err: "folder does not exist. " });

      if (video) {
        // youtubeVideoId 입력한 경우

        const endSec = moment.duration(video.originDuration).asSeconds();
        // start, end 확인
        if (
          (start !== undefined &&
            (typeof start !== "number" ||
              !Number.isInteger(start) ||
              start < 0)) ||
          (end !== undefined &&
            (typeof end !== "number" || !Number.isInteger(end) || end < 0))
        )
          return res
            .status(400)
            .send({ err: "both start and end must be a positive integer. " });
        if (start !== undefined && end !== undefined && start > end)
          return res
            .status(400)
            .send({ err: "end must be longer than start. " });
        if (start !== undefined && start > endSec)
          return res
            .status(400)
            .send({ err: "start must be shorter than video duration. " });
        if (end !== undefined && end > endSec)
          return res
            .status(400)
            .send({ err: "end must be shorter than video duration. " });

        // duration 결정
        if (start !== undefined && end !== undefined)
          duration = moment
            .duration(end * 1000)
            .subtract(start * 1000)
            .toISOString();
        else if (start !== undefined)
          duration = moment
            .duration(endSec * 1000)
            .subtract(start * 1000)
            .toISOString();
        else if (end !== undefined)
          duration = moment.duration(end * 1000).toISOString();
        else duration = video.originDuration;

        // title 확인, 생략 가능
        if (title && typeof title !== "string")
          return res.status(400).send({ err: "title must be a string." });

        // tags 확인
        if (tags) {
          if (!Array.isArray(tags))
            return res.status(400).send({ err: "tags must be an array." });
          if (!tags.every((tag) => typeof tag === "string" && tag.length <= 10))
            return res.status(400).send({
              err: "each tag must be a string within 10 chars. ",
            });
        }

        // 필드 추가
        video.folder = folder;
        video.user = folder.user;
        video.duration = duration;

        if (title) video.title = title;
        if (start !== undefined && start !== 0) video.start = start;
        if (end !== undefined && end !== endSec) video.end = end;
      }

      if (videos.length !== 0) {
        // youtubePlaylistId 입력한 경우
        // 필드 추가
        videos.forEach((video) => {
          video.folder = folder;
          video.user = folder.user;
        });
      }

      // DB에 저장
      let promises = null,
        videosAddArr = [];
      if (video) {
        promises = Promise.all([promises, video.save()]);
        videosAddArr.push(video);
      }
      if (videos.length !== 0) {
        promises = Promise.all([promises, Video.insertMany(videos)]);
        videosAddArr.push(...videos);
      }
      promises = Promise.all([
        promises,
        Folder.updateOne(
          { _id: folderId },
          { $push: { videos: { $each: videosAddArr } } }
        ),
      ]);
      await promises;

      res.send({ success: true, videos: videosAddArr });
    } catch (err) {
      return res.status(400).send({ err: err.message });
    }
  }
);

// 전체 video 읽기
videoRouter.get("/", async (req, res) => {
  try {
    let { keyword, sort, strict } = req.query;
    if (keyword && isValidObjectId(keyword))
      // keyword로 id 넘어온 경우
      keyword = { _id: keyword, "folder.sharingLevel": { $gte: 2 } };
    // id가 아닌 경우, 키워드 검색
    else if (keyword && strict === "true")
      // strict 옵션 있을 경우, 입력된 문장과 띄어쓰기까지 완전히 일치하는 것 골라옴
      keyword = {
        $text: { $search: `"${keyword}"` },
        "folder.sharingLevel": 3,
      };
    else if (keyword)
      keyword = { $text: { $search: keyword }, "folder.sharingLevel": 3 };
    else keyword = { sharingLevel: 3 }; // 기본 검색
    if (sort)
      switch (sort) {
        case "asc": // 오름차순
          sort = { title: 1 };
          break;
        case "des": // 내림차순
          sort = { title: -1 };
          break;
        case "desShared": // 공유많은순
          sort = { sharedCount: -1 };
          break;
        case "latest": // 최신순
          sort = { createdAt: -1 };
          break;
        default:
          return res.status(400).send({ err: "invalid sort. " });
      }
    else sort = { sharedCount: -1 }; // 기본 정렬

    const videos = await Video.find(keyword).sort(sort); // 기본 정렬
    res.send({ success: true, videos });
  } catch (err) {
    return res.status(400).send({ err: err.message });
  }
});

// 특정 id의 video 읽기
videoRouter.get("/:videoId", async (req, res) => {
  try {
    const { videoId } = req.params;
    if (!isValidObjectId(videoId))
      return res.status(400).send({ err: "invaild video id." });

    const video = await Video.findOne({ _id: videoId });
    if (!video) return res.status(400).send({ err: "video does not exist." });

    res.send({ success: true, video });
  } catch (err) {
    return res.status(400).send({ err: err.message });
  }
});

// video 정보 수정
videoRouter.patch("/:videoId", async (req, res) => {
  try {
    const { videoId } = req.params;
    const { title, tags } = req.body;
    let { start, end } = req.body;
    if (!isValidObjectId(videoId))
      return res.status(400).send({ err: "invalid video id. " });

    // 수정사항 없는 경우
    if (!title && !tags && start === undefined && end === undefined)
      return res
        .status(400)
        .send({ err: "at least one of information must be required. " });

    // title 확인
    if (title !== undefined && (typeof title !== "string" || title.length <= 0))
      return res.status(400).send({ err: "title must be a string." });
    // tags 확인
    if (tags) {
      if (!Array.isArray(tags))
        return res.status(400).send({ err: "tags must be an array." });
      if (!tags.every((tag) => typeof tag === "string" && tag.length <= 10))
        return res
          .status(400)
          .send({ err: "each tag must be a string within 10 chars. " });
    }

    let video = await Video.findOne({ _id: videoId });
    if (!video) return res.status(400).send({ err: "video does not exist. " });

    // start, end 확인
    const endSec = moment.duration(video.originDuration).asSeconds();
    // 새 start/end 입력되지 않은 경우, 기존의 값 이용하여 비교 필요
    if (start === undefined) start = video.start;
    if (end === undefined) end = video.end;
    if (
      (start !== undefined && (!Number.isInteger(start) || start < 0)) ||
      (end !== undefined && (!Number.isInteger(end) || end < 0))
    )
      return res.status(400).send({
        err: "both start and end must be a positive integer. ",
      });
    if (start !== undefined && end !== undefined && start > end)
      return res.status(400).send({ err: "end must be longer than start. " });
    if (start !== undefined && start > endSec)
      return res
        .status(400)
        .send({ err: "start must be shorter than video duration. " });
    if (end !== undefined && end > endSec)
      return res
        .status(400)
        .send({ err: "end must be shorter than video duration. " });

    // duration 결정
    let duration;
    if (start !== undefined && end !== undefined)
      duration = moment
        .duration(end * 1000)
        .subtract(start * 1000)
        .toISOString();
    else if (start !== undefined)
      duration = moment
        .duration(endSec * 1000)
        .subtract(start * 1000)
        .toISOString();
    else if (end !== undefined)
      duration = moment.duration(end * 1000).toISOString();
    else duration = video.duration;

    // start와 end가 초기화될 경우, 필드 삭제
    let startEndDelObj = {};
    if (start === 0) {
      delete req.body.start;
      startEndDelObj = { ...startEndDelObj, start: "" };
    }
    if (end === endSec) {
      delete req.body.end;
      startEndDelObj = { ...startEndDelObj, end: "" };
    }
    startEndDelObj = { $unset: startEndDelObj };

    let promises = Promise.all([
      Video.findOneAndUpdate(
        { _id: videoId },
        { ...req.body, duration, ...startEndDelObj },
        { new: true }
      ),
    ]);

    let folderUpdateObj = {};
    if (title)
      folderUpdateObj = { ...folderUpdateObj, "videos.$.title": title };
    if (req.body.start !== undefined || req.body.end !== undefined)
      folderUpdateObj = { ...folderUpdateObj, "videos.$.duration": duration };

    if (title || req.body.start !== undefined || req.body.end !== undefined)
      // title 또는 start/end 수정해야 할 경우, folder에 내장된 정보도 수정 필요
      promises = Promise.all([
        promises,
        Folder.updateOne(
          { _id: video.folder._id, "videos._id": videoId },
          folderUpdateObj
        ),
      ]);

    [video] = await promises;
    res.send({ success: true, video });
  } catch (err) {
    return res.status(400).send({ err: err.message });
  }
});

// video 삭제
videoRouter.delete("/:videoId", async (req, res) => {
  try {
    const { videoId } = req.params;
    if (!isValidObjectId(videoId))
      return res
        .status(400)
        .send({ err: "folder id or video id is invaild. " });

    const video = await Video.findOne({ _id: videoId });
    if (!video) return res.status(400).send({ err: "video does not exist. " });

    await Promise.all([
      Video.deleteOne({ _id: videoId }),
      Folder.updateOne(
        { _id: video.folder._id },
        { $pull: { videos: { _id: videoId } } }
      ),
    ]);

    res.send({ success: true, video });
  } catch (err) {
    return res.status(400).send({ err: err.message });
  }
});

// video 폴더 이동, controller resource
videoRouter.post("/:videoId/move", async (req, res) => {
  try {
    const { videoId } = req.params;
    const { newFolderId } = req.body;
    if (!isValidObjectId(videoId))
      return res.status(400).send({ err: "invalid video id. " });
    if (!newFolderId || !isValidObjectId(newFolderId))
      return res.status(400).send({ err: "invalid folder id. " });

    const [video, newFolder] = await Promise.all([
      Video.findOne({ _id: videoId }),
      Folder.findOne({ _id: newFolderId }),
    ]);
    if (!video) return res.status(400).send({ err: "video does not exist. " });
    if (!newFolder)
      return res.status(400).send({ err: "folder does not exist. " });
    if (newFolder.user.toString() !== video.user.toString())
      return res
        .status(400)
        .send({ err: "owner of folder and video are different. " });

    const oldFolderId = video.folder._id;
    video.folder = newFolder;

    await Promise.all([
      video.save(),
      Folder.updateOne(
        { _id: oldFolderId },
        { $pull: { videos: { _id: videoId } } }
      ),
      Folder.updateOne({ _id: newFolderId }, { $push: { videos: video } }),
    ]);

    res.send({ success: true, video });
  } catch (err) {
    return res.status(400).send({ err: err.message });
  }
});

// 영상 복제, controller resource
videoRouter.post("/:videoId/copy", async (req, res) => {
  try {
    const { videoId: originVideoId } = req.params;
    const { newFolderId } = req.body;
    if (!isValidObjectId(originVideoId))
      return res.status(400).send({ err: "invalid video id. " });
    if (!newFolderId || !isValidObjectId(newFolderId))
      return res.status(400).send({ err: "invalid folder id. " });

    const [originVideo, newFolder] = await Promise.all([
      Video.findOne({ _id: originVideoId }),
      Folder.findOne({ _id: newFolderid }),
    ]);
    if (!originVideo)
      return res.status(400).send({ err: "video does not exist. " });
    if (!newFolder)
      return res.status(400).send({ err: "folder does not exist. " });
    if (
      originVideo.folder.sharingLevel === 1 &&
      originVideo.user.toString() !== newFolder.user.toString()
    )
      return res.status(400).send({ err: "video disabled for coyping. " });

    const newVideo = new Video({
      title: originVideo.title,
      youtubeId: originVideo.youtubeId,
      thumbnail: originVideo.thumbnail,
      originDuration: originVideo.originDuration,
      duration: originVideo.duration,
      tags: originFolder.tags,
      folder: newFolder,
      user: newFolder.user,
    });
    if (originVideo.start !== undefined) newVideo.start = originVideo.start;
    if (originVideo.end !== undefined) newVideo.end = originVideo.end;

    // 새 영상 폴더에 넣어주기
    newFolder.videos.push(newVideo);

    [countedOriginVideo] = await Promise.all([
      Video.findOneAndUpdate(
        { _id: originVideoId, user: { $ne: originVideo.user } },
        { $inc: { sharedCount: 1 } },
        { new: true }
      ),
      newVideo.save(),
      newFolder.save(),
    ]);
    res.send({
      success: true,
      newVideo,
      originVideo: countedOriginVideo ? counterOriginVideo : originVideo,
    });
  } catch (err) {
    return res.status(400).send({ err: err.message });
  }
});

// 영상 북마크, controller resource
videoRouter.post("/:videoId/bookmark", async (req, res) => {
  try {
    const { videoId } = req.params;
    if (!isValidObjectId(videoId))
      return res.status(400).send({ err: "invalid video id. " });

    const [video] = await Promise.all([
      Video.findOneAndUpdate(
        { _id: videoId, isBookmarked: false },
        { isBookmarked: true },
        { new: true }
      ),
      Folder.updateMany(
        { "videos._id": videoId },
        { "videos.$.isBookmarked": true }
      ),
    ]);

    if (!video)
      return res.status(400).send({
        err: "video does not exist, or not owned by the user, or already bookmarked video. ",
      });

    res.send({ success: true, video });
  } catch (err) {
    return res.status(400).send({ err: err.message });
  }
});

// 영상 북마크 해제, controller resource
videoRouter.post("/:videoId/unbookmark", async (req, res) => {
  try {
    const { videoId } = req.params;
    if (!isValidObjectId(videoId))
      return res.status(400).send({ err: "invalid video id. " });

    const [video] = await Promise.all([
      Video.findOneAndUpdate(
        { _id: videoId, isBookmarked: true },
        { isBookmarked: false },
        { new: true }
      ),
      Folder.updateMany(
        { "videos._id": videoId },
        { "videos.$.isBookmarked": false }
      ),
    ]);

    if (!video)
      return res.status(400).send({
        err: "video does not exist, or not owned by the user, or already unbookmarked video. ",
      });

    res.send({ success: true, video });
  } catch (err) {
    return res.status(400).send({ err: err.message });
  }
});

module.exports = { videoRouter };
