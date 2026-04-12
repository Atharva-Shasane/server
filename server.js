const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const mongoSanitize = require("express-mongo-sanitize");
const cookieParser = require("cookie-parser");
require("dotenv").config();

// --- STARTUP VALIDATION ---
// Crash immediately if critical secrets are missing — never fall back to weak defaults
if (!process.env.JWT_SECRET) {
  console.error("CRITICAL: JWT_SECRET environment variable is not set. Refusing to start.");
  process.exit(1);
}
if (!process.env.MONGO_URI) {
  console.error("CRITICAL: MONGO_URI environment variable is not set. Refusing to start.");
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 5000;

/**
 * CRITICAL FIX FOR RENDER DEPLOYMENT
 * Enables 'trust proxy' so express-rate-limit can correctly identify client IPs
 * behind Render's load balancer.
 */
app.set("trust proxy", 1);

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

// Stricter rate limit for auth endpoints to prevent OTP abuse
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

// Dynamic Origins for CORS
const allowedOrigins = [
  "http://localhost:4200",
  "http://127.0.0.1:4200",
  "https://killarestaurant.netlify.app",
];

if (process.env.FRONTEND_URL) {
  let cleanUrl = process.env.FRONTEND_URL;
  if (cleanUrl.includes("q=https")) {
    cleanUrl = cleanUrl.split("q=")[1].split("&")[0];
  }
  allowedOrigins.push(cleanUrl);
}

// CORS CONFIGURATION
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      const isAllowed = allowedOrigins.some((allowed) =>
        origin.startsWith(allowed)
      );
      if (!isAllowed) {
        console.warn(`Blocked by CORS: ${origin}`);
        return callback(
          new Error(
            "The CORS policy for this site does not allow access from the specified Origin."
          ),
          false
        );
      }
      return callback(null, true);
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-auth-token"],
    credentials: true,
  })
);

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

app.get("/", (req, res) => res.send("Killa Resto API Active"));

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ msg: "Endpoint not found on this server." });
});

// GLOBAL ERROR HANDLER
// Catches any error thrown or passed via next(err) in any route
// Returns clean JSON instead of crashing or sending HTML
app.use((err, req, res, next) => {
  console.error("❌ [UNHANDLED ERROR]:", err.stack || err.message);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    msg: err.message || "An unexpected server error occurred.",
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Killa Backend running on port ${PORT}`);
});