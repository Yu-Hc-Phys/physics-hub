const express = require('express');
const router = express.Router();
const db = require('../server').db;
const { authenticateToken, requireRole } = require('../middleware/auth');
const { moderateContent } = require('../utils/moderation');

// 获取帖子的评论
router.get('/post/:postId', authenticateToken, (req, res) => {
    const postId = req.params.postId;
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    
    let query = `
        SELECT c.* 
        FROM comments c
        LEFT JOIN posts p ON c.post_id = p.id
        WHERE c.post_id = ? AND p.status = 'Published'
    `;
    
    let params = [postId];
    
    // 关键修复：根据用户角色显示不同的评论
    if (req.user.role !== 'ta') {
        query += ' AND c.status = "Published"';
    }
    
    query += ' ORDER BY c.timestamp ASC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    db.all(query, params, (err, comments) => {
        if (err) {
            console.error('获取评论错误:', err);
            return res.status(500).json({ error: '获取评论失败' });
        }
        
        // 获取评论总数
        let countQuery = 'SELECT COUNT(*) as total FROM comments c LEFT JOIN posts p ON c.post_id = p.id WHERE c.post_id = ? AND p.status = "Published"';
        let countParams = [postId];
        
        if (req.user.role !== 'ta') {
            countQuery += ' AND c.status = "Published"';
        }
        
        db.get(countQuery, countParams, (err, countResult) => {
            if (err) {
                console.error('获取评论总数错误:', err);
                return res.status(500).json({ error: '获取评论失败' });
            }
            
            res.json({
                success: true,
                comments: comments || [],
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: countResult.total,
                    pages: Math.ceil(countResult.total / limit)
                }
            });
        });
    });
});

// 创建评论 - 修复审核调用
router.post('/', authenticateToken, async (req, res) => {
    const { postId, content, visibility = 'Public' } = req.body;
    
    if (!postId || !content || content.trim().length === 0) {
        return res.status(400).json({ error: '帖子和评论内容不能为空' });
    }
    
    // 检查帖子是否存在且已发布
    db.get('SELECT * FROM posts WHERE id = ? AND status = "Published"', [postId], async (err, post) => {
        if (err) {
            return res.status(500).json({ error: '服务器错误' });
        }
        
        if (!post) {
            return res.status(404).json({ error: '帖子不存在' });
        }
        
        try {
            // 关键修复：正确调用审核函数
            console.log('开始评论内容审核...');
            let commentStatus = 'Published';
            
            // 只有学生发布的内容需要审核，TA发布的内容自动通过
            if (req.user.role !== 'ta') {
                try {
                    const moderationResult = await moderateContent(content);
                    commentStatus = moderationResult;
                    console.log('评论内容审核结果:', moderationResult);
                } catch (modError) {
                    console.error('评论内容审核失败:', modError);
                    // 审核失败时，内容设为待审核状态以确保安全
                    commentStatus = 'PendingReview';
                }
            } else {
                console.log('TA发布评论，自动通过审核');
            }
            
            const authorName = visibility === 'Anonymous' ? 'Anonymous Responder' : req.user.displayName;
            
            db.run(
                `INSERT INTO comments (post_id, content, author_id, author_name, visibility, status, timestamp) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [postId, content.trim(), req.user.id, authorName, visibility, commentStatus, new Date().toISOString()],
                function(err) {
                    if (err) {
                        console.error('创建评论错误:', err);
                        return res.status(500).json({ error: '评论失败: ' + err.message });
                    }
                    
                    const response = {
                        success: true,
                        message: '评论成功',
                        commentId: this.lastID,
                        status: commentStatus
                    };
                    
                    if (commentStatus === 'PendingReview') {
                        response.message = '您的评论已提交，正在等待审核。审核通过后将对其他用户可见。';
                    }
                    
                    console.log('评论创建成功:', response);
                    res.status(201).json(response);
                }
            );
        } catch (error) {
            console.error('创建评论错误:', error);
            res.status(500).json({ error: '评论失败: ' + error.message });
        }
    });
});

// 更新评论
router.put('/:id', authenticateToken, async (req, res) => {
    const commentId = req.params.id;
    const { content, visibility } = req.body;
    
    // 检查评论是否存在且属于当前用户
    db.get('SELECT * FROM comments WHERE id = ? AND author_id = ?', [commentId, req.user.id], async (err, comment) => {
        if (err) {
            return res.status(500).json({ error: '服务器错误' });
        }
        
        if (!comment) {
            return res.status(404).json({ error: '评论不存在或无权编辑' });
        }
        
        try {
            // 关键修复：重新审核更新后的内容
            let commentStatus = comment.status;
            if (req.user.role !== 'ta') {
                const moderationResult = await moderateContent(content);
                commentStatus = moderationResult;
            }
            
            db.run(
                'UPDATE comments SET content = ?, visibility = ?, status = ? WHERE id = ?',
                [content.trim(), visibility || comment.visibility, commentStatus, commentId],
                function(err) {
                    if (err) {
                        console.error('更新评论错误:', err);
                        return res.status(500).json({ error: '更新失败' });
                    }
                    
                    const response = {
                        success: true,
                        message: '评论更新成功',
                        status: commentStatus
                    };
                    
                    if (commentStatus === 'PendingReview') {
                        response.message = '您的修改已提交，正在等待审核';
                    }
                    
                    res.json(response);
                }
            );
        } catch (error) {
            console.error('更新评论错误:', error);
            res.status(500).json({ error: '更新失败' });
        }
    });
});

// 删除评论
router.delete('/:id', authenticateToken, (req, res) => {
    const commentId = req.params.id;
    
    // 检查权限：评论作者或TA可以删除
    db.get('SELECT * FROM comments WHERE id = ?', [commentId], (err, comment) => {
        if (err) {
            return res.status(500).json({ error: '服务器错误' });
        }
        
        if (!comment) {
            return res.status(404).json({ error: '评论不存在' });
        }
        
        if (comment.author_id !== req.user.id && req.user.role !== 'ta') {
            return res.status(403).json({ error: '无权删除此评论' });
        }
        
        db.run('DELETE FROM comments WHERE id = ?', [commentId], function(err) {
            if (err) {
                console.error('删除评论错误:', err);
                return res.status(500).json({ error: '删除失败' });
            }
            
            res.json({
                success: true,
                message: '评论删除成功'
            });
        });
    });
});

// 获取待审核评论 (TA only)
router.get('/moderation/pending', authenticateToken, requireRole('ta'), (req, res) => {
    const query = `
        SELECT c.*, p.title as post_title, p.course_id, crs.name as course_name
        FROM comments c
        LEFT JOIN posts p ON c.post_id = p.id
        LEFT JOIN courses crs ON p.course_id = crs.id
        WHERE c.status = 'PendingReview'
        ORDER BY c.timestamp ASC
    `;
    
    db.all(query, [], (err, comments) => {
        if (err) {
            console.error('获取待审核评论错误:', err);
            return res.status(500).json({ error: '获取失败' });
        }
        
        res.json({
            success: true,
            comments: comments || []
        });
    });
});

// 审核评论 (TA only)
router.post('/:id/moderate', authenticateToken, requireRole('ta'), (req, res) => {
    const commentId = req.params.id;
    const { action, reason } = req.body;
    
    if (!['approve', 'reject'].includes(action)) {
        return res.status(400).json({ error: '无效的操作' });
    }
    
    const newStatus = action === 'approve' ? 'Published' : 'Rejected';
    
    db.run('UPDATE comments SET status = ? WHERE id = ?', [newStatus, commentId], function(err) {
        if (err) {
            console.error('审核评论错误:', err);
            return res.status(500).json({ error: '审核失败' });
        }
        
        if (this.changes === 0) {
            return res.status(404).json({ error: '评论不存在' });
        }
        
        // 记录审核日志
        db.run(
            'INSERT INTO moderation_logs (content_type, content_id, action, moderator_id, reason) VALUES (?, ?, ?, ?, ?)',
            ['comment', commentId, action, req.user.id, reason || '']
        );
        
        res.json({
            success: true,
            message: `评论已${action === 'approve' ? '通过' : '拒绝'}`
        });
    });
});

module.exports = router;