const { Router } = require("express");
const { isValidObjectId } = require("mongoose");
const { Video } = require("../../models");

const folderVideoRouter = Router({ mergeParams: true }); // folderRouter.js에서 설정한 /:folderId값 이용 가능

// folder 안의 모든 video 읽기
folderVideoRouter.get("/", async (req, res) => {
  try {
    let { sort } = req.query;
    const { folderId } = req.params;
    if (!isValidObjectId(folderId))
      return res.status(400).send({ err: "invaild folder id." });

    if (sort)
      switch (sort) {
        case "asc": // 오름차순
          sort = { name: 1 };
          break;
        case "des": // 내림차순
          sort = { name: -1 };
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
    else sort = { name: -1 }; // 기본 정렬

    const videos = await Video.find({ "folder._id": folderId }).sort(sort);
    res.send({ success: true, videos });
  } catch (err) {
    return res.status(400).send({ err: err.message });
  }
});

module.exports = { folderVideoRouter };
