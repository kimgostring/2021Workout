const { isValidObjectId } = require("mongoose");
const { Video, Folder } = require("../models");

const mkVideosFromFolderId = async (req, res, next) => {
  try {
    // 미들웨어 사용된 곳에 따라 다른 컬렉션의 문서 id 주게 됨,
    // 변수명에 따라 각 문서와 관련된 Video 문서들 전부 찾아 리턴
    const { folderId } = req.params;

    if (!isValidObjectId(folderId))
      return res.status(400).send({ err: "invaild folder id. " });

    const originFolder = await Folder.findOne({ _id: folderId });
    if (!originFolder)
      return res.status(404).send({ err: "folder does not exist. " });

    const originVideos = await Promise.all(
      originFolder.videos.map((originVideo) => {
        return Video.findOne({ _id: originVideo._id, user: originFolder.user });
      })
    );

    // 각 video가 제대로 불려와졌는지 확인
    if (
      !originVideos.every(
        (originVideo) => originVideo && isValidObjectId(originVideo._id)
      )
    )
      return res
        .status(404)
        .send({ err: "there is an invalid video in this folder. " });

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

    req.videos = videos;
    req.originFolder = originFolder;
    req.originVideos = originVideos;

    next();
  } catch (err) {
    return res.status(400).send({ err: err.message });
  }
};

module.exports = {
  mkVideosFromFolderId,
};
