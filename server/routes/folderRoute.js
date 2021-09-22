const { Router } = require("express");
const { isValidObjectId } = require("mongoose");
const { Video, Folder, User } = require("../models");
const { folderVideoRouter } = require("./folder");
const {
  mkVideosFromYoutubePlaylistId,
  mkVideosFromVideoSetId,
  checkExistedVideos,
} = require("../middlewares");

const folderRouter = Router();

folderRouter.use("/:folderId/videos", folderVideoRouter);

// folder 생성
folderRouter.post(
  "/",
  mkVideosFromYoutubePlaylistId,
  checkExistedVideos,
  async (req, res) => {
    try {
      const { youtubePlaylistName, videos } = req;
      const {
        userId,
        youtubePlaylistId,
        publicLevel = 1,
        tags,
        name,
        willMoveExistedVideos = false,
      } = req.body;
      // 유저 확인
      if (!userId || !isValidObjectId(userId))
        return res.status(400).send({ err: "invalid user id. " });
      const user = await User.findOne({ _id: userId });
      if (!user) return res.status(400).send({ err: "user does not exist. " });

      // name 확인
      if (!(name || youtubePlaylistName))
        return res
          .status(400)
          .send({ err: "name or youtubePlaylistId is required." });
      // publicLevel 확인
      if (!(publicLevel === 1 || publicLevel === 2 || publicLevel === 3))
        return res
          .status(400)
          .send({ err: "publicLevel must be a 1-3 integer. " });
      // tags 확인
      if (tags) {
        if (!Array.isArray(tags))
          return res.status(400).send({ err: "tags must be an array." });
        if (!tags.every((tag) => typeof tag === "string" && tag.length <= 10))
          return res
            .status(400)
            .send({ err: "each tag must be a string within 10 chars. " });
      }

      // video에 folder 추가 후 folder에 추가
      const folder = new Folder({
        ...req.body,
        name: `${name ? `${name}` : `${youtubePlaylistName}`}`,
        user: user._id,
      });
      if (youtubePlaylistName) folder.youtubeId = youtubePlaylistId;

      let originFolderId,
        promises = null;
      const willPushedVideos = [],
        willInsertedVideos = [],
        willMovedVideos = [];
      videos.forEach((video) => {
        originFolderId = video.folder._id;
        video.folder._id = folder._id;
        video.folder.name = folder.name;
        video.folder.publicLevel = folder.publicLevel;
        video.user = userId;

        // promises에 저장
        if (!video.isExisted) {
          // 새 영상 그냥 저장
          willPushedVideos.push(video);
          willInsertedVideos.push(video);
        } else if (video.isExisted && willMoveExistedVideos) {
          // 폴더 이동하는 경우, 원래의 폴더에서 pull 필요
          promises = Promise.all([
            promises,
            Folder.updateOne(
              { _id: originFolderId },
              { $pull: { videos: { _id: video._id } } }
            ),
          ]);
          willPushedVideos.push(video);
          willMovedVideos.push(video);
        }
        // (!willMoveExistedVideo && video.isExisted)
        // || (video.isExisted && willMoveExistedVideo)
        // 원래 폴더에 그래도 놔둠, 변경사항 저장하지 않음
      });
      folder.videos = willPushedVideos;

      await Promise.all([
        folder.save(),
        Video.insertMany(willInsertedVideos),
        Video.updateMany(
          { _id: { $in: willMovedVideos.map((video) => video._id) } },
          { folder }
        ),
      ]);
      res.send({
        success: true,
        folder,
        pushedVideoNum: willPushedVideos.length,
        insertedVideoNum: willInsertedVideos.length,
        movedVideoNum: willMovedVideos.length,
      });
    } catch (err) {
      return res.status(400).send({ err: err.message });
    }
  }
);

// 전체 folder 읽기
folderRouter.get("/", async (req, res) => {
  try {
    let { keyword, sort, strict } = req.query;
    if (keyword && isValidObjectId(keyword))
      // keyword로 id 넘어온 경우
      keyword = { _id: keyword, publicLevel: { $gte: 2 } };
    // id가 아닌 경우, 키워드 검색
    else if (keyword && strict === "true")
      // strict 옵션 있을 경우, 입력된 문장과 띄어쓰기까지 완전히 일치하는 것 골라옴
      keyword = { $text: { $search: `"${keyword}"` }, publicLevel: 3 };
    else if (keyword) keyword = { $text: { $search: keyword }, publicLevel: 3 };
    else keyword = { publicLevel: 3 }; // 기본 검색
    if (sort)
      switch (sort) {
        case "asc": // 오름차순
          sort = { name: 1 };
          break;
        case "des": // 내림차순
          sort = { name: -1 };
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

    const folders = await Folder.find(keyword).sort(sort); // 기본 정렬
    res.send({ success: true, folders });
  } catch (err) {
    return res.status(400).send({ err: err.message });
  }
});

// 특정 folder 읽기
folderRouter.get("/:folderId", async (req, res) => {
  try {
    const { folderId } = req.params;
    if (!isValidObjectId(folderId))
      return res.status(400).send({ err: "invalid folder id. " });

    const folder = await Folder.findOne({
      _id: folderId,
      publicLevel: { $gte: 1 },
    });
    if (!folder)
      return res.status(400).send({ err: "folder does not exist. " });

    res.send({ success: true, folder });
  } catch (err) {
    return res.status(400).send({ err: err.message });
  }
});

// folder 수정
folderRouter.patch("/:folderId", async (req, res) => {
  try {
    const { folderId } = req.params;
    const { name, publicLevel, tags } = req.body;
    if (!isValidObjectId(folderId))
      return res.status(400).send({ err: "invaild folder id. " });

    // 수정사항 없는 경우
    if (!name && !publicLevel && !tags)
      return res
        .status(400)
        .send({ err: "at least one of information must be required. " });
    // name 확인
    if (name !== undefined && (typeof name !== "string" || name.length <= 0))
      return res.status(400).send({ err: "name must be a string. " });
    // publicLevel 확인
    if (
      publicLevel !== undefined &&
      !(publicLevel === 1 || publicLevel === 2 || publicLevel === 3)
    )
      return res
        .status(400)
        .send({ err: "publicLevel must be a 1-3 integer. " });
    // tags 확인
    if (tags) {
      if (!Array.isArray(tags))
        return res.status(400).send({ err: "tags must be an array." });
      if (!tags.every((tag) => typeof tag === "string" && tag.length <= 10))
        return res
          .status(400)
          .send({ err: "each tag must be a string within 10 chars. " });
    }

    let promises = Promise.all([
      Folder.findOneAndUpdate(
        { _id: folderId, publicLevel: { $gte: 1 } },
        req.body,
        { new: true }
      ),
    ]);

    // name 또는 publicLevel 바뀔 경우, 내장 영상들 정보도 수정되어야 함
    let videosUpdateObj = {};
    if (name) videosUpdateObj = { ...videosUpdateObj, "folder.name": name };
    if (publicLevel)
      videosUpdateObj = {
        ...videosUpdateObj,
        "folder.publicLevel": publicLevel,
      };
    if (name || publicLevel)
      promises = Promise.all([
        promises,
        Video.updateMany({ "folder._id": folderId }, videosUpdateObj),
      ]);

    const [folder] = await promises;
    if (!folder)
      return res.status(400).send({ err: "folder does not exist. " });

    res.send({ success: true, folder });
  } catch (err) {
    return res.status(400).send({ err: err.message });
  }
});

// folder 삭제
folderRouter.delete("/:folderId", async (req, res) => {
  try {
    const { folderId } = req.params;
    if (!isValidObjectId(folderId))
      return res.status(400).send({ err: "folder id is invaild. " });

    const folder = await Folder.findOne({ _id: folderId });
    if (!folder)
      return res.status(400).send({ err: "folder does not exist. " });
    if (folder.isDefault)
      return res.status(400).send({ err: "default folder cannot delete. " });
    if (folder.publicLevel === 0)
      return res.status(400).send({ err: "secret folder cannot delete. " });

    // 폴더 삭제하는 작업 프로미스에 추가
    let promises = Promise.all([
      Folder.deleteOne({
        _id: folderId,
        isDefault: false,
        publicLevel: { $gte: 1 },
      }),
    ]);

    if (
      folder.videos &&
      Array.isArray(folder.videos) &&
      folder.videos.length !== 0
    ) {
      // 폴더 안에 video 있는 경우 영상 기본폴더로 강등 필요
      const defaultFolder = await Folder.findOne({
        user: folder.user,
        isDefault: true,
      });
      if (!defaultFolder)
        return res.status(400).send({ err: "default folder does not exist. " });

      promises = Promise.all([
        promises,
        Video.updateMany({ "folder._id": folderId }, { folder: defaultFolder }), // 기본폴더로 강등
        defaultFolder.updateOne({
          // 기본폴더에 영상 추가
          $push: { videos: { $each: folder.videos } },
        }),
      ]);
    }

    await promises;
    res.send({ success: true, folder });
  } catch (err) {
    return res.status(400).send({ err: err.message });
  }
});

// 폴더 북마크, controller resource
folderRouter.post("/:folderId/bookmark", async (req, res) => {
  try {
    const { folderId } = req.params;
    if (!isValidObjectId(folderId))
      return res.status(400).send({ err: "invalid folder id. " });

    const folder = await Folder.findOneAndUpdate(
      { _id: folderId, isBookmarked: false, publicLevel: { $gte: 1 } },
      { isBookmarked: true },
      { new: true }
    );

    if (!folder)
      return res.status(400).send({
        err: "folder does not exist, or already bookmarked folder. ",
      });

    res.send({ success: true, folder });
  } catch (err) {
    return res.status(400).send({ err: err.message });
  }
});

// 폴더 북마크 해제, controller resource
folderRouter.post("/:folderId/unbookmark", async (req, res) => {
  try {
    const { folderId } = req.params;
    if (!isValidObjectId(folderId))
      return res.status(400).send({ err: "invalid folder id. " });

    const folder = Folder.findOneAndUpdate(
      { _id: folderId, isBookmarked: true, publicLevel: { $gte: 1 } },
      { isBookmarked: false },
      { new: true }
    );

    if (!folder)
      return res.status(400).send({
        err: "folder does not exist, or already unbookmarked folder. ",
      });

    res.send({ success: true, folder });
  } catch (err) {
    return res.status(400).send({ err: err.message });
  }
});

// 폴더 복사하기, controller resource
folderRouter.post(
  "/:folderId/copy",
  mkVideosFromVideoSetId,
  checkExistedVideos,
  async (req, res) => {
    try {
      const { videos, folder: originFolder } = req;
      const { folderId: originFolderId } = req.params;
      const {
        userId,
        publicLevel = 1,
        willMoveExistedVideos = false,
      } = req.body;
      if (!originFolder)
        return res.status(400).send({ err: "folder does not exist. " });
      if (!originFolderId || !isValidObjectId(originFolderId))
        return res.status(400).send({ err: "invalid folder id. " });

      if (!(publicLevel === 1 || publicLevel === 2 || publicLevel === 3))
        return res
          .status(400)
          .send({ err: "publicLevel must be a 1-3 integer. " });

      const user = await User.findOne({ _id: userId });
      if (!user) return res.status(400).send({ err: "user does not exist. " });

      if (
        // 내 폴더가 아닌 폴더를 복사할 때, publicLevel이 1이면 권한 없음
        originFolder.publicLevel === 1 &&
        originFolder.user.toString() !== userId
      )
        return res.status(400).send({ err: "folder disabled for coyping. " });

      // 새 폴더 생성
      const newFolder = new Folder({
        name: originFolder.name,
        youtubeId: originFolder.youtubeId,
        tags: originFolder.tags,
        user: userId,
      });

      // 영상 정보 추가 및 분류
      let promises = null;
      const willPushedVideos = [],
        willInsertedVideos = [],
        willMovedVideos = [];
      videos.forEach((video) => {
        video.folder._id = newFolder._id;
        video.folder.name = newFolder.name;
        video.folder.publicLevel = newFolder.publicLevel;
        video.user = userId;

        if (!video.isExisted) {
          // 새 영상 그냥 저장
          willPushedVideos.push(video);
          willInsertedVideos.push(video);
        } else if (video.isExisted && willMoveExistedVideos) {
          // 폴더 이동하는 경우, 원래의 폴더에서 pull 필d요
          promises = Promise.all([
            promises,
            Folder.updateOne(
              { _id: originFolderId },
              { $pull: { videos: { _id: video._id } } }
            ),
          ]);
          willPushedVideos.push(video);
          willMovedVideos.push(video);
        }
        // (!willMoveExistedVideo && newVideo.isExisted)
        // || (newVideo.isExisted && willMoveExistedVideo)
        // 원래 폴더에 그래도 놔둠, 변경사항 저장하지 않음
      });

      // 새 폴더에 영상들 넣어주기
      newFolder.videos = willPushedVideos;

      promises = Promise.all([
        // origin - sharedCount 증가
        Folder.updateOne(
          { _id: originFolderId, user: { $ne: userId } },
          { $inc: { sharedCount: 1 } }
        ),
        Video.updateMany(
          {
            "folder._id": originFolderId,
            youtubeId: {
              $in: willInsertedVideos.map((video) => video.youtubeId),
            },
            user: { $ne: userId },
          },
          { $inc: { sharedCount: 1 } }
        ),
        // new - folder 추가, video 추가, 기존 존재하던 video 이동
        newFolder.save(),
        Video.insertMany(willInsertedVideos),
        Video.updateMany(
          { _id: { $in: willMovedVideos.map((video) => video._id) } },
          { folder: newFolder }
        ),
        promises, // 원래 폴더에서 옮길 Video pull
      ]);

      const [countedOriginFolder] = await promises;
      res.send({
        success: true,
        folder: newFolder,
        pushedVideoNum: willPushedVideos.length,
        insertedVideoNum: willInsertedVideos.length,
        movedVideoNum: willMovedVideos.length,
        isSharedWithOther: countedOriginFolder.matchedCount ? true : false,
      });
    } catch (err) {
      return res.status(400).send({ err: err.message });
    }
  }
);

// 기본폴더로 지정, controller resource
folderRouter.post("/:folderId/setAsDefault", async (req, res) => {
  try {
    const { folderId } = req.params;
    const { userId } = req.body;
    if (!userId || !isValidObjectId(userId))
      return res.status(400).send({ err: "invaild user id. " });
    if (!isValidObjectId(folderId))
      return res.status(400).send({ err: "invaild folder id. " });

    const [newDefaultFolder, oldDefaultFolder] = await Promise.all([
      Folder.findOne({ _id: folderId, user: userId, publicLevel: { $gte: 1 } }),
      Folder.findOne({ user: userId, isDefault: true }),
    ]);
    if (!oldDefaultFolder)
      return res.status(400).send({
        err: "user does not exist, or default folder does not exist. ",
      });
    if (!newDefaultFolder)
      return res.status(400).send({
        err: "folder does not exist, or user does not have this folder. ",
      });
    if (newDefaultFolder.isDefault)
      return res.status(400).send({ err: "already default folder. " });

    newDefaultFolder.isDefault = true;
    oldDefaultFolder.isDefault = false;

    await Promise.all([newDefaultFolder.save(), oldDefaultFolder.save()]);
    res.send({ success: true, newDefaultFolder, oldDefaultFolder });
  } catch (err) {
    return res.status(400).send({ err: err.message });
  }
});

module.exports = { folderRouter };
