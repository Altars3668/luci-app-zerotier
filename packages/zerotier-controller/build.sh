#!/bin/bash
# Build ZeroTier with Controller support for OpenWrt/ImmortalWrt
# Usage: ./build.sh [target] [version]
#   target: x86_64, aarch64, etc. (default: auto-detect)
#   version: ZeroTier version (default: 1.16.0)

set -e

TARGET="${1:-}"
ZT_VERSION="${2:-1.16.0}"

# Auto-detect target if not specified
if [ -z "$TARGET" ]; then
    if [ -f /etc/openwrt_release ]; then
        TARGET=$(grep DISTRIB_ARCH /etc/openwrt_release | cut -d"'" -f2)
    else
        TARGET="x86_64"
    fi
fi

echo "Building ZeroTier $ZT_VERSION with controller for $TARGET"

# Check if we're on OpenWrt
if [ -f /etc/openwrt_release ]; then
    echo "Detected OpenWrt environment"
    BUILD_ON_DEVICE=1
else
    echo "Not on OpenWrt - will use SDK/Docker"
    BUILD_ON_DEVICE=0
fi

# Download ZeroTier source
if [ ! -d "ZeroTierOne-$ZT_VERSION" ]; then
    echo "Downloading ZeroTier source..."
    wget -q "https://github.com/zerotier/ZeroTierOne/archive/refs/tags/$ZT_VERSION.tar.gz" -O zerotier.tar.gz
    tar xf zerotier.tar.gz
    rm zerotier.tar.gz
fi

cd "ZeroTierOne-$ZT_VERSION"

if [ "$BUILD_ON_DEVICE" = "1" ]; then
    # Building directly on OpenWrt (requires build tools)
    echo "Building on device..."
    
    # Check for required tools
    if ! command -v g++ &> /dev/null; then
        echo "Error: g++ not found. Please install build-essential:"
        echo "  opkg update && opkg install gcc g++ make"
        exit 1
    fi
    
    # Build with controller support
    make clean 2>/dev/null || true
    make -j$(nproc) ZT_CONTROLLER=1 ZT_SSO_SUPPORTED=0 one
    
    echo ""
    echo "Build complete!"
    echo "Binary: $(pwd)/zerotier-one"
    echo ""
    echo "To install:"
    echo "  /etc/init.d/zerotier stop"
    echo "  cp zerotier-one /usr/bin/"
    echo "  /etc/init.d/zerotier start"
else
    # Building using Docker with musl for OpenWrt compatibility
    echo "Building with Docker for $TARGET..."
    
    if ! command -v docker &> /dev/null; then
        echo "Error: Docker not found. Please install Docker first."
        exit 1
    fi
    
    # Use Alpine (musl) for OpenWrt compatibility
    docker run --rm -v "$(pwd):/src" -w /src alpine:latest sh -c "
        apk add --no-cache g++ make linux-headers libsodium-dev
        make clean 2>/dev/null || true
        make -j\$(nproc) ZT_CONTROLLER=1 ZT_SSO_SUPPORTED=0 one
    "
    
    echo ""
    echo "Build complete!"
    echo "Binary: $(pwd)/zerotier-one"
fi

echo ""
echo "Testing build..."
./zerotier-one -v

echo ""
echo "Verifying controller support..."
if strings zerotier-one | grep -q "controller"; then
    echo "✓ Controller support enabled"
else
    echo "✗ Controller support NOT found"
    exit 1
fi

echo ""
echo "=== Installation Instructions ==="
echo ""
echo "1. Copy to your OpenWrt device:"
echo "   scp zerotier-one root@<router-ip>:/tmp/"
echo ""
echo "2. On the router, stop ZeroTier and replace binary:"
echo "   /etc/init.d/zerotier stop"
echo "   cp /tmp/zerotier-one /usr/bin/"
echo "   chmod +x /usr/bin/zerotier-one"
echo "   /etc/init.d/zerotier start"
echo ""
echo "3. Verify controller works:"
echo "   TOKEN=\$(cat /var/lib/zerotier-one/authtoken.secret)"
echo "   curl -s -H \"X-ZT1-Auth: \$TOKEN\" http://localhost:9993/controller"
echo ""
