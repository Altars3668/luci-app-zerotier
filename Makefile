# SPDX-License-Identifier: GPL-3.0-only
#
# Copyright (C) 2022 ImmortalWrt.org

include $(TOPDIR)/rules.mk

LUCI_TITLE:=LuCI for ZeroTier
LUCI_DESCRIPTION:=Status, settings, member permissions, LAN gateway (1:1 NAT), \
	local network controller and moons for ZeroTier
LUCI_DEPENDS:=+zerotier +curl +ucode +ucode-mod-fs +ucode-mod-uci +rpcd-mod-ucode
LUCI_PKGARCH:=all

# Higher than the upstream luci-app-zerotier (26.x): a feed update must not
# replace this one
PKG_VERSION:=99.5.1
PKG_RELEASE:=1
PKG_PO_VERSION:=99.5.1

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
