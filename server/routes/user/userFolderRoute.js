const { Router } = require("express");
const { isValidObjectId } = require("mongoose");
const { Folder, User } = require("../../models");

const userFolderRouter = Router({ mergeParams: true });

// 특정 유저의 폴더 불러오기
userFolderRouter.get("/", async (req, res) => {
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

    // 북마크 폴더만 보여줘야 하는지 - true: 북마크만, false: 둘 다 보여줌
    if (isBookmarked === "true") isBookmarked = { isBookmarked: true };
    else if (!isBookmarked || isBookmarked === "false") isBookmarked = {};
    else return res.status(400).send({ err: "invalid isBookmarked. " });

    if (keyword && isValidObjectId(keyword))
      keyword = { _id: keyword, publicLevel: { $gte: 1 } };
    else if (keyword && strict === "true")
      // strict 옵션 있을 경우, 입력된 문장과 띄어쓰기까지 완전히 일치하는 것 골라옴
      keyword = {
        $text: { $search: `"${keyword}"` },
        publicLevel: { $gte: 1 },
      };
    else if (keyword)
      keyword = { $text: { $search: keyword }, publicLevel: { $gte: 1 } };
    else keyword = { publicLevel: { $gte: 1 } }; // 기본 검색

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

    const [folders, user] = await Promise.all([
      Folder.find({
        user: userId,
        ...isBookmarked,
        ...keyword,
      }).sort(sort),
      User.findOne({ _id: userId }),
    ]);

    if (!user) return res.status(404).send({ err: "user does not exist. " });

    res.send({ success: true, folders });
  } catch (err) {
    return res.status(400).send({ err: err.message });
  }
});

module.exports = { userFolderRouter };
