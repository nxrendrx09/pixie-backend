import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const app = express();   // ✅ FIRST

const server = require("http").createServer(app);   // ✅ AFTER

app.use(express.json());

const cors = require("cors");
app.use(cors({
  origin: "*"
}));

const io = require("socket.io")(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// MongoDB connection
mongoose.connect("mongodb+srv://admin:2006%40Infinity@pixie.apa4hjy.mongodb.net/pixie")
  .then(() => console.log("MongoDB connected ✅"))
  .catch(err => console.log(err));

// Test route
app.get("/", (req, res) => {
  res.send("Pixie backend running 🚀");
});

// Start server
const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log("Pixie is live on port " + PORT + " 🚀");
});