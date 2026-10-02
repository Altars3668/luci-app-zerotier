# luci-app-zerotier

LuCI interface for ZeroTier on OpenWrt: status, settings, per-member firewall
permissions, LAN gateway (1:1 NAT), the embedded network controller and
moons. [中文说明](README_CN.md)

It is the web interface of the [zerotier-openwrt](https://git.altarscn.com/Geoffrey/zerotier-openwrt)
package, whose `zerotier-fw4` does the firewall work; the pages only edit
its configuration and show what it did.

## Pages

| Page | What it does |
|------|--------------|
| **Overview** | Service start/stop/restart, node address and version, joined networks with status, addresses, traffic and access policy, peers with role, latency and path (direct or relayed), log. Refreshes every 5 s. |
| **Settings** | The service (port, persistent directory, local.conf, multithreading) and the networks the router joins: managed addresses, routes, DNS, and per network the firewall policy - *open* (every member gets the same access) or *member permissions* (default deny) - plus member isolation on networks this router controls. |
| **Permissions** | Members and roles with their grants (`router`, `lan`, `wan`, `device:NAME`, `net:PREFIX`, `member:NAME`, `group:ROLE`, optionally narrowed to ports). Roles double as groups: with *Members reach each other*, the members of a role reach one another directly under member isolation. Shows, per network, whether the rules are loaded, how many packets were refused, whether member isolation is in force, the problems `zerotier-fw4` reports, and every member the controller admitted that has no permissions yet - with a button that opens a prefilled entry for it. Members are shown with the MAC the firewall recognizes them by, whether they are online, and how many packets their grants let through. |
| **LAN Gateway** | Map LAN devices to addresses on a ZeroTier network (1:1 NAT), picked from the DHCP/neighbour list, with address suggestions and conflict checks - including addresses a controller pool could hand out. Stable host names that follow a device between its own ZeroTier client and its mapped address. |
| **Controller** | Networks this router controls: create, delete, QR code of the ID; name, private/public, broadcast, MTU, IPv4 pools and routes (with a subnet quick setup), IPv6 modes, DNS; members with admission, addresses, active bridge flag, online state and a link to their permissions. |
| **Moons** | This router as a moon: create it, see whether the addresses it announces are still the router's, follow WAN address changes, open its firewall port; orbit and leave other moons, see whether each is reached directly, fetch a moon's current definition again. |

## Design

- **Backend**: one rpcd ucode plugin (`/usr/share/rpcd/ucode/luci.zerotier`).
  The browser never sees the API token of zerotier-one and never runs a
  command itself; the plugin validates every argument against what the call
  may accept and passes the token to curl through a private header file,
  never on a command line. The ACL only grants these calls, uci of
  `zerotier` / `zerotier-phone-dns`, and the init script.
- **Configuration** stays in `/etc/config/zerotier`. Saving permissions or
  firewall options re-applies the rules without restarting zerotier-one
  (`zerotier-fw4 -R -c`); anything else restarts it.
- **Frontend**: LuCI client-side views in the OpenWrt design language - the
  tables, labels, sections and buttons LuCI's own pages use, styled by the
  theme alone. Shared helpers in `htdocs/luci-static/resources/zerotier/common.js`,
  Simplified Chinese translation in `po/zh_Hans`.

## Requirements

- OpenWrt / ImmortalWrt with fw4 and ucode (23.05 or newer)
- `zerotier` from zerotier-openwrt (member permissions, member isolation,
  LAN gateway); with the plain feed package the Settings, Controller and
  Moons pages still work
- `rpcd-mod-ucode`, `ucode-mod-fs`, `ucode-mod-uci`, `curl`

## Building

In an OpenWrt SDK with the LuCI feed:

```sh
cp -r luci-app-zerotier package/
echo 'CONFIG_PACKAGE_luci-app-zerotier=m' >> .config
echo 'CONFIG_LUCI_LANG_zh_Hans=y' >> .config
make defconfig
make package/luci-app-zerotier/compile
```

The packages are architecture independent (`noarch`). The version is
99.x so that the upstream `luci-app-zerotier` of the feeds (26.x) never
replaces this one on an upgrade.

## Command line helpers

- `zerotier-moon` - create a moon, follow WAN address changes (`dynamic`,
  run from cron and WAN hotplug), `endpoints` / `current` to compare what
  it should and does announce, orbit and leave moons, moon firewall rule.
  `refresh` (cron, every 5 minutes) fetches the current definition of each
  orbited moon that has no direct path: zerotier-one reaches a moon only at
  the addresses of the definition it holds and does not learn a moon's new
  address by itself, so without it a moon that changed its address (DDNS,
  PPPoE) stays reachable only through the public roots. Nodes without this
  package (phones, PCs) have to orbit such a moon again.
- `zerotier-phone-dns` - stable host names (cron, every minute), configured
  in `/etc/config/zerotier-phone-dns`.

## License

GPL-3.0-only
