const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const db = require('../server').db;
const { authenticateToken } = require('../middleware/auth');

// 文件下载
router.get('/download/:filename', authenticateToken, (req, res) => {
    const filename = req.params.filename;
    
    // 查找文件信息
    db.get('SELECT * FROM posts WHERE file_path = ?', [filename], (err, post) => {
        if (err) {
            console.error('查找文件错误:', err);
            return res.status(500).json({ error: '服务器错误' });
        }
        
        if (!post) {
            return res.status(404).json({ error: '文件不存在' });
        }
        
        // 检查权限：课程成员可以下载
        db.get('SELECT * FROM courses WHERE id = ? AND is_active = 1', [post.course_id], (err, course) => {
            if (err) {
                return res.status(500).json({ error: '服务器错误' });
            }
            
            if (!course) {
                return res.status(404).json({ error: '课程不存在' });
            }
            
            const filePath = path.join(__dirname, '../uploads', `user_${post.author_id}`, filename);
            
            if (!fs.existsSync(filePath)) {
                return res.status(404).json({ error: '文件不存在' });
            }
            
            // 设置下载头信息
            res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(post.file_name)}"`);
            res.setHeader('Content-Type', 'application/octet-stream');
            res.setHeader('Content-Length', post.file_size);
            
            // 发送文件
            res.sendFile(filePath);
        });
    });
});

// 获取文件信息
router.get('/info/:filename', authenticateToken, (req, res) => {
    const filename = req.params.filename;
    
    db.get(`
        SELECT p.file_name, p.file_size, p.timestamp, p.author_name, c.name as course_name
        FROM posts p
        LEFT JOIN courses c ON p.course_id = c.id
        WHERE p.file_path = ? AND p.status = 'Published' AND c.is_active = 1
    `, [filename], (err, fileInfo) => {
        if (err) {
            console.error('获取文件信息错误:', err);
            return res.status(500).json({ error: '服务器错误' });
        }
        
        if (!fileInfo) {
            return res.status(404).json({ error: '文件不存在' });
        }
        
        res.json({
            success: true,
            file: fileInfo
        });
    });
});

// 文件预览 (仅支持图片和PDF)
router.get('/preview/:filename', authenticateToken, (req, res) => {
    const filename = req.params.filename;
    
    db.get('SELECT * FROM posts WHERE file_path = ?', [filename], (err, post) => {
        if (err) {
            return res.status(500).json({ error: '服务器错误' });
        }
        
        if (!post) {
            return res.status(404).json({ error: '文件不存在' });
        }
        
        const filePath = path.join(__dirname, '../uploads', `user_${post.author_id}`, filename);
        const fileExt = path.extname(post.file_name).toLowerCase();
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: '文件不存在' });
        }
        
        // 只支持图片和PDF预览
        const imageTypes = ['.jpg', '.jpeg', '.png', '.gif', '.bmp'];
        if (imageTypes.includes(fileExt)) {
            res.setHeader('Content-Type', 'image/' + fileExt.substring(1));
            res.sendFile(filePath);
        } else if (fileExt === '.pdf') {
            res.setHeader('Content-Type', 'application/pdf');
            res.sendFile(filePath);
        } else {
            res.status(400).json({ error: '不支持预览此文件类型' });
        }
    });
});

module.exports = router;