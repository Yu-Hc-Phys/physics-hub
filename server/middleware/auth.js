const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'physics-hub-pku-2024-secure-key';

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: '访问令牌缺失' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: '令牌无效或已过期' });
        }
        req.user = user;
        next();
    });
}

function requireRole(role) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: '未认证' });
        }
        
        if (req.user.role !== role && req.user.role !== 'ta') {
            return res.status(403).json({ error: '权限不足' });
        }
        
        next();
    };
}

module.exports = {
    authenticateToken,
    requireRole
};