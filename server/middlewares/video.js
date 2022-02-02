const { isValidObjectId } = require("mongoose");
const { Video, Folder, Playlist } = require("../models");

const mkVideoFromVideoId = async (req, res, next) => {
  try {
    // 미들웨어 사용된 곳에 따라 다른 컬렉션의 문서 id 주게 됨,
    // 변수명에 따라 각 문서와 관련된 Video 문서들 전부 찾아 리턴
    const { videoId } = req.params;

    if (!isValidObjectId(videoId))
      return res.status(400).send({ err: "invalid video id. " });

    const originVideo = await Video.findOne({ _id: videoId });
    if (!originVideo)
      return res.status(404).send({ err: "video does not exist. " });

    const video = new Video({
      title: originVideo.title,
      youtubeId: originVideo.youtubeId,
      thumbnail: originVideo.thumbnail,
      originDuration: originVideo.originDuration,
      duration: originVideo.duration,
      tags: originVideo.tags,
    });
    if (originVideo.start !== undefined) video.start = originVideo.start;
    if (originVideo.end !== undefined) video.end = originVideo.end;

    req.video = video;
    req.originVideo = originVideo;

    next();
  } catch (err) {
    return res.status(400).send({ err: err.message });
  }
};

const mkVideosFromFolderId = async (req, res, next) => {
  try {
    // 미들웨어 사용된 곳에 따라 다른 컬렉션의 문서 id 주게 됨,
    // 변수명에 따라 각 문서와 관련된 Video 문서들 전부 찾아 리턴
    const { folderId } = req.params;
    if (!folderId || !isValidObjectId(folderId))
      return res.status(400).send({ err: "invaild folder id. " });

    const originFolder = await Folder.findOne({ _id: folderId });
    if (!originFolder)
      return res.status(400).send({ err: "folder does not exist. " });

    const originVideos = await Promise.all(
      originFolder.videos.map((video) => {
        return Video.findOne({ _id: video._id, user: originFolder.user });
      })
    );

    // 각 video가 제대로 불려와졌는지 확인
    if (!originVideos.every((originVideo) => isValidObjectId(originVideo._id)))
      return res.status(400).send({ err: "invalid video. " });

    // 불러온 video를 토대로 새 video 생성
    const videos = originVideos.map((originVideo) => {
      const video = new Video({
        youtubeId: originVideo.youtubeId,
        title: originVideo.title,
        tags: originVideo.tags,
        originDuration: originVideo.originDuration,
        duration: originVideo.duration,
        thumbnail: originVideo.thumbnail,
      });
      if (originVideo.start !== undefined) video.start = originVideo.start;
      if (originVideo.end !== undefined) video.end = originVideo.end;

      return video;
    });

    req.originFolder = originFolder;
    req.videos = videos;
    req.originVideos = originVideos;
    next();
  } catch (err) {
    return res.status(400).send({ err: err.message });
  }
};

const mkVideosFromPlaylistId = async (req, res, next) => {
  try {
    // 미들웨어 사용된 곳에 따라 다른 컬렉션의 문서 id 주게 됨,
    // 변수명에 따라 각 문서와 관련된 Video 문서들 전부 찾아 리턴
    const { playlistId } = req.params;
    if (!playlistId || !isValidObjectId(playlistId))
      return res.status(400).send({ err: "invaild playlist id. " });

    const originPlaylist = await Playlist.findOne({ _id: playlistId });
    if (!originPlaylist)
      return res.status(400).send({ err: "playlist does not exist. " });

    const originDays = [];
    let i, originDay;
    // forEach의 경우 바깥에서 await가 제대로 동작하지 않으므로 대신 for 사용
    for (i = 0; i < originPlaylist.days.length; i++) {
      originDay = await Promise.all(
        originPlaylist.days[i].map((video) => {
          return Video.findOne({ _id: video._id, user: originPlaylist.user });
        })
      );
      originDays.push(originDay);
    }

    originDays.forEach((originDay, dayIndex) => {
      originDay.forEach((video, videoIndex) => {
        if (originPlaylist.days[dayIndex][videoIndex].start !== undefined)
          video.start = originPlaylist.days[dayIndex][videoIndex].start;
        if (originPlaylist.days[dayIndex][videoIndex].end !== undefined)
          video.end = originPlaylist.days[dayIndex][videoIndex].end;
      });
    });

    // 각 video가 제대로 불려와졌는지 확인
    if (
      !originDays.every((originDay) =>
        originDay.every((originVideo) => isValidObjectId(originVideo._id))
      )
    )
      return res.status(400).send({ err: "invalid video. " });

    // 불러온 video를 토대로 새 video 생성
    const days = originDays.map((originDay) => {
      return originDay.map((originVideo) => {
        const video = new Video({
          youtubeId: originVideo.youtubeId,
          title: originVideo.title,
          tags: originVideo.tags,
          originDuration: originVideo.originDuration,
          duration: originVideo.duration,
          thumbnail: originVideo.thumbnail,
        });
        if (originVideo.start !== undefined) video.start = originVideo.start;
        if (originVideo.end !== undefined) video.end = originVideo.end;

        return video;
      });
    });

    req.originPlaylist = originPlaylist;
    req.days = days;
    req.originDays = originDays;
    next();
  } catch (err) {
    return res.status(400).send({ err: err.message });
  }
};

// 이미 저장된 비디오인지 확인하는 미들웨어
const checkExistedVideo = async (req, res, next) => {
  try {
    let { video } = req;
    const { userId } = req.body;

    if (!userId || !isValidObjectId(userId))
      return res.status(400).send({ err: "invaild user id." });

    if (video) {
      const userVideo = await Video.findOne({
        user: userId,
        youtubeId: video.youtubeId,
      });
      if (userVideo) {
        userVideo.isExisted = true;
        video = userVideo;
      }

      req.video = video;
    }

    next();
  } catch (err) {
    return res.status(400).send({ err: err.message });
  }
};

const checkExistedVideos = async (req, res, next) => {
  try {
    let { videos } = req;
    const { userId } = req.body;

    if (!userId || !isValidObjectId(userId))
      return res.status(400).send({ err: "invaild user id. " });

    if (Array.isArray(videos) && videos.length !== 0) {
      const userVideos = await Promise.all(
        videos.map((video) => {
          return Video.findOne({ user: userId, youtubeId: video.youtubeId });
        })
      );
      // DB에서 video 불려와진 경우, 해당 인덱스에 끼워넣기
      userVideos.forEach((userVideo, index) => {
        if (userVideo) {
          userVideo.isExisted = true;
          videos[index] = userVideo;
        }
      });

      req.videos = videos;
    }

    next();
  } catch (err) {
    return res.status(400).send({ err: err.message });
  }
};

const checkVideoValidation = (req, res, next) => {
  try {
    const { video } = req;
    let { title, tags, start, end } = req.body;

    // title 확인
    if (title !== undefined) {
      if (typeof title !== "string" || title.length <= 0)
        return res.status(400).send({ err: "title must be a string. " });
      video.title = title;
    }

    // tags 확인
    if (tags !== undefined) {
      if (!Array.isArray(tags))
        return res.status(400).send({ err: "tags must be an array. " });
      if (!tags.every((tag) => typeof tag === "string" && tag.length <= 10))
        return res
          .status(400)
          .send({ err: "each tag must be a string within 10 chars. " });
      video.tags = tags;
    }

    // start, end 확인
    const endSec = video.originDuration;
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
    if (start !== undefined && end !== undefined && start >= end)
      return res.status(400).send({ err: "start must be shorter than end. " });
    if (start !== undefined && start >= endSec)
      return res
        .status(400)
        .send({ err: "start must be shorter than video duration. " });
    if (end !== undefined && end > endSec)
      return res
        .status(400)
        .send({ err: "end must be shorter than or equal to video duration. " });

    // duration 결정
    if (start !== undefined && end !== undefined) video.duration = end - start;
    else if (start !== undefined) video.duration = endSec - start;
    else if (end !== undefined) video.duration = end;
    // 둘 다 정의되지 않은 경우, 변화 없음

    if (start !== undefined) video.start = start;
    if (end !== undefined) video.end = end;

    req.video = video;

    next();
  } catch (err) {
    return res.status(400).send({ err: err.message });
  }
};

// 내부 구현 함수
// saveVideo, saveVideos 미들웨어에서 사용됨
const classifyVideo = ({
  video,
  folder,
  promises,
  willMoveExistedVideo = false,
} = {}) => {
  let isPushed = false,
    isNew = false,
    isMoved = false;

  if (
    video.isExisted &&
    (!willMoveExistedVideo ||
      video.folder._id.toString() === folder._id.toString())
  ) {
    // 원래 폴더에 그래도 놔둠, 변경사항 저장하지 않음
  } else {
    // video 문서에 folder, user 정보 넣기
    const originVideoFolderId = video.folder._id;

    video.folder._id = folder._id;
    video.folder.title = folder.title;
    video.folder.publicLevel = folder.publicLevel;
    video.user = folder.user;

    // video별로 필요한 DB 작업 분류
    if (!video.isExisted) {
      // video가 기존 다른 폴더에 존재하지 않는 경우, 새로 저장
      isPushed = true;
      isNew = true;
    } else if (video.isExisted && willMoveExistedVideo) {
      // 기존에 존재하던 video를 새 folder로 이동하는 경우, 원래 folder에서 pull 필요
      promises = Promise.all([
        promises,
        Folder.updateOne(
          { _id: originVideoFolderId },
          { $pull: { videos: { _id: video._id } } }
        ),
      ]);
      isPushed = true;
      isMoved = true;
    }
  }

  return { promises, isPushed, isNew, isMoved };
};

const mkPromisesThatSaveVideo = (req, res, next) => {
  try {
    const { folder, video } = req;
    const { willMoveExistedVideo = false } = req.body;

    let promises = null,
      isPushed,
      isNew,
      isMoved;

    ({ promises, isPushed, isNew, isMoved } = classifyVideo({
      video,
      folder,
      promises,
      willMoveExistedVideo,
    }));

    if (isPushed) {
      folder.videos[folder.videos.length] = video;

      promises = Promise.all([
        promises, // 원래 folder에서 기존 video pull하는 작업들의 모음
        folder.save(),
        video.save(),
      ]);
    }

    req.promises;
    req.folder;
    req.video;
    req.resObj = {
      isPushed,
      isNew,
      isMoved,
    };

    next();
  } catch (err) {
    return res.status(400).send({ err: err.message });
  }
};

const mkPromisesThatSaveVideos = (req, res, next) => {
  try {
    const { folder, videos } = req;
    const { willMoveExistedVideos = false } = req.body;

    let promises = null,
      isPushed,
      isNew,
      isMoved; // forEach에 쓰일 변수
    const pushedVideos = [], // 생성한 folder에 추가할 video
      newVideos = [], // 새로 생성되어 추가될 video
      movedVideos = []; // 기존 다른 folder에 존재하던 video 중 새 folder로 옮겨올 video

    videos.forEach((video) => {
      ({ promises, isPushed, isNew, isMoved } = classifyVideo({
        video,
        folder,
        promises,
        willMoveExistedVideo: willMoveExistedVideos,
      }));

      if (isPushed) pushedVideos[pushedVideos.length] = video;
      if (isNew) newVideos[newVideos.length] = video;
      if (isMoved) movedVideos[movedVideos.length] = video;
    });
    folder.videos = [...folder.videos, ...pushedVideos];

    promises = Promise.all([
      promises, // 원래 folder에서 기존 video pull하는 작업들의 모음
      folder.save(),
      Video.insertMany(newVideos),
      Video.updateMany(
        { _id: { $in: movedVideos.map((video) => video._id) } },
        { folder }
      ),
    ]);

    req.promises = promises;
    req.folder = folder;
    req.videos = videos;
    req.resObj = {
      pushedVideoNum: pushedVideos.length,
      newVideoNum: newVideos.length,
      movedVideoNum: movedVideos.length,
    };

    next();
  } catch (err) {
    return res.status(400).send({ err: err.message });
  }
};

module.exports = {
  mkVideoFromVideoId,
  mkVideosFromFolderId,
  mkVideosFromPlaylistId,
  checkExistedVideo,
  checkExistedVideos,
  checkVideoValidation,
  mkPromisesThatSaveVideo,
  mkPromisesThatSaveVideos,
};
