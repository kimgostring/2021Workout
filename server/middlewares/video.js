const { isValidObjectId } = require("mongoose");
const { Video, Folder, Playlist } = require("../models");

const mkVideoFromVideoId = async (req, res, next) => {
  try {
    // 미들웨어 사용된 곳에 따라 다른 컬렉션의 문서 id 주게 됨,
    // 변수명에 따라 각 문서와 관련된 Video 문서들 전부 찾아 리턴
    const { videoId } = req.params;
    if (!videoId || !isValidObjectId(videoId))
      return res.status(400).send({ err: "invalid video id. " });

    const originVideo = await Video.findOne({ _id: videoId });
    if (!originVideo)
      return res.status(400).send({ err: "video does not exist. " });

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

const mkVideosFromVideoSetId = async (req, res, next) => {
  try {
    // 미들웨어 사용된 곳에 따라 다른 컬렉션의 문서 id 주게 됨,
    // 변수명에 따라 각 문서와 관련된 Video 문서들 전부 찾아 리턴
    const { folderId, playlistId } = req.params;
    if (!folderId && !playlistId)
      return res.status(400).send({ err: "at least one set id is required. " });

    if (folderId && !isValidObjectId(folderId))
      return res.status(400).send({ err: "invaild folder id. " });
    if (playlistId && !isValidObjectId(playlistId))
      return res.status(400).send({ err: "invaild playlist id. " });

    let videoSetName = null,
      videos = [],
      originVideos = [];

    if (folderId) {
      const folder = await Folder.findOne({ _id: folderId });
      if (!folder)
        return res.status(400).send({ err: "folder does not exist. " });
      req.folder = folder;
      videoSetName = folder.name;

      originVideos = await Promise.all(
        folder.videos.map((video) => {
          return Video.findOne({ _id: video._id, user: folder.user });
        })
      );
    } else if (playlistId) {
      const playlist = await Playlist.findOne({ _id: playlistId });
      if (!playlist)
        return res.status(400).send({ err: "playlist does not exist. " });
      req.playlist = playlist;
      videoSetName = playlist.name;

      originVideos = await Promise.all(
        playlist.videos.map((video) => {
          return Video.findOne({ _id: video._id, user: playlist.user });
        })
      );
      originVideos.forEach((video, index) => {
        if (playlist.videos[index].start !== undefined)
          video.start = playlist.videos[index].start;
        if (playlist.videos[index].end !== undefined)
          video.end = playlist.videos[index].end;
      });
    }

    // 각 video가 제대로 불려와졌는지 확인
    if (!originVideos.every((originVideo) => isValidObjectId(originVideo._id)))
      return res.status(400).send({ err: "invalid video. " });

    // 불러온 video를 토대로 새 video 생성
    videos = originVideos.map((originVideo) => {
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

    req.videos = videos;
    req.videoSetName = videoSetName;
    req.originVideos = originVideos;
    next();
  } catch (err) {
    return res.status(400).send({ err: err.message });
  }
};

// 이미 저장된 비디오인지 확인하는 미들웨어
const checkExistedVideos = async (req, res, next) => {
  try {
    let { video, videos, playlist } = req;
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
    }
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
          if (playlist) {
            // playlist에 영상 추가하는 작업일 경우, 플리의 start, end 정보 따라야 함
            if (videos[index].start !== undefined)
              userVideo.start = videos[index].start;
            if (videos[index].end !== undefined)
              userVideo.end = videos[index].end;
          }
          videos[index] = userVideo;
        }
      });
    }

    req.video = video;
    req.videos = videos;
    next();
  } catch (err) {
    return res.status(400).send({ err: err.message });
  }
};

module.exports = {
  mkVideoFromVideoId,
  mkVideosFromVideoSetId,
  checkExistedVideos,
};
