const { Schema, model } = require("mongoose");
const bcrypt = require("bcrypt");

const userSchema = new Schema(
  {
    email: {
      type: String,
      unique: true,
      required: true,
      trim: true,
      minlength: 1,
    },
    password: { type: String, required: true, minlength: 5 },
    nickname: {
      type: String,
      unique: true,
      required: true,
      minlength: 1,
      maxlength: 15,
    },
    age: { type: Number, min: 0 },
    sex: { type: Number, min: 1, max: 2 }, // 1 - 남성, 2 - 여성
    introduction: { type: String, maxlength: 50 },
    token: String,
    tokenExp: Date,
  },
  { timestamps: true }
);

// 비밀번호 암호화
userSchema.pre("save", async function (next) {
  const saltRounds = 10;
  const user = this;

  if (user.isModified("password")) {
    try {
      const salt = await bcrypt.genSalt(saltRounds);
      const hash = await bcrypt.hash(user.password, salt);

      user.password = hash;
      next();
    } catch (err) {
      return next(err);
    }
  } else next();
});

const User = model("user", userSchema);
module.exports = { User };
