/* SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright (C) 2024 AltarsCN
 * OpenWrt ZTNCUI Controller Management
 * 
 * Features:
 * - ztncui-openwrt package management
 * - UCI-based configuration
 * - Native C implementation support
 * - Lightweight controller deployment
 * - Resource optimization for embedded devices
 */

'use strict';
'require fs';
'require ui';
'require view';
'require form';
'require rpc';
'require uci';

// OpenWrt ZTNCUI Configuration
const OPENWRT_ZTNCUI_CONFIG = {
	DEFAULT_PORT: 3000,
	DEFAULT_ZT_PORT: 9993,
	HEALTH_CHECK_TIMEOUT: 5000,
	SERVICE_START_TIMEOUT: 15000,
	UCI_CONFIG: 'ztncui',
	DEFAULT_ZT_HOME: '/var/lib/zerotier-one',
	DEFAULT_LOG_LEVEL: 'info',
	MAX_NETWORKS: 50,
	SESSION_TIMEOUT: 3600,
	PACKAGE_SIZE: '~100KB',
	MEMORY_USAGE: '~2MB'
};

const SERVICE_STATES = {
	RUNNING: 'RUNNING',
	STOPPED: 'STOPPED',
	NOT_INSTALLED: 'NOT_INSTALLED',
	READY_TO_INSTALL: 'READY_TO_INSTALL'
};

// RPC declarations
const callServiceList = rpc.declare({
	object: 'service',
	method: 'list',
	params: ['name'],
	expect: { '': {} }
});

const callExec = rpc.declare({
	object: 'file',
	method: 'exec',
	params: ['command', 'args'],
	expect: { code: 0 }
});

const callRead = rpc.declare({
	object: 'file',
	method: 'read',
	params: ['path'],
	expect: { data: '' }
});

const callWrite = rpc.declare({
	object: 'file',
	method: 'write',
	params: ['path', 'data'],
	expect: { code: 0 }
});

return view.extend({
	load: function() {
		return Promise.all([
			this.getOpenWrtZTNCUIStatus(),
			this.getZeroTierStatus(),
			this.getOpenWrtZTNCUIConfig(),
			this.checkPackageAvailability(),
			uci.load('ztncui').catch(function() { return null; })
		]).then(function(results) {
			return {
				ztncuiStatus: results[0],
				zerotierStatus: results[1],
				ztncuiConfig: results[2],
				packageInfo: results[3],
				uciConfig: results[4]
			};
		});
	},

	// Get OpenWrt ZTNCUI service status
	getOpenWrtZTNCUIStatus: function() {
		const self = this;
		return Promise.all([
			// Check system service
			L.resolveDefault(callServiceList('ztncui'), {}).catch(function(err) {
				console.debug('OpenWrt ZTNCUI service check failed:', err);
				return {};
			}),
			// Check if binary exists
			fs.exec('/usr/bin/which', ['ztncui-server']).catch(function(err) {
				console.debug('ztncui-server binary check failed:', err);
				return { code: 1, stdout: '', stderr: 'Binary not found' };
			}),
			// Check process
			fs.exec('/bin/ps', ['w']).then(function(res) {
				return res.code === 0 && res.stdout.includes('ztncui-server');
			}).catch(function() {
				return false;
			})
		]).then(function(results) {
			var serviceResult = results[0];
			var binaryResult = results[1];
			var processRunning = results[2];
			
			var status = {
				isRunning: false,
				isInstalled: false,
				method: 'not_installed',
				details: '',
				healthy: false
			};
			
			// Check if binary exists
			if (binaryResult.code === 0) {
				status.isInstalled = true;
				status.method = 'openwrt_native';
				status.details = 'Native OpenWrt package';
			}
			
			// Check if service is running
			if (serviceResult && serviceResult.ztncui && serviceResult.ztncui.running) {
				status.isRunning = true;
				status.healthy = true;
			} else if (processRunning) {
				status.isRunning = true;
				status.healthy = true;
			}
			
			return status;
		});
	},

	// Get ZeroTier daemon status
	getZeroTierStatus: function() {
		return fs.exec('/usr/bin/zerotier-cli', ['info']).then(function(res) {
			if (res.code === 0) {
				var lines = res.stdout.trim().split('\n');
				if (lines.length > 0) {
					var parts = lines[0].split(' ');
					return {
						running: true,
						nodeId: parts[2] || 'unknown',
						status: parts[0] || 'unknown',
						version: parts[1] || 'unknown'
					};
				}
			}
			return {
				running: false,
				error: res.stderr || 'ZeroTier not running'
			};
		}).catch(function(err) {
			return {
				running: false,
				error: err.message
			};
		});
	},

	// Get OpenWrt ZTNCUI configuration
	getOpenWrtZTNCUIConfig: function() {
		return uci.load('ztncui').then(function() {
			return {
				enabled: uci.get('ztncui', 'main', 'enabled') === '1',
				port: uci.get('ztncui', 'main', 'port') || OPENWRT_ZTNCUI_CONFIG.DEFAULT_PORT,
				bind_address: uci.get('ztncui', 'main', 'bind_address') || '0.0.0.0',
				zt_home: uci.get('ztncui', 'main', 'zt_home') || OPENWRT_ZTNCUI_CONFIG.DEFAULT_ZT_HOME,
				zt_address: uci.get('ztncui', 'main', 'zt_address') || 'localhost:9993',
				enable_https: uci.get('ztncui', 'main', 'enable_https') === '1',
				https_port: uci.get('ztncui', 'main', 'https_port') || '3443',
				log_level: uci.get('ztncui', 'main', 'log_level') || OPENWRT_ZTNCUI_CONFIG.DEFAULT_LOG_LEVEL,
				max_networks: uci.get('ztncui', 'main', 'max_networks') || OPENWRT_ZTNCUI_CONFIG.MAX_NETWORKS,
				session_timeout: uci.get('ztncui', 'main', 'session_timeout') || OPENWRT_ZTNCUI_CONFIG.SESSION_TIMEOUT
			};
		}).catch(function(err) {
			console.debug('Failed to load ztncui config:', err);
			return {
				error: 'Configuration not found',
				enabled: false
			};
		});
	},

	// Check package availability
	checkPackageAvailability: function() {
		return fs.exec('/bin/opkg', ['list', 'ztncui-openwrt']).then(function(res) {
			return {
				available: res.code === 0 && res.stdout.includes('ztncui-openwrt'),
				info: res.stdout.trim()
			};
		}).catch(function() {
			return {
				available: false,
				info: 'Package not available in repositories'
			};
		});
	},

	// Install OpenWrt ZTNCUI package
	installOpenWrtZTNCUI: function() {
		const self = this;
		ui.showModal(_('Installing OpenWrt ZTNCUI'), [
			E('p', { class: 'spinning' }, _('Installing ztncui-openwrt package, please wait...'))
		]);
		
		return fs.exec('/bin/opkg', ['update']).then(function(updateRes) {
			if (updateRes.code !== 0) {
				throw new Error('Failed to update package lists: ' + updateRes.stderr);
			}
			
			return fs.exec('/bin/opkg', ['install', 'ztncui-openwrt']);
		}).then(function(installRes) {
			ui.hideModal();
			
			if (installRes.code === 0) {
				ui.addNotification(null, E('p', {}, _('OpenWrt ZTNCUI package installed successfully!')), 'info');
				return true;
			} else {
				throw new Error('Installation failed: ' + installRes.stderr);
			}
		}).catch(function(err) {
			ui.hideModal();
			ui.addNotification(null, E('p', {}, _('Installation failed: %s').format(err.message)), 'error');
			return false;
		});
	},

	// Uninstall OpenWrt ZTNCUI package
	uninstallOpenWrtZTNCUI: function() {
		const self = this;
		ui.showModal(_('Uninstalling OpenWrt ZTNCUI'), [
			E('p', { class: 'spinning' }, _('Removing ztncui-openwrt package, please wait...'))
		]);
		
		return fs.exec('/bin/opkg', ['remove', 'ztncui-openwrt']).then(function(res) {
			ui.hideModal();
			
			if (res.code === 0) {
				ui.addNotification(null, E('p', {}, _('OpenWrt ZTNCUI package removed successfully!')), 'info');
				return true;
			} else {
				throw new Error('Removal failed: ' + res.stderr);
			}
		}).catch(function(err) {
			ui.hideModal();
			ui.addNotification(null, E('p', {}, _('Removal failed: %s').format(err.message)), 'error');
			return false;
		});
	},

	// Start OpenWrt ZTNCUI service
	startOpenWrtZTNCUI: function() {
		return fs.exec('/etc/init.d/ztncui', ['start']).then(function(res) {
			if (res.code === 0) {
				ui.addNotification(null, E('p', {}, _('OpenWrt ZTNCUI service started successfully!')), 'info');
				return true;
			} else {
				throw new Error(res.stderr || 'Failed to start service');
			}
		}).catch(function(err) {
			ui.addNotification(null, E('p', {}, _('Failed to start service: %s').format(err.message)), 'error');
			return false;
		});
	},

	// Stop OpenWrt ZTNCUI service
	stopOpenWrtZTNCUI: function() {
		return fs.exec('/etc/init.d/ztncui', ['stop']).then(function(res) {
			if (res.code === 0) {
				ui.addNotification(null, E('p', {}, _('OpenWrt ZTNCUI service stopped successfully!')), 'info');
				return true;
			} else {
				throw new Error(res.stderr || 'Failed to stop service');
			}
		}).catch(function(err) {
			ui.addNotification(null, E('p', {}, _('Failed to stop service: %s').format(err.message)), 'error');
			return false;
		});
	},

	// Restart OpenWrt ZTNCUI service
	restartOpenWrtZTNCUI: function() {
		return fs.exec('/etc/init.d/ztncui', ['restart']).then(function(res) {
			if (res.code === 0) {
				ui.addNotification(null, E('p', {}, _('OpenWrt ZTNCUI service restarted successfully!')), 'info');
				return true;
			} else {
				throw new Error(res.stderr || 'Failed to restart service');
			}
		}).catch(function(err) {
			ui.addNotification(null, E('p', {}, _('Failed to restart service: %s').format(err.message)), 'error');
			return false;
		});
	},

	// Enable OpenWrt ZTNCUI service
	enableOpenWrtZTNCUI: function() {
		return fs.exec('/etc/init.d/ztncui', ['enable']).then(function(res) {
			if (res.code === 0) {
				ui.addNotification(null, E('p', {}, _('OpenWrt ZTNCUI service enabled for startup!')), 'info');
				return true;
			} else {
				throw new Error(res.stderr || 'Failed to enable service');
			}
		}).catch(function(err) {
			ui.addNotification(null, E('p', {}, _('Failed to enable service: %s').format(err.message)), 'error');
			return false;
		});
	},

	// Perform health check
	performHealthCheck: function() {
		const self = this;
		ui.showModal(_('Health Check'), [
			E('p', { class: 'spinning' }, _('Checking OpenWrt ZTNCUI service health...'))
		]);
		
		return fs.exec('/etc/init.d/ztncui', ['health_check']).then(function(res) {
			ui.hideModal();
			
			if (res.code === 0) {
				ui.addNotification(null, E('p', {}, _('Health check passed: %s').format(res.stdout)), 'info');
			} else {
				ui.addNotification(null, E('p', {}, _('Health check failed: %s').format(res.stderr || res.stdout)), 'warning');
			}
		}).catch(function(err) {
			ui.hideModal();
			ui.addNotification(null, E('p', {}, _('Health check error: %s').format(err.message)), 'error');
		});
	},

	render: function(data) {
		var self = this;
		var title = E('h2', { class: 'content' }, _('OpenWrt ZeroTier Controller'));
		var desc = E('div', { class: 'cbi-map-descr' }, 
			_('Lightweight C-based ZeroTier Network Controller for OpenWrt systems. This native implementation uses minimal resources while providing full controller functionality.'));

		var content = [title, desc];

		// Service Status Section
		var statusSection = E('div', { class: 'cbi-section' }, [
			E('h3', {}, _('Service Status'))
		]);

		// Status display
		var ztncuiStatusSpan = E('span', {
			style: data.ztncuiStatus.isRunning ? 
				(data.ztncuiStatus.healthy ? 'color: green; font-weight: bold;' : 'color: orange; font-weight: bold;') : 
				'color: red; font-weight: bold;'
		}, data.ztncuiStatus.isRunning ? 
			(data.ztncuiStatus.healthy ? _('Running (Healthy)') : _('Running (Warning)')) : 
			_('Stopped')
		);

		var installationSpan = E('span', { 
			style: 'margin-left: 10px; font-size: 0.9em; color: #666;' 
		}, '(' + (data.ztncuiStatus.details || _('Not installed')) + ')');

		var statusTable = E('table', { class: 'table' }, [
			E('tr', { class: 'tr' }, [
				E('td', { class: 'td left', width: '25%' }, _('OpenWrt ZTNCUI Status')),
				E('td', { class: 'td left' }, [ztncuiStatusSpan, installationSpan])
			])
		]);

		// Add ZeroTier daemon status
		if (data.zerotierStatus.running) {
			statusTable.appendChild(E('tr', { class: 'tr' }, [
				E('td', { class: 'td left' }, _('ZeroTier Daemon')),
				E('td', { class: 'td left' }, [
					E('span', { style: 'color: green; font-weight: bold;' }, _('Running')),
					E('span', { style: 'margin-left: 10px; color: #666;' }, 
						'Node ID: ' + (data.zerotierStatus.nodeId || 'unknown'))
				])
			]));
		} else {
			statusTable.appendChild(E('tr', { class: 'tr' }, [
				E('td', { class: 'td left' }, _('ZeroTier Daemon')),
				E('td', { class: 'td left' }, [
					E('span', { style: 'color: red; font-weight: bold;' }, _('Not Running')),
					E('span', { style: 'margin-left: 10px; color: #666;' }, 
						data.zerotierStatus.error || 'Please start ZeroTier service first')
				])
			]));
		}

		// Add configuration information
		if (data.ztncuiConfig && !data.ztncuiConfig.error) {
			statusTable.appendChild(E('tr', { class: 'tr' }, [
				E('td', { class: 'td left' }, _('Service Port')),
				E('td', { class: 'td left' }, data.ztncuiConfig.port || OPENWRT_ZTNCUI_CONFIG.DEFAULT_PORT)
			]));
			
			statusTable.appendChild(E('tr', { class: 'tr' }, [
				E('td', { class: 'td left' }, _('Bind Address')),
				E('td', { class: 'td left' }, data.ztncuiConfig.bind_address || '0.0.0.0')
			]));
			
			statusTable.appendChild(E('tr', { class: 'tr' }, [
				E('td', { class: 'td left' }, _('ZeroTier Home')),
				E('td', { class: 'td left' }, data.ztncuiConfig.zt_home || OPENWRT_ZTNCUI_CONFIG.DEFAULT_ZT_HOME)
			]));
		}

		// Add resource usage information
		statusTable.appendChild(E('tr', { class: 'tr' }, [
			E('td', { class: 'td left' }, _('Resource Usage')),
			E('td', { class: 'td left' }, [
				E('span', { style: 'color: #28a745;' }, _('Package: %s, Memory: %s').format(
					OPENWRT_ZTNCUI_CONFIG.PACKAGE_SIZE, 
					OPENWRT_ZTNCUI_CONFIG.MEMORY_USAGE))
			])
		]));

		statusSection.appendChild(statusTable);

		// Package Management Section
		var packageSection = E('div', { class: 'cbi-section' }, [
			E('h3', {}, _('Package Management')),
			E('p', {}, _('Install or manage the ztncui-openwrt package for lightweight controller functionality.'))
		]);

		var packageButtonContainer = E('div', { style: 'margin: 10px 0;' });

		// Installation status and buttons
		if (!data.ztncuiStatus.isInstalled) {
			if (data.packageInfo.available) {
				packageButtonContainer.appendChild(E('div', { 
					style: 'padding: 15px; background: #d1ecf1; border: 1px solid #bee5eb; border-radius: 4px; margin-bottom: 15px;' 
				}, [
					E('div', { style: 'display: flex; align-items: center; margin-bottom: 10px;' }, [
						E('i', { class: 'fa fa-info-circle', style: 'color: #0c5460; margin-right: 8px; font-size: 18px;' }),
						E('strong', { style: 'color: #0c5460;' }, _('Package Available'))
					]),
					E('p', { style: 'margin: 0 0 10px 0; color: #0c5460;' }, _('The ztncui-openwrt package is available for installation.')),
					E('button', {
						class: 'btn cbi-button cbi-button-positive',
						style: 'background: #28a745; color: white;',
						click: function() {
							if (confirm(_('This will install the ztncui-openwrt package. Continue?'))) {
								self.installOpenWrtZTNCUI().then(function(success) {
									if (success) {
										setTimeout(function() { window.location.reload(); }, 2000);
									}
								});
							}
						}
					}, _('Install ztncui-openwrt'))
				]));
			} else {
				packageButtonContainer.appendChild(E('div', { 
					style: 'padding: 15px; background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 4px; margin-bottom: 15px;' 
				}, [
					E('div', { style: 'display: flex; align-items: center; margin-bottom: 10px;' }, [
						E('i', { class: 'fa fa-exclamation-triangle', style: 'color: #856404; margin-right: 8px; font-size: 18px;' }),
						E('strong', { style: 'color: #856404;' }, _('Package Not Available'))
					]),
					E('p', { style: 'margin: 0 0 10px 0; color: #856404;' }, _('The ztncui-openwrt package is not available in the current repositories. You may need to build it manually.')),
					E('div', { style: 'display: flex; gap: 10px; flex-wrap: wrap;' }, [
						E('a', {
							href: '#',
							class: 'btn cbi-button',
							style: 'text-decoration: none; background: #6c757d; color: white;',
							click: function() {
								// Show build instructions
								ui.showModal(_('Build Instructions'), [
									E('div', { style: 'max-height: 400px; overflow-y: auto;' }, [
										E('h4', {}, _('Manual Build and Installation')),
										E('ol', {}, [
											E('li', {}, _('Copy openwrt-ztncui folder to OpenWrt build environment')),
											E('li', {}, _('Run: make menuconfig and select Network -> VPN -> ztncui-openwrt')),
											E('li', {}, _('Run: make package/ztncui-openwrt/compile V=s')),
											E('li', {}, _('Install the generated IPK package'))
										]),
										E('p', { style: 'margin-top: 15px;' }, [
											E('strong', {}, _('For detailed instructions, see: ')),
											E('a', { 
												href: '#', 
												click: function() { 
													// Could link to build documentation
													ui.addNotification(null, E('p', {}, _('See BUILD.md in openwrt-ztncui folder')), 'info');
												}
											}, _('Build Documentation'))
										])
									]),
									E('div', { style: 'text-align: right; margin-top: 20px;' }, [
										E('button', {
											class: 'btn cbi-button',
											click: function() { ui.hideModal(); }
										}, _('Close'))
									])
								]);
								return false;
							}
						}, _('View Build Instructions'))
					])
				]));
			}
		} else {
			// Package is installed
			packageButtonContainer.appendChild(E('div', { 
				style: 'padding: 15px; background: #d4edda; border: 1px solid #c3e6cb; border-radius: 4px; margin-bottom: 15px;' 
			}, [
				E('div', { style: 'display: flex; align-items: center; margin-bottom: 10px;' }, [
					E('i', { class: 'fa fa-check-circle', style: 'color: #155724; margin-right: 8px; font-size: 18px;' }),
					E('strong', { style: 'color: #155724;' }, _('Package Installed'))
				]),
				E('p', { style: 'margin: 0 0 10px 0; color: #155724;' }, _('The ztncui-openwrt package is installed and ready to use.')),
				E('button', {
					class: 'btn cbi-button cbi-button-negative',
					style: 'background: #dc3545; color: white;',
					click: function() {
						if (confirm(_('This will remove the ztncui-openwrt package and all its data. Continue?'))) {
							self.uninstallOpenWrtZTNCUI().then(function(success) {
								if (success) {
									setTimeout(function() { window.location.reload(); }, 2000);
								}
							});
						}
					}
				}, _('Uninstall Package'))
			]));
		}

		packageSection.appendChild(packageButtonContainer);

		// Service Control Section (only show if package is installed)
		var controlSection = null;
		if (data.ztncuiStatus.isInstalled) {
			controlSection = E('div', { class: 'cbi-section' }, [
				E('h3', {}, _('Service Control')),
				E('p', {}, _('Control the OpenWrt ZTNCUI service and configure startup behavior.'))
			]);

			var controlButtonContainer = E('div', { style: 'margin: 10px 0;' });

			if (data.ztncuiStatus.isRunning) {
				controlButtonContainer.appendChild(E('div', { style: 'display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 15px;' }, [
					E('button', {
						class: 'btn cbi-button cbi-button-negative',
						style: 'background: #dc3545; color: white; padding: 8px 16px;',
						click: function() {
							if (confirm(_('Are you sure you want to stop OpenWrt ZTNCUI?'))) {
								self.stopOpenWrtZTNCUI().then(function(success) {
									if (success) {
										setTimeout(function() { window.location.reload(); }, 1000);
									}
								});
							}
						}
					}, _('Stop Service')),

					E('button', {
						class: 'btn cbi-button cbi-button-apply',
						style: 'background: #17a2b8; color: white; padding: 8px 16px;',
						click: function() {
							self.restartOpenWrtZTNCUI().then(function(success) {
								if (success) {
									setTimeout(function() { window.location.reload(); }, 2000);
								}
							});
						}
					}, _('Restart Service')),

					E('button', {
						class: 'btn cbi-button',
						style: 'background: #6c757d; color: white; padding: 8px 16px;',
						click: function() {
							self.performHealthCheck();
						}
					}, _('Health Check'))
				]));

				// Add quick access to web interface
				if (data.ztncuiConfig && data.ztncuiConfig.port) {
					controlButtonContainer.appendChild(E('div', { style: 'margin-bottom: 15px;' }, [
						E('a', {
							href: 'http://' + window.location.hostname + ':' + data.ztncuiConfig.port,
							target: '_blank',
							class: 'btn cbi-button cbi-button-positive',
							style: 'background: #28a745; color: white; padding: 8px 16px; text-decoration: none; display: inline-flex; align-items: center;'
						}, [
							E('i', { class: 'fa fa-external-link', style: 'margin-right: 5px;' }),
							_('Open Web Interface')
						])
					]));
				}
			} else {
				controlButtonContainer.appendChild(E('div', { style: 'display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 15px;' }, [
					E('button', {
						class: 'btn cbi-button cbi-button-positive',
						style: 'background: #28a745; color: white; padding: 8px 16px;',
						click: function() {
							self.startOpenWrtZTNCUI().then(function(success) {
								if (success) {
									setTimeout(function() { window.location.reload(); }, 2000);
								}
							});
						}
					}, _('Start Service')),

					E('button', {
						class: 'btn cbi-button',
						style: 'background: #007bff; color: white; padding: 8px 16px;',
						click: function() {
							self.enableOpenWrtZTNCUI().then(function(success) {
								if (success) {
									ui.addNotification(null, E('p', {}, _('Service will start automatically on boot')), 'info');
								}
							});
						}
					}, _('Enable Auto-start'))
				]));
			}

			controlSection.appendChild(controlButtonContainer);
		}

		// Configuration Section (only show if package is installed)
		var configSection = null;
		if (data.ztncuiStatus.isInstalled) {
			configSection = E('div', { class: 'cbi-section' }, [
				E('h3', {}, _('Configuration')),
				E('p', {}, _('Configure OpenWrt ZTNCUI service settings via UCI.'))
			]);

			// Configuration form
			var configForm = E('div', { class: 'cbi-map' });

			// Enable/Disable
			var enabledField = E('div', { class: 'cbi-value' }, [
				E('label', { class: 'cbi-value-title' }, _('Enable Service')),
				E('div', { class: 'cbi-value-field' }, [
					E('input', {
						type: 'checkbox',
						id: 'ztncui_enabled',
						checked: data.ztncuiConfig && data.ztncuiConfig.enabled
					})
				])
			]);

			// Port configuration
			var portField = E('div', { class: 'cbi-value' }, [
				E('label', { class: 'cbi-value-title' }, _('HTTP Port')),
				E('div', { class: 'cbi-value-field' }, [
					E('input', {
						type: 'number',
						id: 'ztncui_port',
						class: 'cbi-input-text',
						value: data.ztncuiConfig ? data.ztncuiConfig.port : OPENWRT_ZTNCUI_CONFIG.DEFAULT_PORT,
						min: '1024',
						max: '65535'
					})
				])
			]);

			// Bind address
			var bindField = E('div', { class: 'cbi-value' }, [
				E('label', { class: 'cbi-value-title' }, _('Bind Address')),
				E('div', { class: 'cbi-value-field' }, [
					E('input', {
						type: 'text',
						id: 'ztncui_bind',
						class: 'cbi-input-text',
						value: data.ztncuiConfig ? data.ztncuiConfig.bind_address : '0.0.0.0',
						placeholder: '0.0.0.0 (all interfaces)'
					})
				])
			]);

			// Save button
			var saveButton = E('div', { class: 'cbi-value' }, [
				E('div', { class: 'cbi-value-field' }, [
					E('button', {
						class: 'btn cbi-button cbi-button-apply',
						click: function() {
							// Save configuration
							uci.load('ztncui').then(function() {
								uci.set('ztncui', 'main', 'enabled', document.getElementById('ztncui_enabled').checked ? '1' : '0');
								uci.set('ztncui', 'main', 'port', document.getElementById('ztncui_port').value);
								uci.set('ztncui', 'main', 'bind_address', document.getElementById('ztncui_bind').value);
								
								return uci.save();
							}).then(function() {
								ui.addNotification(null, E('p', {}, _('Configuration saved successfully!')), 'info');
								ui.addNotification(null, E('p', {}, _('Restart the service to apply changes')), 'info');
							}).catch(function(err) {
								ui.addNotification(null, E('p', {}, _('Failed to save configuration: %s').format(err.message)), 'error');
							});
						}
					}, _('Save Configuration'))
				])
			]);

			configForm.appendChild(enabledField);
			configForm.appendChild(portField);
			configForm.appendChild(bindField);
			configForm.appendChild(saveButton);
			configSection.appendChild(configForm);
		}

		// Documentation Section
		var docsSection = E('div', { class: 'cbi-section' }, [
			E('h3', {}, _('Documentation and Support')),
			E('p', {}, _('Additional resources and information about OpenWrt ZTNCUI.')),
			E('div', { style: 'display: flex; gap: 10px; flex-wrap: wrap;' }, [
				E('a', {
					href: '#',
					class: 'btn cbi-button',
					style: 'text-decoration: none;',
					click: function() {
						// Show features
						ui.showModal(_('OpenWrt ZTNCUI Features'), [
							E('div', { style: 'max-height: 400px; overflow-y: auto;' }, [
								E('h4', {}, _('Key Features')),
								E('ul', {}, [
									E('li', {}, _('Lightweight C implementation (~100KB vs 100MB+)')),
									E('li', {}, _('Minimal memory usage (~2MB vs 50MB+)')),
									E('li', {}, _('UCI configuration integration')),
									E('li', {}, _('ProCD service management')),
									E('li', {}, _('Built-in HTTP server')),
									E('li', {}, _('ZeroTier API client')),
									E('li', {}, _('Web-based network management')),
									E('li', {}, _('Member authorization and configuration'))
								]),
								E('h4', {}, _('Comparison with Node.js ZTNCUI')),
								E('table', { class: 'table' }, [
									E('tr', { class: 'tr' }, [
										E('th', { class: 'th' }, _('Feature')),
										E('th', { class: 'th' }, _('OpenWrt ZTNCUI')),
										E('th', { class: 'th' }, _('Node.js ZTNCUI'))
									]),
									E('tr', { class: 'tr' }, [
										E('td', { class: 'td' }, _('Package Size')),
										E('td', { class: 'td' }, '~100KB'),
										E('td', { class: 'td' }, '100MB+')
									]),
									E('tr', { class: 'tr' }, [
										E('td', { class: 'td' }, _('Memory Usage')),
										E('td', { class: 'td' }, '~2MB'),
										E('td', { class: 'td' }, '50MB+')
									]),
									E('tr', { class: 'tr' }, [
										E('td', { class: 'td' }, _('Dependencies')),
										E('td', { class: 'td' }, _('Basic C libraries')),
										E('td', { class: 'td' }, _('Node.js + npm packages'))
									]),
									E('tr', { class: 'tr' }, [
										E('td', { class: 'td' }, _('Configuration')),
										E('td', { class: 'td' }, _('UCI integration')),
										E('td', { class: 'td' }, _('Environment variables'))
									])
								])
							]),
							E('div', { style: 'text-align: right; margin-top: 20px;' }, [
								E('button', {
									class: 'btn cbi-button',
									click: function() { ui.hideModal(); }
								}, _('Close'))
							])
						]);
						return false;
					}
				}, _('View Features')),
				
				E('a', {
					href: '#',
					class: 'btn cbi-button',
					style: 'text-decoration: none;',
					click: function() {
						// Show troubleshooting
						ui.showModal(_('Troubleshooting'), [
							E('div', { style: 'max-height: 400px; overflow-y: auto;' }, [
								E('h4', {}, _('Common Issues')),
								E('h5', {}, _('Service Won\'t Start')),
								E('ul', {}, [
									E('li', {}, _('Check if ZeroTier daemon is running: zerotier-cli info')),
									E('li', {}, _('Verify configuration: uci show ztncui')),
									E('li', {}, _('Check logs: logread | grep ztncui'))
								]),
								E('h5', {}, _('Cannot Access Web Interface')),
								E('ul', {}, [
									E('li', {}, _('Check if service is running: /etc/init.d/ztncui status')),
									E('li', {}, _('Verify port: netstat -tlnp | grep 3000')),
									E('li', {}, _('Check firewall rules: iptables -L | grep 3000'))
								]),
								E('h5', {}, _('Configuration Issues')),
								E('ul', {}, [
									E('li', {}, _('Reset to defaults: uci delete ztncui && uci commit')),
									E('li', {}, _('Verify UCI config: uci show ztncui')),
									E('li', {}, _('Restart after changes: /etc/init.d/ztncui restart'))
								])
							]),
							E('div', { style: 'text-align: right; margin-top: 20px;' }, [
								E('button', {
									class: 'btn cbi-button',
									click: function() { ui.hideModal(); }
								}, _('Close'))
							])
						]);
						return false;
					}
				}, _('Troubleshooting'))
			])
		]);

		// Add all sections to content
		content.push(statusSection, packageSection);
		if (controlSection) content.push(controlSection);
		if (configSection) content.push(configSection);
		content.push(docsSection);

		return E('div', { class: 'cbi-map' }, content);
	}
});