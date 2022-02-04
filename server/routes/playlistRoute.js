const { Router } = require("express");
const { isValidObjectId } = require("mongoose");
const { Playlist, Folder, User } = require("../models");
const {
  mkVideosFromYoutubePlaylistId,
  mkRoutinesFromYoutubePlaylistIds,
  mkRoutinesFromPlaylistId,
  checkExistedVideos,
  checkPlaylistValidation,
  mkValidRoutines,
  mkOrFindFolder,
  mkPromisesThatSaveVideos,
} = require("../middlewares");

const playlistRouter = Router();

// 전체 playlist 읽기
playlistRouter.get("/", async (req, res) => {
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
        case "ascDuration": // 플리길이순
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

    const playlists = await Playlist.find(keyword).sort(sort);

    res.send({ success: true, playlists });
  } catch (err) {
    return res.status(400).send({ err: err.message });
  }
});

// playlist 생성
playlistRouter.post(
  "/",
  (req, res, next) => {
    try {
      const { youtubePlaylistIds, title } = req.body;

      if (title === undefined)
        return res.status(400).send({ err: "title is required. " });

      // 기존 보유 영상으로부터 플리 만드는 경우
      if (!Array.isArray(youtubePlaylistIds)) next("route");
      // youtubePlaylistId로부터 플리 만드는 경우
      else next();
    } catch (err) {
      return res.status(400).send({ err: err.message });
    }
  },
  mkRoutinesFromYoutubePlaylistIds,
  checkExistedVideos,
  mkOrFindFolder,
  mkPromisesThatSaveVideos,
  mkValidRoutines,
  (req, res, next) => {
    next("route");
  }
);

// youtubePlaylistIds로 영상 저장 이후 플리 생성, 확인, 저장
// 또는 기존 영상으로 플리 생성, 확인, 저장
playlistRouter.post(
  "/",
  async (req, res, next) => {
    try {
      const { userId } = req.body;

      // id 확인
      if (!userId || !isValidObjectId(userId))
        return res.status(400).send({ err: "invalid user id. " });

      const user = await User.findOne({ _id: userId });
      if (!user) return res.status(404).send({ err: "user does not exist. " });

      const playlist = new Playlist({ user: userId });

      req.playlist = playlist;

      next();
    } catch (err) {
      return res.status(400).send({ err: err.message });
    }
  },
  checkPlaylistValidation,
  async (req, res) => {
    try {
      const { promises = null, playlist, folder, resObj = {} } = req;
      const { folderId } = req.body;

      if (folderId || resObj.pushedVideoNum > 0) {
        playlist.folder = folder._id;
        resObj.folder = folder;
      }

      await Promise.all([promises, playlist.save()]);

      return res.send({ success: true, playlist, ...resObj });
    } catch (err) {
      return res.status(400).send({ err: err.message });
    }
  }
);

// 특정 playlist 읽기
playlistRouter.get("/:playlistId", async (req, res) => {
  try {
    const { playlistId } = req.params;
    const { userId } = req.body;

    if (!isValidObjectId(playlistId))
      return res.status(400).send({ err: "invalid playlist id. " });
    if (!userId || !isValidObjectId(userId))
      return res.status(400).send({ err: "invalid user id. " });

    const playlist = await Playlist.findOne({ _id: playlistId });
    if (!playlist)
      return res.status(404).send({ err: "playlist does not exist. " });

    if (playlist.publicLevel === 1 && playlist.user.toString() !== userId)
      return res
        .status(403)
        .send({ err: "this playlist is disabled for reading. " });

    res.send({ success: true, playlist });
  } catch (err) {
    return res.status(400).send({ err: err.message });
  }
});

// playlist 수정
playlistRouter.patch(
  "/:playlistId",
  async (req, res, next) => {
    try {
      const { playlistId } = req.params;
      const {
        folderId,
        title,
        publicLevel,
        tags,
        routines,
        successNotification,
        failNotification,
      } = req.body;

      if (!isValidObjectId(playlistId))
        return res.status(400).send({ err: "invaild playlist id. " });

      // 수정사항 없는 경우
      if (
        folderId === undefined &&
        title === undefined &&
        publicLevel === undefined &&
        tags === undefined &&
        routines === undefined &&
        successNotification === undefined &&
        failNotification === undefined
      )
        return res
          .status(400)
          .send({ err: "at least one of information must be required. " });

      if (folderId && !isValidObjectId(folderId))
        return res.status(400).send({ err: "invaild folder id. " });

      let promises = null;
      if (folderId)
        promises = Promise.all([
          Playlist.findOne({ _id: playlistId }),
          Folder.findOne({ _id: folderId }),
          promises,
        ]);
      else
        promises = Promise.all([
          Playlist.findOne({ _id: playlistId }),
          promises,
        ]);

      const [playlist, folder] = await promises;

      if (!playlist)
        return res.status(404).send({ err: "playlist does not exist. " });
      if (folderId && isValidObjectId(folderId) && !folder)
        return res.status(404).send({ err: "folder does not exist. " });

      req.playlist = playlist;
      req.folder = folder;

      next();
    } catch (err) {
      return res.status(400).send({ err: err.message });
    }
  },
  checkPlaylistValidation,
  async (req, res) => {
    try {
      const { playlist } = req;

      // *** 미래의 days 함께 변해야 함
      await playlist.save();

      res.send({ success: true, playlist });
    } catch (err) {
      return res.status(400).send({ err: err.message });
    }
  }
);

// playlist 삭제
playlistRouter.delete("/:playlistId", async (req, res) => {
  try {
    const { playlistId } = req.params;

    if (!isValidObjectId(playlistId))
      return res.status(400).send({ err: "invaild playlist id. " });

    // *** 삭제하려면 playlist 및 미래 day에 존재하면 안 됨
    const playlist = await Playlist.findOne({ _id: playlistId });
    if (!playlist)
      return res.status(404).send({ err: "playlist does not exist. " });

    await playlist.deleteOne();

    res.send({ success: true, playlist });
  } catch (err) {
    return res.status(400).send({ err: err.message });
  }
});

// 플리 북마크 토글, controller resource
playlistRouter.post("/:playlistId/toggleBookmark", async (req, res) => {
  try {
    const { playlistId } = req.params;

    if (!isValidObjectId(playlistId))
      return res.status(400).send({ err: "invalid playlist id. " });

    let playlist = await Playlist.findOne({ _id: playlistId });
    if (!playlist)
      return res.status(404).send({ err: "playlist does not exist. " });

    playlist = await Playlist.findOneAndUpdate(
      { _id: playlistId },
      { bookmark: !playlist.bookmark },
      { new: true }
    );

    res.send({ success: true, playlist, isBookmark: playlist.bookmark });
  } catch (err) {
    return res.status(400).send({ err: err.message });
  }
});

// 플리 복사하기, controller resource
playlistRouter.post(
  "/:playlistId/copy",
  mkRoutinesFromPlaylistId,
  checkExistedVideos,
  async (req, res, next) => {
    try {
      const { originPlaylist } = req;
      const {
        userId,
        title,
        publicLevel = 1,
        willMoveExistedVideos = false,
      } = req.body;

      if (!userId || !isValidObjectId(userId))
        return res.status(400).send({ err: "invaild user id. " });

      const user = await User.findOne({ _id: userId });
      if (!user) return res.status(404).send({ err: "user does not exist. " });

      if (
        title !== undefined &&
        (typeof title !== "string" || title.length <= 0)
      )
        return res.status(400).send({ err: "title must be a string. " });
      if (title === undefined) req.playlistTitle = originPlaylist.title;

      if (!(publicLevel === 1 || publicLevel === 2 || publicLevel === 3))
        return res.status(400).send({ err: "publicLevel must be 1, 2 or 3. " });

      // 같은 플리를 변형해서 살짝만 다르게 만들 수 있음,
      // 폴더와 달리 자신의 플리 복사는 OK
      if (
        originPlaylist.publicLevel <= 1 &&
        originPlaylist.user.toString() !== userId
      )
        return res
          .status(403)
          .send({ err: "this playlist is disabled for coyping. " });

      // 본인 플리이고 willMoveExistedVideos === false인 경우, 새 폴더 생성 또는 기존 폴더 찾을 필요 없음
      if (!willMoveExistedVideos && originPlaylist.user.toString() === userId)
        next("route");
      // 본인 플리가 아니거나 특정 폴더로 플리의 영상들 모두 옮기는 경우, 영상 저장 준비
      else next();
    } catch (err) {
      return res.status(400).send({ err: err.message });
    }
  },
  mkOrFindFolder,
  mkPromisesThatSaveVideos,
  mkValidRoutines,
  async (req, res) => {
    try {
      const { promises, playlistTitle, routines, folder, resObj } = req;
      const { folderId, userId, title, publicLevel = 1 } = req.body;

      const playlist = new Playlist({
        title: title ? title : playlistTitle,
        user: userId,
        publicLevel,
        routines,
      });

      if (folderId || resObj.pushedVideoNum > 0) {
        playlist.folder = folder._id;
        resObj.folder = folder;
      }

      await Promise.all([promises, playlist.save()]);

      res.send({ success: true, playlist, ...resObj });
    } catch (err) {
      return res.status(400).send({ err: err.message });
    }
  }
);

// 본인 플리이고 willMoveExistedVideos === false인 경우 (새 폴더 생성 또는 기존 폴더 찾을 필요 없음)
playlistRouter.post("/:playlistId/copy", async (req, res) => {
  try {
    const { originPlaylist } = req;
    const { userId, publicLevel = 1 } = req.body;

    const playlist = new Playlist({
      title: originPlaylist.title,
      user: userId,
      publicLevel,
      tags: originPlaylist.tags,
      duration: originPlaylist.duration,
      routines: originPlaylist.routines,
      successNotification: originPlaylist.successNotification,
      failNotification: originPlaylist.failNotification,
    });
    if (originPlaylist.folder) playlist.folder = originPlaylist.folder;

    await playlist.save();

    return res.send({ success: true, playlist });
  } catch (err) {
    return res.status(400).send({ err: err.message });
  }
});

// PlayInfo 초기화, controller resource
playlistRouter.post("/:playlistId/initPlayInfo", async (req, res) => {
  try {
    const { playlistId } = req.params;

    if (!isValidObjectId(playlistId))
      return res.status(400).send({ err: "invaild playlist id. " });

    let playlist = await Playlist.findOne({ _id: playlistId });
    if (!playlist)
      return res.status(404).send({ err: "playlist does not exist. " });

    playlist = await Playlist.findOneAndUpdate(
      { _id: playlistId },
      {
        "playInfo.successCount": 0,
        "playInfo.playedCount": 0,
        $unset: { "playInfo.avgStar": "" },
      },
      { new: true }
    );

    res.send({ success: true, playlist });
  } catch (err) {
    return res.status(400).send({ err: err.message });
  }
});

// youtube playlist와 동기화 (routines에 있는 youtubeId 이용해 일치시키기), controller resource
playlistRouter.post(
  "/:playlistId/sync",
  async (req, res, next) => {
    try {
      const { playlistId } = req.params;
      const { syncIndex } = req.body;

      if (!isValidObjectId(playlistId))
        return res.status(400).send({ err: "invalid playlist id. " });

      const playlist = await Playlist.findOne({ _id: playlistId });
      if (!playlist)
        return res.status(404).send({ err: "playlist does not exist. " });

      // syncIndex 검사
      if (
        syncIndex !== undefined &&
        (!Number.isInteger(syncIndex) ||
          syncIndex < 0 ||
          syncIndex >= playlist.routines.length)
      )
        return res.status(400).send({
          err: "snyc index must be signed integer smaller than routines length. ",
        });

      // 동기화 시킬 youtube playlist id가 없는 경우, 작업 종료
      if (
        playlist.routines.every((routine) => !routine.youtubeId) ||
        (syncIndex !== undefined && !playlist.routines[syncIndex].youtubeId)
      )
        res.send({ success: true, playlist });

      req.playlist = playlist;

      if (playlist.folder) req.folderId = playlist.folder._id;
      req.playlistTitle = playlist.title;

      if (syncIndex !== undefined) {
        // 인덱스 있는 경우, 하나의 routine만을 동기화
        req.youtubePlaylistId = playlist.routines[syncIndex].youtubeId;

        next("route");
      } else {
        // 인덱스 없는 경우
        req.youtubePlaylistIds = playlist.routines.map(
          (routine) => routine.youtubeId
        );

        next();
      }
    } catch (err) {
      return res.status(400).send({ err: err.message });
    }
  },
  mkRoutinesFromYoutubePlaylistIds,
  checkExistedVideos,
  mkOrFindFolder,
  mkPromisesThatSaveVideos,
  mkValidRoutines,
  (req, res, next) => {
    try {
      let { playlist, routines } = req;

      routines = playlist.routines.map((playlistRoutine, ind) => {
        // youtubeId가 있는 routine의 경우, 유튜브 API로 불러온 routine 그대로 저장
        if (playlistRoutine.youtubeId) return routines[ind];
        // youtubeId가 없는 routine의 경우, 플리에 저장되어 있던 기존 routine으로 대체 (플리 변경사항 없음)
        return playlistRoutine;
      });

      req.routines = routines;

      next();
    } catch (err) {
      return res.status(400).send({ err: err.message });
    }
  },
  checkPlaylistValidation,
  async (req, res) => {
    try {
      const { promises = null, playlist, folder, resObj = {} } = req;

      if (resObj.pushedVideoNum > 0) {
        playlist.folder = folder._id;
        resObj.folder = folder;
      }

      await Promise.all([promises, playlist.save()]);

      return res.send({ success: true, playlist, ...resObj });
    } catch (err) {
      return res.status(400).send({ err: err.message });
    }
  }
);

// 인덱스 있는 경우, 하나의 routine만을 동기화
playlistRouter.post(
  "/:playlistId/sync",
  mkVideosFromYoutubePlaylistId,
  checkExistedVideos,
  mkOrFindFolder,
  mkPromisesThatSaveVideos,
  (req, res, next) => {
    try {
      const { syncIndex } = req.body;
      let { playlist, youtubePlaylistId, videos } = req;

      const routines = playlist.routines.map((playlistRoutine, ind) => {
        if (ind === syncIndex) return { youtubeId: youtubePlaylistId, videos };
        return playlistRoutine;
      });

      req.routines = routines;

      next();
    } catch (err) {
      return res.status(400).send({ err: err.message });
    }
  },
  checkPlaylistValidation,
  async (req, res) => {
    try {
      const { promises = null, playlist, folder, resObj = {} } = req;

      if (resObj.pushedVideoNum > 0) {
        playlist.folder = folder._id;
        resObj.folder = folder;
      }

      await Promise.all([promises, playlist.save()]);

      return res.send({ success: true, playlist, ...resObj });
    } catch (err) {
      return res.status(400).send({ err: err.message });
    }
  }
);

module.exports = { playlistRouter };
