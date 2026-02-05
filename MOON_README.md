# ZeroTier LuCI App - Moon服务器功能

## 功能简介

此LuCI应用为OpenWrt添加了ZeroTier的完整管理功能，包括：
- 基础的ZeroTier网络配置
- Moon服务器功能（自建中继服务器）
- 自定义ztncui控制器支持
- 完整的中文界面

### 主要功能模块

1. **基础设置**: ZeroTier网络配置和访问控制
2. **接口信息**: 查看ZeroTier接口状态
3. **控制器**: 配置和管理网络控制器（官方或ztncui）
4. **Moon服务器**: 配置自建中继服务器
5. **手动配置**: 高级配置选项

## Moon服务器功能

### 什么是Moon服务器？

Moon服务器是ZeroTier网络中的根服务器（root server），它可以：
- 为ZeroTier客户端提供中继服务
- 改善网络连接质量，特别是在复杂网络环境中
- 减少对官方根服务器的依赖
- 提供更低的延迟和更稳定的连接

### 如何使用Moon服务器功能

#### 配置Moon服务器

1. 登录OpenWrt管理界面
2. 进入 `VPN` -> `ZeroTier` -> `Moon Server`
3. 启用Moon服务器功能
4. 配置以下参数：
   - **Moon服务器端口**: 默认为9993，通常不需要修改
   - **外部IP地址**: 留空自动检测，或手动填入公网IP
5. 点击"生成Moon配置"按钮
6. 记录生成的Moon ID，客户端需要使用此ID连接

#### 分发Moon文件

1. 在Moon服务器配置页面，点击"下载Moon文件"
2. 将下载的.moon文件分发给需要使用的客户端
3. 客户端将.moon文件放置在ZeroTier目录的moons.d文件夹中

#### 客户端连接Moon服务器

在客户端配置页面：
1. 输入Moon ID
2. 点击"添加Moon"按钮
3. 查看"当前Moon列表"确认连接状态

### 网络要求

- Moon服务器需要有公网IP地址
- 防火墙需要开放配置的端口（默认9993）
- 建议使用稳定的网络连接

### 故障排除

1. **无法生成Moon配置**
   - 检查网络连接
   - 确认zerotier-idtool工具已安装
   - 手动设置外部IP地址

2. **客户端无法连接Moon**
   - 确认防火墙设置
   - 检查Moon服务器的网络连通性
   - 验证Moon ID是否正确

3. **Moon文件下载失败**
   - 确认Moon配置已成功生成
   - 检查文件权限

## ztncui控制器功能

### 什么是ztncui？

ztncui是ZeroTier的自托管网络控制器，它提供：
- 完全自主的网络控制
- 更好的隐私保护
- 不受官方服务限制
- 可定制的管理界面

### 配置ztncui控制器

1. 进入 `VPN` -> `ZeroTier` -> `Controller`
2. 选择控制器类型为"自定义 ztncui 控制器"
3. 配置ztncui服务器URL（如：http://192.168.1.100:3000）
4. 可选择配置API令牌
5. 点击"测试连接"验证配置

### 使用ztncui管理网络

1. **创建网络**：
   - 点击"打开控制器"访问ztncui界面
   - 在ztncui中创建新网络
   - 配置网络参数（IP范围、路由等）

2. **加入网络**：
   - 使用"快速加入网络"功能
   - 输入网络ID并点击加入
   - 在ztncui中授权设备

3. **设备管理**：
   - 记录本设备的节点ID
   - 在ztncui中找到对应设备并授权

### ztncui安装指南

详细的安装说明请参考Controller页面中的安装指南，支持Docker和手动安装两种方式。

## 配置文件位置

- Moon配置文件: `/var/lib/zerotier-one/moon.json`
- Moon文件: `/var/lib/zerotier-one/*.moon`
- ZeroTier配置: `/etc/config/zerotier`

## 命令行工具

也可以使用命令行管理Moon功能：

```bash
# 查看当前连接的Moon
zerotier-cli listmoons

# 添加Moon
zerotier-cli orbit <moon_id> <moon_id>

# 删除Moon
zerotier-cli deorbit <moon_id>
```

## 注意事项

1. Moon服务器功能需要ZeroTier服务正常运行
2. 首次生成Moon配置后，建议重启ZeroTier服务
3. 更改Moon配置后需要重新生成配置文件
4. 建议定期备份Moon配置文件

## 更新日志

- 添加Moon服务器配置界面
- 支持自动检测外部IP地址
- 提供Moon文件下载功能
- 添加客户端Moon管理功能
- **新增ztncui控制器支持**
- **添加自定义控制器配置**
- **提供快速网络加入功能**
- **完整的ztncui安装和使用指南**
- 完善中文界面翻译

## 与其他方案的对比

### vs 官方ZeroTier Central
- **优势**: 完全自主控制，无设备数量限制，更好的隐私保护
- **劣势**: 需要自己维护服务器，技术要求较高

### vs 单纯的Moon服务器
- **Moon服务器**: 改善网络连接质量，作为中继服务器
- **ztncui**: 提供网络管理和控制功能，替代官方控制面板
- **结合使用**: 可以同时部署Moon服务器和ztncui获得最佳体验

## 企业级部署建议

1. **小型企业** (< 25设备): 使用官方控制器 + Moon服务器
2. **中型企业** (25-100设备): 部署ztncui + Moon服务器
3. **大型企业** (> 100设备): 多个ztncui实例 + 多个Moon服务器

## 安全建议

1. **ztncui安全**:
   - 修改默认密码
   - 启用HTTPS
   - 限制访问IP
   - 定期备份数据

2. **Moon服务器安全**:
   - 使用防火墙限制端口访问
   - 定期更新系统
   - 监控服务状态

3. **网络安全**:
   - 合理配置访问控制规则
   - 定期审查设备授权
   - 使用强密码和多因素认证