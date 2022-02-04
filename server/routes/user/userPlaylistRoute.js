const { Router } = require("express");
const { isValidObjectId } = require("mongoose");
const { Playlist, User } = require("../../models");

const userPlaylistRouter = Router({ mergeParams: true });

// 특정 유저의 플리 불러오기
userPlaylistRouter.get("/", async (req, res) => {
  try {
    let {
      isBookmarked,
      keyword,
      sort = "ascTitle",
      strict = "false",
    } = req.query;
    const { userId } = req.params;

    // userId 확인
    if (!isValidObjectId(userId))
      return res.status(400).send({ err: "invaild user id. " });

    // 북마크 플리만 보여줘야 하는지 - true: 북마크만, false: 둘 다 보여줌
    if (isBookmarked === "true") isBookmarked = { isBookmarked: true };
    else if (!isBookmarked || isBookmarked === "false") isBookmarked = {};
    else return res.status(400).send({ err: "invalid isBookmarked. " });

    if (keyword && isValidObjectId(keyword)) keyword = { _id: keyword };
    else if (keyword && strict === "true")
      // strict 옵션 있을 경우, 입력된 문장과 띄어쓰기까지 완전히 일치하는 것 골라옴
      keyword = { $text: { $search: `"${keyword}"` } };
    else if (keyword) keyword = { $text: { $search: keyword } };
    else keyword = {}; // 기본 검색

    if (sort)
      switch (sort) {
        case "ascTitle": // 오름차순
          sort = { title: 1 };
          break;
        case "desTitle": // 내림차순
          sort = { title: -1 };
          break;
        case "desPlayed": // 플레이많은순
          sort = { "playInfo.playedCount": -1 };
          break;
        case "desSuccess":
          sort = { "playInfo.successCount": -1 };
          break;
        case "ascDuration": // 영상길이순
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
    else sort = { title: -1 }; // 기본 정렬

    const [playlists, user] = await Promise.all([
      Playlist.find({
        user: userId,
        ...isBookmarked,
        ...keyword,
      }).sort(sort),
      User.findOne({ _id: userId }),
    ]);

    if (!user) return res.status(404).send({ err: "user does not exist. " });

    res.send({ success: true, playlists });
  } catch (err) {
    return res.status(400).send({ err: err.message });
  }
});

module.exports = { userPlaylistRouter };
