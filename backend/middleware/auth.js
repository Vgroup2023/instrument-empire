const jwt = require('jsonwebtoken');

function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'dev_secret');
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
}

function approvedCarrierOnly(req, res, next) {
  if (req.user?.role === 'admin') return next();
  if (req.user?.role === 'carrier' && req.user?.carrierStatus === 'Approved') return next();
  res.status(403).json({ error: 'Approved carrier access required' });
}

module.exports = { auth, adminOnly, approvedCarrierOnly };
