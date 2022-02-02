const { isValidObjectId } = require("mongoose");
const { Video, Playlist } = require("../models");

const mkVideosFromPlaylistId = async (req, res, next) => {
  try {
    // 미들웨어 사용된 곳에 따라 다른 컬렉션의 문서 id 주게 됨,
    // 변수명에 따라 각 문서와 관련된 Video 문서들 전부 찾아 리턴
    const { playlistId } = req.params;

    if (!isValidObjectId(playlistId))
      return res.status(400).send({ err: "invaild playlist id. " });

    const originPlaylist = await Playlist.findOne({ _id: playlistId });
    if (!originPlaylist)
      return res.status(404).send({ err: "playlist does not exist. " });

    const originVideosList = [];
    let i, originVideos;
    // forEach의 경우 바깥에서 await가 제대로 동작하지 않으므로 대신 for 사용
    for (i = 0; i < originPlaylist.videosList.length; i++) {
      originVideos = await Promise.all(
        originPlaylist.videosList[i].map((originVideo) => {
          return Video.findOne({
            _id: originVideo._id,
            user: originPlaylist.user,
          });
        })
      );
      originVideosList[originVideosList.length] = originVideos;
    }

    originVideosList.forEach((originVideos, videosIndex) => {
      originVideos.forEach((originVideo, videoIndex) => {
        if (
          originPlaylist.videosList[videosIndex][videoIndex].start !== undefined
        )
          originVideo.start =
            originPlaylist.videosList[videosIndex][videoIndex].start;
        if (
          originPlaylist.videosList[videosIndex][videoIndex].end !== undefined
        )
          originVideo.end =
            originPlaylist.videosList[videosIndex][videoIndex].end;
      });
    });

    // 각 video가 제대로 불려와졌는지 확인
    if (
      !originVideosList.every((originVideos) =>
        originVideos.every(
          (originVideo) => originVideo && isValidObjectId(originVideo._id)
        )
      )
    )
      return res
        .status(400)
        .send({ err: "there is an invalid video in this playlist. " });

    // 불러온 video를 토대로 새 video 생성
    const videos = [];
    const videosList = originVideosList.map((originVideos) => {
      return originVideos.map((originVideo) => {
        const video = new Video({
          youtubeId: originVideo.youtubeId,
          title: originVideo.title,
          tags: originVideo.tags,
          originDuration: originVideo.originDuration,
          duration: originVideo.duration,
          thumbnail: originVideo.thumbnail,
        });

        videos[videos.length] = video;

        // videosList에는 기존 플리의 start, end, repeatition 기록
        if (originVideo.start !== undefined) video.start = originVideo.start;
        if (originVideo.end !== undefined) video.end = originVideo.end;
        video.repeatition = originVideo.repeatition;

        return video;
      });
    });

    req.videos = videos;
    req.videosList = videosList;
    req.originPlaylist = originPlaylist;
    req.originVideosList = originVideosList;

    next();
  } catch (err) {
    return res.status(400).send({ err: err.message });
  }
};

module.exports = {
  mkVideosFromPlaylistId,
};
