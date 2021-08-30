const jwt = require("jsonwebtoken");
const { User } = require("../models");

const auth = async (req, res, next) => {
  try {
    const { TOKEN_KEY } = process.env;
    const token = req.cookies.x_auth;

    //  토큰 존재 여부 확인
    if (!token)
      return res
        .status(400)
        .send({ isAuth: false, err: "token is required. " });

    // 해당 토큰 존재하는 유저 유무 확인
    const { userId } = await jwt.verify(token, TOKEN_KEY);
    const user = await User.findOne({ _id: userId, token });

    // 존재 X, 다음으로 넘어가지 않고 종료
    if (!user)
      return res.status(400).send({ isAuth: false, err: "invalid token. " });
    // 존재, 다음으로 넘어감
    req.user = user;
    next();
  } catch (err) {
    return res.status(400).send({ isAuth: false, err: err.message });
  }
};

module.exports = { auth };
