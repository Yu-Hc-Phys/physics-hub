const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const router = express.Router();
const db = require('../server').db;
const { authenticateToken } = require('../middleware/auth');

const JWT_SECRET = process.env.JWT_SECRET || 'physics-hub-pku-2024-secure-key';

// 用户登录
router.post('/login', async (req, res) => {
    const { userId, password } = req.body;
    
    if (!userId || !password) {
        return res.status(400).json({ error: '用户ID和密码不能为空' });
    }

    try {
        const userEmail = `user${userId.padStart(3, '0')}@hub.edu`;
        
        db.get('SELECT * FROM users WHERE email = ? AND is_active = 1', [userEmail], async (err, user) => {
            if (err) {
                console.error('数据库查询错误:', err);
                return res.status(500).json({ error: '服务器内部错误' });
            }
            
            if (!user) {
                return res.status(400).json({ error: '用户不存在' });
            }
            
            // 验证密码
            const validPassword = await bcrypt.compare(password, user.password);
            if (!validPassword) {
                return res.status(400).json({ error: '密码错误' });
            }
            
            // 更新最后登录时间
            db.run('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);
            
            // 生成JWT令牌
            const token = jwt.sign(
                { 
                    id: user.id, 
                    email: user.email, 
                    displayName: user.display_name,
                    role: user.role 
                }, 
                JWT_SECRET, 
                { expiresIn: '7d' }
            );
            
            res.json({
                success: true,
                token,
                user: {
                    id: user.id,
                    email: user.email,
                    displayName: user.display_name,
                    role: user.role
                },
                message: '登录成功'
            });
        });
    } catch (error) {
        console.error('登录错误:', error);
        res.status(500).json({ error: '服务器内部错误' });
    }
});

// 获取用户信息
router.get('/profile', authenticateToken, (req, res) => {
    res.json({
        success: true,
        user: {
            id: req.user.id,
            email: req.user.email,
            displayName: req.user.displayName,
            role: req.user.role
        }
    });
});

// 更新用户资料
router.put('/profile', authenticateToken, (req, res) => {
    const { displayName } = req.body;
    
    if (!displayName || displayName.trim().length === 0) {
        return res.status(400).json({ error: '显示名称不能为空' });
    }
    
    db.run('UPDATE users SET display_name = ? WHERE id = ?', [displayName.trim(), req.user.id], function(err) {
        if (err) {
            console.error('更新用户资料错误:', err);
            return res.status(500).json({ error: '更新失败' });
        }
        
        res.json({ 
            success: true,
            message: '资料更新成功',
            displayName: displayName.trim()
        });
    });
});

// 更新密码
router.put('/password', authenticateToken, async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: '当前密码和新密码不能为空' });
    }
    
    if (newPassword.length < 6) {
        return res.status(400).json({ error: '新密码至少需要6位' });
    }
    
    try {
        // 验证当前密码
        db.get('SELECT password FROM users WHERE id = ?', [req.user.id], async (err, user) => {
            if (err) {
                return res.status(500).json({ error: '服务器错误' });
            }
            
            const validPassword = await bcrypt.compare(currentPassword, user.password);
            if (!validPassword) {
                return res.status(400).json({ error: '当前密码错误' });
            }
            
            // 更新密码
            const hashedPassword = await bcrypt.hash(newPassword, 12);
            db.run('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, req.user.id], function(err) {
                if (err) {
                    return res.status(500).json({ error: '密码更新失败' });
                }
                
                res.json({ 
                    success: true,
                    message: '密码更新成功'
                });
            });
        });
    } catch (error) {
        console.error('密码更新错误:', error);
        res.status(500).json({ error: '服务器内部错误' });
    }
});

// 用户注销
router.post('/logout', authenticateToken, (req, res) => {
    // JWT是无状态的，客户端只需删除token即可
    res.json({ 
        success: true,
        message: '注销成功'
    });
});

module.exports = router;