# ZeroTier Controller Package

This package provides a ZeroTier binary compiled with built-in controller support (`ZT_CONTROLLER=1`).

## Why This Package?

The standard OpenWrt `zerotier` package is compiled **without** controller support to save space. This means the `/controller` API endpoint returns 404, and you cannot create/manage networks locally.

This `zerotier-controller` package enables the built-in controller API, allowing you to:
- Create and manage your own ZeroTier networks
- Authorize/deauthorize members
- Configure routes and IP pools
- All without external services or ZTNCUI

## Quick Installation (x86_64)

For x86_64 ImmortalWrt/OpenWrt users, you can try the pre-built binary:

```bash
# Download pre-built zerotier-one with controller
wget https://github.com/AltarsCN/luci-app-zerotier/releases/download/zerotier-controller/zerotier-one-x86_64 -O /tmp/zerotier-one

# Stop service
/etc/init.d/zerotier stop

# Backup original
cp /usr/bin/zerotier-one /usr/bin/zerotier-one.bak

# Replace binary
cp /tmp/zerotier-one /usr/bin/zerotier-one
chmod +x /usr/bin/zerotier-one

# Start service
/etc/init.d/zerotier start

# Verify controller works
sleep 3
TOKEN=$(cat /var/lib/zerotier-one/authtoken.secret)
curl -s -H "X-ZT1-Auth: $TOKEN" http://localhost:9993/controller
```

## Installation Methods

### Method 1: Add to OpenWrt Build System (Recommended)

1. **Clone this repository to your OpenWrt source tree:**
   ```bash
   cd ~/openwrt
   mkdir -p package/network/services/zerotier-controller
   cp -r /path/to/luci-app-zerotier/packages/zerotier-controller/* package/network/services/zerotier-controller/
   ```

2. **Update feeds and configure:**
   ```bash
   ./scripts/feeds update -a
   ./scripts/feeds install -a
   make menuconfig
   ```

3. **Select the package:**
   ```
   Network → VPN → zerotier-controller
   ```

4. **Build:**
   ```bash
   make package/zerotier-controller/compile V=s
   ```

5. **Install the generated IPK:**
   ```bash
   scp bin/packages/*/base/zerotier-controller_*.ipk root@router:/tmp/
   ssh root@router "opkg install /tmp/zerotier-controller_*.ipk"
   ```

### Method 2: SDK Build

1. **Download OpenWrt SDK for your target:**
   Visit https://downloads.openwrt.org/ and download the SDK for your architecture.

2. **Extract and setup:**
   ```bash
   tar xf openwrt-sdk-*.tar.xz
   cd openwrt-sdk-*
   ```

3. **Copy package:**
   ```bash
   mkdir -p package/zerotier-controller
   cp -r /path/to/luci-app-zerotier/packages/zerotier-controller/* package/zerotier-controller/
   ```

4. **Build:**
   ```bash
   make defconfig
   make package/zerotier-controller/compile V=s
   ```

### Method 3: ImmortalWrt Builder

For ImmortalWrt users:

1. **Clone ImmortalWrt:**
   ```bash
   git clone https://github.com/immortalwrt/immortalwrt.git
   cd immortalwrt
   ```

2. **Add package and build** (follow Method 1 steps)

## Post-Installation

After installing `zerotier-controller`:

1. **Restart ZeroTier:**
   ```bash
   /etc/init.d/zerotier restart
   ```

2. **Verify controller is available:**
   ```bash
   TOKEN=$(cat /var/lib/zerotier-one/authtoken.secret)
   curl -s -H "X-ZT1-Auth: $TOKEN" http://localhost:9993/controller
   ```
   You should see `{"controller":true}` instead of 404.

3. **Use LuCI Networks tab:**
   Navigate to `VPN → ZeroTier → Networks` to create and manage networks.

## Package Details

| Field | Value |
|-------|-------|
| Package Name | zerotier-controller |
| Version | 1.14.2 |
| Size | ~1.5MB |
| Depends | libstdcpp, libpthread, libminiupnpc, libnatpmp, libsodium |
| Conflicts | zerotier |
| Provides | zerotier |

## Updating

To update to a newer ZeroTier version:

1. Update `PKG_VERSION` in the Makefile
2. Update `PKG_HASH` (get from `sha256sum ZeroTierOne-<version>.tar.gz`)
3. Rebuild the package

## Troubleshooting

### Controller still returns 404

- Ensure the new package is installed: `opkg list-installed | grep zerotier`
- Restart ZeroTier: `/etc/init.d/zerotier restart`
- Wait a few seconds for the service to fully start

### Build fails with missing dependencies

Install required build dependencies:
```bash
./scripts/feeds install libstdcpp libpthread libminiupnpc libnatpmp libsodium
```

### Conflicts with existing zerotier

This package conflicts with and replaces the standard `zerotier` package:
```bash
opkg remove zerotier
opkg install zerotier-controller_*.ipk
```

## See Also

- [LuCI ZeroTier Networks Tab](../README.md)
- [ZTNCUI Integration](../README-ztncui.md)
- [ZeroTier Controller API](https://docs.zerotier.com/self-hosting/network-controllers/)
