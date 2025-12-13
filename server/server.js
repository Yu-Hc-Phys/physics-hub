const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'physics-hub-pku-2024-secure-key';

// 中间件配置
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// 静态文件服务
app.use('/public', express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 数据库初始化
const dbPath = path.join(__dirname, 'database', 'physics-hub.db');
const db = new sqlite3.Database(dbPath);

// 确保数据库目录存在
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

// 将 db 实例附加到 app 上，以便路由可以使用
app.set('db', db);

// 导入路由
const authRoutes = require('./routes/auth');
const courseRoutes = require('./routes/courses');
const postRoutes = require('./routes/posts');
const commentRoutes = require('./routes/comments');
const fileRoutes = require('./routes/files');

// 使用路由 - 确保这些行存在且正确
app.use('/api/auth', authRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/files', fileRoutes);

// 根路径重定向到主页面
app.get('/', (req, res) => {
    res.redirect('/public/physics-hub.html');
});

// 健康检查端点
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

// 调试：列出所有注册的路由
app._router.stack.forEach((middleware) => {
    if (middleware.route) {
        // 路由注册在 app 上
        console.log(`${Object.keys(middleware.route.methods).join(', ').toUpperCase()} ${middleware.route.path}`);
    } else if (middleware.name === 'router') {
        // 路由注册在路由器上
        middleware.handle.stack.forEach((handler) => {
            if (handler.route) {
                console.log(`${Object.keys(handler.route.methods).join(', ').toUpperCase()} /api${middleware.regexp.source.replace('^\\/?(?=\\/|$)', '').replace('\\/?(?=\\/|$)', '')}${handler.route.path}`);
            }
        });
    }
});

// 404 处理
app.use('*', (req, res) => {
    console.log(`404: ${req.method} ${req.originalUrl}`);
    res.status(404).json({ error: '接口不存在' });
});

// 错误处理中间件
app.use((err, req, res, next) => {
    console.error('服务器错误:', err);
    res.status(500).json({ 
        error: '服务器内部错误',
        message: process.env.NODE_ENV === 'development' ? err.message : '请联系管理员'
    });
});

// 初始化数据库表
const initDatabase = require('./database/init');
initDatabase(db).then(() => {
    console.log('数据库初始化完成');
});

// 启动服务器
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`
    =============================================
      Physics Hub 服务器启动成功!
      访问地址: http://10.129.240.154:${PORT}
      内部地址: http://10.129.240.154:${PORT}
      启动时间: ${new Date().toLocaleString('zh-CN')}
    =============================================
    `);
});

// 优雅关闭
process.on('SIGTERM', () => {
    console.log('收到 SIGTERM 信号，正在关闭服务器...');
    server.close(() => {
        db.close();
        console.log('服务器已关闭');
        process.exit(0);
    });
});

// 导出 db 实例供路由使用
module.exports = { app, db };