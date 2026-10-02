# luci-app-zerotier

OpenWrt 上 ZeroTier 的 LuCI 管理界面：状态、设置、按成员分配的防火墙权限、
局域网网关（1:1 NAT）、内置网络控制器和 Moon。[English](README.md)

它是 [zerotier-openwrt](https://git.altarscn.com/Geoffrey/zerotier-openwrt) 软件包的网页界面：
防火墙规则由其中的 `zerotier-fw4` 生成和加载，页面只负责编辑配置、展示结果。

## 页面

| 页面 | 功能 |
|------|------|
| **概览** | 启动、停止、重启服务；本节点地址与版本；已加入网络的状态、地址、流量和访问策略；对等节点的角色、延迟和路径（直连或中继）；日志。每 5 秒自动刷新。 |
| **设置** | 服务参数（端口、持久化目录、local.conf）以及本路由器加入的网络：受管地址、路由、DNS，每个网络的防火墙策略——*开放*（所有成员获得相同访问）或*成员权限*（默认拒绝），以及本路由器作为控制器时的成员隔离。 |
| **权限** | 成员和角色及其授权（`router`、`lan`、`wan`、`device:名称`、`net:前缀`、`member:名称`、`group:角色`，可限定端口）。角色同时也是分组：勾选*组内互通*后，启用成员隔离时同一角色的成员可以直接互访。按网络显示规则是否已加载、拒绝了多少包、成员隔离是否生效、`zerotier-fw4` 报告的配置问题，以及所有"已被控制器准入、但还没有权限"的成员——点一下即可打开预填好的权限条目。成员列表显示防火墙识别它所用的 MAC、是否在线、授权放行了多少包。 |
| **局域网网关** | 把局域网设备映射为 ZeroTier 网络中的地址（1:1 NAT），可从 DHCP/邻居表直接选取，自动建议地址并检查冲突，包括控制器地址池可能分配出去的地址。稳定主机名：让一个主机名跟随设备在"自身 ZeroTier 客户端"与"映射地址"之间切换。 |
| **控制器** | 本路由器控制的网络：创建、删除、网络 ID 二维码；名称、私有/公开、广播、MTU、IPv4 地址池和路由（支持按子网快速设置）、IPv6 分配方式、DNS；成员的准入、地址、主动桥接、在线状态，以及到其权限的链接。 |
| **Moon** | 本路由器作为 Moon：创建；检查它发布的地址是否仍是路由器当前的地址；跟随 WAN 地址变化；开放防火墙端口；加入或退出其他 Moon，查看每个 Moon 是否直连，重新获取 Moon 的当前定义。 |

## 设计

- **后端**：一个 rpcd ucode 插件（`/usr/share/rpcd/ucode/luci.zerotier`）。浏览器既拿不到
  zerotier-one 的 API token，也不能自行执行命令；插件按白名单校验每个参数，token 通过私有的
  请求头文件交给 curl，绝不出现在命令行上。ACL 只授权这些调用、`zerotier` /
  `zerotier-phone-dns` 两份 uci 配置和 init 脚本。
- **配置**仍然在 `/etc/config/zerotier`。只改权限或防火墙选项时，保存后重新应用规则，
  不重启 zerotier-one（`zerotier-fw4 -R -c`）；其他改动才会重启。
- **前端**：LuCI 客户端视图，遵循 OpenWrt 的设计语言——只用 LuCI 自身页面的表格、标签、分节和按钮，
  外观完全交给主题。公共函数在 `htdocs/luci-static/resources/zerotier/common.js`，
  简体中文翻译在 `po/zh_Hans`。

## 依赖

- 带 fw4 和 ucode 的 OpenWrt / ImmortalWrt（23.05 或更新）
- zerotier-openwrt 的 `zerotier` 包（成员权限、成员隔离、局域网网关需要它）；
  用 feed 里的原版包时，设置、控制器和 Moon 页面仍可使用
- `rpcd-mod-ucode`、`ucode-mod-fs`、`ucode-mod-uci`、`curl`

## 构建

在带 LuCI feed 的 OpenWrt SDK 中：

```sh
cp -r luci-app-zerotier package/
echo 'CONFIG_PACKAGE_luci-app-zerotier=m' >> .config
echo 'CONFIG_LUCI_LANG_zh_Hans=y' >> .config
make defconfig
make package/luci-app-zerotier/compile
```

生成的包与架构无关（`noarch`）。版本号定为 99.x，保证 feed 里上游的
`luci-app-zerotier`（26.x）升级时不会把它替换掉。

## 命令行辅助工具

- `zerotier-moon`：创建 Moon、跟随 WAN 地址变化（`dynamic`，由 cron 和 WAN 热插拔触发）、
  用 `endpoints` / `current` 对比"应发布"与"实际发布"的地址、加入或退出 Moon、管理 Moon 端口的防火墙规则。
  `refresh`（cron 每 5 分钟）为每个没有直连路径的已加入 Moon 重新获取当前定义：zerotier-one 只按自己
  持有的定义里的地址访问 Moon，不会自己学到 Moon 的新地址；没有这一步，换了地址（DDNS、PPPoE）的
  Moon 就只能经公共根服务器中转访问。没装本软件包的节点（手机、电脑）需要重新加入这样的 Moon。
- `zerotier-phone-dns`：稳定主机名（cron 每分钟运行），配置在 `/etc/config/zerotier-phone-dns`。

## 许可证

GPL-3.0-only
