const jwt = require("jsonwebtoken");

module.exports = function (req, res, next) {
  // 1. Get token from cookies
  const token = req.cookies.token;

  // 2. Check if no token
  if (!token) {
    return res.status(401).json({ msg: "No token, authorization denied" });
  }

  // 3. Verify token
  // JWT_SECRET is guaranteed to exist — server.js crashes at startup if missing
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded.user;
    next();
  } catch (err) {
    res.status(401).json({ msg: "Token is not valid" });
  }
};