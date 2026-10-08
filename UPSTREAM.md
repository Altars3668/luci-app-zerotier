# Upstream provenance

[简体中文](README.md) | [English](README.en.md)

## 已核实来源

- 仓库：[`immortalwrt/luci`](https://github.com/immortalwrt/luci)。
- 路径：`applications/luci-app-zerotier`；分支：`master`。
- 本轮固定提交：`5fc1fac5684cac6eee2c7fbff78c65b867980dd8`（2026-10-08 核对）。机器可读记录见 [UPSTREAM.toml](UPSTREAM.toml)。

## 保留与适配

六个自有视图与 ucode 控制器后端保持；stock 两页界面由本项目的权限、网关、Moon、bond / relay 页面取代。合并上游俄文及其他可复用翻译，不让旧界面覆盖自有功能。

独立导入仓库原先没有可证明的共享 Git 祖先。本轮只抽取对应子目录的历史；历史 anchor 用于还原导入差异，不把非精确匹配冒充原始 fork 点。原提交与原分支保留在独立备份；过滤历史不会带入整个 feed。

## 验证边界

检查视图 JavaScript、JSON、翻译编译和 ucode 编译；本轮不连接路由器进行网页或防火墙验收。

## English

Pinned upstream: `immortalwrt/luci`, `applications/luci-app-zerotier`, `master` at `5fc1fac5684cac6eee2c7fbff78c65b867980dd8`. See [UPSTREAM.toml](UPSTREAM.toml) for the reproducible reference and import-anchor classification.

The six custom views and ucode controller backend remain. They supersede the stock two-page UI. Reusable upstream translations are merged without reverting permissions, gateways, Moons, bond or relay features.

Imported standalone snapshots did not prove shared Git ancestry. Only the relevant subdirectory history is retained; non-exact historical anchors are reconstruction aids, not asserted original fork points. Original refs and commits remain backed up.

JavaScript, JSON, translation compilation and ucode compilation are checked; this refresh does not run router UI or firewall acceptance tests.
