# LuCI ZeroTier 应用 - 增强版

增强版 LuCI ZeroTier 应用，具备全面的 Moon 节点管理和 ZTNCUI 网络控制器集成功能。

## 🌟 特性

### 核心 ZeroTier 管理
- ✅ **高级配置**: 完整的 ZeroTier 服务配置，支持实时监控
- ✅ **网络管理**: 加入/退出网络，具备高级路由和防火墙集成
- ✅ **接口监控**: 实时网络接口状态和流量统计
- ✅ **多语言支持**: 英文、简体中文、繁体中文，提供全面翻译

### 🌙 Moon 节点管理
- 🌙 **创建 Moon 节点**: 将您的路由器转换为 ZeroTier Moon，增强连接性
- 🌙 **加入 Moon 网络**: 连接到现有 Moon 节点，支持自动发现
- 🌙 **连接管理**: 监控和管理 Moon 连接，显示健康状态
- 🌙 **自动创建**: 启动时智能创建 Moon 节点，带验证功能
- 🌙 **输入验证**: 全面的 IP 地址和端口验证

### 🎛️ 网络控制器（ZTNCUI 集成）
- 🎛️ **本地控制器**: 运行您自己的 ZeroTier 网络控制器，具备完整管理功能
- 🎛️ **Web 界面**: 通过 ZTNCUI 提供现代化的浏览器网络管理
- 🎛️ **多种安装**: Docker、系统服务、二进制文件和 Node.js 安装方式
- 🎛️ **健康监控**: 实时服务健康检查和自动恢复
- 🎛️ **一键设置**: 自动化 Docker 安装和配置
- 🎛️ **服务管理**: 启动、停止、重启，智能状态检测

## 🚀 快速开始

### 系统要求
- **OpenWrt/ImmortalWrt**: 19.07+ 或兼容版本
- **存储空间**: 最少 10MB（完整 ZTNCUI 功能需要 100MB+）
- **网络连接**: 需要互联网连接
- **可选 Docker**: 用于简化 ZTNCUI 安装

### 1. 安装

#### 软件包管理器安装
```bash
# 更新软件包列表
opkg update

# 安装 ZeroTier 核心
opkg install zerotier zerotier-idtool

# 安装 LuCI 应用
opkg install luci-app-zerotier

# 重启 LuCI
/etc/init.d/uhttpd restart
```

#### 手动安装
1. 下载适合您架构的 IPK 软件包
2. 通过 LuCI 安装：**系统** → **软件包** → **上传软件包**
3. 或使用命令行：`opkg install luci-app-zerotier_*.ipk`

### 2. 基础配置
1. 导航到 **网络** → **VPN** → **ZeroTier** → **配置**
2. 启用 ZeroTier 服务
3. 添加您的网络 ID（16 位字符）
4. 根据需要配置网络设置
5. 点击 **保存&应用**

### 3. 授权设备
1. 访问 [ZeroTier Central](https://my.zerotier.com/network)
2. 在网络成员列表中找到您的设备
3. 勾选 **已授权** 以允许连接
4. 可选择分配静态 IP 地址

## 📋 高级功能

### 网络控制器设置

#### 快速 ZTNCUI 安装（Docker）
1. 进入 **ZeroTier** → **网络控制器**
2. 如果 Docker 可用，点击 **通过 Docker 安装**
3. 等待安装完成
4. 在 `http://[路由器IP]:3000` 访问 Web 界面
5. 使用默认凭据登录：
   - 用户名：`admin`
   - 密码：`password`
6. **重要**: 首次登录后请更改密码

#### 其他安装方法

**Node.js 安装：**
```bash
opkg install node npm
npm install -g ztncui
ztncui-manager start
```

**手动二进制安装：**
从 [ZTNCUI 发布页](https://github.com/key-networks/ztncui/releases) 下载

### Moon 节点配置

#### 创建 Moon 节点
1. 导航到 **ZeroTier** → **Moon 管理器**
2. 输入您的 **公网 IP 地址**
3. 设置 **公网端口**（默认：9993）
4. 点击 **创建 Moon**
5. 与其他用户分享生成的 Moon ID

#### 加入 Moon 网络
1. 获取 Moon ID（10 位十六进制字符串）
2. 在 Moon 管理器中输入 Moon ID
3. 点击 **加入 Moon**
4. 在已连接 Moon 列表中验证连接

### 高级网络配置

#### 防火墙集成
- **入站规则**: 控制对 ZeroTier 服务的访问
- **转发规则**: 允许网络间流量
- **地址伪装**: 启用 NAT 访问互联网
- **接口选择**: 为规则选择特定接口

#### 路由选项
- **管理路由**: 让 ZeroTier 自动处理路由
- **全局路由**: 允许到公网的路由（谨慎使用）
- **默认路由**: 使用 ZeroTier 作为默认网关
- **DNS 管理**: 允许 ZeroTier 配置 DNS 设置

## 🛠️ 配置选项

### 全局设置
```yaml
监听端口: 9993              # ZeroTier 守护进程端口
客户端密钥: [可选]          # 认证密钥
配置路径: /etc/zerotier     # 持久配置目录
复制配置: true             # 复制到内存（保护闪存）
自动 Moon: false           # 启动时自动创建 Moon
启用控制器: false          # 启用 ZTNCUI 功能
```

### 网络设置（每个网络）
```yaml
网络 ID: [16位十六进制]     # ZeroTier 网络标识符
允许管理 IP: true          # ZeroTier IP 管理
允许全局 IP: false         # 公网 IP 路由
允许默认路由: false        # 默认网关
允许 DNS: true             # DNS 配置
防火墙规则:                # 自定义防火墙设置
  - 入站: 允许/拒绝
  - 转发: 允许/拒绝
  - 伪装: 启用/禁用
```

## 📚 文档

### 用户文档
- 📖 **[用户手册](docs/USER_MANUAL.md)** - 全面使用指南
- 🔧 **[故障排除指南](docs/USER_MANUAL.md#故障排除)** - 常见问题和解决方案
- ⚙️ **[配置示例](docs/USER_MANUAL.md#高级配置)** - 高级设置场景

### 开发者文档
- 🏗️ **[架构指南](ARCHITECTURE.md)** - 系统设计和组件
- 👨‍💻 **[开发者指南](docs/DEVELOPER_GUIDE.md)** - 开发标准和实践
- 📊 **[项目总结](PROJECT_SUMMARY.md)** - 优化概览和改进

### 其他资源
- 📝 **[更新日志](CHANGELOG.md)** - 版本历史和更新
- 🌙 **[Moon 设置指南](README-moon.md)** - 详细的 Moon 配置
- 🎛️ **[ZTNCUI 集成](README-ztncui.md)** - 控制器设置指南

## 🔧 命令行工具

### ZeroTier 管理
```bash
# 服务控制
/etc/init.d/zerotier start|stop|restart|status

# 网络管理
zerotier-cli join <网络ID>
zerotier-cli leave <网络ID>
zerotier-cli listnetworks

# 节点信息
zerotier-cli info
zerotier-cli peers
```

### Moon 管理
```bash
# 创建 Moon
zerotier-moon create <公网IP> [端口]

# 加入 Moon
zerotier-moon join <Moon-ID>

# 列出 Moon
zerotier-moon list

# 离开 Moon
zerotier-moon leave <Moon-ID>
```

### ZTNCUI 管理
```bash
# 服务控制
ztncui-manager start|stop|restart|status

# 安装帮助
ztncui-manager install

# 配置
ztncui-manager setup
ztncui-manager show-config

# 健康检查
ztncui-manager health-check [端口]
```

## 🐛 故障排除

### 常见问题

**服务无法启动**
```bash
# 检查服务状态
/etc/init.d/zerotier status

# 查看日志
logread | grep zerotier

# 重启服务
/etc/init.d/zerotier restart
```

**网络连接问题**
1. 验证设备在 ZeroTier Central 中已授权
2. 检查防火墙规则和路由
3. 确认网络 ID 正确
4. 使用 `ping` 测试其他网络成员

**ZTNCUI 访问问题**
1. 验证服务正在运行：`ztncui-manager status`
2. 检查端口可访问性和防火墙
3. 尝试健康检查：`ztncui-manager health-check`
4. 查看 Docker 日志：`docker logs ztncui`

**Moon 创建失败**
1. 确保公网 IP 可从互联网访问
2. 验证防火墙允许 ZeroTier 端口
3. 检查网络连接
4. 确认 zerotier-idtool 可用

### 获取帮助
- 📋 **问题报告**: [GitHub Issues](https://github.com/AltarsCN/luci-app-zerotier/issues)
- 💬 **论坛**: OpenWrt 和 ImmortalWrt 社区论坛
- 📖 **文档**: 查看全面的用户手册
- 🔍 **搜索**: 现有问题和社区讨论

## 🔐 安全考虑

### 网络安全
- 使用 **私有网络** 而不是公开网络
- 定期 **审核网络成员** 并移除未使用的设备
- 为您的使用场景配置 **适当的防火墙规则**
- 监控 **未授权访问尝试**

### 系统安全
- 设置后立即 **更改默认 ZTNCUI 密码**
- 保持 **ZeroTier 和 OpenWrt 更新** 到最新版本
- 为所有账户使用 **强密码**
- 如需要，**限制 ZTNCUI Web 界面访问**
- 定期 **查看网络访问日志**

## ⚡ 性能提示

### 网络优化
- 选择 **邻近的 Moon 节点** 以获得更好的延迟
- 为您的网络配置 **适当的 MTU** 设置
- 使用 **私有网络** 减少开销
- 监控 **带宽使用** 并根据需要优化

### 系统优化
- 启用 **"复制配置"** 减少闪存磨损
- 定期监控 **内存和 CPU 使用**
- 配置 **适当的轮询间隔**
- 定期 **清理旧日志文件**

## 🤝 贡献

我们欢迎社区贡献！以下是您可以帮助的方式：

### 贡献方式
- 🐛 **报告错误**: 提交详细的错误报告和日志
- 💡 **建议功能**: 提出新功能或改进建议
- 📝 **改进文档**: 帮助使文档更清晰、更全面
- 🌍 **翻译**: 添加更多语言支持
- 💻 **代码贡献**: 提交修复和功能的拉取请求

### 开发设置
1. Fork 仓库
2. 创建功能分支
3. 进行更改并进行适当测试
4. 提交带有详细描述的拉取请求

### 代码标准
- 遵循现有的代码风格和约定
- 添加全面的注释和文档
- 为新功能包含测试
- 确保向后兼容性

## 📄 许可证

本项目采用 **GPL-3.0-only** 许可证 - 详情请参阅 [LICENSE](LICENSE) 文件。

## 🙏 致谢

### 核心贡献者
- **ImmortalWrt 社区** - 原始开发和持续维护
- **OpenWrt 项目** - 基础平台和生态系统
- **ZeroTier 团队** - 优秀的网络技术和文档

### 特别感谢
- **ZTNCUI 开发者** - 网络控制器 Web 界面
- **社区贡献者** - 错误报告、功能请求和反馈
- **翻译者** - 多语言支持
- **Beta 测试者** - 早期采用和测试

### 相关项目
- [ZeroTier](https://github.com/zerotier/ZeroTierOne) - 核心 VPN 技术
- [ZTNCUI](https://github.com/key-networks/ztncui) - 网络控制器界面
- [OpenWrt](https://github.com/openwrt/openwrt) - 路由器操作系统
- [ImmortalWrt](https://github.com/immortalwrt/immortalwrt) - 增强版 OpenWrt 发行版

---

<div align="center">

**🌐 用 ZeroTier 构建更好的网络 🌐**

[文档](docs/) • [问题](https://github.com/AltarsCN/luci-app-zerotier/issues) • [讨论](https://github.com/AltarsCN/luci-app-zerotier/discussions) • [发布](https://github.com/AltarsCN/luci-app-zerotier/releases)

</div>