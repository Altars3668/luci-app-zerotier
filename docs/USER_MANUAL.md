# LuCI ZeroTier Application - 用户手册

## 概述

LuCI ZeroTier Application 是 OpenWrt 路由器的 ZeroTier VPN 管理界面，提供了完整的 ZeroTier 网络管理功能，包括基础配置、Moon 节点管理和网络控制器功能。

## 系统要求

### 硬件要求
- **CPU**: ARM/MIPS/x86 架构
- **内存**: 至少 64MB RAM（推荐 128MB+）
- **存储**: 至少 10MB 可用空间（完整功能需要 100MB+）
- **网络**: 互联网连接

### 软件要求
- **OpenWrt**: 19.07+ 或 ImmortalWrt
- **LuCI**: Web 管理界面
- **ZeroTier**: 核心 VPN 服务
- **Docker**: 可选，用于 ZTNCUI 控制器

## 安装指南

### 1. 基础安装

#### 通过软件包管理器
```bash
# 更新软件包列表
opkg update

# 安装 ZeroTier 核心
opkg install zerotier

# 安装 LuCI 应用
opkg install luci-app-zerotier
```

#### 手动安装
1. 下载对应架构的 IPK 包
2. 通过 LuCI 界面上传安装
3. 或使用命令行安装：`opkg install luci-app-zerotier_*.ipk`

### 2. 验证安装
1. 重启 LuCI 服务：`/etc/init.d/uhttpd restart`
2. 访问路由器管理界面
3. 在"VPN"菜单下找到"ZeroTier"选项

## 快速入门

### 第一步：启用 ZeroTier 服务
1. 进入 **网络** → **VPN** → **ZeroTier** → **配置**
2. 勾选"启用"选项
3. 点击"保存&应用"

### 第二步：加入网络
1. 在"网络配置"部分点击"添加"
2. 输入 16 位网络 ID
3. 启用该网络
4. 点击"保存&应用"

### 第三步：授权设备
1. 访问 [ZeroTier Central](https://my.zerotier.com)
2. 在网络管理页面找到新设备
3. 勾选"Authorized"授权设备

## 功能详解

### 主配置页面

#### 全局配置
- **启用**: 开启/关闭 ZeroTier 服务
- **监听端口**: ZeroTier 守护进程端口（默认：9993）
- **客户端密钥**: 可选的认证密钥
- **本地配置路径**: local.conf 文件路径
- **配置路径**: 持久配置目录
- **复制配置路径**: 避免频繁写入闪存

#### Moon 节点配置
- **自动创建 Moon**: 启动时自动创建 Moon 节点
- **Moon 公网端口**: Moon 节点公网端口
- **Moon 公网地址**: Moon 节点公网 IP 或域名

#### 网络控制器配置
- **启用网络控制器**: 开启 ZTNCUI 功能
- **控制器 Web 端口**: ZTNCUI 界面端口（默认：3000）

#### 防火墙配置
- **允许入站流量**: 允许外部访问 ZeroTier 端口

#### 网络管理
每个网络可以配置：
- **网络 ID**: 16 位网络标识符
- **允许管理 IP/路由**: 允许 ZeroTier 管理 IP 和路由
- **允许全局 IP/路由**: 允许公网 IP 和路由
- **允许默认路由**: 允许设置默认网关
- **允许 DNS**: 允许 ZeroTier 设置 DNS
- **防火墙规则**: 入站、转发、伪装设置

### 接口信息页面

显示当前 ZeroTier 网络接口的详细信息：
- **接口名称**: 虚拟网络接口名
- **MAC 地址**: 虚拟网卡 MAC 地址
- **IPv4/IPv6 地址**: 分配的 IP 地址
- **MTU**: 最大传输单元
- **流量统计**: 上传/下载字节数

### Moon 节点管理

#### Moon 节点作用
Moon 节点是 ZeroTier 网络中的超级节点，可以：
- 提供更好的网络连接性
- 减少连接延迟
- 在网络条件较差时提供中继服务

#### 创建 Moon 节点
1. 进入 **ZeroTier** → **Moon 管理**
2. 输入公网 IP 地址
3. 设置公网端口（默认：9993）
4. 点击"创建 Moon"

#### 加入 Moon 网络
1. 获取 Moon ID（10 位十六进制）
2. 在"加入 Moon 网络"部分输入 Moon ID
3. 点击"加入 Moon"

#### 管理已连接的 Moon
- 查看已连接的 Moon 列表
- 查看 Moon 地址信息
- 离开不需要的 Moon 网络

### 网络控制器管理

#### ZTNCUI 简介
ZTNCUI (ZeroTier Network Controller UI) 是一个 Web 界面的 ZeroTier 网络控制器，允许您：
- 创建和管理自己的 ZeroTier 网络
- 管理网络成员
- 配置网络规则和路由
- 监控网络状态

#### 安装 ZTNCUI
应用支持多种安装方式：

**方法 1: Docker 安装（推荐）**
1. 安装 Docker：`opkg install dockerd docker`
2. 启动 Docker：`/etc/init.d/dockerd start`
3. 在控制器管理页面点击"通过 Docker 安装"

**方法 2: Node.js 安装**
1. 安装 Node.js：`opkg install node npm`
2. 安装 ZTNCUI：`npm install -g ztncui`
3. 启动服务

**方法 3: 预编译二进制**
下载对应架构的预编译版本并安装

#### 使用 ZTNCUI
1. 启动 ZTNCUI 服务
2. 访问 Web 界面：`http://路由器IP:3000`
3. 使用默认账户登录：
   - 用户名：`admin`
   - 密码：`password`
4. 首次登录后修改密码

#### 创建网络
1. 在 ZTNCUI 界面点击"Add Network"
2. 设置网络名称和描述
3. 配置网络设置（私有/公开、IP 范围等）
4. 保存网络配置

#### 管理成员
1. 进入网络详情页面
2. 查看待授权的成员
3. 授权信任的设备
4. 配置成员 IP 地址（如需要）

## 高级配置

### 防火墙集成

#### 基础防火墙规则
应用会自动创建必要的防火墙规则：
- 允许 ZeroTier 端口通信
- 配置网络间转发规则
- 设置 NAT 规则（如启用）

#### 自定义防火墙规则
可以在网络配置中进一步自定义：
- **允许入站**: 允许来自 ZeroTier 网络的入站连接
- **允许转发**: 允许 ZeroTier 网络与其他网络间转发
- **转发接口**: 指定允许转发的接口
- **IP 伪装**: 启用 NAT 功能
- **伪装接口**: 指定 NAT 出口接口

### 路由配置

#### 自动路由管理
- **允许管理 IP/路由**: 让 ZeroTier 自动管理内网路由
- **允许全局 IP/路由**: 允许公网路由（谨慎使用）
- **允许默认路由**: 将 ZeroTier 设为默认网关

#### 手动路由配置
对于复杂网络，可能需要手动配置路由：
```bash
# 添加到 ZeroTier 网络的路由
ip route add 10.147.20.0/24 dev ztkmtqin6c

# 删除路由
ip route del 10.147.20.0/24 dev ztkmtqin6c
```

### 性能优化

#### 网络性能
- 选择距离较近的 Moon 节点
- 优化 MTU 设置
- 配置合适的缓冲区大小

#### 系统性能
- 定期清理日志文件
- 监控内存和 CPU 使用
- 合理配置轮询间隔

### 安全配置

#### 网络安全
- 使用私有网络而非公开网络
- 定期审查网络成员
- 配置适当的防火墙规则
- 启用网络加密（默认启用）

#### 系统安全
- 定期更新 ZeroTier 和 OpenWrt
- 使用强密码
- 限制 ZTNCUI 访问权限
- 监控异常连接

## 故障排除

### 常见问题

#### 1. 服务无法启动
**症状**: ZeroTier 服务状态显示"未运行"
**解决方案**:
```bash
# 检查服务状态
/etc/init.d/zerotier status

# 查看错误日志
logread | grep zerotier

# 重启服务
/etc/init.d/zerotier restart
```

#### 2. 无法连接到网络
**症状**: 设备在网络中但无法通信
**解决方案**:
1. 检查设备是否已授权
2. 验证防火墙规则
3. 检查路由配置
4. 尝试重新加入网络

#### 3. ZTNCUI 无法访问
**症状**: 无法打开 ZTNCUI Web 界面
**解决方案**:
```bash
# 检查 ZTNCUI 状态
ztncui-manager status

# 重启 ZTNCUI
ztncui-manager restart

# 检查端口占用
netstat -tlnp | grep 3000
```

#### 4. Moon 节点创建失败
**症状**: 创建 Moon 时出现错误
**解决方案**:
1. 确保公网 IP 正确
2. 检查端口是否开放
3. 验证防火墙配置
4. 检查网络连接

### 日志分析

#### 系统日志
```bash
# 查看 ZeroTier 日志
logread | grep zerotier

# 实时监控日志
logread -f | grep zerotier

# 查看详细调试信息
/usr/bin/zerotier-cli info
```

#### ZTNCUI 日志
```bash
# 查看 ZTNCUI 日志
cat /etc/ztncui/log/ztncui.log

# 检查容器日志（Docker 安装）
docker logs ztncui
```

### 网络诊断

#### 连接测试
```bash
# 测试 ZeroTier 连接
zerotier-cli peers

# 测试网络连通性
ping 目标IP

# 查看路由表
ip route
```

#### 网络状态
```bash
# 查看网络列表
zerotier-cli listnetworks

# 查看网络详情
zerotier-cli get 网络ID

# 查看接口状态
ip addr show
```

## 最佳实践

### 网络设计
1. **网络规划**: 合理规划 IP 地址段
2. **安全分区**: 不同用途使用不同网络
3. **访问控制**: 启用网络访问控制
4. **监控告警**: 设置网络监控

### 运维管理
1. **定期备份**: 备份 ZeroTier 配置
2. **版本更新**: 及时更新软件版本
3. **性能监控**: 监控网络性能指标
4. **安全审计**: 定期审查网络安全

### 故障预防
1. **冗余设计**: 部署多个 Moon 节点
2. **健康检查**: 定期检查服务状态
3. **日志管理**: 配置日志轮转
4. **文档记录**: 维护配置文档

## 附录

### 配置文件位置
- UCI 配置：`/etc/config/zerotier`
- ZeroTier 数据：`/var/lib/zerotier-one/`
- ZTNCUI 配置：`/etc/ztncui/etc/ztncui.conf`
- 日志文件：`/var/log/` 或通过 `logread` 查看

### 端口说明
- **9993**: ZeroTier 默认端口
- **3000**: ZTNCUI Web 界面端口
- **其他**: 自定义端口根据配置而定

### 有用的命令
```bash
# ZeroTier 管理
zerotier-cli info                    # 查看节点信息
zerotier-cli join 网络ID             # 加入网络
zerotier-cli leave 网络ID            # 离开网络
zerotier-cli listnetworks           # 列出网络
zerotier-cli peers                  # 查看对等节点

# 系统管理
uci show zerotier                   # 查看 UCI 配置
/etc/init.d/zerotier restart       # 重启服务
ztncui-manager status              # ZTNCUI 状态
```

### 参考资源
- [ZeroTier 官方文档](https://docs.zerotier.com/)
- [OpenWrt 官方网站](https://openwrt.org/)
- [ZTNCUI 项目](https://github.com/key-networks/ztncui)
- [LuCI 开发文档](https://openwrt.org/docs/guide-developer/luci)

通过本手册，用户可以全面了解和使用 LuCI ZeroTier Application 的各项功能，构建稳定可靠的 ZeroTier VPN 网络。