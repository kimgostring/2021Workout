const { Router } = require("express");
const { isValidObjectId } = require("mongoose");
const { Video, Folder, User } = require("../models");
const { videoRouter } = require("./folder");
const {
  mkVideosFromYoutubePlaylistId,
  mkVideosFromFolderId,
  checkExistedVideos,
  checkFolderValidation,
  mkPromisesThatSaveVideos,
} = require("../middlewares");

const folderRouter = Router();

folderRouter.use("/:folderId/videos", videoRouter);

// 전체 folder 읽기
folderRouter.get("/", async (req, res) => {
  try {
    let { keyword, sort = "ascTitle", strict = "false" } = req.query;

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
        case "ascTitle": // 오름차순
          sort = { title: 1 };
          break;
        case "desTitle": // 내림차순
          sort = { title: -1 };
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

    const folders = await Folder.find(keyword).sort(sort);

    res.send({ success: true, folders });
  } catch (err) {
    return res.status(400).send({ err: err.message });
  }
});

// folder 생성
folderRouter.post(
  "/",
  mkVideosFromYoutubePlaylistId,
  checkExistedVideos,
  async (req, res, next) => {
    try {
      const { youtubePlaylistTitle } = req;
      const { userId, title } = req.body;

      // 유저 확인
      if (!userId || !isValidObjectId(userId))
        return res.status(400).send({ err: "invalid user id. " });

      if (title === undefined && youtubePlaylistTitle === undefined)
        return res
          .status(400)
          .send({ err: "title or youtube playlist id is required. " });

      const user = await User.findOne({ _id: userId });
      if (!user) return res.status(404).send({ err: "user does not exist. " });

      // video에 folder 추가 후 folder에 추가
      // 만들어질 때, publicLevel = 1
      const folder = new Folder({ user: userId });
      req.folder = folder;

      next();
    } catch (err) {
      return res.status(400).send({ err: err.message });
    }
  },
  checkFolderValidation,
  mkPromisesThatSaveVideos,
  async (req, res) => {
    try {
      const { promises, folder, resObj } = req;

      await promises;

      res.send({ success: true, folder, ...resObj });
    } catch (err) {
      return res.status(400).send({ err: err.message });
    }
  }
);

// 특정 folder 읽기
folderRouter.get("/:folderId", async (req, res) => {
  try {
    const { folderId } = req.params;
    const { userId } = req.body;

    if (!isValidObjectId(folderId))
      return res.status(400).send({ err: "invalid folder id. " });
    if (!userId || !isValidObjectId(userId))
      return res.status(400).send({ err: "invalid user id. " });

    const folder = await Folder.findOne({
      _id: folderId,
      publicLevel: { $gte: 1 },
    });

    if (!folder)
      return res.status(404).send({ err: "folder does not exist. " });
    if (folder.publicLevel <= 1 && folder.user.toString() !== userId)
      return res
        .status(403)
        .send({ err: "this folder is disabled for reading. " });

    res.send({ success: true, folder });
  } catch (err) {
    return res.status(400).send({ err: err.message });
  }
});

// folder 수정
folderRouter.patch(
  "/:folderId",
  mkVideosFromYoutubePlaylistId,
  async (req, res, next) => {
    try {
      const { folderId } = req.params;
      const { youtubePlaylistId, title, publicLevel, tags } = req.body;

      if (!isValidObjectId(folderId))
        return res.status(400).send({ err: "invaild folder id. " });

      // 수정사항 없는 경우
      if (
        !youtubePlaylistId &&
        title === undefined &&
        publicLevel === undefined &&
        tags === undefined
      )
        return res
          .status(400)
          .send({ err: "at least one of information must be required. " });

      const folder = await Folder.findOne({ _id: folderId });
      if (!folder)
        return res.status(404).send({ err: "folder does not exist. " });
      if (folder.publicLevel === 0)
        return res.status(403).send({ err: "secret folder cannot edit. " });

      req.folder = folder;

      next();
    } catch (err) {
      return res.status(400).send({ err: err.message });
    }
  },
  checkFolderValidation,
  async (req, res) => {
    try {
      const { folder } = req;
      const { folderId } = req.params;
      const { title, publicLevel } = req.body;

      let promises = Promise.all([folder.save()]);

      // title 또는 publicLevel 바뀔 경우, 내장 영상들 정보도 수정되어야 함
      let videosUpdateOpt = {};
      if (title)
        videosUpdateOpt = { ...videosUpdateOpt, "folder.title": title };
      if (publicLevel)
        videosUpdateOpt = {
          ...videosUpdateOpt,
          "folder.publicLevel": publicLevel,
        };

      if (title || publicLevel)
        promises = Promise.all([
          promises,
          Video.updateMany({ "folder._id": folderId }, videosUpdateOpt),
        ]);

      await promises;

      res.send({ success: true, folder });
    } catch (err) {
      return res.status(400).send({ err: err.message });
    }
  }
);

// folder 삭제
folderRouter.delete("/:folderId", async (req, res) => {
  try {
    const { folderId } = req.params;
    const { willHideVideos = false } = req.body;

    if (!isValidObjectId(folderId))
      return res.status(400).send({ err: "invaild folder id. " });

    const folder = await Folder.findOne({ _id: folderId });
    if (!folder)
      return res.status(404).send({ err: "folder does not exist. " });
    if (folder.isDefault)
      return res.status(403).send({ err: "default folder cannot delete. " });
    if (folder.publicLevel === 0)
      return res.status(403).send({ err: "secret folder cannot delete. " });

    // 폴더 삭제하는 작업 프로미스에 추가
    let promises = Promise.all([folder.deleteOne()]),
      newFolder = null;

    // 삭제될 폴더 안에 video 있는 경우
    if (
      folder.videos &&
      Array.isArray(folder.videos) &&
      folder.videos.length !== 0
    ) {
      if (willHideVideos) {
        // 비밀폴더로 강등
        newFolder = await Folder.findOne({
          user: folder.user,
          publicLevel: 0,
        });
      } else {
        // 기본폴더로 강등
        newFolder = await Folder.findOne({
          user: folder.user,
          isDefault: true,
        });
      }

      if (!newFolder)
        return res.status(404).send({
          err: `${
            willHideVideos ? "secret folder" : "default folder"
          } does not exist. `,
        });

      [newFolder] = await Promise.all([
        Folder.findOneAndUpdate(
          { _id: newFolder._id },
          {
            // 비밀/기본폴더에 영상 추가
            $push: { videos: { $each: folder.videos } },
          },
          { new: true }
        ),
        Video.updateMany({ "folder._id": folderId }, { folder: newFolder }), // 비밀/기본폴더로 강등
        promises,
      ]);
    }

    res.send({ success: true, folder, newFolder });
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

    let folder = await Folder.findOne({ _id: folderId });

    if (!folder)
      return res.status(404).send({ err: "folder does not exist. " });
    if (folder.publicLevel === 0)
      return res.status(403).send({ err: "secret folder cannot bookmark. " });

    folder = await Folder.findOneAndUpdate(
      { _id: folderId },
      { isBookmarked: true },
      { new: true }
    );

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

    let folder = await Folder.findOne({ _id: folderId });

    if (!folder)
      return res.status(404).send({ err: "folder does not exist. " });
    if (folder.publicLevel === 0)
      return res.status(403).send({ err: "secret folder cannot unbookmark. " });

    folder = await Folder.findOneAndUpdate(
      { _id: folderId },
      { isBookmarked: false },
      { new: true }
    );

    res.send({ success: true, folder });
  } catch (err) {
    return res.status(400).send({ err: err.message });
  }
});

// 폴더 복사, controller resource
folderRouter.post(
  "/:folderId/copy",
  mkVideosFromFolderId,
  checkExistedVideos,
  async (req, res, next) => {
    try {
      const { originFolder } = req;
      const { userId, title, publicLevel = 1 } = req.body;

      if (!userId || !isValidObjectId(userId))
        return res.status(400).send({ err: "invaild user id. " });

      const user = await User.findOne({ _id: userId });
      if (!user) return res.status(404).send({ err: "user does not exist. " });

      if (
        title !== undefined &&
        (typeof title !== "string" || title.length <= 0)
      )
        return res.status(400).send({ err: "title must be a string. " });

      if (!(publicLevel === 1 || publicLevel === 2 || publicLevel === 3))
        return res.status(400).send({ err: "publicLevel must be 1, 2 or 3. " });

      // 같은 영상은 한 유저에게 하나만 존재할 수 있음, 따라서 자신의 폴더를 복사하는 건 무의미
      if (originFolder.user.toString() === userId)
        return res
          .status(403)
          .send({ err: "folder owner cannot copy folder." });
      if (originFolder.publicLevel <= 1)
        return res
          .status(403)
          .send({ err: "this folder is disabled for coyping. " });

      // 새 폴더 생성
      const folder = new Folder({
        title: title ? title : originFolder.title,
        user: userId,
        publicLevel,
        tags: originFolder.tags,
      });
      if (originFolder.youtubeId) folder.youtubeId = originFolder.youtubeId;
      req.folder = folder;

      next();
    } catch (err) {
      return res.status(400).send({ err: err.message });
    }
  },
  mkPromisesThatSaveVideos,
  async (req, res) => {
    try {
      const { promises, folder, resObj } = req;

      await promises;

      res.send({ success: true, folder, ...resObj });
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

    if (!isValidObjectId(folderId))
      return res.status(400).send({ err: "invaild folder id. " });
    if (!userId || !isValidObjectId(userId))
      return res.status(400).send({ err: "invaild user id. " });

    const [newDefaultFolder, oldDefaultFolder] = await Promise.all([
      Folder.findOne({ _id: folderId }),
      Folder.findOne({ user: userId, isDefault: true }),
    ]);

    if (!oldDefaultFolder)
      return res.status(404).send({
        err: "user or default folder does not exist. ",
      });

    if (!newDefaultFolder)
      return res.status(404).send({
        err: "folder does not exist. ",
      });
    if (newDefaultFolder.user.toString() !== userId)
      return res.status(403).send({
        err: "this user is not the owner of this folder. ",
      });
    if (newDefaultFolder.publicLevel === 0)
      return res.status(403).send({ err: "secret folder cannot be default. " });

    if (newDefaultFolder.isDefault)
      return res.status(403).send({ err: "this folder is already default. " });

    oldDefaultFolder.isDefault = false;
    newDefaultFolder.isDefault = true;

    await Promise.all([newDefaultFolder.save(), oldDefaultFolder.save()]);

    res.send({ success: true, newDefaultFolder, oldDefaultFolder });
  } catch (err) {
    return res.status(400).send({ err: err.message });
  }
});

module.exports = { folderRouter };
