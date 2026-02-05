# SPDX-License-Identifier: GPL-3.0-only
#
# Copyright (C) 2022 ImmortalWrt.org

include $(TOPDIR)/rules.mk

LUCI_TITLE:=LuCI for Zerotier
LUCI_DEPENDS:=+zerotier +zerotier-idtool +curl
LUCI_PKGARCH:=all
LUCI_DESCRIPTION:=LuCI support for ZeroTier with Moon node management, ZTNCUI controller and lightweight network controller

include ../../luci.mk

# call BuildPackage - OpenWrt buildroot signature


