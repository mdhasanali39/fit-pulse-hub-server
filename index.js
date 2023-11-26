import express from "express";
import cors from "cors";
import "dotenv/config";
// import cookieParser from "cookie-parser";
// import jwt from "jsonwebtoken";

// create express instance
const app = express();
const port = process.env.PORT || 5000;

// testing api
app.get("/", (req, res) => {
    res.send("fit pulse server is running well");
  });
  
  app.listen(port, () => {
    console.log(`fit pulse server is running on port: ${port}`);
  });