const moment = require("moment");
const { Router } = require("express");
const { isValidObjectId } = require("mongoose");
const { Playlist, Folder, Video, User } = require("../models");
const {
  checkExistedVideos,
  mkVideosFromVideoSetId,
  mkVideosFromYoutubePlaylistId,
} = require("../middlewares");

const playlistRouter = Router();

// playlist 생성
playlistRouter.post(
  "/",
  mkVideosFromYoutubePlaylistId,
  checkExistedVideos,
  async (req, res) => {
    try {
      const { youtubePlaylistName } = req;
      const {
        userId,
        folderId,
        publicLevel = 1,
        tags,
        name,
        successNotification,
        failNotification,
      } = req.body;

      let videos;
      if (youtubePlaylistName) videos = req.videos;
      else {
        videos = req.body.videos;
        videos.forEach((video) => (video.isExisted = true));
      }

      // id 확인
      if (!userId || !isValidObjectId(userId))
        return res.status(400).send({ err: "invalid user id. " });
      if (folderId && !isValidObjectId(folderId))
        return res.status(400).send({ err: "invalid folder id. " });

      let promises;
      promises = Promise.all([User.findOne({ _id: userId })]);
      if (youtubePlaylistName) {
        if (folderId)
          promises = Promise.all([
            promises,
            Folder.findOne({ _id: folderId, user: userId }),
          ]);
        else
          promises = Promise.all([
            promises,
            Folder.findOne({ user: userId, publicLevel: 0 }),
          ]);
      }

      const [user, folder] = await promises;
      if (!user) return res.status(400).send({ err: "user does not exist. " });
      if (youtubePlaylistName && !folder)
        return res
          .status(400)
          .send({ err: "folder does not exist, or not owned by user. " });

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
      // notification 확인
      if (
        (successNotification !== undefined &&
          (typeof successNotification !== "string" ||
            successNotification.length > 50)) ||
        (failNotification !== undefined &&
          (typeof failNotification !== "string" ||
            failNotification.length > 50))
      )
        return res
          .status(400)
          .send({ err: "notification must be a string within 50 chars. " });

      // videos 확인
      if (!Array.isArray(videos) || videos.length <= 0)
        return res
          .status(400)
          .send({ err: "at least one video is required. " });
      if (
        !videos.every(
          (video) =>
            isValidObjectId(video._id) &&
            (!video.isExisted ||
              (video.isExisted && video.user.toString() === userId)) &&
            (video.repeatition === undefined ||
              (video.repeatition !== undefined &&
                Number.isInteger(video.repeatition) &&
                video.repeatition >= 1))
        )
      )
        return res.status(400).send({ err: "invalid video. " });

      // videos 분류, 새 videos에 정보 추가
      const willInsertedVideos = [];
      videos.forEach((video) => {
        if (!video.isExisted) {
          video.folder._id = folder._id;
          video.folder.name = folder.name;
          video.folder.publicLevel = folder.publicLevel;
          video.user = userId;
          willInsertedVideos.push(video);
        }
      });
      folder.videos.push(...willInsertedVideos);

      // duration 생성
      let duration = 0;
      videos.forEach((video) => {
        duration += moment.duration(video.duration).asSeconds();
      });
      duration = moment.duration(duration * 1000).toISOString();

      const playlist = new Playlist({
        ...req.body,
        name: `${name ? `${name}` : `${youtubePlaylistName}`}`,
        user: userId,
        duration,
        videos,
      });
      if (successNotification)
        playlist.successNotification = successNotification;
      if (failNotification) playlist.failNotification = failNotification;

      if (willInsertedVideos.length === 0) await playlist.save();
      else
        await Promise.all([
          playlist.save(),
          folder.save(),
          Video.insertMany(willInsertedVideos),
        ]);

      res.send({
        success: true,
        playlist,
        insertedVideoNum: willInsertedVideos.length,
      });
    } catch (err) {
      return res.status(400).send({ err: err.message });
    }
  }
);

// 전체 playlist 읽기
playlistRouter.get("/", async (req, res) => {
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

    const playlists = await Playlist.find(keyword).sort(sort); // 기본 정렬
    res.send({ success: true, playlists });
  } catch (err) {
    return res.status(400).send({ err: err.message });
  }
});

// 특정 playlist 읽기
playlistRouter.get("/:playlistId", async (req, res) => {
  try {
    const { playlistId } = req.params;
    if (!isValidObjectId(playlistId))
      return res.status(400).send({ err: "invalid playlist id. " });

    const playlist = await Playlist.findOne({ _id: playlistId });
    if (!playlist)
      return res.status(400).send({ err: "playlist does not exist. " });

    res.send({ success: true, playlist });
  } catch (err) {
    return res.status(400).send({ err: err.message });
  }
});

// playlist 수정
playlistRouter.patch("/:playlistId", async (req, res) => {
  try {
    const { playlistId } = req.params;
    const {
      userId,
      name,
      publicLevel,
      tags,
      videos,
      successNotification,
      failNotification,
    } = req.body;

    if (!isValidObjectId(playlistId))
      return res.status(400).send({ err: "invaild playlist id. " });

    // 수정사항 없는 경우
    if (
      !name &&
      publicLevel === undefined &&
      tags === undefined &&
      videos === undefined &&
      successNotification === undefined &&
      failNotification === undefined
    )
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
    // notification 확인
    if (
      (successNotification !== undefined &&
        (typeof successNotification !== "string" ||
          successNotification.length > 50)) ||
      (failNotification !== undefined &&
        (typeof failNotification !== "string" || failNotification.length > 50))
    )
      return res
        .status(400)
        .send({ err: "notification must be a string within 50 chars. " });
    // videos 확인
    if (videos !== undefined) {
      // videos 확인
      if (!Array.isArray(videos) || videos.length <= 0)
        return res
          .status(400)
          .send({ err: "at least one video is required. " });
      if (
        !videos.every(
          (video) =>
            isValidObjectId(video._id) &&
            video.user.toString() === userId &&
            (video.repeatition === undefined ||
              (video.repeatition !== undefined &&
                Number.isInteger(video.repeatition) &&
                video.repeatition >= 1))
        )
      )
        return res.status(400).send({ err: "invalid video. " });

      // duration 생성
      let duration = 0;
      videos.forEach((video) => {
        duration += moment.duration(video.duration).asSeconds();
      });
      duration = moment.duration(duration * 1000).toISOString();
      req.body.duration = duration;
    }

    const playlist = await Playlist.findOneAndUpdate(
      { _id: playlistId },
      req.body,
      { new: true }
    );
    if (!playlist)
      return res.status(400).send({ err: "playlist does not exist. " });

    res.send({ success: true, playlist });
  } catch (err) {
    return res.status(400).send({ err: err.message });
  }
});

// playlist 삭제
playlistRouter.delete("/:playlistId", async (req, res) => {
  try {
    const { playlistId } = req.params;
    if (!isValidObjectId(playlistId))
      return res.status(400).send({ err: "invaild playlist id. " });

    const playlist = await Playlist.findOneAndDelete({ _id: playlistId });
    if (!playlist)
      return res.status(400).send({ err: "playlist does not exist. " });

    res.send({ success: true, playlist });
  } catch (err) {
    return res.status(400).send({ err: err.message });
  }
});

// 플리 북마크, controller resource
playlistRouter.post("/:playlistId/bookmark", async (req, res) => {
  try {
    const { playlistId } = req.params;
    if (!isValidObjectId(playlistId))
      return res.status(400).send({ err: "invalid playlist id. " });

    const playlist = await Playlist.findOneAndUpdate(
      { _id: playlistId, isBookmarked: false },
      { isBookmarked: true },
      { new: true }
    );

    if (!playlist)
      return res.status(400).send({
        err: "playlist does not exist, or already bookmarked playlist. ",
      });

    res.send({ success: true, playlist });
  } catch (err) {
    return res.status(400).send({ err: err.message });
  }
});

// 플리 북마크 해제, controller resource
playlistRouter.post("/:playlistId/unbookmark", async (req, res) => {
  try {
    const { playlistId } = req.params;
    if (!isValidObjectId(playlistId))
      return res.status(400).send({ err: "invalid playlist id. " });

    const playlist = Playlist.findOneAndUpdate(
      { _id: playlistId, isBookmarked: true },
      { isBookmarked: false },
      { new: true }
    );

    if (!playlist)
      return res.status(400).send({
        err: "playlist does not exist, or already unbookmarked playlist. ",
      });

    res.send({ success: true, playlist });
  } catch (err) {
    return res.status(400).send({ err: err.message });
  }
});

// 플리 복사하기, controller resource
playlistRouter.post(
  "/:playlistId/copy",
  mkVideosFromVideoSetId,
  checkExistedVideos,
  async (req, res) => {
    try {
      const { videos, playlist: originPlaylist } = req;
      const { playlistId: originPlaylistId } = req.params;
      const { userId, folderId, publicLevel = 1 } = req.body;
      if (!originPlaylist)
        return res.status(400).send({ err: "playlist does not exist. " });

      if (!userId || !isValidObjectId(userId))
        return res.status(400).send({ err: "invaild user id. " });
      if (folderId && !isValidObjectId(folderId))
        return res.status(400).send({ err: "invalid folder id. " });

      if (!(publicLevel === 1 || publicLevel === 2 || publicLevel === 3))
        return res
          .status(400)
          .send({ err: "publicLevel must be a 1-3 integer. " });

      let promises = Promise.all([User.findOne({ _id: userId })]);
      if (folderId)
        promises = Promise.all([
          promises,
          Folder.findOne({ _id: folderId, user: userId }),
        ]);
      else
        promises = Promise.all([
          promises,
          Folder.findOne({ user: userId, publicLevel: 0 }),
        ]);

      const [user, folder] = await promises;
      if (!user) return res.status(400).send({ err: "user does not exist. " });
      if (!folder)
        return res
          .status(400)
          .send({ err: "folder does not exist, or not owned by user. " });

      if (
        // 내 플리가 아닌 플리를 복사할 때, publicLevel이 1이면 권한 없음
        originPlaylist.publicLevel === 1 &&
        originPlaylist.user.toString() !== userId
      )
        return res.status(400).send({ err: "playlist disabled for coyping. " });

      // 새 플리 생성
      const newPlaylist = new Playlist({
        name: originPlaylist.name,
        tags: originPlaylist.tags,
        duration: originPlaylist.duration,
        user: userId,
      });
      if (originPlaylist.youtubeId)
        newPlaylist.youtubeId = originPlaylist.youtubeId;
      if (originPlaylist.successNotification)
        newPlaylist.successNotification = originPlaylist.successNotification;
      if (originPlaylist.failNotification)
        newPlaylist.failNotification = originPlaylist.failNotification;

      // 영상에 정보 추가
      const willInsertedVideos = [];
      videos.forEach((video) => {
        video.folder._id = folder._id;
        video.folder.name = folder.name;
        video.folder.publicLevel = folder.publicLevel;
        video.user = userId;
        if (!video.isExisted) willInsertedVideos.push(video);
      });

      // 폴더와 새 플리에 영상들 넣어주기
      newPlaylist.videos = videos;
      folder.videos.push(...willInsertedVideos);

      const [countedOriginPlaylist] = await Promise.all([
        Playlist.updateOne(
          { _id: originPlaylistId, user: { $ne: userId } },
          { $inc: { sharedCount: 1 } }
        ),
        newPlaylist.save(),
        Video.insertMany(willInsertedVideos),
        folder.save(),
      ]);

      res.send({
        success: true,
        playlist: newPlaylist,
        insertedVideoNum: willInsertedVideos.length,
        isSharedWithOther: countedOriginPlaylist.matchedCount ? true : false,
      });
    } catch (err) {
      return res.status(400).send({ err: err.message });
    }
  }
);

module.exports = { playlistRouter };
