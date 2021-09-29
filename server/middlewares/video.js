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
const checkExistedVideos = async (req, res, next) => {
  try {
    let { video, videos, days } = req;
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
          videos[index] = userVideo;
        }
      });
    }

    if (Array.isArray(days) && days.length !== 0) {
      const userDays = [];
      let i, userDay;
      for (i = 0; i < days.length; i++) {
        userDay = await Promise.all(
          days[i].map((video) => {
            return Video.findOne({ user: userId, youtubeId: video.youtubeId });
          })
        );
        userDays.push(userDay);
      }
      // DB에서 video 불려와진 경우, 해당 인덱스에 끼워넣기
      userDays.forEach((userDay, dayIndex) => {
        userDay.forEach((userVideo, videoIndex) => {
          if (userVideo) {
            userVideo.isExisted = true;

            // 원본 playlist에서 설정된 start, end 있는 경우 적용
            if (days[dayIndex][videoIndex].start !== undefined)
              userVideo.start = days[dayIndex][videoIndex].start;
            if (days[dayIndex][videoIndex].end !== undefined)
              userVideo.end = days[dayIndex][videoIndex].end;

            days[dayIndex][videoIndex] = userVideo;
          }
        });
      });
    }

    req.video = video;
    req.videos = videos;
    req.days = days;
    next();
  } catch (err) {
    return res.status(400).send({ err: err.message });
  }
};

module.exports = {
  mkVideoFromVideoId,
  mkVideosFromFolderId,
  mkVideosFromPlaylistId,
  checkExistedVideos,
};
