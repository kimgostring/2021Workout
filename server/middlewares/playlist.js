const { isValidObjectId } = require("mongoose");
const { Video, Playlist } = require("../models");

const mkRoutinesFromPlaylistId = async (req, res, next) => {
  try {
    // 미들웨어 사용된 곳에 따라 다른 컬렉션의 문서 id 주게 됨,
    // 변수명에 따라 각 문서와 관련된 Video 문서들 전부 찾아 리턴
    const { playlistId } = req.params;

    if (!isValidObjectId(playlistId))
      return res.status(400).send({ err: "invaild playlist id. " });

    const originPlaylist = await Playlist.findOne({ _id: playlistId });
    if (!originPlaylist)
      return res.status(404).send({ err: "playlist does not exist. " });

    // 배열 routines.$.videos을 저장할 배열
    const originVideosList = [];
    let originVideos = [];
    let i, tempVideos;
    // forEach의 경우 바깥에서 await가 제대로 동작하지 않으므로 대신 for 사용
    for (i = 0; i < originPlaylist.routines.length; i++) {
      tempVideos = await Promise.all(
        originPlaylist.routines[i].videos.map((originVideo) => {
          return Video.findOne({
            _id: originVideo._id,
            user: originPlaylist.user,
          });
        })
      );
      tempVideos.forEach((video, videoInd) => {
        video.repeatition =
          originPlaylist.routines[i].videos[videoInd].repeatition;
        if (originPlaylist.routines[i].videos[videoInd].start !== undefined)
          video.start = originPlaylist.routines[i].videos[videoInd].start;
        if (originPlaylist.routines[i].videos[videoInd].end !== undefined)
          video.end = originPlaylist.routines[i][videoInd].end;
      });

      originVideosList[originVideosList.length] = tempVideos;
      originVideos = [...originVideos, ...tempVideos];
    }

    // 각 video가 제대로 불려와졌는지 확인
    if (
      !originVideos.every(
        (originVideo) => originVideo && isValidObjectId(originVideo._id)
      )
    )
      return res
        .status(400)
        .send({ err: "there is an invalid video in this playlist. " });

    // 불러온 video를 토대로 새 video 생성
    const videos = [];

    let tempRoutine;
    const routines = originVideosList.map((originVideos, listInd) => {
      tempRoutine = {};
      if (originPlaylist.routines[listInd].youtubeId)
        tempRoutine.youtubeId = originPlaylist.routines[listInd].youtubeId;

      tempRoutine.videos = originVideos.map((originVideo) => {
        const video = new Video({
          youtubeId: originVideo.youtubeId,
          title: originVideo.title,
          tags: originVideo.tags,
          originDuration: originVideo.originDuration,
          duration: originVideo.duration,
          thumbnail: originVideo.thumbnail,
        });

        videos[videos.length] = video;

        // routines에는 기존 플리의 start, end, repeatition 기록
        if (originVideo.start !== undefined) video.start = originVideo.start;
        if (originVideo.end !== undefined) video.end = originVideo.end;
        video.repeatition = originVideo.repeatition;

        return video;
      });

      return tempRoutine;
    });

    req.videos = videos;
    req.routines = routines;
    req.originPlaylist = originPlaylist;
    req.originVideos = originVideos;

    next();
  } catch (err) {
    return res.status(400).send({ err: err.message });
  }
};

const mkValidRoutines = async (req, res, next) => {
  try {
    let { videos, routines } = req;

    // videos의 isExisted를 routines에 적용,
    // 이미 폴더에 저장된 영상(in videos)의 start, end를
    // 플리에 저장될 영상(in routines)의 start, end로 덮어씌운 뒤
    // routines의 것과 바꿔치기

    let i = 0,
      tempVideo;
    routines = routines.map((routine) => {
      routine.videos = routine.videos.map((video) => {
        tempVideo = video;

        if (videos[i].isExisted) {
          // 이미 해당 영상 기존에 저장하고 있는 경우,
          // 기존 영상에 플리의 start, end, repeatition을 적용한 문서로 바꿔치기
          tempVideo = videos[i];

          if (video.start !== undefined) tempVideo.start = video.start;
          if (video.end !== undefined) tempVideo.end = video.end;
          tempVideo.repeatition = video.repeatition;
        }

        i++;
        return tempVideo;
      });

      return routine;
    });

    req.routines = routines;

    next();
  } catch (err) {
    return res.status(400).send({ err: err.message });
  }
};

const checkPlaylistValidation = (req, res, next) => {
  try {
    const { playlist } = req;
    const {
      userId,
      title,
      publicLevel,
      tags,
      successNotification,
      failNotification,
    } = req.body;

    let { routines } = req.body;
    if (!routines) ({ routines } = req);

    // title 확인
    if (title !== undefined) {
      if (typeof title !== "string" || title.length <= 0)
        return res.status(400).send({ err: "title must be a string. " });
      playlist.title = title;
    }

    // publicLevel 확인
    if (publicLevel !== undefined) {
      if (!(publicLevel === 1 || publicLevel === 2 || publicLevel === 3))
        return res.status(400).send({ err: "publicLevel must be 1, 2 or 3. " });
      playlist.publicLevel = publicLevel;
    }

    // tags 확인
    if (tags !== undefined) {
      if (!Array.isArray(tags))
        return res.status(400).send({ err: "tags must be an array. " });
      if (!tags.every((tag) => typeof tag === "string" && tag.length <= 10))
        return res
          .status(400)
          .send({ err: "each tag must be a string within 10 chars. " });
      playlist.tags = tags;
    }

    // notification 확인
    if (successNotification !== undefined) {
      if (
        typeof successNotification !== "string" ||
        successNotification.length > 50
      )
        return res.status(400).send({
          err: "success notification must be a string within 50 chars. ",
        });
      playlist.successNotification = successNotification;
    }
    if (failNotification !== undefined) {
      if (typeof failNotification !== "string" || failNotification.length > 50)
        return res.status(400).send({
          err: "fail notification must be a string within 50 chars. ",
        });
      playlist.failNotification = failNotification;
    }

    // routines 확인
    if (routines !== undefined) {
      if (!Array.isArray(routines))
        return res.status(400).send({ err: "routines must be an array. " });
      if (
        !routines.every(
          (routine) =>
            typeof routine === "object" &&
            (!routine.youtubeId || typeof routine.youtubeId === "string") &&
            Array.isArray(routine.videos) &&
            routine.videos.length >= 0 &&
            routine.videos.every(
              (video) =>
                isValidObjectId(video._id) &&
                typeof video.youtubeId === "string" &&
                typeof video.title === "string" &&
                (!video.user || video.user.toString() === userId) &&
                Number.isInteger(video.originDuration) &&
                (video.repeatition === undefined ||
                  (Number.isInteger(video.repeatition) &&
                    video.repeatition >= 1)) &&
                Number.isInteger(video.duration) &&
                Number.isInteger(video.originDuration) &&
                typeof video.thumbnail === "string" &&
                (video.start === undefined ||
                  (Number.isInteger(video.start) &&
                    video.start >= 0 &&
                    video.start <= video.originDuration)) &&
                (video.end === undefined ||
                  (Number.isInteger(video.end) &&
                    video.end >= 0 &&
                    video.end <= video.originDuration)) &&
                (video.start === undefined ||
                  video.end === undefined ||
                  video.start < video.end)
            )
        )
      )
        return res.status(400).send({ err: "invalid routines. " });

      // Playlist duration 및 각 Video의 duration 계산
      let duration = 0;
      routines.forEach((routine) => {
        routine.videos.forEach((video) => {
          if (video.start !== undefined && video.end !== undefined)
            video.duration = video.end - video.start;
          else if (video.start !== undefined)
            video.duration = video.originDuration - video.start;
          else if (video.end !== undefined) video.duration = video.end;
          else video.duration = video.originDuration;

          duration +=
            video.duration * (video.repeatition ? video.repeatition : 1);
        });
      });

      playlist.routines = routines;
      playlist.duration = duration;
    }

    req.playlist = playlist;

    next();
  } catch (err) {
    return res.status(400).send({ err: err.message });
  }
};

module.exports = {
  mkRoutinesFromPlaylistId,
  mkValidRoutines,
  checkPlaylistValidation,
};
