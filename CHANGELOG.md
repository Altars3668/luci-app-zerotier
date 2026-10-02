# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [99.4.0] - 2026-10-02

### Added
- Settings: multithreading of zerotier-one - on or off, the number of
  threads (the page shows how many CPU cores the router has: more than 1
  and fewer than that) and pinning threads to cores. It is kept in uci
  (`multicore`, `concurrency`, `cpu_pinning` in the `global` section) and
  takes effect with a zerotier package that merges these into local.conf
  (zerotier-openwrt 99.1.16.2-r2 and later). Encrypting what the router
  sends then runs on several threads, and so does handing received frames
  to the interface; decrypting what arrives stays on one.

## [99.3.1] - 2026-10-02

### Fixed
- A moon that follows its address (dynamic mode with DDNS, or PPPoE) was lost
  to the routers orbiting it as soon as the address changed. zerotier-one
  reaches a moon only at the stableEndpoints of the definition it holds,
  refuses every other address of the moon's node, and takes a newer
  definition only from the moon itself at those same endpoints - so the
  orbiting router stayed relayed through the public roots for good, with
  high latency and loss. `zerotier-moon refresh`, run every 5 minutes from
  cron, now fetches the current definition of each orbited moon that has no
  direct path, by orbiting it again through its seed. If the moon does not
  answer, the old definition is put back; attempts that bring no direct
  path back off from 15 minutes to 6 hours.

### Added
- Moons page: whether each orbited moon is reached directly or relayed, and
  a button to fetch its current definition again.

## [99.3.0] - 2026-09-24

### Changed
- Every page follows the OpenWrt design language: the status tables, labels,
  sections, alerts and buttons LuCI's own pages use, no custom styling. Only
  a rule hiding the Argon theme's duplicate section name is left.

### Added
- Groups: every role is also a group. With "Members reach each other" its
  members reach one another directly under member isolation, and
  `group:ROLE` grants reach every member holding the role.

## [99.2.0] - 2026-09-24

A rewrite. The version jumps to 99.x so that the upstream luci-app-zerotier of
the feeds (26.x) does not replace this package on an upgrade.

### Added
- Permissions page: members and roles with grants, the MAC the firewall
  recognizes each member by, online state and packet counters; per network
  whether the rules are loaded, refused packets, member isolation state and
  the problems zerotier-fw4 reports; authorized members without permissions,
  with a prefilled entry one click away.
- Member isolation (controller flow rules generated from the grants) in the
  network settings.
- Overview page: service control, networks with traffic and access policy,
  peers with paths, log; merged the old interface page.
- Stable host names (zerotier-phone-dns) on the LAN Gateway page.
- Network ID QR code, subnet quick setup, IPv6 modes and DNS on the
  Controller page; moon endpoint check against the current WAN addresses.
- Simplified Chinese translation of every page.

### Changed
- The backend is a ucode rpcd plugin (luci.zerotier). The browser no longer
  reads the API token or runs commands; arguments are validated, the token
  never appears on a command line, and the ACL only grants what the pages use.
- Saving permissions or firewall options no longer restarts zerotier-one.
- The router cannot deauthorize itself on its own network.

### Fixed
- zerotier-moon never updated a moon whose endpoint list spanned several
  lines in moon.json, and compared only the IPv4 address: moons kept
  announcing stale addresses. moon.json (it holds the moon's signing key) is
  now kept at mode 600; domains are resolved before they are announced.
- Executables were packaged without the executable bit.

### Removed
- The ztncui integration and the external controller page (which stored the
  API token in /etc/zerotier-controller.conf), the legacy Lua pages, and the
  hotplug script that now ships with the zerotier package.

## [2.1.0] - 2024-09-11 (Enhanced Edition)

### Added ✨
- **ZTNCUI Network Controller Integration**
  - Full ZTNCUI web interface support
  - Multiple installation methods (Docker, System Service, Binary)
  - Automatic service detection and health monitoring
  - One-click Docker installation feature
  - Configuration management interface
  - Real-time status monitoring

- **Enhanced Moon Node Management**
  - Improved Moon creation with input validation
  - Better error handling and user feedback
  - Loading animations and progress indicators
  - Moon ID parsing and display
  - Connection status monitoring

- **Advanced Configuration Options**
  - Auto-create Moon functionality
  - Network controller settings
  - Enhanced firewall integration
  - Improved path management
  - Copy config to memory option

- **Developer Tools and Documentation**
  - Comprehensive architecture documentation
  - Developer guide with coding standards
  - User manual with troubleshooting guide
  - Project summary and changelog
  - Code quality improvements

### Improved 🚀
- **Code Quality**
  - Structured constants and configuration management
  - Enhanced error handling with Promise chains
  - Asynchronous operation optimization
  - Debugging support with structured logging
  - Consistent naming conventions and code style

- **User Experience**
  - Real-time service status monitoring with timestamps
  - Rich status indicators with color coding
  - Intelligent button state management
  - Loading animations for long operations
  - User-friendly error messages and notifications

- **Performance**
  - Parallel execution of status checks
  - Intelligent caching and state management
  - Reduced redundant system calls
  - Optimized DOM operations and UI updates
  - Smart polling with configurable intervals

- **Security**
  - Input validation and sanitization
  - XSS protection measures
  - Secure command execution
  - User confirmation dialogs for critical operations
  - Permission checks and validation

### Fixed 🐛
- **Script Issues**
  - Fixed syntax errors in ztncui-manager script
  - Corrected shell script logic and error handling
  - Improved command execution and validation
  - Fixed Docker container management

- **UI/UX Issues**
  - Resolved status polling edge cases
  - Fixed button state inconsistencies
  - Improved error message display
  - Better responsive design handling

- **Service Management**
  - Enhanced service detection reliability
  - Improved startup and shutdown procedures
  - Better health check implementation
  - Fixed configuration file handling

### Changed 🔄
- **Configuration Structure**
  - Reorganized global configuration options
  - Enhanced network configuration with advanced options
  - Improved Moon and Controller settings layout
  - Better organization of firewall rules

- **Error Handling**
  - Centralized error management system
  - Consistent error message formatting
  - Improved error recovery mechanisms
  - Better logging and debugging information

- **Documentation**
  - Complete rewrite of user documentation
  - Added comprehensive developer guide
  - Enhanced README with better examples
  - Improved code comments and documentation

### Internationalization 🌍
- **Enhanced Chinese Support**
  - Updated Simplified Chinese translations
  - Added new translation entries for enhanced features
  - Improved error message localization
  - Better context-aware translations

- **Translation Infrastructure**
  - Structured translation management
  - Consistent translation keys
  - Support for complex formatted messages
  - Translation validation and testing

## [1.x.x] - Previous Versions

### Original Features
- Basic ZeroTier service management
- Network configuration and monitoring
- Simple Moon node support
- Interface information display
- Firewall integration
- Multi-language support (English, Chinese)

---

## Migration Guide

### From v1.x to v2.1.0

#### Configuration Changes
- No breaking changes to existing UCI configuration
- New optional configuration parameters available
- Enhanced Moon and Controller settings

#### UI Changes
- Improved layout and navigation
- Enhanced status indicators
- New controller management interface
- Better error handling and feedback

#### New Dependencies
- Optional Docker support for ZTNCUI
- Enhanced shell script requirements
- Additional translation files

#### Recommended Actions
1. Backup existing configuration before upgrade
2. Review new configuration options
3. Test Moon and Controller functionality
4. Update any custom scripts or integrations

## Development Changelog

### Code Quality Improvements
- **JavaScript Enhancement**
  - ES5+ compatibility with modern patterns
  - Promise-based error handling
  - Modular function organization
  - Consistent code formatting

- **Shell Script Enhancement**
  - POSIX compliance improvements
  - Better error handling and validation
  - Structured function organization
  - Improved parameter processing

- **CSS and UI**
  - Responsive design improvements
  - Better accessibility support
  - Consistent styling patterns
  - Mobile-friendly interfaces

### Testing and Validation
- **Functional Testing**
  - Core feature validation
  - Cross-platform compatibility testing
  - Error scenario testing
  - Performance benchmarking

- **Code Quality**
  - Static analysis integration
  - Security vulnerability scanning
  - Performance profiling
  - Documentation validation

### Infrastructure
- **Build System**
  - Enhanced Makefile configuration
  - Better dependency management
  - Automated testing integration
  - Documentation generation

- **Documentation**
  - Comprehensive API documentation
  - User guide improvements
  - Developer onboarding guide
  - Troubleshooting resources

## Future Roadmap

### Planned Features (v2.2.0)
- [ ] Performance monitoring dashboard
- [ ] Automated testing pipeline
- [ ] Mobile app integration
- [ ] Extended language support
- [ ] Plugin system architecture

### Long-term Goals (v3.0.0)
- [ ] Microservices architecture
- [ ] Cloud-native deployment options
- [ ] AI-powered network optimization
- [ ] Enterprise management features
- [ ] Integration with other VPN solutions

## Contributors

### Core Team
- **ImmortalWrt Community** - Original development and maintenance
- **AltarsCN** - Enhanced features and optimizations

### Community Contributors
- Thanks to all users who provided feedback and bug reports
- Special thanks to translators and documentation contributors
- Appreciation for beta testers and early adopters

## Support and Resources

### Getting Help
- **Documentation**: Check the comprehensive user manual
- **Issues**: Report bugs on GitHub Issues
- **Community**: Join OpenWrt and ImmortalWrt forums
- **Development**: See developer guide for contribution

### External Resources
- [ZeroTier Official Documentation](https://docs.zerotier.com/)
- [OpenWrt Documentation](https://openwrt.org/docs)
- [LuCI Development Guide](https://openwrt.org/docs/guide-developer/luci)
- [ZTNCUI Project](https://github.com/key-networks/ztncui)

---

**Note**: This changelog follows semantic versioning. Breaking changes will be clearly marked and migration guides provided for major version updates.