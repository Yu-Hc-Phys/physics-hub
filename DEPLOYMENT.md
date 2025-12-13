# Physics Hub 完整部署指南

## 📋 目录
1. [系统要求](#系统要求)
2. [环境准备](#环境准备)
3. [项目部署](#项目部署)
4. [配置说明](#配置说明)
5. [服务启动](#服务启动)
6. [验证部署](#验证部署)
7. [故障排查](#故障排查)
8. [日常维护](#日常维护)
9. [备份与恢复](#备份与恢复)

---

## 🖥️ 系统要求

### 最低硬件配置
- **CPU**: 2核或以上
- **内存**: 4GB或以上  
- **存储**: 20GB可用空间
- **网络**: 公网IP或域名

### 软件要求
- **操作系统**: Ubuntu 18.04+ / CentOS 7+ / Debian 9+
- **Node.js**: 16.0.0 或更高版本
- **Nginx**: 1.14+ 
- **SQLite3**: 3.8+
- **PM2**: 5.0+

### 网络要求
- **开放端口**: 
  - 80 (HTTP)
  - 443 (HTTPS，可选)
  - 3000 (后端API)

---

## 🛠️ 环境准备

### 1. 系统更新
```bash
# Ubuntu/Debian
sudo apt update && sudo apt upgrade -y

# CentOS/RHEL
sudo yum update -y
```

### 2. 安装Node.js
```bash
# 方法一：使用NodeSource仓库（推荐）
curl -fsSL https://deb.nodesource.com/setup_16.x | sudo -E bash -
sudo apt-get install -y nodejs

# 方法二：使用Node Version Manager
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 16
nvm use 16

# 验证安装
node --version  # 应该输出 v16.x.x
npm --version   # 应该输出 8.x.x
```

### 3. 安装Nginx
```bash
# Ubuntu/Debian
sudo apt install nginx -y

# CentOS/RHEL
sudo yum install nginx -y

# 启动并启用开机自启
sudo systemctl start nginx
sudo systemctl enable nginx
```

### 4. 安装PM2
```bash
sudo npm install -g pm2

# 设置PM2开机自启
pm2 startup
# 按照输出的提示执行命令
```

### 5. 安装SQLite3
```bash
# Ubuntu/Debian
sudo apt install sqlite3 -y

# CentOS/RHEL
sudo yum install sqlite3 -y
```

### 6. 防火墙配置
```bash
# 启用防火墙（如果尚未启用）
sudo ufw enable

# 开放必要端口
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 22/tcp   # SSH

# 检查防火墙状态
sudo ufw status
```

---

## 📦 项目部署

### 1. 创建项目目录
```bash
# 创建项目根目录
sudo mkdir -p /var/www/html/physics-hub
sudo chown -R $USER:$USER /var/www/html/physics-hub
cd /var/www/html/physics-hub
```

### 2. 上传项目文件
将以下文件上传到对应目录：

```
/var/www/html/physics-hub/
├── server/
│   ├── server.js
│   ├── package.json
│   ├── database/
│   │   └── init.js
│   ├── middleware/
│   │   ├── auth.js
│   │   └── upload.js
│   ├── routes/
│   │   ├── auth.js
│   │   ├── courses.js
│   │   ├── posts.js
│   │   ├── comments.js
│   │   └── files.js
│   ├── utils/
│   │   ├── moderation.js
│   │   └── helpers.js
│   └── uploads/                   # 空目录
├── public/
│   ├── physics-hub.html
│   ├── css/
│   │   └── style.css
│   └── js/
│       └── app.js
├── nginx.conf
├── start.sh
└── troubleshoot.sh
```

### 3. 设置文件权限
```bash
cd /var/www/html/physics-hub

# 设置执行权限
chmod +x start.sh
chmod +x troubleshoot.sh

# 创建必要的目录
mkdir -p server/uploads server/database server/logs
chmod 755 server/uploads
```

---

## ⚙️ 配置说明

### 1. 环境变量配置
```bash
cd /var/www/html/physics-hub/server

# 创建环境变量文件
cat > .env << EOF
# ============================================
# Physics Hub 环境配置
# ============================================

# JWT 密钥（生产环境必须修改！）
# 生成命令：openssl rand -base64 32
JWT_SECRET=physics-hub-production-secret-key-2024-change-this

# DeepSeek API 密钥（可选，用于内容审核）
DEEPSEEK_API_KEY=your-deepseek-api-key-here

# 服务器配置
NODE_ENV=production
PORT=3000

# 数据库配置
DB_PATH=./database/physics-hub.db

# 文件上传配置
UPLOAD_MAX_SIZE=20971520
EOF

# 设置正确的文件权限
chmod 600 .env
```

### 2. 生成安全的JWT密钥
```bash
cd /var/www/html/physics-hub/server

# 生成随机密钥
JWT_SECRET=$(openssl rand -base64 32)
sed -i "s|physics-hub-production-secret-key-2024-change-this|$JWT_SECRET|" .env

echo "✅ JWT密钥已生成并更新"
```

### 3. 配置Nginx
```bash
# 备份默认配置
sudo cp /etc/nginx/sites-available/default /etc/nginx/sites-available/default.backup

# 复制项目Nginx配置
sudo cp /var/www/html/physics-hub/nginx.conf /etc/nginx/sites-available/physics-hub

# 创建符号链接
sudo ln -s /etc/nginx/sites-available/physics-hub /etc/nginx/sites-enabled/

# 禁用默认站点（可选）
sudo rm /etc/nginx/sites-enabled/default

# 测试Nginx配置
sudo nginx -t

# 重新加载Nginx
sudo systemctl reload nginx
```

### 4. 修改服务器IP地址
编辑 `nginx.conf` 文件，确保 `server_name` 正确：
```nginx
server {
    listen 80;
    server_name 你的服务器IP或域名;  # 例如: 10.129.240.154 或 physics-hub.example.com
    # ... 其他配置保持不变
}
```

---

## 🚀 服务启动

### 1. 安装项目依赖
```bash
cd /var/www/html/physics-hub/server

# 安装依赖
npm install --production

# 如果有开发依赖需要安装
npm install
```

### 2. 初始化数据库
```bash
cd /var/www/html/physics-hub/server

# 初始化数据库表结构和默认数据
node database/init.js
```

**预期输出：**
```
✅ 成功初始化 5000 个用户
✅ 数据库初始化完成
```

### 3. 启动服务
```bash
cd /var/www/html/physics-hub

# 使用部署脚本启动
./start.sh
```

**部署脚本执行过程：**
- ✅ 检查系统依赖
- ✅ 加载环境变量
- ✅ 安装项目依赖
- ✅ 创建必要目录
- ✅ 设置文件权限
- ✅ 启动PM2服务
- ✅ 保存PM2配置

### 4. 验证服务状态
```bash
# 检查PM2进程状态
pm2 status

# 检查服务日志
pm2 logs physics-hub --lines 20

# 检查端口监听
netstat -tulpn | grep -E '(:80|:3000)'
```

---

## ✅ 验证部署

### 1. 基础服务检查
```bash
cd /var/www/html/physics-hub

# 运行诊断脚本
./troubleshoot.sh
```

### 2. API健康检查
```bash
# 测试后端API
curl http://localhost:3000/health

# 测试通过Nginx代理
curl http://你的服务器IP/api/health
```

**预期响应：**
```json
{
  "status": "OK",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "version": "1.0.0"
}
```

### 3. 前端访问测试
在浏览器中访问：
```
http://你的服务器IP
```

### 4. 登录测试

#### 测试TA账号：
- **账号**: `user4700@hub.edu`
- **密码**: `asymptotic_freedom`
- **预期**: 成功登录，显示TA专属功能（创建课程、审核队列等）

#### 测试学生账号：
- **账号**: `user0001@hub.edu`
- **密码**: `111111`
- **预期**: 成功登录，只有学生权限

### 5. 功能测试清单
- [ ] 用户登录/登出
- [ ] 课程列表显示
- [ ] 帖子创建和显示
- [ ] 评论功能
- [ ] 文件上传下载（TA账号）
- [ ] 内容审核（TA账号）
- [ ] 个人资料修改
- [ ] 密码修改

---

## 🔧 故障排查

### 1. 常见问题解决

#### 问题：端口被占用
```bash
# 查找占用端口的进程
sudo lsof -i :3000
sudo lsof -i :80

# 杀死占用进程
sudo kill -9 <PID>
```

#### 问题：权限错误
```bash
# 修复文件权限
sudo chown -R $USER:$USER /var/www/html/physics-hub
chmod -R 755 /var/www/html/physics-hub/server/uploads
```

#### 问题：Node.js版本不兼容
```bash
# 检查Node.js版本
node --version

# 如果版本过低，使用nvm升级
nvm install 16
nvm use 16
```

#### 问题：数据库初始化失败
```bash
# 删除旧数据库文件重新初始化
rm /var/www/html/physics-hub/server/database/physics-hub.db
node /var/www/html/physics-hub/server/database/init.js
```

### 2. 日志文件位置
```bash
# 应用日志
pm2 logs physics-hub

# Nginx访问日志
sudo tail -f /var/log/nginx/access.log

# Nginx错误日志  
sudo tail -f /var/log/nginx/error.log

# 系统日志
sudo journalctl -u nginx -f
```

### 3. 服务重启流程
```bash
# 重启整个服务
cd /var/www/html/physics-hub
pm2 restart physics-hub
sudo systemctl restart nginx

# 或者使用部署脚本重新部署
./start.sh
```

---

## 🛡️ 日常维护

### 1. 监控服务状态
```bash
# 查看服务状态
pm2 status
sudo systemctl status nginx

# 监控资源使用
pm2 monit
htop
```

### 2. 日志管理
```bash
# 设置日志轮转
sudo nano /etc/logrotate.d/physics-hub

# 添加以下内容：
/var/www/html/physics-hub/server/logs/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    copytruncate
}
```

### 3. 定期更新
```bash
# 系统更新
sudo apt update && sudo apt upgrade -y

# Node.js依赖更新
cd /var/www/html/physics-hub/server
npm update

# 重启服务
pm2 restart physics-hub
```

### 4. 性能监控
```bash
# 安装监控工具
sudo apt install htop iotop nethogs -y

# 监控命令
htop              # CPU和内存
iotop             # 磁盘IO
nethogs           # 网络流量
df -h             # 磁盘空间
```

---

## 💾 备份与恢复

### 1. 备份策略

#### 数据库备份
```bash
# 创建备份脚本
cat > /var/www/html/physics-hub/backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/var/backups/physics-hub"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# 备份数据库
cp /var/www/html/physics-hub/server/database/physics-hub.db $BACKUP_DIR/physics-hub_$DATE.db

# 备份上传文件
tar -czf $BACKUP_DIR/uploads_$DATE.tar.gz -C /var/www/html/physics-hub/server uploads

# 备份环境配置
cp /var/www/html/physics-hub/server/.env $BACKUP_DIR/env_$DATE.backup

# 删除7天前的备份
find $BACKUP_DIR -name "*.db" -mtime +7 -delete
find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete
find $BACKUP_DIR -name "*.backup" -mtime +7 -delete

echo "✅ 备份完成: $BACKUP_DIR"
EOF

chmod +x /var/www/html/physics-hub/backup.sh
```

#### 设置定时备份
```bash
# 编辑crontab
crontab -e

# 添加以下行（每天凌晨2点备份）
0 2 * * * /var/www/html/physics-hub/backup.sh
```

### 2. 恢复流程

#### 数据库恢复
```bash
# 停止服务
pm2 stop physics-hub

# 恢复数据库
cp /var/backups/physics-hub/physics-hub_最新日期.db /var/www/html/physics-hub/server/database/physics-hub.db

# 恢复上传文件
tar -xzf /var/backups/physics-hub/uploads_最新日期.tar.gz -C /var/www/html/physics-hub/server

# 恢复环境配置
cp /var/backups/physics-hub/env_最新日期.backup /var/www/html/physics-hub/server/.env

# 重启服务
pm2 start physics-hub
```

---

## 📞 技术支持

### 1. 获取帮助
如果遇到问题，请按以下步骤排查：

1. **运行诊断脚本**：`./troubleshoot.sh`
2. **检查服务状态**：`pm2 status` 和 `sudo systemctl status nginx`
3. **查看最新日志**：`pm2 logs physics-hub --lines 50`
4. **验证网络连通性**：`curl http://localhost:3000/health`

### 2. 重要文件位置
- **应用代码**: `/var/www/html/physics-hub/`
- **配置文件**: `/var/www/html/physics-hub/server/.env`
- **数据库文件**: `/var/www/html/physics-hub/server/database/physics-hub.db`
- **日志文件**: `/var/www/html/physics-hub/server/logs/`
- **上传文件**: `/var/www/html/physics-hub/server/uploads/`
- **Nginx配置**: `/etc/nginx/sites-available/physics-hub`

### 3. 默认账户信息
| 角色 | 账号范围 | 示例账号 | 初始密码 | 权限 |
|------|----------|----------|----------|------|
| 学生 | 1-4699 | user0001@hub.edu | 111111 | 基础功能 |
| TA | 4700-5000 | user4700@hub.edu | asymptotic_freedom | 管理功能 |

---

## 🎯 部署完成确认清单

- [ ] 系统环境准备完成
- [ ] 项目文件上传完成
- [ ] 环境变量配置完成
- [ ] Nginx配置完成
- [ ] 数据库初始化完成
- [ ] 服务启动成功
- [ ] 前端访问正常
- [ ] 用户登录测试通过
- [ ] 基础功能测试通过
- [ ] 备份策略配置完成

**恭喜！Physics Hub 部署完成！** 🎉

如果部署过程中遇到任何问题，请参考故障排查章节或运行诊断脚本。