# ZTNCUI Network Controller Setup Guide

This guide explains how to set up ZTNCUI (ZeroTier Network Controller UI) with the LuCI ZeroTier application.

## What is ZTNCUI?

ZTNCUI is a web-based user interface for ZeroTier network controllers. It allows you to:

- Create and manage your own ZeroTier networks
- Control member access and authorization
- Set up routing rules and network policies
- Monitor network activity and member status
- Run a private ZeroTier controller instead of relying on ZeroTier Central

## Prerequisites

1. **ZeroTier installed and running**
2. **Sufficient storage space** (at least 50MB for ZTNCUI)
3. **Network access** to download packages
4. **Router with adequate RAM** (minimum 128MB recommended)

## Installation

**Important**: ZTNCUI is not available in standard OpenWrt package repositories. You need to install it manually using one of the following methods.

### Method 1: Docker Installation (Recommended)

Docker provides the easiest and most reliable way to run ZTNCUI on OpenWrt.

#### Prerequisites
- OpenWrt device with sufficient storage (500MB+ recommended)
- Internet connection for downloading Docker images

#### Steps
1. **Install Docker on OpenWrt:**
   ```bash
   opkg update
   opkg install dockerd docker docker-compose
   ```

2. **Start Docker service:**
   ```bash
   /etc/init.d/dockerd start
   /etc/init.d/dockerd enable
   ```

3. **Run ZTNCUI container:**
   ```bash
   docker run -d --name ztncui \
     --restart=unless-stopped \
     -p 3000:3000 \
     -v /var/lib/zerotier-one:/var/lib/zerotier-one \
     -v ztncui-data:/opt/key-networks/ztncui/etc \
     keynetworks/ztncui
   ```

4. **Verify installation:**
   ```bash
   docker ps | grep ztncui
   ```

### Method 2: Node.js Installation

If you prefer running ZTNCUI natively, you can install it via Node.js.

#### Prerequisites
- At least 200MB free storage space
- Stable internet connection

#### Steps
1. **Install Node.js and npm:**
   ```bash
   opkg update
   opkg install node npm
   ```

2. **Install ZTNCUI globally:**
   ```bash
   npm install -g ztncui
   ```

3. **Create systemd/init service (optional):**
   ```bash
   # Create init script
   cat > /etc/init.d/ztncui << 'EOF'
   #!/bin/sh /etc/rc.common
   START=99
   STOP=99
   
   start() {
       ztncui &
   }
   
   stop() {
       killall ztncui
   }
   EOF
   
   chmod +x /etc/init.d/ztncui
   /etc/init.d/ztncui enable
   ```

### Method 3: Manual Binary Installation

Download and install pre-compiled binaries if available.

#### Steps
1. **Check available releases:**
   Visit: https://github.com/key-networks/ztncui/releases

2. **Download appropriate binary:**
   ```bash
   # Replace [version] and [architecture] with actual values
   wget https://github.com/key-networks/ztncui/releases/download/v[version]/ztncui-[architecture]
   ```

3. **Install binary:**
   ```bash
   chmod +x ztncui-[architecture]
   mv ztncui-[architecture] /usr/bin/ztncui
   ```

4. **Create configuration and service files manually**

### Method 4: External ZTNCUI Server

Run ZTNCUI on a separate device and configure it to manage the OpenWrt ZeroTier controller.

#### Setup
1. **Install ZTNCUI on external device** (PC, Raspberry Pi, etc.)
2. **Configure ZTNCUI to connect to OpenWrt ZeroTier daemon**
3. **Ensure network connectivity between devices**
4. **Configure firewall rules as needed**

## Configuration

### Using LuCI Interface

1. Go to **Network** → **VPN** → **ZeroTier** → **Network Controller**
2. Click "Enable Controller Mode" to prepare ZeroTier for controller functionality
3. Start the ZTNCUI service
4. Access the web interface at `http://[router-ip]:3000`

### Manual Configuration

1. Initialize ZTNCUI configuration:
   ```bash
   /usr/bin/ztncui-manager setup
   ```

2. Start the service:
   ```bash
   /etc/init.d/ztncui start
   /etc/init.d/ztncui enable
   ```

3. Enable ZeroTier controller mode:
   ```bash
   zerotier-cli set allowTcpFallbackRelay=1
   zerotier-cli set allowDefaultCentrality=1
   ```

## First-Time Setup

### 1. Access Web Interface

Open your browser and navigate to:
- Local: `http://localhost:3000`
- Network: `http://[router-ip]:3000`

### 2. Login

Use the default credentials:
- **Username**: `admin`
- **Password**: `password`

**Important**: Change the default password immediately after first login!

### 3. Create Your First Network

1. Click "Add Network" or "Networks" → "Add"
2. Enter a network name and description
3. Configure network settings:
   - IP assignment mode (auto or manual)
   - IP ranges and routes
   - Access control (open or private)
4. Save the network configuration

### 4. Add Members

1. Install ZeroTier on client devices
2. Join the network using: `zerotier-cli join [NETWORK_ID]`
3. In ZTNCUI, go to "Networks" → [your network] → "Members"
4. Authorize new members by checking the "Auth" box
5. Optionally assign static IPs or configure member-specific settings

## Network Configuration Options

### Basic Settings

- **Network Name**: Descriptive name for your network
- **Network ID**: Unique 16-character identifier
- **Description**: Optional description

### IP Assignment

- **Auto**: Automatic IP assignment from defined ranges
- **Manual**: Manual IP assignment only
- **Both**: Allow both automatic and manual assignment

### Access Control

- **Open**: Anyone can join (not recommended)
- **Private**: Require authorization for new members

### Advanced Settings

- **Multicast**: Enable/disable multicast traffic
- **Broadcast**: Enable/disable broadcast traffic
- **IPv6**: Enable IPv6 support
- **Routes**: Define custom routes

## Security Considerations

### 1. Change Default Credentials

Immediately change the default admin password:
1. Login to ZTNCUI
2. Go to "Account" or "Settings"
3. Change password to a strong, unique password

### 2. Network Access Control

- Use private networks instead of open networks
- Regularly review and audit network members
- Remove unused or suspicious members

### 3. Firewall Configuration

Ensure your firewall allows:
- ZeroTier traffic on port 9993
- ZTNCUI web interface on port 3000 (or your configured port)

### 4. HTTPS Configuration (Optional)

For production use, consider enabling HTTPS:
1. Generate SSL certificates
2. Update ZTNCUI configuration
3. Enable HTTPS in `/etc/ztncui/etc/ztncui.conf`

## Troubleshooting

### Common Issues

#### ZTNCUI Won't Start

1. Check if ZeroTier is running:
   ```bash
   zerotier-cli info
   ```

2. Check ZTNCUI logs:
   ```bash
   tail -f /etc/ztncui/log/ztncui.log
   ```

3. Verify configuration:
   ```bash
   /usr/bin/ztncui-manager show-config
   ```

#### Can't Access Web Interface

1. Check if service is running:
   ```bash
   /usr/bin/ztncui-manager status
   ```

2. Verify port configuration:
   ```bash
   netstat -tlnp | grep 3000
   ```

3. Check firewall rules:
   ```bash
   iptables -L | grep 3000
   ```

#### Members Can't Connect

1. Verify network is authorized in ZTNCUI
2. Check member authorization status
3. Ensure ZeroTier controller mode is enabled:
   ```bash
   zerotier-cli get allowTcpFallbackRelay
   zerotier-cli get allowDefaultCentrality
   ```

### Reset Configuration

If you need to reset ZTNCUI:

1. Stop the service:
   ```bash
   /etc/init.d/ztncui stop
   ```

2. Reset password:
   ```bash
   /usr/bin/ztncui-manager reset-password
   ```

3. Restart service:
   ```bash
   /etc/init.d/ztncui start
   ```

## Performance Optimization

### Resource Usage

- ZTNCUI typically uses 20-50MB RAM
- Database grows with network size and activity
- Monitor disk space in `/etc/ztncui/`

### Network Performance

- Controller performance depends on member count
- Consider hardware limitations for large networks (>100 members)
- Monitor network latency and connection quality

## Backup and Recovery

### Backup Configuration

```bash
# Backup ZTNCUI configuration
tar -czf ztncui-backup.tar.gz /etc/ztncui/

# Backup ZeroTier identity
tar -czf zerotier-backup.tar.gz /var/lib/zerotier-one/
```

### Restore Configuration

```bash
# Stop services
/etc/init.d/ztncui stop
/etc/init.d/zerotier stop

# Restore backups
tar -xzf ztncui-backup.tar.gz -C /
tar -xzf zerotier-backup.tar.gz -C /

# Start services
/etc/init.d/zerotier start
/etc/init.d/ztncui start
```

## Additional Resources

- [ZTNCUI GitHub Repository](https://github.com/key-networks/ztncui)
- [ZeroTier Documentation](https://docs.zerotier.com/)
- [ZeroTier Manual - Controllers](https://docs.zerotier.com/controller/)
- [OpenWrt ZeroTier Package](https://openwrt.org/packages/pkgdata/zerotier)

## Support

For issues specific to this LuCI integration, please check:
1. LuCI log files in `/tmp/luci-*`
2. ZeroTier status via `zerotier-cli info`
3. ZTNCUI logs in `/etc/ztncui/log/`

For ZTNCUI-specific issues, refer to the [official documentation](https://github.com/key-networks/ztncui/wiki) or submit issues to the ZTNCUI repository.