import jwt from 'jsonwebtoken';
import db from './localdb.js';

const JWT_SECRET = process.env.JWT_SECRET;

export function generateToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
}

export function verifyToken(token) {
  try {
    console.log(`[Auth] Verifying token with secret: ${JWT_SECRET}`);
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    console.log(`[Auth] Token verification failed: ${err.message}`);
    return null;
  }
}

export function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.split(' ')[1];
  const decoded = verifyToken(token);

  if (!decoded) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.user = decoded;
  next();
}

export function roleMiddleware(allowedRoles) {
  return (req, res, next) => {
    if (req.user && allowedRoles.includes(req.user.role)) {
      next();
    } else {
      res.status(403).json({ error: `Required role: ${allowedRoles.join(' or ')}` });
    }
  };
}

export function adminMiddleware(req, res, next) {
  return roleMiddleware(['admin'])(req, res, next);
}
