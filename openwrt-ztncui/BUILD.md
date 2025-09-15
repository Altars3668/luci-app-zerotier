# ZTNCUI OpenWrt Package - Build and Installation Guide

## 概述

这是一个为 OpenWrt 系统设计的轻量级 ZeroTier Network Controller UI (ZTNCUI) 包。它使用 C 语言实现，相比原始的 Node.js 版本，大大减少了资源占用。

## 功能特性

- 轻量级 C 实现（~100KB vs 100MB+）
- 内嵌 HTTP 服务器（基于 libmicrohttpd）
- ZeroTier API 客户端
- UCI 配置集成
- ProCD 服务管理
- Web 管理界面
- 网络和成员管理

## 系统要求

### 依赖包
- `zerotier` - ZeroTier One daemon
- `libjson-c` - JSON-C library
- `libmicrohttpd` - HTTP server library  
- `libuci` - UCI configuration library
- `libcurl` - HTTP client library

### 最小硬件要求
- RAM: 4MB (vs 50MB+ for Node.js version)
- Flash: 200KB (vs 100MB+ for Node.js version)
- CPU: Any supported by OpenWrt

## 编译方法

### 方法 1: 在 OpenWrt 构建环境中编译

1. 复制到 OpenWrt 源码树：
```bash
cp -r openwrt-ztncui $(OPENWRT_DIR)/package/
```

2. 配置编译选项：
```bash
cd $(OPENWRT_DIR)
make menuconfig
# Navigate to: Network -> VPN -> ztncui-openwrt
```

3. 编译包：
```bash
make package/openwrt-ztncui/compile V=s
```

### 方法 2: 独立编译（用于开发测试）

1. 安装依赖（Ubuntu/Debian）：
```bash
sudo apt-get install build-essential libjson-c-dev libmicrohttpd-dev libcurl4-openssl-dev
```

2. 编译：
```bash
cd src/
make
```

3. 测试运行：
```bash
./ztncui-server -c ../files/etc/config/ztncui
```

## 安装步骤

### 方法 1: 使用预编译包

1. 上传到路由器：
```bash
scp ztncui-openwrt_*.ipk root@router:/tmp/
```

2. 安装：
```bash
ssh root@router
opkg update
opkg install /tmp/ztncui-openwrt_*.ipk
```

### 方法 2: 手动安装

1. 复制文件到路由器：
```bash
# Binary
scp src/ztncui-server root@router:/usr/bin/

# Configuration
scp files/etc/config/ztncui root@router:/etc/config/
scp files/etc/init.d/ztncui root@router:/etc/init.d/

# Make executable
ssh root@router "chmod +x /usr/bin/ztncui-server /etc/init.d/ztncui"
```

## 配置

### UCI 配置文件: `/etc/config/ztncui`

```
config main 'main'
	option enabled '1'
	option port '3000'
	option bind_address '0.0.0.0'
	option zt_address 'localhost:9993'
	option zt_home '/var/lib/zerotier-one'

config auth 'auth'
	option auth_type 'local'
	option username 'admin'
	option password 'password'
	option session_timeout '3600'

config network 'network'
	option enable_auto_assign '1'
	option default_route '0'
	option max_networks '10'
```

### 配置修改

```bash
# 修改监听端口
uci set ztncui.main.port=8080
uci commit ztncui

# 修改管理员密码
uci set ztncui.auth.password=newpassword
uci commit ztncui

# 重启服务应用配置
/etc/init.d/ztncui restart
```

## 服务管理

### 启动/停止服务

```bash
# 启动服务
/etc/init.d/ztncui start

# 停止服务
/etc/init.d/ztncui stop

# 重启服务
/etc/init.d/ztncui restart

# 查看状态
/etc/init.d/ztncui status
```

### 开机自启

```bash
# 启用开机自启
/etc/init.d/ztncui enable

# 禁用开机自启
/etc/init.d/ztncui disable
```

## Web 管理界面

### 访问地址
- HTTP: `http://路由器IP:3000`
- 默认用户名: `admin`
- 默认密码: `password`

### 主要功能
1. **状态监控**: 查看 ZeroTier 守护进程状态
2. **网络管理**: 创建、配置、删除虚拟网络
3. **成员管理**: 授权、配置网络成员
4. **配置管理**: 修改服务配置

## API 接口

### 状态查询
```
GET /api/status
```

### 网络管理
```
GET /api/networks          # 获取网络列表
POST /api/networks         # 创建新网络
GET /api/networks/{id}     # 获取网络详情
DELETE /api/networks/{id}  # 删除网络
```

### 成员管理
```
GET /api/networks/{id}/members          # 获取成员列表
POST /api/networks/{id}/members/{mid}   # 更新成员配置
DELETE /api/networks/{id}/members/{mid} # 删除成员
```

## 故障排查

### 常见问题

1. **服务启动失败**
```bash
# 检查依赖
opkg list-installed | grep -E "(zerotier|json-c|microhttpd)"

# 检查配置
uci show ztncui

# 查看日志
logread | grep ztncui
```

2. **无法访问 Web 界面**
```bash
# 检查端口监听
netstat -tulpn | grep :3000

# 检查防火墙
iptables -L | grep 3000
```

3. **ZeroTier 连接失败**
```bash
# 检查 ZeroTier 状态
zerotier-cli status

# 检查认证令牌
ls -la /var/lib/zerotier-one/authtoken.secret
```

### 日志文件

- 系统日志: `logread | grep ztncui`
- ZeroTier 日志: `/var/lib/zerotier-one/`

## 开发指南

### 源码结构
```
src/
├── ztncui-server.c    # 主服务器程序
├── zt-api.c          # ZeroTier API 客户端
├── web-server.c      # HTTP 服务器模块
├── config.h          # 配置结构定义
├── zt-api.h          # API 客户端头文件
├── web-server.h      # Web 服务器头文件
└── Makefile          # 编译配置
```

### 添加新功能

1. 修改相应的 .c 和 .h 文件
2. 更新 Makefile 中的依赖关系
3. 重新编译测试
4. 提交 Pull Request

## 许可证

Copyright (C) 2024 AltarsCN

该项目基于原始 ZTNCUI 项目，采用相同的开源许可证。

## 支持

如遇问题或需要功能建议，请：

1. 查阅本文档的故障排查部分
2. 在项目 Issues 中搜索相关问题
3. 提交新的 Issue 并提供详细信息

---

**注意**: 这是一个针对 OpenWrt 优化的精简版本。如需完整功能，请考虑使用原始的 Node.js 版本。