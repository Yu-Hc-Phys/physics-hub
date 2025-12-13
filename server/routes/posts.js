const express = require('express');
const router = express.Router();
const { authenticateToken, requireRole } = require('../middleware/auth');
const { upload } = require('../middleware/upload');
const { moderateContent } = require('../utils/moderation');

// 获取数据库实例
const { db } = require('../server');

// 获取帖子列表
router.get('/', authenticateToken, (req, res) => {
    const { courseId, type, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const userId = req.user.id;
    
    let query = `
        SELECT p.*, 
               c.name as course_name,
               COUNT(DISTINCT v.id) as vote_count,
               COUNT(DISTINCT cm.id) as comment_count,
               EXISTS(SELECT 1 FROM votes WHERE post_id = p.id AND user_id = ?) as user_voted
        FROM posts p
        LEFT JOIN courses c ON p.course_id = c.id
        LEFT JOIN votes v ON p.id = v.post_id
        LEFT JOIN comments cm ON p.id = cm.post_id AND cm.status = 'Published'
        WHERE c.is_active = 1
    `;
    
    let params = [userId];
    
    // 关键修复：根据用户角色显示不同的内容
    if (req.user.role !== 'ta') {
        query += ' AND p.status = "Published"';
    }
    
    if (courseId) {
        query += ' AND p.course_id = ?';
        params.push(courseId);
    } else {
        query += ' AND 1=0';
    }
    
    if (type && type !== 'All') {
        query += ' AND p.type = ?';
        params.push(type);
    }
    
    query += ' GROUP BY p.id ORDER BY p.timestamp DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    
    console.log('执行查询:', query, '参数:', params);
    
    db.all(query, params, (err, posts) => {
        if (err) {
            console.error('获取帖子列表错误:', err);
            return res.status(500).json({ error: '获取帖子失败' });
        }
        
        let countQuery = 'SELECT COUNT(DISTINCT p.id) as total FROM posts p LEFT JOIN courses c ON p.course_id = c.id WHERE c.is_active = 1';
        let countParams = [];
        
        if (req.user.role !== 'ta') {
            countQuery += ' AND p.status = "Published"';
        }
        
        if (courseId) {
            countQuery += ' AND p.course_id = ?';
            countParams.push(courseId);
        } else {
            countQuery += ' AND 1=0';
        }
        
        if (type && type !== 'All') {
            countQuery += ' AND p.type = ?';
            countParams.push(type);
        }
        
        db.get(countQuery, countParams, (err, countResult) => {
            if (err) {
                console.error('获取帖子总数错误:', err);
                return res.status(500).json({ error: '获取帖子失败' });
            }
            
            res.json({
                success: true,
                posts: posts || [],
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: countResult?.total || 0,
                    pages: Math.ceil((countResult?.total || 0) / limit)
                }
            });
        });
    });
});

// 获取单个帖子
router.get('/:id', authenticateToken, (req, res) => {
    const postId = req.params.id;
    
    const query = `
        SELECT p.*, 
               c.name as course_name,
               COUNT(DISTINCT v.id) as vote_count,
               COUNT(DISTINCT cm.id) as comment_count,
               EXISTS(SELECT 1 FROM votes WHERE post_id = p.id AND user_id = ?) as user_voted
        FROM posts p
        LEFT JOIN courses c ON p.course_id = c.id
        LEFT JOIN votes v ON p.id = v.post_id
        LEFT JOIN comments cm ON p.id = cm.post_id AND cm.status = 'Published'
        WHERE p.id = ? AND c.is_active = 1
        GROUP BY p.id
    `;
    
    db.get(query, [req.user.id, postId], (err, post) => {
        if (err) {
            console.error('获取帖子错误:', err);
            return res.status(500).json({ error: '获取帖子失败' });
        }
        
        if (!post) {
            return res.status(404).json({ error: '帖子不存在' });
        }
        
        // 关键修复：只有已发布的帖子才增加浏览量
        if (post.status === 'Published') {
            db.run('UPDATE posts SET view_count = view_count + 1 WHERE id = ?', [postId]);
        }
        
        res.json({
            success: true,
            post
        });
    });
});

// 创建新帖子 - 修复审核逻辑
router.post('/', authenticateToken, async (req, res) => {
    const contentType = req.headers['content-type'] || '';
    
    let courseId, title, content, type, visibility;
    let file = null;

    try {
        if (contentType.includes('multipart/form-data')) {
            await new Promise((resolve, reject) => {
                upload.single('file')(req, res, (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });

            courseId = req.body.courseId;
            title = req.body.title;
            content = req.body.content;
            type = req.body.type;
            visibility = req.body.visibility;
            file = req.file;
        } else if (contentType.includes('application/json')) {
            ({ courseId, title, content, type, visibility = 'Public' } = req.body);
        } else {
            return res.status(400).json({ error: '不支持的 Content-Type' });
        }

        if (!courseId || !title || !content || !type) {
            return res.status(400).json({ error: '课程、标题、内容和类型不能为空' });
        }

        if ((type === 'Announcement' || type === 'Material') && req.user.role !== 'ta') {
            return res.status(403).json({ error: '只有TA可以发布公告和资料' });
        }

        // 关键修复：正确调用审核函数
        console.log('开始内容审核...');
        let postStatus = 'Published';
        
        // 只有学生发布的内容需要审核，TA发布的内容自动通过
        if (req.user.role !== 'ta') {
            try {
                const moderationResult = await moderateContent(title + "\n\n" + content);
                postStatus = moderationResult;
                console.log('内容审核结果:', moderationResult);
            } catch (modError) {
                console.error('内容审核失败:', modError);
                // 审核失败时，内容设为待审核状态以确保安全
                postStatus = 'PendingReview';
            }
        } else {
            console.log('TA发布内容，自动通过审核');
        }

        const postData = {
            course_id: courseId,
            title: title.trim(),
            content: content.trim(),
            type,
            author_id: req.user.id,
            author_name: visibility === 'Anonymous' ? 'Anonymous Atom' : req.user.displayName,
            visibility,
            status: postStatus,
            timestamp: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            view_count: 0,
            vote_count: 0,
            comment_count: 0
        };

        if (file) {
            postData.file_name = file.originalname;
            postData.file_path = file.filename;
            postData.file_size = file.size;
        }

        db.run(
            `INSERT INTO posts (course_id, title, content, type, author_id, author_name, visibility, status, file_name, file_path, file_size, timestamp, updated_at, view_count, vote_count, comment_count) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                postData.course_id, postData.title, postData.content, postData.type, postData.author_id, 
                postData.author_name, postData.visibility, postData.status, postData.file_name, 
                postData.file_path, postData.file_size, postData.timestamp, postData.updated_at,
                postData.view_count, postData.vote_count, postData.comment_count
            ],
            function(err) {
                if (err) {
                    console.error('创建帖子错误:', err);
                    return res.status(500).json({ error: '发布失败: ' + err.message });
                }

                const response = {
                    success: true,
                    message: '发布成功',
                    postId: this.lastID,
                    status: postStatus
                };

                if (postStatus === 'PendingReview') {
                    response.message = '您的帖子已提交，正在等待审核。审核通过后将对其他用户可见。';
                }

                console.log('帖子创建成功:', response);
                res.status(201).json(response);
            }
        );

    } catch (error) {
        console.error('创建帖子错误:', error);
        
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: '文件大小超过限制 (20MB)' });
        }
        if (error.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({ error: '只能上传一个文件' });
        }
        
        res.status(500).json({ error: '发布失败: ' + error.message });
    }
});

// 更新帖子
router.put('/:id', authenticateToken, upload.single('file'), async (req, res) => {
    const postId = req.params.id;
    const { title, content, visibility } = req.body;
    
    db.get('SELECT * FROM posts WHERE id = ? AND author_id = ?', [postId, req.user.id], async (err, post) => {
        if (err) {
            return res.status(500).json({ error: '服务器错误' });
        }
        
        if (!post) {
            return res.status(404).json({ error: '帖子不存在或无权编辑' });
        }
        
        try {
            // 关键修复：重新审核更新后的内容
            let postStatus = post.status;
            if (req.user.role !== 'ta') {
                const moderationResult = await moderateContent(title + "\n\n" + content);
                postStatus = moderationResult;
            }
            
            const updateData = {
                title: title?.trim() || post.title,
                content: content?.trim() || post.content,
                visibility: visibility || post.visibility,
                status: postStatus,
                updated_at: new Date().toISOString()
            };
            
            let query = 'UPDATE posts SET title = ?, content = ?, visibility = ?, status = ?, updated_at = ?';
            let params = [updateData.title, updateData.content, updateData.visibility, updateData.status, updateData.updated_at];
            
            if (req.file) {
                query += ', file_name = ?, file_path = ?, file_size = ?';
                params.push(req.file.originalname, req.file.filename, req.file.size);
            }
            
            query += ' WHERE id = ?';
            params.push(postId);
            
            db.run(query, params, function(err) {
                if (err) {
                    console.error('更新帖子错误:', err);
                    return res.status(500).json({ error: '更新失败' });
                }
                
                const response = {
                    success: true,
                    message: '更新成功',
                    status: postStatus
                };
                
                if (postStatus === 'PendingReview') {
                    response.message = '您的修改已提交，正在等待审核';
                }
                
                res.json(response);
            });
        } catch (error) {
            console.error('更新帖子错误:', error);
            res.status(500).json({ error: '更新失败' });
        }
    });
});

// 删除帖子
router.delete('/:id', authenticateToken, (req, res) => {
    const postId = req.params.id;
    console.log(`删除帖子请求: ID=${postId}, 用户ID=${req.user.id}, 用户角色=${req.user.role}`);
    
    db.get('SELECT * FROM posts WHERE id = ?', [postId], (err, post) => {
        if (err) {
            console.error('查询帖子错误:', err);
            return res.status(500).json({ error: '服务器错误' });
        }
        
        if (!post) {
            console.log('帖子不存在:', postId);
            return res.status(404).json({ error: '帖子不存在' });
        }
        
        // 检查权限：帖子作者或TA可以删除
        if (post.author_id !== req.user.id && req.user.role !== 'ta') {
            console.log('权限不足: 用户', req.user.id, '尝试删除帖子', postId, '作者为', post.author_id);
            return res.status(403).json({ error: '无权删除此帖子' });
        }
        
        db.run('DELETE FROM posts WHERE id = ?', [postId], function(err) {
            if (err) {
                console.error('删除帖子错误:', err);
                return res.status(500).json({ error: '删除失败' });
            }
            
            console.log(`帖子删除成功: ID=${postId}, 影响行数=${this.changes}`);
            res.json({
                success: true,
                message: '帖子删除成功'
            });
        });
    });
});

// 投票功能
router.post('/:id/vote', authenticateToken, (req, res) => {
    const postId = req.params.id;
    const userId = req.user.id;
    
    // 检查是否已经投票
    db.get('SELECT * FROM votes WHERE post_id = ? AND user_id = ?', [postId, userId], (err, existingVote) => {
        if (err) {
            return res.status(500).json({ error: '服务器错误' });
        }
        
        if (existingVote) {
            // 取消投票
            db.run('DELETE FROM votes WHERE post_id = ? AND user_id = ?', [postId, userId], function(err) {
                if (err) {
                    return res.status(500).json({ error: '取消投票失败' });
                }
                res.json({ success: true, voted: false });
            });
        } else {
            // 添加投票
            db.run('INSERT INTO votes (post_id, user_id) VALUES (?, ?)', [postId, userId], function(err) {
                if (err) {
                    return res.status(500).json({ error: '投票失败' });
                }
                res.json({ success: true, voted: true });
            });
        }
    });
});

// 获取待审核帖子 (TA only)
router.get('/moderation/pending', authenticateToken, requireRole('ta'), (req, res) => {
    const query = `
        SELECT p.*, c.name as course_name
        FROM posts p
        LEFT JOIN courses c ON p.course_id = c.id
        WHERE p.status = 'PendingReview'
        ORDER BY p.timestamp ASC
    `;
    
    db.all(query, [], (err, posts) => {
        if (err) {
            console.error('获取待审核帖子错误:', err);
            return res.status(500).json({ error: '获取失败' });
        }
        
        res.json({
            success: true,
            posts: posts || []
        });
    });
});

// 审核帖子 (TA only)
router.post('/:id/moderate', authenticateToken, requireRole('ta'), (req, res) => {
    const postId = req.params.id;
    const { action, reason } = req.body;
    
    if (!['approve', 'reject'].includes(action)) {
        return res.status(400).json({ error: '无效的操作' });
    }
    
    const newStatus = action === 'approve' ? 'Published' : 'Rejected';
    
    db.run('UPDATE posts SET status = ? WHERE id = ?', [newStatus, postId], function(err) {
        if (err) {
            console.error('审核帖子错误:', err);
            return res.status(500).json({ error: '审核失败' });
        }
        
        if (this.changes === 0) {
            return res.status(404).json({ error: '帖子不存在' });
        }
        
        // 记录审核日志
        db.run(
            'INSERT INTO moderation_logs (content_type, content_id, action, moderator_id, reason) VALUES (?, ?, ?, ?, ?)',
            ['post', postId, action, req.user.id, reason || '']
        );
        
        res.json({
            success: true,
            message: `帖子已${action === 'approve' ? '通过' : '拒绝'}`
        });
    });
});

module.exports = router;