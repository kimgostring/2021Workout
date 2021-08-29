const { Router } = require("express");
const { isValidObjectId } = require("mongoose");
const bcrypt = require("bcrypt");
const { User } = require("../models");

const userRouter = Router();

// 유저 생성
userRouter.post("/", async (req, res) => {
  try {
    const { email, password, confirm, nickname, age, sex } = req.body;
    // password와 confirm 일치 확인
    if (password !== confirm)
      return res.status(400).send({ err: "confirm is wrong. " });

    // age와 sex 범위 확인
    if (typeof age !== "number" || age <= 0)
      return res.status(400).send({ err: "age is required. " });
    if (!(sex === 1 || sex === 2))
      return res.status(400).send({ err: "sex is required. " });

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
    await user.save();
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

    // * 해당 유저가 생성한 데이터도 함께 삭제해야 함
    const user = await User.findOneAndDelete({ _id: userId });
    res.send({ success: true, user });
  } catch (err) {
    return res.status(400).send({ err: err.message });
  }
});

// 닉네임 수정
userRouter.patch("/:userId/nickname", async (req, res) => {
  try {
    const { userId } = req.params;
    const nickname = req.body.nickname.trim();

    // userId 확인
    if (!isValidObjectId(userId))
      return res.status(400).send({ err: "invalid user id." });

    // 타입 확인
    if (typeof nickname !== "string")
      return res.status(400).send({ err: "nickname must be a string. " });

    // 중복 닉네임 존재 여부 확인
    const sameNicknameUser = await User.findOne({ nickname });
    if (sameNicknameUser) {
      // 현재와 동일한 닉네임일 경우, 성공으로 작업 끝내기
      if (userId === sameNicknameUser._id.toString())
        return res.send({ success: true, isNoOp: true, nickname });
      // 이미 해당 유저 존재하는 경우
      else return res.status(400).send({ err: "nickname must be unique. " });
    }

    const user = await User.findOneAndUpdate(
      { _id: userId },
      { nickname },
      { new: true }
    );
    res.send({ success: true, user });
  } catch (err) {
    return res.status(400).send({ err: err.message });
  }
});

// 한줄소개 수정
userRouter.patch("/:userId/introduction", async (req, res) => {
  try {
    const { userId } = req.params;
    const { introduction } = req.body;
    // userId 확인
    if (!isValidObjectId(userId))
      return res.status(400).send({ err: "invalid user id." });

    // 범위 확인
    if (typeof introduction !== "string")
      return res.status(400).send({ err: "introduction must be a string. " });
    // 길이 확인
    if (introduction.length >= 50)
      return res.status(400).send({ err: "too long introduction. " });

    const user = await User.findOneAndUpdate(
      { _id: userId },
      { introduction },
      { new: true }
    );
    res.send({ success: true, user });
  } catch (err) {
    return res.status(400).send({ err: err.message });
  }
});

// 비밀번호 수정
userRouter.patch("/:userId/password", async (req, res) => {
  try {
    const { userId } = req.params;
    const { oldPassword, newPassword, confirm } = req.body;

    // userId 확인
    if (!isValidObjectId(userId))
      return res.status(400).send({ err: "invalid user id. " });

    // 타입 확인
    if (typeof newPassword !== "string")
      return res.status(400).send({ err: "password must be a string. " });
    // 길이 확인
    if (newPassword.length < 5)
      return res.status(400).send({ err: "too short new password. " });
    // new와 confirm 일치 확인
    if (newPassword !== confirm)
      return res.status(400).send({ err: "confirm is wrong. " });

    // 기존 비밀번호와 일치 확인
    const user = await User.findOne({ _id: userId });
    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch)
      return res.status(400).send({ err: "old password is wrong. " });

    user.password = newPassword;
    await user.save();
    res.send({ success: true, user });
  } catch (err) {
    return res.status(400).send({ err: err.message });
  }
});

module.exports = { userRouter };
