const express = require('express');
const router = express.Router();
const db = require('../server').db;
const { authenticateToken, requireRole } = require('../middleware/auth');

// 获取所有课程
router.get('/', authenticateToken, (req, res) => {
    const query = `
        SELECT c.*, 
               COUNT(DISTINCT p.id) as post_count,
               COUNT(DISTINCT cm.id) as comment_count
        FROM courses c
        LEFT JOIN posts p ON c.id = p.course_id
        LEFT JOIN comments cm ON p.id = cm.post_id
        WHERE c.is_active = 1
        GROUP BY c.id
        ORDER BY c.created_at DESC
    `;
    
    db.all(query, [], (err, courses) => {
        if (err) {
            console.error('获取课程列表错误:', err);
            return res.status(500).json({ error: '获取课程失败' });
        }
        
        res.json({
            success: true,
            courses: courses || []
        });
    });
});

// 获取单个课程详情
router.get('/:id', authenticateToken, (req, res) => {
    const courseId = req.params.id;
    
    const query = `
        SELECT c.*, 
               COUNT(DISTINCT p.id) as post_count,
               COUNT(DISTINCT cm.id) as comment_count
        FROM courses c
        LEFT JOIN posts p ON c.id = p.course_id
        LEFT JOIN comments cm ON p.id = cm.post_id
        WHERE c.id = ? AND c.is_active = 1
        GROUP BY c.id
    `;
    
    db.get(query, [courseId], (err, course) => {
        if (err) {
            console.error('获取课程详情错误:', err);
            return res.status(500).json({ error: '获取课程失败' });
        }
        
        if (!course) {
            return res.status(404).json({ error: '课程不存在' });
        }
        
        res.json({
            success: true,
            course
        });
    });
});

// 创建新课程 (TA only)
router.post('/', authenticateToken, requireRole('ta'), (req, res) => {
    const { name, description } = req.body;
    
    if (!name || name.trim().length === 0) {
        return res.status(400).json({ error: '课程名称不能为空' });
    }
    
    db.run(
        'INSERT INTO courses (name, description, ta_id, ta_name) VALUES (?, ?, ?, ?)',
        [name.trim(), description?.trim() || '', req.user.id, req.user.displayName],
        function(err) {
            if (err) {
                console.error('创建课程错误:', err);
                return res.status(500).json({ error: '创建课程失败' });
            }
            
            res.status(201).json({
                success: true,
                message: '课程创建成功',
                course: {
                    id: this.lastID,
                    name: name.trim(),
                    description: description?.trim() || '',
                    ta_id: req.user.id,
                    ta_name: req.user.displayName
                }
            });
        }
    );
});

// 更新课程 (TA only)
router.put('/:id', authenticateToken, requireRole('ta'), (req, res) => {
    const courseId = req.params.id;
    const { name, description } = req.body;
    
    if (!name || name.trim().length === 0) {
        return res.status(400).json({ error: '课程名称不能为空' });
    }
    
    db.run(
        'UPDATE courses SET name = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [name.trim(), description?.trim() || '', courseId],
        function(err) {
            if (err) {
                console.error('更新课程错误:', err);
                return res.status(500).json({ error: '更新课程失败' });
            }
            
            if (this.changes === 0) {
                return res.status(404).json({ error: '课程不存在' });
            }
            
            res.json({
                success: true,
                message: '课程更新成功'
            });
        }
    );
});

// 删除课程 (TA only)
router.delete('/:id', authenticateToken, requireRole('ta'), (req, res) => {
    const courseId = req.params.id;
    
    // 软删除：标记为不活跃
    db.run(
        'UPDATE courses SET is_active = 0 WHERE id = ?',
        [courseId],
        function(err) {
            if (err) {
                console.error('删除课程错误:', err);
                return res.status(500).json({ error: '删除课程失败' });
            }
            
            if (this.changes === 0) {
                return res.status(404).json({ error: '课程不存在' });
            }
            
            res.json({
                success: true,
                message: '课程删除成功'
            });
        }
    );
});

// 获取课程统计
router.get('/:id/stats', authenticateToken, (req, res) => {
    const courseId = req.params.id;
    
    const query = `
        SELECT 
            COUNT(DISTINCT p.id) as total_posts,
            COUNT(DISTINCT CASE WHEN p.type = 'Question' THEN p.id END) as question_posts,
            COUNT(DISTINCT CASE WHEN p.type = 'Announcement' THEN p.id END) as announcement_posts,
            COUNT(DISTINCT CASE WHEN p.type = 'Material' THEN p.id END) as material_posts,
            COUNT(DISTINCT cm.id) as total_comments,
            COUNT(DISTINCT p.author_id) as active_users
        FROM courses c
        LEFT JOIN posts p ON c.id = p.course_id AND p.status = 'Published'
        LEFT JOIN comments cm ON p.id = cm.post_id AND cm.status = 'Published'
        WHERE c.id = ? AND c.is_active = 1
    `;
    
    db.get(query, [courseId], (err, stats) => {
        if (err) {
            console.error('获取课程统计错误:', err);
            return res.status(500).json({ error: '获取统计失败' });
        }
        
        res.json({
            success: true,
            stats: stats || {
                total_posts: 0,
                question_posts: 0,
                announcement_posts: 0,
                material_posts: 0,
                total_comments: 0,
                active_users: 0
            }
        });
    });
});

module.exports = router;