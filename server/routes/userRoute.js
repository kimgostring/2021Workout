const { Router } = require("express");
const { isValidObjectId } = require("mongoose");
const bcrypt = require("bcrypt");
const { User, Video, Folder, Playlist } = require("../models");
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
    const { password, confirm, age, sex } = req.body;
    let { nickname, email } = req.body;

    // password
    if (!password || typeof password !== "string" || password.length < 5)
      return res
        .status(400)
        .send({ err: "password must be a string longer than 4 chars. " });
    if (!confirm || password !== confirm)
      return res.status(400).send({ err: "confirm is wrong. " });

    // age와 sex 범위 확인
    if (!age || !Number.isInteger(age) || age < 0)
      return res.status(400).send({ err: "age must be a signed integer. " });
    if (!sex || !(sex === 1 || sex === 2 || sex === 3))
      return res.status(400).send({ err: "sex must be 1, 2 or 3. " });

    // nickname 확인
    if (!nickname || typeof nickname !== "string")
      return res
        .status(400)
        .send({ err: "nickname must be a string within 15 chars. " });
    nickname = nickname.trim();
    if (nickname.length <= 0 || nickname.length > 15)
      return res
        .status(400)
        .send({ err: "nickname must be a string within 15 chars. " });

    // email 확인
    if (!email || typeof email !== "string")
      return res.status(400).send({ err: "email must be a string. " });
    email = email.trim();
    if (email.length <= 0)
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
      title: "기본 폴더",
      user,
      isDefault: true,
    });
    const secretFolder = new Folder({
      title: "비밀 폴더",
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
    if (!user) return res.status(404).send({ err: "user does not exist. " });

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
      Playlist.deleteMany({ user: userId }),
      // *** 이후 추가되는 스키마 모델도 추가
    ]);
    if (!user) return res.status(404).send({ err: "user does not exist. " });

    res.send({ success: true, user });
  } catch (err) {
    return res.status(400).send({ err: err.message });
  }
});

// 유저 정보 수정
userRouter.patch("/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { introduction, age, sex, oldPassword, newPassword, confirm } =
      req.body;
    let { nickname, email } = req.body;

    // userId 확인
    if (!isValidObjectId(userId))
      return res.status(400).send({ err: "invalid user id." });

    let user = await User.findOne({ _id: userId });
    if (!user) return res.status(404).send({ err: "user does not exist. " });

    // nickname, email, introduction, age, sex, password 중 하나는 변화해야 함
    if (
      !nickname && // 공백 문자열도 x
      !email &&
      introduction === undefined && // 공백 문자열도 o
      !age &&
      !sex &&
      (oldPassword === undefined ||
        newPassword === undefined ||
        confirm === undefined)
    )
      return res
        .status(400)
        .send({ err: "at least one of information must be required. " });

    // nickname 확인
    if (nickname !== undefined) {
      if (typeof nickname !== "string")
        return res
          .status(400)
          .send({ err: "nickname must be a string within 15 chars. " });

      nickname = nickname.trim(); // 닉네임 앞뒤 공백제거
      if (nickname.length <= 0 || nickname.length > 15)
        return res
          .status(400)
          .send({ err: "nickname must be a string within 15 chars. " });

      // 중복 닉네임 존재 여부 확인
      const sameNicknameUser = await User.findOne({ nickname });
      if (sameNicknameUser && userId !== sameNicknameUser._id.toString())
        return res.status(400).send({ err: "nickname must be unique. " });
      user.nickname = nickname;
    }

    // email 확인
    if (email !== undefined) {
      if (typeof email !== "string")
        return res.status(400).send({ err: "email must be a string. " });

      email.trim();
      if (email.length <= 0)
        return res.status(400).send({ err: "email must be a string. " });

      const sameEmailUser = await User.findOne({ email });
      if (sameEmailUser && userId !== sameEmailUser._id.toString())
        return res.status(400).send({ err: "email must be unique. " });

      user.email = email;
    }

    // introduction 확인
    if (introduction !== undefined) {
      if (typeof introduction !== "string" || introduction.length > 50)
        return res
          .status(400)
          .send({ err: "introduction must be a string within 50 chars. " });

      user.introduction = introduction;
    }

    // age 확인
    if (age !== undefined) {
      if (!Number.isInteger(age) || age < 0)
        return res.status(400).send({ err: "age must be a signed integer. " });

      user.age = age;
    }

    // sex 확인
    if (sex !== undefined) {
      if (!(sex === 1 || sex === 2 || sex === 3))
        return res.status(400).send({ err: "sex must be 1, 2 or 3. " });

      user.sex = sex;
    }

    // password 확인
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
      if (oldPassword === undefined || typeof oldPassword !== "string")
        return res.status(400).send({ err: "old password is wrong. " });

      const isMatch = await bcrypt.compare(oldPassword, user.password);
      if (!isMatch)
        return res.status(400).send({ err: "old password is wrong. " });

      user.password = newPassword;
    }

    await user.save();

    res.send({ success: true, user });
  } catch (err) {
    return res.status(400).send({ err: err.message });
  }
});

module.exports = { userRouter };
