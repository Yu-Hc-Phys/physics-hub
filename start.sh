#!/bin/bash
# Physics Hub 启动脚本

cd /var/www/html/physics-hub/server

# 检查Node.js是否安装
if ! command -v node &> /dev/null; then
    echo "错误: Node.js 未安装"
    exit 1
fi

# 安装依赖
echo "安装依赖..."
npm install

# 创建必要的目录
mkdir -p uploads database logs

# 设置文件权限
chmod 755 uploads
chmod 644 database/physics-hub.db 2>/dev/null || true

# 导入环境变量
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# 启动服务
echo "启动 Physics Hub 服务..."
pm2 start server.js --name physics-hub --env production

# 保存PM2配置
pm2 save

echo "Physics Hub 启动完成!"
echo "访问地址: http://10.129.240.154"
echo "API地址: http://10.129.240.154:3000"