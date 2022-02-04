const axios = require("axios");
const moment = require("moment");
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

      // title, duration, thumbnail
      const { title } = videoFromYoutube.snippet;
      const originDuration = moment
        .duration(videoFromYoutube.contentDetails.duration)
        .asSeconds();
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
    return res.status(404).send({
      err: "invalid youtube id, or private youtube data, or already deleted data. ",
    });
  }
};

// 내부 구현 함수
// 미들웨어에서 호출에서 사용하기 위함
const _mkVideosFromYoutubePlaylistId = async (youtubePlaylistId) => {
  try {
    const { YOUTUBE_URI, YOUTUBE_KEY } = process.env;

    let videos = [],
      youtubePlaylistTitle;
    if (youtubePlaylistId) {
      const maxVideoNum = 50;
      let count = 1,
        totalVideoNum,
        nextPageToken;

      // 1. playlistId로부터 playlistInfo, videos 불러오기
      let [videosFromYoutube, playlistFromYoutube] = await Promise.all([
        axios
          .get(
            `${YOUTUBE_URI}/playlistItems?key=${YOUTUBE_KEY}&part=snippet,contentDetails&maxResults=${maxVideoNum}&playlistId=${youtubePlaylistId}`
          )
          .then((res) => {
            totalVideoNum = res.data.pageInfo.totalResults;
            nextPageToken = res.data.nextPageToken;

            return res.data.items;
          }),
        axios
          .get(
            `${YOUTUBE_URI}/playlists?key=${YOUTUBE_KEY}&part=snippet,contentDetails&id=${youtubePlaylistId}`
          )
          .then((res) => res.data.items[0]),
      ]);

      // youtube playlist에 50개 이상의 영상 존재하는 경우, 추가적인 호출 필요
      while (maxVideoNum * count < totalVideoNum) {
        videosFromYoutube = await axios
          .get(
            `${YOUTUBE_URI}/playlistItems?key=${YOUTUBE_KEY}&part=snippet,contentDetails&maxResults=${maxVideoNum}&playlistId=${youtubePlaylistId}&pageToken=${nextPageToken}`
          )
          .then((res) => {
            nextPageToken = res.data.nextPageToken;
            return [...videosFromYoutube, ...res.data.items];
          });

        count++;
      }

      // 2. 필요한 정보만 얻어오기
      // 플리 이름 빼오기
      youtubePlaylistTitle = playlistFromYoutube.snippet.title;

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
              videoInfo.originDuration = moment
                .duration(res.data.items[0].contentDetails.duration)
                .asSeconds();
              videoInfo.duration = videoInfo.originDuration;
            });
        })
      );

      // 4. Video 객체 생성
      videos = videoInfos.map((videoInfo) => new Video(videoInfo));
    }

    return { videos, youtubePlaylistTitle };
  } catch (err) {
    return res.status(404).send({
      err: "invalid youtube id, or private youtube data, or already deleted data. ",
    });
  }
};

// playlistId로부터 정보 얻어와 video 문서 배열 만들어 제공해주는 미들웨어
const mkVideosFromYoutubePlaylistId = async (req, res, next) => {
  try {
    let { youtubePlaylistId } = req.body;
    if (!youtubePlaylistId) ({ youtubePlaylistId } = req);

    const { videos, youtubePlaylistTitle } =
      await _mkVideosFromYoutubePlaylistId(youtubePlaylistId);

    req.videos = videos;
    req.youtubePlaylistTitle = youtubePlaylistTitle;

    next();
  } catch (err) {
    return res.status(400).send({ err: err.message });
  }
};

const mkRoutinesFromYoutubePlaylistIds = async (req, res, next) => {
  try {
    let { youtubePlaylistIds } = req.body;
    if (!youtubePlaylistIds) ({ youtubePlaylistIds } = req);

    let routines = [],
      videos = [];

    if (Array.isArray(youtubePlaylistIds) && youtubePlaylistIds.length > 0) {
      routines = await Promise.all(
        youtubePlaylistIds.map((id) => _mkVideosFromYoutubePlaylistId(id))
      );

      routines = routines.map((routine, ind) => {
        videos = [...videos, ...routine.videos];

        return { youtubeId: youtubePlaylistIds[ind], ...routine };
      });
    }

    req.routines = routines;
    req.videos = videos;

    next();
  } catch (err) {
    return res.status(404).send({
      err: "invalid youtube id, or private youtube data, or already deleted data. ",
    });
  }
};

module.exports = {
  mkVideoFromYoutubeVideoId,
  mkVideosFromYoutubePlaylistId,
  mkRoutinesFromYoutubePlaylistIds,
};
