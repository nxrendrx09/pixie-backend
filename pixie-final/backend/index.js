import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

// MongoDB connection
mongoose.connect("mongodb+srv://admin:2006%40Infinity@pixie.apa4hjy.mongodb.net/pixie")
  .then(() => console.log("MongoDB connected ✅"))
  .catch(err => console.log(err));

// Test route
app.get("/", (req, res) => {
  res.send("Pixie backend running 🚀");
});

// Start server
app.listen(3001, () => {
  console.log("🚀 Pixie is live on port 3001");
});