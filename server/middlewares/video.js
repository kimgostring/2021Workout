const { isValidObjectId } = require("mongoose");
const { Video, Folder } = require("../models");

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
    const { folderId } = req.params;
    if (!folderId || !isValidObjectId(folderId))
      return res.status(400).send({ err: "invaild folder id. " });

    let videos = [],
      originVideos = [];

    if (folderId) {
      const folder = await Folder.findOne({ _id: folderId });
      if (!folder)
        return res.status(400).send({ err: "folder does not exist. " });
      req.folder = folder;

      originVideos = await Promise.all(
        folder.videos.map((video) => {
          return Video.findOne({ _id: video._id, user: folder.user });
        })
      );
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
    req.originVideos = originVideos;
    next();
  } catch (err) {
    return res.status(400).send({ err: err.message });
  }
};

module.exports = {
  mkVideoFromVideoId,
  mkVideosFromVideoSetId,
};
