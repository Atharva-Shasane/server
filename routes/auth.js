const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Otp = require("../models/Otp");
const auth = require("../middleware/auth");

/**
 * Helper: Send Email via Resend API
 */
async function sendOTPEmail(email, otp) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;

  if (!RESEND_API_KEY) {
    console.error("❌ [AUTH ERROR] RESEND_API_KEY is missing in .env file.");
    console.log(`[FALLBACK OTP] Code for ${email}: ${otp}`);
    return;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Killa Resto <onboarding@resend.dev>", // NOTE: Resend requires verified domains in production
        to: [email],
        subject: "Your Killa Resto Verification Code",
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
            <h2 style="color: #ff6600;">Killa Resto Verification</h2>
            <p>Your 6-digit verification code is:</p>
            <div style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #333; margin: 20px 0;">
              ${otp}
            </div>
            <p>This code will expire in 5 minutes. If you did not request this, please ignore this email.</p>
            <p style="font-size: 12px; color: #888;">Note: If you are using a Resend free account, ensure '${email}' is a verified recipient.</p>
          </div>
        `,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      // Log exactly what Resend says is wrong
      console.error("❌ [RESEND API ERROR]:", data);
      throw new Error(data.message || "Failed to send email");
    }

    console.log(
      `✅ [AUTH] Email sent successfully to ${email}. ID: ${data.id}`
    );
  } catch (error) {
    console.error("❌ [EMAIL SYSTEM FAILURE]:", error.message);
    // Fallback so you can still login during development
    console.log(`[EMERGENCY OTP LOG] Code for ${email}: ${otp}`);
  }
}

/**
 * Helper: Generate 6-digit OTP
 */
const generateOTP = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

/**
 * Password Validator: Strong password check
 */
const isPasswordStrong = (password) => {
  const regex =
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{6,}$/;
  return regex.test(password);
};

/**
 * @route POST api/auth/request-otp
 * @desc Request OTP for registration or owner login
 */
router.post("/request-otp", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ msg: "Email is required" });

  const otp = generateOTP();

  try {
    // Save/Update OTP in database
    await Otp.findOneAndUpdate(
      { email: email.toLowerCase() },
      { otp, attempts: 0, createdAt: new Date() },
      { upsert: true, new: true }
    );

    // Send the actual email
    await sendOTPEmail(email.toLowerCase(), otp);

    res.json({ msg: "Verification code sent to your email." });
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

/**
 * @route POST api/auth/register
 * @desc Register a new user (Requires OTP)
 */
router.post("/register", async (req, res) => {
  const { name, email, mobile, password, otp } = req.body;

  if (!isPasswordStrong(password)) {
    return res.status(400).json({
      msg: "Password must be 6+ chars with 1 uppercase, 1 number, and 1 special character.",
    });
  }

  // Verify OTP
  const storedOtp = await Otp.findOne({ email: email.toLowerCase() });
  if (!storedOtp)
    return res.status(400).json({ msg: "OTP expired or not requested." });

  if (storedOtp.otp !== otp) {
    storedOtp.attempts += 1;
    await storedOtp.save();

    if (storedOtp.attempts >= 3) {
      await Otp.deleteOne({ _id: storedOtp._id });
      return res
        .status(400)
        .json({ msg: "Too many failed attempts. Please request a new code." });
    }
    return res
      .status(400)
      .json({
        msg: `Invalid OTP. ${3 - storedOtp.attempts} attempts remaining.`,
      });
  }

  try {
    let user = await User.findOne({ email: email.toLowerCase() });
    if (user) return res.status(400).json({ msg: "User already exists" });

    user = new User({
      name,
      email: email.toLowerCase(),
      mobile,
      passwordHash: password,
      role: "USER",
    });

    const salt = await bcrypt.genSalt(10);
    user.passwordHash = await bcrypt.hash(password, salt);
    await user.save();

    await Otp.deleteOne({ _id: storedOtp._id });

    const payload = { user: { id: user.id, role: user.role } };
    const token = jwt.sign(payload, process.env.JWT_SECRET || "secret", {
      expiresIn: "7d",
    });

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server error");
  }
});

/**
 * @route POST api/auth/login
 * @desc Authenticate user.
 */
router.post("/login", async (req, res) => {
  const { email, password, otp } = req.body;

  try {
    let user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(400).json({ msg: "Invalid Credentials" });

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) return res.status(400).json({ msg: "Invalid Credentials" });

    if (user.role === "OWNER") {
      const storedOtp = await Otp.findOne({ email: email.toLowerCase() });

      if (!otp) {
        const newOtp = generateOTP();
        await Otp.findOneAndUpdate(
          { email: email.toLowerCase() },
          { otp: newOtp, attempts: 0, createdAt: new Date() },
          { upsert: true }
        );
        await sendOTPEmail(email.toLowerCase(), newOtp);
        return res.json({
          requiresOtp: true,
          msg: "Owner verification code sent to your email.",
        });
      }

      if (!storedOtp || storedOtp.otp !== otp) {
        return res.status(400).json({ msg: "Invalid or expired OTP" });
      }
      await Otp.deleteOne({ email: email.toLowerCase() });
    }

    user.lastLogin = Date.now();
    await user.save();

    const payload = { user: { id: user.id, role: user.role } };
    const token = jwt.sign(payload, process.env.JWT_SECRET || "secret", {
      expiresIn: "7d",
    });

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server error");
  }
});

/**
 * @route POST api/auth/logout
 */
router.post("/logout", (req, res) => {
  res.clearCookie("token");
  res.json({ msg: "Logged out successfully" });
});

/**
 * @route GET api/auth/me
 */
router.get("/me", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-passwordHash");
    res.json(user);
  } catch (err) {
    res.status(500).send("Server Error");
  }
});

module.exports = router;
