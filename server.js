const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const mongoSanitize = require("express-mongo-sanitize");
const cookieParser = require("cookie-parser");
require("dotenv").config();

// --- STARTUP VALIDATION ---
if (!process.env.JWT_SECRET) {
  console.error(
    "CRITICAL: JWT_SECRET environment variable is not set. Refusing to start."
  );
  process.exit(1);
}

if (!process.env.MONGO_URI) {
  console.error(
    "CRITICAL: MONGO_URI environment variable is not set. Refusing to start."
  );
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 5000;

// Trust Render/Proxy
app.set("trust proxy", 1);

// SECURITY & MIDDLEWARE
app.use(helmet());
app.use(cookieParser());
app.use(mongoSanitize());

// GLOBAL RATE LIMITER
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { msg: "Too many requests, please try again later." },
});

app.use("/api/", limiter);

// AUTH RATE LIMITER
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { msg: "Too many auth requests, please try again later." },
});

app.use("/api/auth/request-otp", authLimiter);
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);

// ========================
// CORS - ALLOW ALL ORIGINS
// ========================
app.use(
  cors({
    origin: true, // Allow all origins
    credentials: true, // Allow cookies/auth headers
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: [
      "Origin",
      "X-Requested-With",
      "Content-Type",
      "Accept",
      "Authorization",
      "x-auth-token",
    ],
  })
);

app.options("*", cors());

// BODY PARSING
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// DATABASE CONNECTION
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB Connection Error:", err));

// API ROUTES
app.use("/api/auth", require("./routes/auth"));
app.use("/api/menu", require("./routes/menu"));
app.use("/api/orders", require("./routes/orders"));
app.use("/api/analytics", require("./routes/analytics"));
app.use("/api/rating", require("./routes/rating"));

// HEALTH CHECK
app.get("/", (req, res) => {
  res.send("Killa Resto API Active");
});

// 404 HANDLER
app.use((req, res) => {
  res.status(404).json({
    msg: "Endpoint not found on this server.",
  });
});

// GLOBAL ERROR HANDLER
app.use((err, req, res, next) => {
  console.error("❌ [UNHANDLED ERROR]:", err.stack || err.message);

  const status = err.status || err.statusCode || 500;

  res.status(status).json({
    msg: err.message || "An unexpected server error occurred.",
  });
});

// START SERVER
app.listen(PORT, () => {
  console.log(`🚀 Killa Backend running on port ${PORT}`);
});
