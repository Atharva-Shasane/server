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

// Dynamic Origins for CORS
// Add your hosted frontend URL to this array when you have it
const allowedOrigins = [
  "http://localhost:4200",
  "http://127.0.0.1:4200",
  process.env.FRONTEND_URL // This will be used in production
];

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

// CORS CONFIGURATION (Dynamic for Local & Hosted)
app.use(
  cors({
    origin: function (origin, callback) {
      // allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) === -1) {
        return callback(new Error('The CORS policy for this site does not allow access from the specified Origin.'), false);
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