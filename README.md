# LuCI ZeroTier Application - Enhanced Edition

Enhanced LuCI application for ZeroTier with comprehensive Moon node management and ZTNCUI network controller integration.

## Features

### Core ZeroTier Management
- ✅ Basic ZeroTier configuration and network management
- ✅ Interface information and status monitoring
- ✅ Firewall integration and traffic control
- ✅ Multi-language support (English, 简体中文, 繁體中文)

### Moon Node Management
- 🌙 **Create Moon Nodes**: Set up your router as a ZeroTier Moon for improved connectivity
- 🌙 **Join Moon Networks**: Connect to existing Moon nodes
- 🌙 **Manage Connections**: View and manage connected Moon nodes
- 🌙 **Auto-creation**: Automatically create Moon nodes on startup

### Network Controller (ZTNCUI Integration)
- 🎛️ **Local Controller**: Run your own ZeroTier network controller
- 🎛️ **Web Interface**: Browser-based network management via ZTNCUI
- 🎛️ **Service Control**: Start, stop, and configure ZTNCUI service
- 🎛️ **Quick Setup**: Automated controller mode configuration

## Installation

### Prerequisites
- OpenWrt router with LuCI
- ZeroTier package installed
- Sufficient storage space (recommended: 100MB+)

### Package Installation

```bash
# Install core ZeroTier
opkg update
opkg install zerotier

# Install LuCI ZeroTier app
opkg install luci-app-zerotier

# Install ZTNCUI for network controller functionality
# Note: ZTNCUI is not available in standard OpenWrt packages
# Choose one of the following methods:

# Method 1: Docker (Recommended)
opkg install dockerd docker
docker run -d --name ztncui --restart=unless-stopped \
  -p 3000:3000 \
  -v /var/lib/zerotier-one:/var/lib/zerotier-one \
  keynetworks/ztncui

# Method 2: Node.js
opkg install node npm
npm install -g ztncui

# Method 3: Manual download
# Download from: https://github.com/key-networks/ztncui/releases
```

## Quick Start Guide

### 1. Basic ZeroTier Setup
1. Go to **Network** → **VPN** → **ZeroTier** → **Configuration**
2. Enable ZeroTier service
3. Add your network ID
4. Configure network settings
5. Apply changes

### 2. Moon Node Setup
1. Navigate to **ZeroTier** → **Moon Manager**
2. Enter your public IP address and port
3. Click "Create Moon"
4. Share your Moon ID with other users

### 3. Network Controller Setup
1. Go to **ZeroTier** → **Network Controller**
2. Click "Enable Controller Mode"
3. Start ZTNCUI service
4. Access web interface at `http://[router-ip]:3000`
5. Login with default credentials (admin/password)
6. Create and manage your networks

## Configuration Options

### Global Settings
- **Listen Port**: ZeroTier daemon port (default: 9993)
- **Client Secret**: Optional authentication secret
- **Config Path**: Persistent configuration directory
- **Copy Config**: Copy config to memory to avoid flash writes

### Moon Configuration
- **Auto-create Moon**: Automatically create Moon on startup
- **Public IP/Port**: Required for Moon creation
- **Moon Management**: Join/leave Moon networks

### Controller Settings
- **Enable Controller**: Activate network controller functionality
- **Web Port**: ZTNCUI interface port (default: 3000)
- **Service Control**: Start/stop ZTNCUI service

### Network Settings
- **Network ID**: 16-character network identifier
- **IP Management**: Allow managed/global/default routes
- **DNS Settings**: Allow DNS configuration
- **Firewall Rules**: Input/forward/masquerade controls

## File Structure

```
/usr/share/luci/menu.d/
└── luci-app-zerotier.json          # Menu configuration

/usr/share/rpcd/acl.d/
└── luci-app-zerotier.json          # Permission configuration

/usr/share/luci-static/resources/view/zerotier/
├── config.js                       # Main configuration page
├── interface.js                    # Interface information page
├── moon.js                         # Moon node management
└── controller.js                   # ZTNCUI controller management

/usr/bin/
├── zerotier-moon                   # Moon management script
└── ztncui-manager                  # ZTNCUI management script

/etc/uci-defaults/
└── 40_luci-zerotier               # Installation script
```

## Advanced Usage

### Command Line Tools

#### Moon Management
```bash
# Create a moon
zerotier-moon create <public_ip> [port]

# Join a moon
zerotier-moon join <moon_id>

# Leave a moon
zerotier-moon leave <moon_id>

# List connected moons
zerotier-moon list
```

#### ZTNCUI Management
```bash
# Setup ZTNCUI
ztncui-manager setup

# Control service
ztncui-manager start|stop|restart

# Reset admin password
ztncui-manager reset-password

# Show configuration
ztncui-manager show-config
```

### Configuration Files

#### ZeroTier UCI Config
```bash
# View configuration
uci show zerotier

# Example network configuration
uci set zerotier.@network[0].enabled='1'
uci set zerotier.@network[0].id='1234567890abcdef'
uci commit zerotier
```

#### ZTNCUI Configuration
```bash
# Configuration file location
/etc/ztncui/etc/ztncui.conf

# Key settings
HTTP_PORT=3000
ZT_HOME=/var/lib/zerotier-one
HTTP_ALL_INTERFACES=yes
```

## Troubleshooting

### Common Issues

#### ZeroTier Service Issues
```bash
# Check service status
/etc/init.d/zerotier status

# View logs
logread | grep zerotier

# Restart service
/etc/init.d/zerotier restart
```

#### Moon Creation Problems
- Ensure public IP is accessible from internet
- Check firewall rules for ZeroTier port
- Verify zerotier-idtool is available

#### ZTNCUI Access Issues
- Verify service is running: `ztncui-manager status`
- Check web port accessibility
- Review firewall configuration for port 3000

### Debug Information

```bash
# ZeroTier status
zerotier-cli info
zerotier-cli peers
zerotier-cli listnetworks

# Moon status
zerotier-cli listmoons

# System resources
free -m
df -h
```

## Security Considerations

### Firewall Configuration
- Ensure ZeroTier port (9993) is accessible
- Restrict ZTNCUI web interface access if needed
- Use strong passwords for ZTNCUI admin account

### Network Security
- Use private networks instead of open ones
- Regularly audit network members
- Monitor for unauthorized access attempts

### Moon Security
- Only create moons on trusted networks
- Regularly review connected moons
- Use secure, non-default ports when possible

## Performance Tips

### Resource Optimization
- Use "Copy Config" option to reduce flash writes
- Monitor storage usage in config directories
- Restart services periodically for optimal performance

### Network Performance
- Place Moon nodes on stable, high-bandwidth connections
- Limit number of networks per controller based on hardware
- Monitor network latency and adjust accordingly

## API Reference

### UCI Configuration Schema

```
zerotier.global
├── enabled (boolean)
├── port (integer)
├── secret (string)
├── local_conf_path (string)
├── config_path (string)
├── copy_config_path (boolean)
├── auto_moon (boolean)
├── moon_root_public_port (integer)
├── moon_root_public_addr (string)
├── enable_controller (boolean)
├── controller_port (integer)
└── fw_allow_input (boolean)

zerotier.network[]
├── enabled (boolean)
├── id (string)
├── allow_managed (boolean)
├── allow_global (boolean)
├── allow_default (boolean)
├── allow_dns (boolean)
├── fw_allow_input (boolean)
├── fw_allow_forward (boolean)
├── fw_forward_ifaces (list)
├── fw_allow_masq (boolean)
└── fw_masq_ifaces (list)
```

## Contributing

### Development Setup
1. Clone the luci repository
2. Navigate to `applications/luci-app-zerotier/`
3. Make modifications
4. Test on OpenWrt device
5. Submit pull request

### Translation
- Add new language files in `po/[language]/`
- Follow existing translation format
- Test translations in LuCI interface

## Changelog

### v2.0.0 (Enhanced Edition)
- ➕ Added Moon node management functionality
- ➕ Added ZTNCUI network controller integration
- ➕ Enhanced multi-language support
- ➕ Added comprehensive configuration options
- ➕ Added command-line management tools
- 🐛 Fixed various UI and configuration issues

### v1.x.x (Original)
- Basic ZeroTier configuration
- Network management
- Interface information display

## License

This project is licensed under GPL-3.0-only, maintaining compatibility with the original LuCI ZeroTier application.

## Acknowledgments

- Original luci-app-zerotier developers
- ZeroTier team for the excellent networking solution
- ZTNCUI developers for the controller interface
- OpenWrt and LuCI communities

## Support

For issues and support:
1. Check troubleshooting section above
2. Review log files and error messages
3. Consult ZeroTier and ZTNCUI documentation
4. Submit issues with detailed information and logs

---

**Note**: This enhanced version maintains full backward compatibility with existing ZeroTier configurations while adding powerful new features for advanced users.