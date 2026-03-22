module.exports = function (req, res, next) {
  // 403 Forbidden if not an owner
  // req.user is populated by the auth middleware
  if (!req.user || req.user.role !== "OWNER") {
    return res.status(403).json({ msg: "Access denied. Owners only." });
  }
  next();
};