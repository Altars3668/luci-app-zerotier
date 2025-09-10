# LuCI ZeroTier Moon Manager

This LuCI application provides a web interface for managing ZeroTier Moon nodes.

## Features

- **Node Information**: View current ZeroTier node status and information
- **Create Moon Node**: Set up this device as a ZeroTier Moon node for improved connectivity
- **Join Moon Network**: Connect to existing Moon nodes by ID
- **Manage Connected Moons**: View and leave connected Moon networks

## Moon Node Setup

### Prerequisites

1. ZeroTier must be installed and running
2. The device should have a static public IP address
3. Port 9993 (or custom port) should be accessible from the internet

### Creating a Moon Node

1. Go to **Network** → **VPN** → **ZeroTier** → **Moon Manager**
2. In the "Create Moon Node" section:
   - Enter your public IP address
   - Specify the public port (default: 9993)
   - Click "Create Moon"
3. The system will generate the moon configuration automatically
4. ZeroTier will restart to apply the new configuration

### Joining a Moon Network

1. Get the Moon ID from the moon node administrator
2. In the "Join Moon Network" section:
   - Enter the Moon ID
   - Click "Join Moon"
3. Your node will connect to the moon for improved connectivity

### Configuration Options

In the main configuration page, you can also set:

- **Auto-create moon**: Automatically create a moon node on startup
- **Moon public port**: Default port for moon creation
- **Moon public address**: Default public IP for moon creation

## Technical Details

### Moon File Locations

- Moon configurations: `/var/lib/zerotier-one/moons.d/`
- Node identity: `/var/lib/zerotier-one/identity.public`
- Generated moon files: `/var/lib/zerotier-one/[NODEID].moon`

### Command Line Interface

The backend uses the `/usr/bin/zerotier-moon` script which provides:

```bash
zerotier-moon create <public_ip> [public_port]
zerotier-moon join <moon_id>
zerotier-moon leave <moon_id>
zerotier-moon list
zerotier-moon info
```

## Troubleshooting

### Common Issues

1. **"ZeroTier not running"**: Ensure ZeroTier service is started
2. **"Failed to create moon"**: Check that zerotier-idtool is available
3. **"Public IP required"**: Enter a valid public IP address accessible from internet
4. **"Permission denied"**: Ensure the zerotier-moon script has execute permissions

### Checking Moon Status

Use the interface info page or command line to verify moon connectivity:

```bash
zerotier-cli listmoons
zerotier-cli info
```

## Security Considerations

- Moon nodes should be placed on trusted networks
- Firewall rules should allow ZeroTier traffic on the specified port
- Regular monitoring of connected nodes is recommended

## Support

For more information about ZeroTier Moons, see:
- [ZeroTier Manual - Moons](https://docs.zerotier.com/moons/)
- [ZeroTier GitHub Repository](https://github.com/zerotier/ZeroTierOne)