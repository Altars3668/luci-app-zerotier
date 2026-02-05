# LuCI ZeroTier Application - Enhanced Edition

Enhanced LuCI application for ZeroTier with comprehensive Moon node management and ZTNCUI network controller integration.

> [📖 中文文档 / Chinese Documentation](README_CN.md)

## 🌟 Features

### Core ZeroTier Management
- ✅ **Advanced Configuration**: Complete ZeroTier service configuration with real-time monitoring
- ✅ **Network Management**: Join/leave networks with advanced routing and firewall integration
- ✅ **Interface Monitoring**: Real-time network interface status and traffic statistics
- ✅ **Multi-language Support**: English, 简体中文, 繁體中文 with comprehensive translations

### 🌙 Moon Node Management
- 🌙 **Create Moon Nodes**: Transform your router into a ZeroTier Moon for enhanced connectivity
- 🌙 **Join Moon Networks**: Connect to existing Moon nodes with automatic discovery
- 🌙 **Connection Management**: Monitor and manage Moon connections with health status
- 🌙 **Auto-creation**: Intelligent Moon node creation on startup with validation
- 🌙 **Input Validation**: Comprehensive IP address and port validation

### 🎛️ Network Controller (ZTNCUI Integration)
- 🎛️ **Local Controller**: Run your own ZeroTier network controller with full management
- 🎛️ **Web Interface**: Modern browser-based network management via ZTNCUI
- 🎛️ **Multi-Installation**: Docker, System Service, Binary, and Node.js installation methods
- 🎛️ **Health Monitoring**: Real-time service health checks and automatic recovery
- 🎛️ **One-click Setup**: Automated Docker installation and configuration
- 🎛️ **Service Management**: Start, stop, restart with intelligent status detection

### 🖥️ Lightweight Network Controller (NEW!)
- 🖥️ **Built-in Controller UI**: Manage ZeroTier networks directly from LuCI without external tools
- 🖥️ **Network Management**: Create, edit, and delete networks with intuitive interface
- 🖥️ **Member Authorization**: Authorize/deauthorize members and manage IP assignments
- 🖥️ **Route Configuration**: Add and remove network routes with visual editor
- 🖥️ **IP Pool Management**: Configure IP assignment pools for auto-assignment
- 🖥️ **Quick Setup Wizard**: One-click CIDR configuration for routes and IP pools
- 🖥️ **No External Dependencies**: Works with just curl, no Node.js or Docker required

## 🚀 Quick Start

### Prerequisites
- **OpenWrt/ImmortalWrt**: 19.07+ or compatible
- **Storage Space**: 10MB minimum (100MB+ for full ZTNCUI features)
- **Internet Connection**: Required for network functionality
- **Optional Docker**: For easy ZTNCUI installation

### 1. Installation

#### Package Manager Installation
```bash
# Update package lists
opkg update

# Install ZeroTier core
opkg install zerotier zerotier-idtool

# Install LuCI application
opkg install luci-app-zerotier

# Restart LuCI
/etc/init.d/uhttpd restart
```

#### Manual Installation
1. Download the appropriate IPK package for your architecture
2. Install via LuCI: **System** → **Software** → **Upload Package**
3. Or command line: `opkg install luci-app-zerotier_*.ipk`

### 2. Basic Configuration
1. Navigate to **Network** → **VPN** → **ZeroTier** → **Configuration**
2. Enable ZeroTier service
3. Add your network ID (16 characters)
4. Configure network settings as needed
5. Click **Save & Apply**

### 3. Authorize Device
1. Visit [ZeroTier Central](https://my.zerotier.com/network)
2. Find your device in the network members list
3. Check **Authorized** to allow connection
4. Optionally assign a static IP address

## 📋 Advanced Features

### Network Controller Setup

#### Quick ZTNCUI Installation (Docker)
1. Go to **ZeroTier** → **Network Controller**
2. If Docker is available, click **Install via Docker**
3. Wait for installation to complete
4. Access web interface at `http://[router-ip]:3000`
5. Login with default credentials:
   - Username: `admin`
   - Password: `password`
6. **Important**: Change password after first login

#### Alternative Installation Methods

**Node.js Installation:**
```bash
opkg install node npm
npm install -g ztncui
ztncui-manager start
```

**Manual Binary:**
Download from [ZTNCUI Releases](https://github.com/key-networks/ztncui/releases)

### Moon Node Configuration

#### Creating a Moon Node
1. Navigate to **ZeroTier** → **Moon Manager**
2. Enter your **public IP address**
3. Set **public port** (default: 9993)
4. Click **Create Moon**
5. Share the generated Moon ID with other users

#### Joining a Moon Network
1. Obtain a Moon ID (10-character hex string)
2. In Moon Manager, enter the Moon ID
3. Click **Join Moon**
4. Verify connection in the connected moons list

### Advanced Network Configuration

#### Lightweight Network Controller
1. Navigate to **ZeroTier** → **Networks**
2. Click **Create Network** to create a new network
3. In the network row, click the ⚙️ icon for **Quick Setup**:
   - Enter a CIDR (e.g., `10.147.20.0/24`)
   - Automatically configures routes and IP assignment pools
4. Click member icons to manage members:
   - ✓ Authorize members to allow network access
   - Assign static IPs or leave for auto-assignment
5. Use **Routes** and **IP Pools** buttons for advanced configuration

> **Note:** The lightweight controller requires the local ZeroTier service running with controller enabled. No external ZTNCUI or Docker required.

#### Firewall Integration
- **Input Rules**: Control access to ZeroTier service
- **Forward Rules**: Allow traffic between networks
- **Masquerading**: Enable NAT for internet access
- **Interface Selection**: Choose specific interfaces for rules

#### Routing Options
- **Managed Routes**: Let ZeroTier handle routing automatically
- **Global Routes**: Allow routes to public networks (use cautiously)
- **Default Route**: Use ZeroTier as default gateway
- **DNS Management**: Allow ZeroTier to configure DNS settings

## 🛠️ Configuration Options

### Global Settings
```yaml
Listen Port: 9993              # ZeroTier daemon port
Client Secret: [optional]      # Authentication secret
Config Path: /etc/zerotier     # Persistent configuration
Copy Config: true              # Copy to memory (flash protection)
Auto Moon: false               # Auto-create Moon on startup
Enable Controller: false      # Enable ZTNCUI functionality
```

### Network Settings (per network)
```yaml
Network ID: [16-char hex]      # ZeroTier network identifier
Allow Managed IP: true         # ZeroTier IP management
Allow Global IP: false         # Public IP routes
Allow Default Route: false     # Default gateway
Allow DNS: true                # DNS configuration
Firewall Rules:                # Custom firewall settings
  - Input: allow/deny
  - Forward: allow/deny
  - Masquerade: enable/disable
```

## 📚 Documentation

### User Documentation
- 📖 **[User Manual](docs/USER_MANUAL.md)** - Comprehensive usage guide
- 🔧 **[Troubleshooting Guide](docs/USER_MANUAL.md#故障排除)** - Common issues and solutions
- ⚙️ **[Configuration Examples](docs/USER_MANUAL.md#高级配置)** - Advanced setup scenarios

### Developer Documentation
- 🏗️ **[Architecture Guide](ARCHITECTURE.md)** - System design and components
- 👨‍💻 **[Developer Guide](docs/DEVELOPER_GUIDE.md)** - Development standards and practices
- 📊 **[Project Summary](PROJECT_SUMMARY.md)** - Optimization overview and improvements

### Additional Resources
- 📝 **[Changelog](CHANGELOG.md)** - Version history and updates
- 🌙 **[Moon Setup Guide](README-moon.md)** - Detailed Moon configuration
- 🎛️ **[ZTNCUI Integration](README-ztncui.md)** - Controller setup guide

## 🔧 Command Line Tools

### ZeroTier Management
```bash
# Service control
/etc/init.d/zerotier start|stop|restart|status

# Network management
zerotier-cli join <network-id>
zerotier-cli leave <network-id>
zerotier-cli listnetworks

# Node information
zerotier-cli info
zerotier-cli peers
```

### Moon Management
```bash
# Create moon
zerotier-moon create <public-ip> [port]

# Join moon
zerotier-moon join <moon-id>

# List moons
zerotier-moon list

# Leave moon
zerotier-moon leave <moon-id>
```

### ZTNCUI Management
```bash
# Service control
ztncui-manager start|stop|restart|status

# Installation help
ztncui-manager install

# Configuration
ztncui-manager setup
ztncui-manager show-config

# Health check
ztncui-manager health-check [port]
```

## 🐛 Troubleshooting

### Common Issues

**Service Won't Start**
```bash
# Check service status
/etc/init.d/zerotier status

# View logs
logread | grep zerotier

# Restart service
/etc/init.d/zerotier restart
```

**Network Connection Issues**
1. Verify device is authorized in ZeroTier Central
2. Check firewall rules and routing
3. Confirm network ID is correct
4. Test with `ping` to other network members

**ZTNCUI Access Problems**
1. Verify service is running: `ztncui-manager status`
2. Check port accessibility and firewall
3. Try health check: `ztncui-manager health-check`
4. Review Docker logs: `docker logs ztncui`

**Moon Creation Failures**
1. Ensure public IP is reachable from internet
2. Verify firewall allows ZeroTier port
3. Check network connectivity
4. Confirm zerotier-idtool is available

### Getting Help
- 📋 **Issues**: [GitHub Issues](https://github.com/AltarsCN/luci-app-zerotier/issues)
- 💬 **Forums**: OpenWrt and ImmortalWrt community forums
- 📖 **Documentation**: Check the comprehensive user manual
- 🔍 **Search**: Existing issues and community discussions

## 🔐 Security Considerations

### Network Security
- Use **private networks** instead of public ones
- Regularly **audit network members** and remove unused devices
- Configure **appropriate firewall rules** for your use case
- Monitor for **unauthorized access attempts**

### System Security
- Change **default ZTNCUI password** immediately after setup
- Keep **ZeroTier and OpenWrt updated** to latest versions
- Use **strong passwords** for all accounts
- Restrict **ZTNCUI web interface access** if needed
- Review **network access logs** periodically

## ⚡ Performance Tips

### Network Optimization
- Choose **nearby Moon nodes** for better latency
- Configure **appropriate MTU** settings for your network
- Use **private networks** to reduce overhead
- Monitor **bandwidth usage** and optimize as needed

### System Optimization
- Enable **"Copy Config"** to reduce flash wear
- Monitor **memory and CPU usage** regularly
- Configure **appropriate polling intervals**
- Clean up **old log files** periodically

## 🤝 Contributing

We welcome contributions from the community! Here's how you can help:

### Ways to Contribute
- 🐛 **Report Bugs**: Submit detailed bug reports with logs
- 💡 **Suggest Features**: Propose new functionality or improvements
- 📝 **Improve Documentation**: Help make docs clearer and more comprehensive
- 🌍 **Translate**: Add support for more languages
- 💻 **Code Contributions**: Submit pull requests for fixes and features

### Development Setup
1. Fork the repository
2. Create a feature branch
3. Make your changes with proper testing
4. Submit a pull request with detailed description

### Code Standards
- Follow existing code style and conventions
- Add comprehensive comments and documentation
- Include tests for new functionality
- Ensure backward compatibility

## 📄 License

This project is licensed under **GPL-3.0-only** - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

### Core Contributors
- **ImmortalWrt Community** - Original development and ongoing maintenance
- **OpenWrt Project** - Foundation platform and ecosystem
- **ZeroTier Team** - Excellent networking technology and documentation

### Special Thanks
- **ZTNCUI Developers** - Network controller web interface
- **Community Contributors** - Bug reports, feature requests, and feedback
- **Translators** - Multi-language support
- **Beta Testers** - Early adoption and testing

### Related Projects
- [ZeroTier](https://github.com/zerotier/ZeroTierOne) - Core VPN technology
- [ZTNCUI](https://github.com/key-networks/ztncui) - Network controller interface
- [OpenWrt](https://github.com/openwrt/openwrt) - Router operating system
- [ImmortalWrt](https://github.com/immortalwrt/immortalwrt) - Enhanced OpenWrt distribution

---

<div align="center">

**🌐 Building Better Networks with ZeroTier 🌐**

[Documentation](docs/) • [Issues](https://github.com/AltarsCN/luci-app-zerotier/issues) • [Discussions](https://github.com/AltarsCN/luci-app-zerotier/discussions) • [Releases](https://github.com/AltarsCN/luci-app-zerotier/releases)

</div>