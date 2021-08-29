const express = require("express");
const mongoose = require("mongoose");
const { userRouter } = require("./routes");

const app = express();

const server = async () => {
  try {
    const { PORT, MONGO_URI } = process.env;
    if (!PORT) throw new Error("PORT is required. ");
    if (!MONGO_URI) throw new Error("MONGO_URI is required. ");

    await mongoose.connect(MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      //   useCreateIndex: true,
      //   useFindAndModify: false,
    });
    console.log("Mongo DB connected. ");

    app.use(express.json());
    app.use("/users", userRouter);

    app.listen(PORT, () => {
      console.log(`server listening at port ${PORT}. `);
    });
  } catch (err) {
    console.log(err);
  }
};

server();
