const express = require("express");
const mongoose = require("mongoose");
const cookieParser = require("cookie-parser");
const {
  userRouter,
  authRouter,
  videoRouter,
  folderRouter,
  playlistRouter,
} = require("./routes");

const app = express();

const server = async () => {
  try {
    const { PORT, MONGO_URI } = process.env;
    if (!PORT) throw new Error("PORT is required. ");
    if (!MONGO_URI) throw new Error("MONGO_URI is required. ");

    await mongoose.connect(MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("Mongo DB connected. ");

    app.use(express.json());
    app.use(express.urlencoded({ extended: true })); // 쿼리 스트링에 한글 있는 경우 처리 필요
    app.use(cookieParser());

    // 라우터 추가
    app.use("/users", userRouter);
    app.use("/auth", authRouter);
    app.use("/videos", videoRouter);
    app.use("/folders", folderRouter);
    app.use("/playlists", playlistRouter);

    app.listen(PORT, () => {
      console.log(`server listening at port ${PORT}. `);
    });
  } catch (err) {
    console.log(err);
  }
};

server();
