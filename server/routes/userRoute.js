const { Router } = require("express");
const { isValidObjectId } = require("mongoose");
const bcrypt = require("bcrypt");
const { User, Video, Folder } = require("../models");
const {
  userVideoRouter,
  userFolderRouter,
  userPlaylistRouter,
} = require("./user");

const userRouter = Router();

userRouter.use("/:userId/videos", userVideoRouter);
userRouter.use("/:userId/folders", userFolderRouter);
userRouter.use("/:userId/playlists", userPlaylistRouter);

// 유저 생성
userRouter.post("/", async (req, res) => {
  try {
    const { email, password, confirm, age, sex } = req.body;
    let { nickname } = req.body;
    // password와 confirm 일치 확인
    if (!email || !password || !confirm || !nickname || !age || !sex)
      return res.status(400).send({ err: "some information is missing. " });

    // password
    if (typeof password !== "string" || password.length < 5)
      return res
        .status(400)
        .send({ err: "password must be a string longer than 4 chars. " });
    if (password !== confirm)
      return res.status(400).send({ err: "confirm is wrong. " });

    // age와 sex 범위 확인
    if (!Number.isInteger(age) || age < 0)
      return res.status(400).send({ err: "age must be a signed integer. " });
    if (!(sex === 1 || sex === 2))
      return res.status(400).send({ err: "sex must be 1-2 integer. " });

    // email, nickname 확인
    if (typeof nickname !== "string")
      return res.status(400).send({ err: "nickname must be a string. " });

    nickname = nickname.trim();
    if (nickname.length <= 0 || nickname.length > 15)
      return res
        .status(400)
        .send({ err: "nickname must be a string within 15 chars. " });
    if (typeof email !== "string" || nickname.length <= 0)
      return res.status(400).send({ err: "email must be a string. " });

    // email, nickname 중복 확인
    const [sameEmail, sameNickname] = await Promise.all([
      User.findOne({ email }),
      User.findOne({ nickname }),
    ]);
    if (sameEmail)
      return res.status(400).send({ err: "email must be unique. " });
    if (sameNickname)
      return res.status(400).send({ err: "nickname must be unique. " });

    // 등록
    const user = new User(req.body);
    const defaultFolder = new Folder({
      name: "기본 폴더",
      user,
      isDefault: true,
    });
    const secretFolder = new Folder({
      name: "비밀 폴더",
      user,
      publicLevel: 0,
    });

    await Promise.all([user.save(), defaultFolder.save(), secretFolder.save()]);
    res.send({ success: true, user });
  } catch (err) {
    return res.status(400).send({ err: err.message });
  }
});

// 특정 유저 불러오기
userRouter.get("/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    // userId 확인
    if (!isValidObjectId(userId))
      return res.status(400).send({ err: "invalid user id." });

    const user = await User.findOne({ _id: userId });
    res.send({ success: true, user });
  } catch (err) {
    return res.status(400).send({ err: err.message });
  }
});

// 유저 삭제
userRouter.delete("/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    // userId 확인
    if (!isValidObjectId(userId))
      return res.status(400).send({ err: "invalid user id. " });

    const [user] = await Promise.all([
      User.findOneAndDelete({ _id: userId }),
      // 해당 유저가 생성한 데이터도 함께 삭제
      Video.deleteMany({ user: userId }),
      Folder.deleteMany({ user: userId }),
    ]);
    res.send({ success: true, user });
  } catch (err) {
    return res.status(400).send({ err: err.message });
  }
});

// 유저 정보 수정
userRouter.patch("/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { introduction, age, oldPassword, newPassword, confirm } = req.body;
    let { nickname } = req.body;
    // userId 확인
    if (!isValidObjectId(userId))
      return res.status(400).send({ err: "invalid user id." });

    // nickname, introduction, age, password 중 하나는 변화해야 함
    if (
      !nickname &&
      introduction === undefined &&
      !age &&
      (!oldPassword || !newPassword || !confirm)
    )
      return res
        .status(400)
        .send({ err: "at least one of information must be required. " });

    if (nickname !== undefined) {
      // nickname 확인
      if (typeof nickname !== "string")
        return res.status(400).send({ err: "nickname must be a string. " });

      nickname = nickname.trim(); // 닉네임 앞뒤 공백제거
      if (nickname.length <= 0 || nickname.length > 15)
        return res
          .status(400)
          .send({ err: "nickname must be a string within 15 chars. " });

      // 중복 닉네임 존재 여부 확인
      const sameNicknameUser = await User.findOne({ nickname });
      if (sameNicknameUser && userId !== sameNicknameUser._id.toString())
        return res.status(400).send({ err: "nickname must be unique. " });
    }

    if (
      introduction !== undefined &&
      (typeof introduction !== "string" || introduction.length > 50)
    )
      return res
        .status(400)
        .send({ err: "introduction must be a string within 50 chars. " });

    if (age !== undefined && (!Number.isInteger(age) || age < 0))
      return res.status(400).send({ err: "age must be a signed integer. " });

    if (newPassword !== undefined) {
      // 길이 확인
      if (typeof newPassword !== "string" || newPassword.length < 5)
        return res
          .status(400)
          .send({ err: "password must be a string longer than 4 chars. " });
      // new와 confirm 일치 확인
      if (newPassword !== confirm)
        return res.status(400).send({ err: "confirm is wrong. " });

      // 기존 비밀번호와 일치 확인
      const user = await User.findOne({ _id: userId });
      const isMatch = await bcrypt.compare(oldPassword, user.password);
      if (!isMatch)
        return res.status(400).send({ err: "old password is wrong. " });
    }

    const user = await User.findOneAndUpdate(
      { _id: userId },
      { ...req.body, nickname },
      { new: true }
    );
    res.send({ success: true, user });
  } catch (err) {
    return res.status(400).send({ err: err.message });
  }
});

module.exports = { userRouter };
