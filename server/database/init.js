const bcrypt = require('bcryptjs');

module.exports = function initDatabase(db) {
    return new Promise((resolve, reject) => {
        // 启用外键约束
        db.run('PRAGMA foreign_keys = ON');

        // 创建用户表
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            display_name TEXT NOT NULL,
            role TEXT DEFAULT 'student',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_login DATETIME,
            is_active BOOLEAN DEFAULT 1
        )`);

        // 创建课程表
        db.run(`CREATE TABLE IF NOT EXISTS courses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            ta_id INTEGER,
            ta_name TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            is_active BOOLEAN DEFAULT 1,
            FOREIGN KEY (ta_id) REFERENCES users (id)
        )`);

        // 创建帖子表
        db.run(`CREATE TABLE IF NOT EXISTS posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            course_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            type TEXT NOT NULL,
            author_id INTEGER NOT NULL,
            author_name TEXT NOT NULL,
            visibility TEXT DEFAULT 'Public',
            status TEXT DEFAULT 'Published',
            file_name TEXT,
            file_path TEXT,
            file_size INTEGER,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            view_count INTEGER DEFAULT 0,
            FOREIGN KEY (course_id) REFERENCES courses (id),
            FOREIGN KEY (author_id) REFERENCES users (id)
        )`);

        // 创建评论表
        db.run(`CREATE TABLE IF NOT EXISTS comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            post_id INTEGER NOT NULL,
            content TEXT NOT NULL,
            author_id INTEGER NOT NULL,
            author_name TEXT NOT NULL,
            visibility TEXT DEFAULT 'Public',
            status TEXT DEFAULT 'Published',
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE,
            FOREIGN KEY (author_id) REFERENCES users (id)
        )`);

        // 创建投票表
        db.run(`CREATE TABLE IF NOT EXISTS votes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            post_id INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, post_id),
            FOREIGN KEY (user_id) REFERENCES users (id),
            FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE
        )`);

        // 创建审核日志表
        db.run(`CREATE TABLE IF NOT EXISTS moderation_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            content_type TEXT NOT NULL,
            content_id INTEGER NOT NULL,
            action TEXT NOT NULL,
            moderator_id INTEGER,
            reason TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (moderator_id) REFERENCES users (id)
        )`);

        // 插入初始数据
        setTimeout(() => {
            initDefaultData(db).then(resolve).catch(reject);
        }, 1000);
    });
};

async function initDefaultData(db) {
    const defaultPassword = await bcrypt.hash('111111', 12);
    
    return new Promise((resolve, reject) => {
        // 插入默认用户 (1-100)
        const users = [];
        for (let i = 1; i <= 100; i++) {
            const userId = i.toString().padStart(3, '0');
            const email = `user${userId}@hub.edu`;
            const displayName = i === 1 ? 'TA Coordinator' : `Student #${userId}`;
            const role = i === 1 ? 'ta' : 'student';
            
            users.push([email, defaultPassword, displayName, role]);
        }

        const placeholders = users.map(() => '(?, ?, ?, ?)').join(',');
        const values = users.flat();
        
        db.run(`INSERT OR IGNORE INTO users (email, password, display_name, role) VALUES ${placeholders}`, values, function(err) {
            if (err) {
                console.error('初始化用户数据失败:', err);
                reject(err);
            } else {
                console.log(`成功初始化 ${this.changes} 个用户`);
                
                // 插入示例课程
                db.run(`INSERT OR IGNORE INTO courses (name, description, ta_id, ta_name) VALUES (?, ?, ?, ?)`, 
                    ['PHYC 205: Classical Mechanics', '经典力学课程讨论区', 1, 'TA Coordinator'], 
                    function(err) {
                        if (err) {
                            console.error('初始化课程数据失败:', err);
                            reject(err);
                        } else {
                            console.log('数据库初始化完成');
                            resolve();
                        }
                    }
                );
            }
        });
    });
}