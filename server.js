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

// --- SECURITY & MIDDLEWARE ---
// Helmet helps secure Express apps by setting various HTTP headers
app.use(helmet());
// cookieParser is required to read JWT tokens from cookies
app.use(cookieParser());
// mongoSanitize prevents NoSQL injection attacks
app.use(mongoSanitize());

// RATE LIMITER (Adjusted for high development traffic)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 2000, // Limit each IP to 2000 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: { msg: "Too many requests, please try again later." },
});
app.use("/api/", limiter);

// CORS CONFIGURATION
// origin must match your Angular development server (usually localhost:4200)
app.use(
  cors({
    origin: "http://localhost:4200",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "x-auth-token", "Authorization"],
    credentials: true, // Crucial for allowing cookies to be sent across origins
  }),
);

// BODY PARSING
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// LOGGING MIDDLEWARE
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// DATABASE CONNECTION
mongoose
  .connect(process.env.MONGO_URI || "mongodb://localhost:27017/Killa_db")
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ DB Error:", err));

// --- API ROUTES ---
app.use("/api/auth", require("./routes/auth"));
app.use("/api/menu", require("./routes/menu"));
app.use("/api/orders", require("./routes/orders"));
app.use("/api/analytics", require("./routes/analytics"));

// MOUNTING THE FEEDBACK SYSTEM (Crucial for fixing 404 errors in the rating component)
app.use("/api/rating", require("./routes/rating"));

// Health Check Route
app.get("/", (req, res) => res.send("Killa Resto API Active 🚀"));

// CATCH-ALL 404 for undefined routes
app.use((req, res) => {
  res.status(404).json({ msg: "Endpoint not found on this server." });
});

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 Killa Backend running on port ${PORT}`);
});
