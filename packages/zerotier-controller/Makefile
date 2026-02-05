# SPDX-License-Identifier: GPL-2.0-only
#
# Copyright (C) 2024 LuCI-app-zerotier
#
# ZeroTier with built-in Controller support
# This package provides zerotier-one compiled with ZT_CONTROLLER=1
# enabling the built-in network controller API

include $(TOPDIR)/rules.mk

PKG_NAME:=zerotier-controller
PKG_VERSION:=1.16.0
PKG_RELEASE:=1

PKG_SOURCE:=ZeroTierOne-$(PKG_VERSION).tar.gz
PKG_SOURCE_URL:=https://codeload.github.com/zerotier/ZeroTierOne/tar.gz/$(PKG_VERSION)?
PKG_HASH:=skip

PKG_BUILD_DIR:=$(BUILD_DIR)/ZeroTierOne-$(PKG_VERSION)

PKG_LICENSE:=BSL-1.1
PKG_LICENSE_FILES:=LICENSE.txt
PKG_MAINTAINER:=LuCI-app-zerotier

PKG_ASLR_PIE:=0
PKG_BUILD_FLAGS:=gc-sections lto

include $(INCLUDE_DIR)/package.mk

define Package/zerotier-controller
  SECTION:=net
  CATEGORY:=Network
  SUBMENU:=VPN
  DEPENDS:=+libstdcpp +libpthread +libminiupnpc +libnatpmp +libsodium
  TITLE:=ZeroTier with Controller Support
  URL:=https://www.zerotier.com
  CONFLICTS:=zerotier
  PROVIDES:=zerotier
endef

define Package/zerotier-controller/description
 ZeroTier creates a global provider-independent virtual private cloud network.
 This package includes the built-in network controller, allowing you to
 create and manage your own ZeroTier networks without external services.
endef

define Package/zerotier-controller/conffiles
/etc/config/zerotier
endef

MAKE_FLAGS += \
	DEFS="" \
	OSTYPE="Linux" \
	ZT_CONTROLLER=1 \
	ZT_SSO_SUPPORTED=0

define Build/Compile
	$(call Build/Compile/Default,one)
endef

define Package/zerotier-controller/install
	$(INSTALL_DIR) $(1)/usr/bin
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/zerotier-one $(1)/usr/bin/
	$(LN) zerotier-one $(1)/usr/bin/zerotier-cli
	$(LN) zerotier-one $(1)/usr/bin/zerotier-idtool
endef

$(eval $(call BuildPackage,zerotier-controller))
