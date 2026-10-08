# luci-app-zerotier

**简体中文** | [English](README.en.md)

把 OpenWrt 路由器变成 **ZeroTier 节点、网络控制器、权限网关和 Moon 的统一管理入口**。本版本基于 ImmortalWrt LuCI ZeroTier 集成演进，重点不再只是“加入一个网络”，而是管理成员能访问什么、局域网设备如何映射、Moon 如何跟随地址变化，以及实际运行状态是否符合配置。

搭配 [zerotier-openwrt](https://github.com/Altars3668/zerotier-openwrt) 使用：**LuCI 负责配置与展示，`zerotier-fw4` 负责生成和执行规则**。当前界面包版本为 **99.5.1**。

## 当前版本与上游

界面包 **99.5.1**；LuCI 原始源码来自 **ImmortalWrt**。建议与配套 **zerotier-openwrt 99.1.16.2-r5** 一起使用。

本轮同步应用子目录历史和可复用翻译，保留六个自有页面及 rpcd ucode 后端；没有退回上游的基础两页界面。

## 我的改造与特色

| 相对基础 ZeroTier 页面增加 / 重做的部分 | 作用 |
| --- | --- |
| **本机网络控制器** | 在路由器上创建网络，管理成员准入、地址池、路由、IPv6、DNS、MTU 和网络 ID 二维码。 |
| **成员权限与角色 / 分组** | 按成员授予路由器、LAN、WAN、指定设备、网段、成员或分组权限，可限定协议和端口；显示命中 / 拒绝计数及缺少权限的已准入成员。 |
| **成员之间的隔离** | 为本机控制的网络配置 controller flow rules；组内互通和跨组授权不再靠粗放地开放整个网络。 |
| **LAN 设备 1:1 NAT** | 将没有 ZeroTier 客户端的设备映射到虚拟网络地址，从 DHCP / 邻居列表选择，检查地址冲突，保留稳定主机名。 |
| **Moon 生命周期** | 创建、orbit / deorbit、检查发布地址、跟踪 WAN 变化，并在 Moon 地址变更后重新获取定义，区分直连与中继。 |
| **多线程、peer bond 与 SMB relay** | 配置多线程和 leaf peer bond；为单个客户端设置可选 SMB TCP relay，并单独显示 bond / relay 实时状态。 |
| **后端与权限重构** | 用 rpcd ucode 插件代理本机 API，校验参数；不把 ZeroTier API token 交给浏览器，也不放到 curl 命令行。 |
| **原生 OpenWrt 界面** | 使用 LuCI 自身表格、分节、按钮与主题样式，提供简体中文翻译，不另造一套自定义 UI。 |

## 六个页面

| 页面 | 主要内容 |
| --- | --- |
| **概览** | 服务操作、本机 ID / 版本、网络流量、成员路径与延迟、bond 状态、日志；定时刷新。 |
| **设置** | 服务参数、加入网络、持久目录、`local.conf`、多线程和 peer bond。 |
| **权限** | 成员 / 角色授权、分组、加载状态、流量计数和待配置成员。 |
| **局域网网关** | 1:1 NAT 设备映射、地址建议、稳定主机名与 SMB relay。 |
| **控制器** | 本机控制的网络、地址分配、路由、DNS、成员准入与权限入口。 |
| **Moon** | 本机 Moon、发布地址、WAN 变化与已 orbit 的 Moon 状态。 |

## 依赖与版本配套

- 带 **fw4、ucode、LuCI** 的 OpenWrt / ImmortalWrt 环境；面向 23.05 及更新的平台构建，但不能据此保证所有衍生固件兼容。
- 包依赖：`zerotier`、`curl`、`rpcd-mod-ucode`、`ucode-mod-fs`、`ucode-mod-uci`。
- 成员权限、隔离与 LAN 网关需要本人的 **zerotier-openwrt**；原版 feed 包不能提供这些后台脚本。
- bond / SMB relay 应搭配 **zerotier-openwrt 99.1.16.2-r4 或更新的兼容版本**，r4 修复了 ZeroTier 重启后 relay 重定向丢失的问题。
- 99.x 是本 fork 的包版本策略，不是 ZeroTier 核心版本；它用来避免当前 feeds 的同名低版本包覆盖定制功能。

## 构建

在已准备好 LuCI 和 packages feeds 的 SDK 中：

```sh
git clone https://github.com/Altars3668/luci-app-zerotier.git package/luci-app-zerotier
# 将配套 zerotier-openwrt 的 net/zerotier 放入 package/zerotier，避免使用同名原版包
./scripts/feeds install luci-base rpcd-mod-ucode ucode-mod-fs ucode-mod-uci curl
printf '%s\n' 'CONFIG_PACKAGE_luci-app-zerotier=m' 'CONFIG_LUCI_LANG_zh_Hans=y' >> .config
make defconfig
make package/luci-app-zerotier/compile V=s -j2
```

界面是架构无关包；`zerotier` 二进制不是。两者仍需与目标固件、依赖和包格式匹配。当前没有保证可用的预编译 Release，构建方式以 [Makefile](Makefile) 和配套固件为准。

## 推荐使用顺序

1. 安装配套核心包与界面，打开 **服务 → ZeroTier**。
2. 在设置页加入现有网络，或在控制器页创建自己的网络。
3. 授权成员并分配地址；控制器“准入”与网关“权限”是两层不同的设置。
4. 需要最小权限时启用 ACL 策略，配置成员 / 角色；如果还需要阻止成员直接互访，为本机控制的网络启用成员隔离。
5. 需要访问没有客户端的 NAS 等设备时，再建立 1:1 NAT 映射及对应成员授权。
6. 用概览、权限计数、Moon 直连状态和 relay 实时状态验证结果，而不是仅凭保存成功判断。

## 架构与生效边界

- [前端视图](htdocs/luci-static/resources/view/zerotier/) → [rpcd ucode 后端](root/usr/share/rpcd/ucode/luci.zerotier) → 本机 ZeroTier API / UCI / 受限工具。
- 只改权限或防火墙选项时可用 `zerotier-fw4 -R -c` 重新应用规则，**不重启 ZeroTier**。
- 保存 bond / relay 参数不等于立即生效；界面不通过重启 WAN、fw4 或 ZeroTier 来伪装“已经应用”。按配套核心包的生命周期使其生效，再检查实时状态。
- 路由器防火墙只能控制经过路由器的流量；成员互访隔离需要控制器 flow rules，不应把两者混淆。
- SMB relay 是 TCP 字节转接，不终止 SMB 认证、签名或加密；就绪后会复位指定客户端仍走直连的 SMB 连接以促使重连。吞吐收益需真实路径测量，**不承诺开启即可加速**。
- 多线程并不是所有环节都并行：发送加密和收到帧后的投递可并行，接收解密仍有单线程边界。
- 非 OpenWrt 客户端不会自动运行本包的 Moon 刷新工具，Moon 更换地址后可能需要重新 orbit。

## 工具与维护

[zerotier-moon](root/usr/bin/zerotier-moon) 管理 Moon 及地址刷新；[zerotier-phone-dns](root/usr/bin/zerotier-phone-dns) 维护稳定主机名。身份文件、controller 数据和配置含密钥，备份时需要保密。

功能演进见 [CHANGELOG](CHANGELOG.md)。旧 `ARCHITECTURE.md` 等文档包含此前 ztncui / Lua 方案的历史描述；当前实现以本 README、99.x 的 changelog 和现行源码为准，不需要 Docker 或 ztncui 来启用内置控制器。

## 来源与许可证

原始 LuCI 集成与版权信息来自 [ImmortalWrt](https://github.com/immortalwrt/luci)，本仓库的后续重构由 Altars3668 维护。[Makefile](Makefile) 声明 **GPL-3.0-only**，版权和授权以保留的源码声明为准。

配套项目：[ZeroTier OpenWrt 核心包](https://github.com/Altars3668/zerotier-openwrt) · [RE-CS-02 固件 CI](https://github.com/Altars3668/OpenWRT-CI)。

## 上游基线与验证边界

源码来源已核实为 [immortalwrt/luci 的 `applications/luci-app-zerotier`](https://github.com/immortalwrt/luci/tree/5fc1fac5684cac6eee2c7fbff78c65b867980dd8/applications/luci-app-zerotier)，本轮基线为 `5fc1fac5684c`。来源、导入历史和保留的定制差异见 [UPSTREAM.md](UPSTREAM.md)。

检查视图 JavaScript、JSON、翻译编译和 ucode 编译；本轮不连接路由器进行网页或防火墙验收。

这些检查覆盖语法、翻译及所列本机回归；不等于所有架构 SDK / 固件构建或真实设备验收。本次发布更新源码和说明，不安装软件、不触发刷机，也不伪造预编译产物。
