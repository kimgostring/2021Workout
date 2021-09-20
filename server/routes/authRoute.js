const { Router } = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { User } = require("../models");
const { auth } = require("../middlewares");

const authRouter = Router();
const HOUR = 60 * 60 * 1000;

// RESTful X
// 인증
authRouter.get("/", auth, async (req, res) => {
  // 미들웨어 안전하게 넘어온 경우 성공
  res.send({ isAuth: true, user: req.user });
});

// 로그인
authRouter.post("/login", async (req, res) => {
  try {
    const { TOKEN_KEY } = process.env;
    const { email, password } = req.body;
    // email, password 입력 확인
    if (typeof email !== "string" || typeof password !== "string")
      return res
        .status(400)
        .send({ err: "both email and string is required. " });

    const user = await User.findOne({ email });
    // email 회원가입 여부 확인
    if (!user) return res.status(400).send({ err: "email is invalid. " });
    // 비밀번호 확인
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).send({ err: "password is wrong. " });

    // 성공, token 생성 후 저장
    const exp = new Date(Date.now() + 24 * HOUR); // 24시간 뒤 만료
    user.token = await jwt.sign(
      { exp: Math.floor(exp.getTime() / 1000), userId: user._id.toHexString() },
      TOKEN_KEY
    );
    user.tokenExp = exp;

    await user.save();
    res.cookie("x_auth", user.token).send({ success: true, user });
  } catch (err) {
    return res.status(400).send({ err: err.message });
  }
});

// 로그아웃
authRouter.post("/logout", auth, async (req, res) => {
  try {
    // 미들웨어 안전하게 넘어온 경우(로그인된 경우)에만
    let { user } = req;

    user = await User.findOneAndUpdate(
      { _id: user._id },
      { $unset: { token: "", tokenExp: "" } },
      { new: true }
    );
    res.cookie("x_auth", "").send({ success: true, user });
  } catch (err) {
    return res.status(400).send({ err: err.message });
  }
});

module.exports = { authRouter };
