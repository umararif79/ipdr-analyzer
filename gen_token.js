import jwt from 'jsonwebtoken';
const JWT_SECRET = process.env.JWT_SECRET || 'ipdr-secret-key-2026';
const token = jwt.sign(
  { id: 13, username: 'admin', role: 'admin' },
  JWT_SECRET,
  { expiresIn: '24h' }
);
console.log(token);
