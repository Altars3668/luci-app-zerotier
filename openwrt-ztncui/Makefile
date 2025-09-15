# OpenWrt Makefile for ZTNCUI
include $(TOPDIR)/rules.mk

PKG_NAME:=ztncui-openwrt
PKG_VERSION:=1.0.0
PKG_RELEASE:=1

PKG_SOURCE_PROTO:=git
PKG_SOURCE_URL:=https://github.com/AltarsCN/luci-app-zerotier.git
PKG_SOURCE_VERSION:=HEAD
PKG_SOURCE:=$(PKG_NAME)-$(PKG_VERSION).tar.gz
PKG_SOURCE_SUBDIR:=$(PKG_NAME)-$(PKG_VERSION)

PKG_LICENSE:=GPL-3.0
PKG_LICENSE_FILES:=LICENSE
PKG_MAINTAINER:=AltarsCN <altars@example.com>

PKG_BUILD_PARALLEL:=1
PKG_USE_MIPS16:=0

include $(INCLUDE_DIR)/package.mk

define Package/ztncui-openwrt
  SECTION:=net
  CATEGORY:=Network
  TITLE:=ZeroTier Network Controller UI for OpenWrt
  URL:=https://github.com/AltarsCN/luci-app-zerotier
  DEPENDS:=+zerotier +libjson-c +libmicrohttpd +libuci +libpthread
  PKGARCH:=all
endef

define Package/ztncui-openwrt/description
  A lightweight web-based interface for managing ZeroTier networks 
  as a network controller on OpenWrt systems. This is a C 
  implementation optimized for resource-constrained devices.
endef

define Package/ztncui-openwrt/conffiles
/etc/config/ztncui
/etc/ztncui/
endef

# Build configuration
TARGET_CFLAGS += -I$(STAGING_DIR)/usr/include/json-c
TARGET_LDFLAGS += -ljson-c -lmicrohttpd -luci -lpthread

define Build/Configure
	# No configure step needed for this simple C project
endef

define Build/Compile
	$(MAKE) -C $(PKG_BUILD_DIR)/openwrt-ztncui/src \
		CC="$(TARGET_CC)" \
		CFLAGS="$(TARGET_CFLAGS)" \
		LDFLAGS="$(TARGET_LDFLAGS)" \
		all
endef

define Package/ztncui-openwrt/install
	# Install binary
	$(INSTALL_DIR) $(1)/usr/bin
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/openwrt-ztncui/src/ztncui-server $(1)/usr/bin/
	
	# Install init script
	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) ./files/etc/init.d/ztncui $(1)/etc/init.d/
	
	# Install UCI config
	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_CONF) ./files/etc/config/ztncui $(1)/etc/config/
	
	# Install configuration directory
	$(INSTALL_DIR) $(1)/etc/ztncui
	$(INSTALL_DATA) ./files/etc/ztncui/* $(1)/etc/ztncui/
	
	# Install web interface
	$(INSTALL_DIR) $(1)/www/ztncui
	$(CP) ./files/www/ztncui/* $(1)/www/ztncui/
	
	# Install shared files
	$(INSTALL_DIR) $(1)/usr/share/ztncui
	$(CP) ./files/usr/share/ztncui/* $(1)/usr/share/ztncui/
endef

define Package/ztncui-openwrt/postinst
#!/bin/sh
# Enable service but don't start it automatically
[ -n "$${IPKG_INSTROOT}" ] || {
	/etc/init.d/ztncui enable
	echo "ZTNCUI installed. Configure via UCI and start with: /etc/init.d/ztncui start"
	echo "Web interface will be available at: http://[router-ip]:3000"
}
endef

define Package/ztncui-openwrt/prerm
#!/bin/sh
# Stop service before removal
[ -n "$${IPKG_INSTROOT}" ] || {
	/etc/init.d/ztncui stop
	/etc/init.d/ztncui disable
}
endef

$(eval $(call BuildPackage,ztncui-openwrt))