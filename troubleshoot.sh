#!/bin/bash
# Physics Hub 故障诊断脚本

set -e

echo "================================================"
echo "🔍 Physics Hub 故障诊断工具"
echo "================================================"
echo "运行时间: $(date)"
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${BLUE}ℹ️  INFO:${NC} $1"
}

log_success() {
    echo -e "${GREEN}✅ SUCCESS:${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}⚠️  WARNING:${NC} $1"
}

log_error() {
    echo -e "${RED}❌ ERROR:${NC} $1"
}

# 检查命令是否存在
check_command() {
    if command -v $1 &> /dev/null; then
        log_success "$1 已安装"
        return 0
    else
        log_error "$1 未安装"
        return 1
    fi
}

# 检查服务状态
check_service() {
    log_info "检查 $1 服务状态..."
    if systemctl is-active --quiet $1; then
        log_success "$1 正在运行"
    else
        log_error "$1 未运行"
    fi
}

echo "1. 检查系统依赖..."
echo "-------------------"

check_command "node"
check_command "npm"
check_command "nginx"
check_command "sqlite3"
check_command "pm2"

# 检查 Node.js 版本
NODE_VERSION=$(node -v | cut -d'v' -f2)
REQUIRED_VERSION="16.0.0"
log_info "Node.js 版本: $NODE_VERSION"

if [ "$(printf '%s\n' "$REQUIRED_VERSION" "$NODE_VERSION" | sort -V | head -n1)" = "$REQUIRED_VERSION" ]; then
    log_success "Node.js 版本符合要求 (>= $REQUIRED_VERSION)"
else
    log_error "Node.js 版本过低，需要 >= $REQUIRED_VERSION"
fi

echo ""
echo "2. 检查服务状态..."
echo "-------------------"

check_service "nginx"

# 检查 PM2 进程
log_info "检查 PM2 进程..."
if pm2 list | grep -q "physics-hub"; then
    log_success "Physics Hub PM2 进程存在"
    pm2 list | grep "physics-hub"
else
    log_error "Physics Hub PM2 进程不存在"
fi

echo ""
echo "3. 检查端口占用..."
echo "-------------------"

check_port() {
    if netstat -tulpn 2>/dev/null | grep -q ":$1 "; then
        log_success "端口 $1 已被占用"
    else
        log_error "端口 $1 未被占用"
    fi
}

check_port 80
check_port 3000

echo ""
echo "4. 检查文件系统和权限..."
echo "-----------------------"

check_directory() {
    if [ -d "$1" ]; then
        log_success "目录 $1 存在"
        if [ -w "$1" ]; then
            log_success "目录 $1 可写"
        else
            log_error "目录 $1 不可写"
        fi
    else
        log_error "目录 $1 不存在"
    fi
}

check_file() {
    if [ -f "$1" ]; then
        log_success "文件 $1 存在"
        if [ -r "$1" ]; then
            log_success "文件 $1 可读"
        else
            log_error "文件 $1 不可读"
        fi
    else
        log_error "文件 $1 不存在"
    fi
}

cd /var/www/html/physics-hub

check_directory "."
check_directory "server"
check_directory "server/uploads"
check_directory "server/database"
check_directory "server/logs"
check_directory "public"

check_file "server/.env"
check_file "server/database/physics-hub.db"
check_file "server/package.json"
check_file "nginx.conf"
check_file "start.sh"

# 检查文件权限
log_info "检查文件权限..."
UPLOAD_PERM=$(stat -c "%a" server/uploads 2>/dev/null || echo "未知")
DB_PERM=$(stat -c "%a" server/database/physics-hub.db 2>/dev/null || echo "未知")

log_info "uploads 目录权限: $UPLOAD_PERM"
log_info "数据库文件权限: $DB_PERM"

echo ""
echo "5. 检查环境配置..."
echo "-------------------"

if [ -f "server/.env" ]; then
    log_success ".env 文件存在"
    
    # 检查关键环境变量
    if grep -q "JWT_SECRET" server/.env; then
        JWT_SECRET=$(grep "JWT_SECRET" server/.env | cut -d'=' -f2)
        if [ "${#JWT_SECRET}" -lt 20 ]; then
            log_warning "JWT_SECRET 可能太短或不安全"
        else
            log_success "JWT_SECRET 已配置"
        fi
    else
        log_error "JWT_SECRET 未配置"
    fi
    
    if grep -q "DEEPSEEK_API_KEY" server/.env; then
        DEEPSEEK_KEY=$(grep "DEEPSEEK_API_KEY" server/.env | cut -d'=' -f2)
        if [ "$DEEPSEEK_KEY" = "your-deepseek-api-key-here" ] || [ -z "$DEEPSEEK_KEY" ]; then
            log_warning "DEEPSEEK_API_KEY 未配置或使用默认值（AI审核将使用本地规则）"
        else
            log_success "DEEPSEEK_API_KEY 已配置"
        fi
    else
        log_warning "DEEPSEEK_API_KEY 未配置（AI审核将使用本地规则）"
    fi
else
    log_error ".env 文件不存在"
fi

echo ""
echo "6. 检查网络连通性..."
echo "---------------------"

check_connectivity() {
    if curl -f -s -o /dev/null --connect-timeout 5 "$1"; then
        log_success "能够访问 $1"
    else
        log_error "无法访问 $1"
    fi
}

log_info "检查本地API连通性..."
check_connectivity "http://localhost:3000/health"

log_info "检查Nginx代理连通性..."
SERVER_IP=$(curl -s http://checkip.amazonaws.com || hostname -I | awk '{print $1}')
check_connectivity "http://$SERVER_IP/api/health"

echo ""
echo "7. 检查数据库..."
echo "----------------"

if [ -f "server/database/physics-hub.db" ]; then
    log_success "数据库文件存在"
    
    # 检查数据库表
    if command -v sqlite3 &> /dev/null; then
        DB_TABLES=$(sqlite3 server/database/physics-hub.db ".tables" 2>/dev/null | wc -w)
        if [ "$DB_TABLES" -gt 0 ]; then
            log_success "数据库包含 $DB_TABLES 个表"
            
            # 检查用户数量
            USER_COUNT=$(sqlite3 server/database/physics-hub.db "SELECT COUNT(*) FROM users;" 2>/dev/null || echo "0")
            log_info "数据库中的用户数量: $USER_COUNT"
        else
            log_error "数据库表可能未正确初始化"
        fi
    else
        log_warning "sqlite3 未安装，无法检查数据库内容"
    fi
else
    log_error "数据库文件不存在"
fi

echo ""
echo "8. 检查日志文件..."
echo "------------------"

check_logs() {
    if [ -f "$1" ]; then
        log_success "$1 存在"
        LOG_SIZE=$(du -h "$1" | cut -f1)
        log_info "日志文件大小: $LOG_SIZE"
        
        # 显示最后几行错误日志
        if [ "$2" = "show_errors" ] && grep -q -i "error\|fail\|exception" "$1" 2>/dev/null; then
            log_warning "发现错误日志:"
            grep -i "error\|fail\|exception" "$1" | tail -5
        fi
    else
        log_warning "$1 不存在"
    fi
}

check_logs "server/logs/error.log" "show_errors"
check_logs "/var/log/nginx/error.log" "show_errors"

# 检查PM2日志
log_info "检查PM2应用日志..."
pm2 logs physics-hub --lines 10 --silent | tail -10 || log_warning "无法获取PM2日志"

echo ""
echo "9. 检查Nginx配置..."
echo "-------------------"

if sudo nginx -t &> /dev/null; then
    log_success "Nginx 配置语法正确"
else
    log_error "Nginx 配置语法错误"
    sudo nginx -t
fi

# 检查Nginx站点配置
if [ -f "/etc/nginx/sites-available/physics-hub" ]; then
    log_success "Nginx 站点配置存在"
else
    log_error "Nginx 站点配置不存在"
fi

echo ""
echo "10. 系统资源检查..."
echo "-------------------"

# 内存使用
MEM_USED=$(free -m | awk 'NR==2{printf "%.2f%%", $3*100/$2 }')
log_info "内存使用率: $MEM_USED"

# 磁盘使用
DISK_USED=$(df -h /var/www | awk 'NR==2{print $5}')
log_info "磁盘使用率: $DISK_USED"

# CPU负载
CPU_LOAD=$(uptime | awk -F'load average:' '{print $2}' | awk '{print $1}')
log_info "CPU负载: $CPU_LOAD"

echo ""
echo "================================================"
echo "📋 诊断摘要"
echo "================================================"

# 总结关键问题
log_info "下一步建议:"

if ! pm2 list | grep -q "physics-hub"; then
    log_warning "1. Physics Hub 服务未运行，请执行: cd /var/www/html/physics-hub && ./start.sh"
fi

if ! netstat -tulpn 2>/dev/null | grep -q ":80 "; then
    log_warning "2. HTTP端口(80)未被占用，请检查Nginx服务"
fi

if ! netstat -tulpn 2>/dev/null | grep -q ":3000 "; then
    log_warning "3. API端口(3000)未被占用，请检查Node.js服务"
fi

if [ ! -f "server/.env" ]; then
    log_warning "4. 缺少环境配置文件，请创建 server/.env"
fi

if [ ! -f "server/database/physics-hub.db" ]; then
    log_warning "5. 数据库文件不存在，请运行数据库初始化"
fi

# 检查是否有错误级别的日志
if [ -f "server/logs/error.log" ] && grep -q -i "error" "server/logs/error.log" 2>/dev/null; then
    log_warning "6. 应用日志中发现错误，请检查: server/logs/error.log"
fi

if [ -f "/var/log/nginx/error.log" ] && sudo grep -q -i "error" "/var/log/nginx/error.log" 2>/dev/null; then
    log_warning "7. Nginx错误日志中发现问题，请检查: /var/log/nginx/error.log"
fi

echo ""
log_info "常用命令:"
echo "  - 启动服务: ./start.sh"
echo "  - 查看日志: pm2 logs physics-hub"
echo "  - 重启服务: pm2 restart physics-hub"
echo "  - 检查Nginx: sudo nginx -t && sudo systemctl reload nginx"
echo "  - 数据库初始化: cd server && node database/init.js"

echo ""
echo "================================================"
echo "🔧 诊断完成"
echo "================================================"