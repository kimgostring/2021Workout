const { Schema, model } = require("mongoose");
const bcrypt = require("bcrypt");
const saltRounds = 10;

const userSchema = new Schema(
  {
    email: { type: String, unique: true, required: true, trim: true },
    password: String,
    nickname: { type: String, unique: true, required: true, maxlength: 15 },
    age: Number,
    sex: Number,
    introduction: { type: String, maxlength: 50 },
  },
  { timestamps: true }
);

// 비밀번호 암호화
userSchema.pre("save", function (next) {
  const user = this;

  if (user.isModified("password")) {
    bcrypt.genSalt(saltRounds, (err, salt) => {
      if (err) return next(err);

      bcrypt.hash(user.password, salt, (err, hash) => {
        if (err) return next(err);

        user.password = hash;
        next();
      });
    });
  } else next();
});

const User = model("User", userSchema);
module.exports = { User };
