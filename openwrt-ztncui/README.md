# OpenWrt ZTNCUI Package

## Overview
This is a lightweight version of ZTNCUI specifically designed for OpenWrt systems. It provides a web-based interface for managing ZeroTier networks locally as a network controller.

## Package Structure
```
luci-app-zerotier-controller/
├── Makefile                    # OpenWrt package build configuration
├── files/
│   ├── etc/
│   │   ├── config/
│   │   │   └── ztncui          # UCI configuration file
│   │   └── init.d/
│   │       └── ztncui          # Init script
│   ├── usr/
│   │   ├── bin/
│   │   │   └── ztncui-server   # Main server executable
│   │   └── share/
│   │       └── ztncui/
│   │           ├── www/        # Web interface files
│   │           └── lib/        # JavaScript libraries
│   └── www/
│       └── ztncui/             # Static web files
└── src/                        # Source code for compilation
    ├── ztncui-server.c         # Main C server
    ├── zt-api.c               # ZeroTier API client
    ├── web-server.c           # HTTP server
    └── config.h               # Configuration header
```

## Features
- Lightweight C implementation (suitable for resource-constrained routers)
- UCI configuration integration
- Built-in web server (no Node.js dependency)
- ZeroTier controller API client
- Network and member management
- OpenWrt package system integration

## Dependencies
- zerotier (OpenWrt package)
- libjson-c
- libmicrohttpd (or built-in HTTP server)
- libuci

## Installation Size
- Package size: ~100KB (compared to 100MB+ for full ztncui)
- Runtime memory: ~2MB (compared to 50MB+ for Node.js version)
- Storage requirement: ~500KB