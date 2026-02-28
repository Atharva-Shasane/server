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
        from: "Killa Resto <onboarding@resend.dev>",
        to: email,
        subject: `${otp} is your Killa Resto verification code`,
        html: `
          <div style="font-family: 'Poppins', sans-serif; max-width: 500px; margin: auto; padding: 40px; border: 1px solid #222; border-radius: 24px; background: #0a0a0a; color: white;">
            <h2 style="color: #ff6600; font-size: 24px; font-weight: 800; margin-bottom: 20px;">Identity Verification</h2>
            <p style="color: #aaa; font-size: 16px; line-height: 1.6;">Use the following legendary code to secure your session. This code is valid for 5 minutes.</p>
            <div style="font-size: 42px; font-weight: 900; letter-spacing: 10px; color: #ff6600; margin: 30px 0; text-align: center; background: #111; padding: 20px; border-radius: 12px; border: 1px solid #333;">
              ${otp}
            </div>
            <p style="color: #666; font-size: 13px;">If you didn't request this code, you can safely ignore this email.</p>
          </div>
        `,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("❌ [RESEND API ERROR]:", data);
      throw new Error(data.message || "Failed to send email");
    }

    console.log(
      `✅ [AUTH] Email sent successfully to ${email}. ID: ${data.id}`,
    );
  } catch (error) {
    console.error("❌ [EMAIL SYSTEM FAILURE]:", error.message);
    console.log(`[EMERGENCY OTP LOG] Code for ${email}: ${otp}`);
  }
}

const generateOTP = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

const isPasswordStrong = (pwd) => {
  const regex = /^(?=.*[A-Z])(?=.*[!@#$%^&*])(?=.{6,})/;
  return regex.test(pwd);
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
    await Otp.findOneAndUpdate(
      { email: email.toLowerCase() },
      { otp, attempts: 0, createdAt: new Date() },
      { upsert: true, new: true },
    );

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
    return res
      .status(400)
      .json({ msg: "Password does not meet security requirements" });
  }

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
    await Otp.deleteOne({ email: email.toLowerCase() });

    const payload = { user: { id: user.id, role: user.role } };
    const token = jwt.sign(payload, process.env.JWT_SECRET || "secret", {
      expiresIn: "1h", // JWT expires in 1 hour
    });

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Lax",
      maxAge: 1 * 60 * 60 * 1000, // Cookie expires in 1 hour (3600000 ms)
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
          { upsert: true },
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
      expiresIn: "1h", // JWT expires in 1 hour
    });

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Lax",
      maxAge: 1 * 60 * 60 * 1000, // Cookie expires in 1 hour
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
    res.status(500).send("Server Error");
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
