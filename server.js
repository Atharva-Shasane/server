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
/**
 * Helmet helps secure the app by setting various HTTP headers.
 * mongoSanitize prevents NoSQL injection attacks by stripping out keys starting with '$'.
 */
app.use(helmet());
app.use(cookieParser());
app.use(mongoSanitize());

// INCREASED RATE LIMIT FOR DEVELOPMENT:
// Prevents brute-force attacks and excessive automated requests.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 1000 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    msg: "Too many requests from this IP, please try again after 15 minutes.",
  },
});

app.use("/api/", limiter);

// REFINED CORS CONFIGURATION
// Configured to allow cross-origin requests from the Angular frontend specifically.
app.use(
  cors({
    origin: "http://localhost:4200",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "x-auth-token", "Authorization"],
    credentials: true,
  }),
);

/** --- BODY PARSING MIDDLEWARE ---
 * These lines allow the server to read the 'req.body'
 * from your Analytics expense form and other POST requests.
 */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- DEBUGGING MIDDLEWARE ---
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// --- DATABASE CONNECTION ---
mongoose
  .connect(process.env.MONGO_URI || "mongodb://localhost:27017/Killa_db")
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ DB Error:", err));

// --- ROUTES ---
app.use("/api/auth", require("./routes/auth"));
app.use("/api/menu", require("./routes/menu"));
app.use("/api/orders", require("./routes/orders"));
app.use("/api/analytics", require("./routes/analytics"));

// MOUNTING THE NEW RATING SYSTEM
// Handles user feedback, ratings, and feedback-to-order associations.
app.use("/api/rating", require("./routes/rating"));

app.get("/", (req, res) => res.send("Killa Restaurant API Running 🚀"));

// Error handling for undefined routes
app.use((req, res) => {
  res.status(404).json({ msg: "Route not found" });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
