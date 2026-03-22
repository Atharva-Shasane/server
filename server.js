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

/**
 * CRITICAL FIX FOR RENDER DEPLOYMENT
 * Enables 'trust proxy' so express-rate-limit can correctly identify client IPs
 * behind Render's load balancer. This prevents the 500 Error (ERR_ERL_UNEXPECTED_X_FORWARDED_FOR).
 */
app.set("trust proxy", 1);

// SECURITY & MIDDLEWARE
app.use(helmet());
app.use(cookieParser());
app.use(mongoSanitize());

// RATE LIMITER
// Increased max limit to 2000 for standard API usage, but applied to /api/ routes
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { msg: "Too many requests, please try again later." },
});
app.use("/api/", limiter);

// Dynamic Origins for CORS
const allowedOrigins = [
  "http://localhost:4200",
  "http://127.0.0.1:4200",
  "https://killarestaurant.netlify.app", // Your direct Netlify URL
];

// If FRONTEND_URL is provided in environment, add it to allowed origins
if (process.env.FRONTEND_URL) {
  // Logic to strip potential email tracking wrappers if present
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
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);

      // Check if the origin is in our whitelist
      const isAllowed = allowedOrigins.some((allowed) =>
        origin.startsWith(allowed),
      );

      if (!isAllowed) {
        console.warn(`Blocked by CORS: ${origin}`);
        return callback(
          new Error(
            "The CORS policy for this site does not allow access from the specified Origin.",
          ),
          false,
        );
      }
      return callback(null, true);
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-auth-token"],
    credentials: true,
  }),
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

app.listen(PORT, () => {
  console.log(`🚀 Killa Backend running on port ${PORT}`);
});
