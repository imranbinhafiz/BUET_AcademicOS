const jwt = require('jsonwebtoken');

// Verifies the JWT sent in the Authorization header and attaches the
// decoded payload (user_id, role) to req.user for use in protected routes.
//
// Usage in a route file:
//   const { verifyToken } = require('../middleware/auth');
//   router.post('/', verifyToken, async (req, res) => { ... req.user.user_id ... });

function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { user_id, role, iat, exp }
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired, please log in again' });
    }
    return res.status(401).json({ message: 'Invalid token' });
  }
}

// Optional: restrict a route to specific roles, e.g. requireRole('admin').
// Must be used AFTER verifyToken, since it relies on req.user being set.
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'No token provided' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }
    next();
  };
}

// Like verifyToken, but never rejects the request — used on public routes
// (like browsing resources) where we still want to know who's logged in
// if anyone, e.g. to show their own vote as highlighted. Anonymous
// visitors just get req.user left undefined and continue normally.
function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      req.user = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      // Invalid or expired token on a public route — treat as anonymous
      // rather than blocking the request entirely.
    }
  }

  next();
}

module.exports = { verifyToken, optionalAuth, requireRole };