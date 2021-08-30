const { Schema, model } = require("mongoose");
const bcrypt = require("bcrypt");

const userSchema = new Schema(
  {
    email: { type: String, unique: true, required: true, trim: true },
    password: String,
    nickname: { type: String, unique: true, required: true, maxlength: 15 },
    age: Number,
    sex: Number,
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

const User = model("User", userSchema);
module.exports = { User };
