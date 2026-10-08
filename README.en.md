# luci-app-zerotier

[简体中文](README.md) | **English**

A unified OpenWrt interface for a **ZeroTier node, embedded network controller, permission gateway and Moon**. Evolved from the ImmortalWrt LuCI integration, this edition goes beyond joining a network: it manages what members may access, how LAN devices are mapped, how Moons follow address changes, and whether runtime state matches saved configuration.

Pair it with [zerotier-openwrt](https://github.com/Altars3668/zerotier-openwrt): **LuCI configures and reports; `zerotier-fw4` generates and enforces rules.** The current UI package version is **99.5.1**.

## Current version and upstream

UI package **99.5.1**, with original LuCI sources from **ImmortalWrt**. Pair this revision with **zerotier-openwrt 99.1.16.2-r5**.

This refresh incorporates application-only history and reusable translations while preserving all six custom views and the rpcd ucode backend, rather than reverting to the stock two-page UI.

## What I changed

| Added or redesigned area | Purpose |
| --- | --- |
| **Embedded controller UI** | Creates networks on the router and manages admission, pools, routes, IPv6, DNS, MTU and network-ID QR codes. |
| **Member permissions and roles / groups** | Grants router, LAN, WAN, device, subnet, member or group access, optionally restricted by protocol and port; reports counters and admitted members without grants. |
| **Member-to-member isolation** | Configures controller flow rules on locally controlled networks, including within-group access and explicit cross-group grants. |
| **1:1 NAT for LAN devices** | Maps devices without a ZeroTier client into virtual-network addresses, with DHCP / neighbour selection, conflict checks and stable hostnames. |
| **Moon lifecycle management** | Creates, orbits and leaves Moons, checks advertised addresses, follows WAN changes, refreshes definitions and distinguishes direct from relayed paths. |
| **Multithreading, peer bonds and SMB relay** | Configures worker threads and leaf-peer bonds, plus an optional per-client SMB TCP relay; reports runtime state independently. |
| **Reworked backend and access model** | Uses an rpcd ucode plugin with argument validation; the ZeroTier API token never reaches the browser or curl command line. |
| **Native OpenWrt presentation** | Uses standard LuCI tables, sections, buttons and theme styling, with Simplified Chinese translations rather than a separate custom UI. |

## Six pages

| Page | Contents |
| --- | --- |
| **Overview** | Service controls, node ID / version, network traffic, peer latency and paths, bonds and logs with periodic refresh. |
| **Settings** | Service parameters, joined networks, persistent directory, `local.conf`, threads and peer bonds. |
| **Permissions** | Member / role grants, groups, load state, counters and members awaiting grants. |
| **LAN Gateway** | 1:1 NAT mappings, address suggestions, stable hostnames and SMB relay. |
| **Controller** | Local networks, addressing, routes, DNS, admission and links to member permissions. |
| **Moons** | Local Moon, advertised endpoints, WAN changes and orbited-Moon status. |

## Requirements and version pairing

- OpenWrt / ImmortalWrt with **fw4, ucode and LuCI**. Intended for 23.05 and newer environments, not a compatibility guarantee for every derivative firmware.
- Dependencies: `zerotier`, `curl`, `rpcd-mod-ucode`, `ucode-mod-fs`, `ucode-mod-uci`.
- Permissions, isolation and LAN gateway features require **zerotier-openwrt** from this account. The ordinary feed package lacks their backend helpers.
- Bond / SMB relay features need **zerotier-openwrt 99.1.16.2-r4 or a newer compatible version**. Release r4 restores relay redirects after ZeroTier restarts.
- 99.x is this fork's package-version policy, not the ZeroTier engine version; it prevents current lower-version feed packages from replacing the custom integration.

## Build

In an SDK with LuCI and packages feeds already prepared:

```sh
git clone https://github.com/Altars3668/luci-app-zerotier.git package/luci-app-zerotier
# Place the companion zerotier-openwrt net/zerotier recipe in package/zerotier instead of the ordinary feed recipe.
./scripts/feeds install luci-base rpcd-mod-ucode ucode-mod-fs ucode-mod-uci curl
printf '%s\n' 'CONFIG_PACKAGE_luci-app-zerotier=m' 'CONFIG_LUCI_LANG_zh_Hans=y' >> .config
make defconfig
make package/luci-app-zerotier/compile V=s -j2
```

The UI package is architecture-independent; the ZeroTier binary is not. Both must match the target firmware, dependencies and package format. A usable prebuilt Release is not guaranteed; consult the [Makefile](Makefile) and companion firmware.

## Suggested setup order

1. Install the companion engine and UI, then open **Services → ZeroTier**.
2. Join an existing network in Settings or create one in Controller.
3. Authorise members and assign addresses. Controller admission and gateway permissions are separate layers.
4. For least-privilege access, enable ACL policy and configure members / roles. To restrict direct member traffic, also enable isolation on a locally controlled network.
5. Add 1:1 NAT mappings and matching grants for NAS devices or other hosts without a client.
6. Verify with live peer paths, permission counters, Moon status and relay readiness—not just a successful save.

## Architecture and application boundaries

- [Frontend views](htdocs/luci-static/resources/view/zerotier/) → [rpcd ucode backend](root/usr/share/rpcd/ucode/luci.zerotier) → local ZeroTier API / UCI / restricted helpers.
- Permission-only or firewall-only changes can apply through `zerotier-fw4 -R -c` **without restarting ZeroTier**.
- Saving bond / relay settings does not imply immediate activation. The UI does not restart WAN, fw4 or ZeroTier to disguise configuration as live state. Apply through the companion package's lifecycle, then inspect runtime status.
- The router firewall governs routed traffic; direct member isolation requires controller flow rules. They are not interchangeable.
- SMB relay forwards TCP bytes without terminating SMB authentication, signing or encryption. When ready, it resets the selected client's remaining direct SMB connections to trigger reconnection. Measure throughput on the actual path; **enabling it does not guarantee acceleration**.
- Multithreading does not parallelise everything: outgoing encryption and delivery of received frames can run concurrently; incoming decryption retains a single-thread boundary.
- Other clients do not run this package's Moon refresh helper and may need to orbit again after a Moon changes address.

## Helpers and maintenance

[zerotier-moon](root/usr/bin/zerotier-moon) manages Moons and endpoint refresh; [zerotier-phone-dns](root/usr/bin/zerotier-phone-dns) maintains stable hostnames. Identity files, controller state and configuration contain secrets and need confidential backups.

See [CHANGELOG](CHANGELOG.md). Older files such as `ARCHITECTURE.md` describe historical ztncui / Lua designs. This README, the 99.x changelog and current source describe the active implementation. Docker and ztncui are not required for the embedded controller.

## Attribution and license

The original LuCI integration and copyright notices come from [ImmortalWrt](https://github.com/immortalwrt/luci); subsequent work is maintained by Altars3668. The [Makefile](Makefile) declares **GPL-3.0-only**; retained source notices define attribution and terms.

Related: [ZeroTier OpenWrt engine package](https://github.com/Altars3668/zerotier-openwrt) · [RE-CS-02 firmware CI](https://github.com/Altars3668/OpenWRT-CI).

## Upstream baseline and verification scope

The verified source is [`immortalwrt/luci/applications/luci-app-zerotier`](https://github.com/immortalwrt/luci/tree/5fc1fac5684cac6eee2c7fbff78c65b867980dd8/applications/luci-app-zerotier), pinned to `5fc1fac5684c`. [UPSTREAM.md](UPSTREAM.md) explains provenance, imported history and retained customisations.

JavaScript, JSON, translation compilation and ucode compilation are checked; this refresh does not run router UI or firewall acceptance tests.

These checks cover syntax, translations and the listed local regressions, not full SDK / firmware builds for every architecture or live-device qualification. This publication updates sources and documentation; it neither installs software nor flashes devices or manufactures prebuilt artifacts.
