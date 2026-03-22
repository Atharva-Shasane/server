const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const mongoSanitize = require("express-mongo-sanitize");
const cookieParser = require("cookie-parser");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;

// SECURITY & MIDDLEWARE
app.use(helmet());
app.use(cookieParser());
app.use(mongoSanitize());

// RATE LIMITER
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 2000, 
  standardHeaders: true,
  legacyHeaders: false,
  message: { msg: "Too many requests, please try again later." },
});
app.use("/api/", limiter);

// CORS CONFIGURATION
app.use(
  cors({
    origin: "http://localhost:4200", // Must exactly match Angular dev server
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-auth-token"],
    credentials: true, // Required for cookies to be sent/received
  })
);

// BODY PARSING
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// DATABASE CONNECTION
mongoose
  .connect(process.env.MONGO_URI || "mongodb://localhost:27017/Killa_db")
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => {});

// API ROUTES
app.use("/api/auth", require("./routes/auth"));
app.use("/api/menu", require("./routes/menu"));
app.use("/api/orders", require("./routes/orders"));
app.use("/api/analytics", require("./routes/analytics"));
app.use("/api/rating", require("./routes/rating"));

app.get("/", (req, res) => res.send("Killa Resto API Active"));

app.use((req, res) => {
  res.status(404).json({ msg: "Endpoint not found on this server." });
});

app.listen(PORT, () => {
  console.log(`🚀 Killa Backend running on port ${PORT}`);
});