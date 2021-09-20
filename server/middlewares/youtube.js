const axios = require("axios");
const { Video } = require("../models");

// videoId로부터 정보 얻어와 video 문서 만들어 제공해주는 미들웨어
const mkVideoFromYoutubeVideoId = async (req, res, next) => {
  try {
    const { YOUTUBE_URI, YOUTUBE_KEY } = process.env;
    const { youtubeVideoId } = req.body;

    let video = null;
    if (youtubeVideoId) {
      const videoFromYoutube = await axios // youtube 영상 정보 가져오기 - title, duration, thumbnail
        .get(
          `${YOUTUBE_URI}/videos?key=${YOUTUBE_KEY}&part=snippet,contentDetails&id=${youtubeVideoId}`
        )
        .then((res) => res.data.items[0]);
      if (!videoFromYoutube)
        return res.status(400).send({ err: "invalid youtube video id. " });

      // title, duration, thumbnail
      if (!videoFromYoutube)
        return res.status(400).send({ err: "invalid youtube video id. " });
      const { title } = videoFromYoutube.snippet;
      const originDuration = videoFromYoutube.contentDetails.duration;
      const thumbnail = videoFromYoutube.snippet.thumbnails.medium.url;

      video = new Video({
        youtubeId: youtubeVideoId,
        title,
        originDuration,
        duration: originDuration,
        thumbnail,
      });
    }
    req.video = video;
    next();
  } catch (err) {
    return res.status(400).send({ err: err.message });
  }
};

// playlistId로부터 정보 얻어와 video 문서 배열 만들어 제공해주는 미들웨어
const mkVideosFromYoutubePlaylistId = async (req, res, next) => {
  try {
    const { YOUTUBE_URI, YOUTUBE_KEY } = process.env;
    const { youtubePlaylistId } = req.body;

    let youtubePlaylistName = null;
    let videos = [];
    if (youtubePlaylistId) {
      // 1. playlistId로부터 playlistInfo, videos 불러오기
      const [videosFromYoutube, playlistFromYoutube] = await Promise.all([
        axios
          .get(
            `${YOUTUBE_URI}/playlistItems?key=${YOUTUBE_KEY}&part=snippet,contentDetails&playlistId=${youtubePlaylistId}`
          )
          .then((res) => res.data.items),
        axios
          .get(
            `${YOUTUBE_URI}/playlists?key=${YOUTUBE_KEY}&part=snippet,contentDetails&id=${youtubePlaylistId}`
          )
          .then((res) => res.data.items[0]),
      ]);
      // playlist 존재 확인
      if (!playlistFromYoutube)
        return res.status(400).send({ err: "invalid youtube playlist id. " });

      // 2. 필요한 정보만 얻어오기
      // 플리 이름 빼오기
      youtubePlaylistName = playlistFromYoutube.snippet.title;
      // playlist의 items에 저장된 video 리스트에서 필요한 것만 빼내 저장
      const videoInfos = videosFromYoutube.map((videoFromYoutube) => {
        const { videoId, start, end } = videoFromYoutube.contentDetails;
        const { title } = videoFromYoutube.snippet;
        const thumbnail = videoFromYoutube.snippet.thumbnails.medium.url;

        const videoInfo = {
          youtubeId: videoId,
          title,
          thumbnail,
        };
        if (start) videoInfo.start = Number(start);
        if (end) videoInfo.end = Number(end);

        return videoInfo;
      });

      // 3. 얻어온 video id로 youtube에서 영상 duration 찾아 삽입
      await Promise.all(
        videoInfos.map((videoInfo) => {
          return axios
            .get(
              `${YOUTUBE_URI}/videos?key=${YOUTUBE_KEY}&part=snippet,contentDetails&id=${videoInfo.youtubeId}`
            )
            .then((res) => {
              videoInfo.originDuration =
                res.data.items[0].contentDetails.duration;
              videoInfo.duration = videoInfo.originDuration;
            });
        })
      );

      // 4. Video 객체 생성
      videos = videoInfos.map((videoInfo) => new Video(videoInfo));
    }
    req.youtubePlaylistName = youtubePlaylistName;
    req.videos = videos;
    next();
  } catch (err) {
    return res.status(400).send({ err: err.message });
  }
};

module.exports = {
  mkVideoFromYoutubeVideoId,
  mkVideosFromYoutubePlaylistId,
};
