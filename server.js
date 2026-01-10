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

// --- SECURITY MIDDLEWARE ---

app.use(helmet());
app.use(cookieParser());

// INCREASED RATE LIMIT FOR DEVELOPMENT:
// 1000 requests per 15 mins to accommodate polling and reloads
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    msg: "Too many requests from this IP, please try again after 15 minutes.",
  },
});

app.use("/api/", limiter);
app.use(mongoSanitize());

// REFINED CORS CONFIGURATION
app.use(
  cors({
    origin: "http://localhost:4200",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "x-auth-token", "Authorization"],
    credentials: true,
  })
);

app.use(express.json({ limit: "10kb" }));

// --- DEBUGGING ---
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// --- DATABASE ---
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ DB Error:", err));

// --- ROUTES ---
app.use("/api/auth", require("./routes/auth"));
app.use("/api/menu", require("./routes/menu"));
app.use("/api/orders", require("./routes/orders"));

app.get("/", (req, res) => res.send("Killa Restaurant API Running 🚀"));

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
