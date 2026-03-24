import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";

dotenv.config();

const app = express();
const server = http.createServer(app); // ✅ create server FIRST

// Middleware
app.use(express.json());
app.use(cors({
  origin: "*"
}));

// Socket.io setup
const io = new Server(server, {
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