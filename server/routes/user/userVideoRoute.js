const { Router } = require("express");
const { isValidObjectId } = require("mongoose");
const { Video } = require("../../models");

const userVideoRouter = Router({ mergeParams: true });

// 특정 유저의 영상 불러오기
userVideoRouter.get("/", async (req, res) => {
  try {
    let { isBookmarked, keyword, sort } = req.query;
    const { userId } = req.params;
    // userId 확인
    if (!isValidObjectId(userId))
      return res.status(400).send({ err: "invaild user id. " });

    // 북마크 영상만 보여줘야 하는지
    if (isBookmarked === "true") isBookmarked = { isBookmarked: true };
    else if (!isBookmarked || isBookmarked === "false") isBookmarked = {};
    else return res.status(400).send({ err: "invalid isBookmarked. " });

    if (keyword && isValidObjectId(keyword))
      keyword = { _id: keyword, publicLevel: { $gte: 1 } };
    else if (keyword)
      keyword = { $text: { $search: keyword }, publicLevel: { $gte: 1 } };
    else keyword = { publicLevel: { $gte: 1 } }; // 기본 검색
    if (sort)
      switch (sort) {
        case "asc": // 오름차순
          sort = { title: 1 };
          break;
        case "des": // 내림차순
          sort = { title: -1 };
          break;
        case "desShared": // 공유많은순
          sort = { sharedCount: -1 };
          break;
        case "desPlayed": // 플레이많은순
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
        default:
          return res.status(400).send({ err: "invalid sort. " });
      }
    else sort = { title: -1 }; // 기본 정렬

    const videos = await Video.find({
      user: userId,
      ...isBookmarked,
      ...keyword,
    }).sort(sort);
    res.send({ success: true, videos });
  } catch (err) {
    return res.status(400).send({ err: err.message });
  }
});

module.exports = { userVideoRouter };
