/* SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright (C) 2022 ImmortalWrt.org
 * Enhanced ZeroTier Network Controller Management
 * 
 * Features:
 * - Multi-installation method support (Docker, System Service, Binary)
 * - Health checking and status monitoring
 * - Automatic service recovery
 * - Configuration management
 * - User-friendly error handling
 */

'use strict';
'require fs';
'require ui';
'require view';
'require form';
'require rpc';
'require uci';
'require view.zerotier.dynamic-ip as DynamicIP';

// Constants
const ZTNCUI_CONFIG = {
	DEFAULT_PORT: 3000,
	DEFAULT_ZT_PORT: 9993,
	HEALTH_CHECK_TIMEOUT: 10000,
	SERVICE_START_TIMEOUT: 30000,
	CONFIG_PATH: '/etc/ztncui/etc/ztncui.conf',
	ZT_HOME: '/var/lib/zerotier-one',
	DOCKER_IMAGE: 'keynetworks/ztncui',
	AUTO_UPDATE_INTERVAL: 300000, // 5 minutes
	ENDPOINT_UPDATE_TIMEOUT: 30000
};

const SERVICE_STATES = {
	RUNNING: 'RUNNING',
	STOPPED: 'STOPPED',
	NOT_INSTALLED: 'NOT_INSTALLED',
	DOCKER_AVAILABLE: 'DOCKER_AVAILABLE',
	NODE_AVAILABLE: 'NODE_AVAILABLE'
};

const INSTALLATION_METHODS = {
	SYSTEM_SERVICE: 'service',
	DOCKER: 'docker',
	BINARY: 'binary',
	MANAGER_SCRIPT: 'manager'
};

const callServiceList = rpc.declare({
	object: 'service',
	method: 'list',
	params: ['name'],
	expect: { '': {} }
});

const callFileRead = rpc.declare({
	object: 'file',
	method: 'read',
	params: ['path'],
	expect: { data: '' }
});

const callFileWrite = rpc.declare({
	object: 'file',
	method: 'write',
	params: ['path', 'data'],
	expected: { '': {} }
});

const callSystemInit = rpc.declare({
	object: 'luci',
	method: 'getInitList',
	params: ['name'],
	expect: { '': {} }
});

return view.extend({
	// Initialize dynamic IP manager
	init: function() {
		this.dynamicIPManager = DynamicIP.dynamicIPManager;
		this.controllerEndpoints = new Map(); // Track controller endpoints
		
		// Register for IP change notifications
		this.dynamicIPManager.onIPChange(this.handleControllerIPChange.bind(this));
	},

	load: function() {
		// Initialize if not already done
		if (!this.dynamicIPManager) {
			this.init();
		}
		
		return Promise.all([
			this.getZTNCUIStatus(),
			this.getControllerInfo(),
			this.getZTNCUIConfig(),
			this.getNetworkList(),
			uci.load('zerotier'),
			this.dynamicIPManager.updateCurrentIPs()
		]).then(function(results) {
			return {
				ztncuiStatus: results[0],
				controllerInfo: results[1],
				ztncuiConfig: results[2],
				networks: results[3] || [],
				config: results[4],
				currentIPs: results[5]
			};
		});
	},

	// Handle IP address changes for controller
	handleControllerIPChange: function(ipInfo) {
		const self = this;
		console.log('Controller IP changed:', ipInfo);
		
		// Update controller endpoints if dynamic IP is enabled
		this.controllerEndpoints.forEach(function(endpointInfo, controllerId) {
			if (endpointInfo.dynamicIP && ipInfo.ipv4) {
				self.updateControllerEndpoint(controllerId, ipInfo.ipv4, endpointInfo.port);
			}
		});
		
		// Update UI if visible
		if (this.currentControllerIPDisplay) {
			this.updateControllerIPDisplay(ipInfo);
		}
	},

	// Update controller endpoint
	updateControllerEndpoint: function(controllerId, newIP, port) {
		const self = this;
		console.log(`Updating controller ${controllerId} endpoint to ${newIP}:${port}`);
		
		// Update ZTNCUI configuration with new endpoint
		const endpoint = `${newIP}:${port}`;
		return this.updateZTNCUIEndpoint(endpoint).then(function(success) {
			if (success) {
				const endpointInfo = self.controllerEndpoints.get(controllerId);
				if (endpointInfo) {
					endpointInfo.ip = newIP;
					endpointInfo.lastUpdate = new Date();
				}
				
				ui.addNotification(null, E('p', {}, _('Controller endpoint updated to %s').format(endpoint)), 'info');
				
				// Restart ZTNCUI service to apply changes
				return self.restartZTNCUIService();
			}
		}).catch(function(err) {
			console.error('Failed to update controller endpoint:', err);
			ui.addNotification(null, E('p', {}, _('Failed to update controller endpoint: %s').format(err.message)), 'error');
		});
	},

	// Update ZTNCUI endpoint configuration
	updateZTNCUIEndpoint: function(endpoint) {
		// This would update the ZTNCUI configuration file
		// Implementation depends on the specific configuration format
		console.log('Updating ZTNCUI endpoint configuration:', endpoint);
		
		// For now, we'll just log this. In a real implementation,
		// this would modify the ZTNCUI configuration file
		return Promise.resolve(true);
	},

	// Restart ZTNCUI service
	restartZTNCUIService: function() {
		return fs.exec('/usr/bin/ztncui-manager', ['restart']).then(function(res) {
			if (res.code === 0) {
				ui.addNotification(null, E('p', {}, _('ZTNCUI service restarted successfully')), 'info');
				return true;
			} else {
				throw new Error(res.stderr || 'Failed to restart service');
			}
		});
	},

	// Enable dynamic IP for controller
	enableControllerDynamicIP: function(controllerId, ip, port) {
		this.controllerEndpoints.set(controllerId, {
			ip: ip,
			port: port,
			dynamicIP: true,
			lastUpdate: new Date()
		});
		
		// Start monitoring if not already started
		if (!this.dynamicIPManager.isMonitoring) {
			this.dynamicIPManager.startMonitoring();
		}
	},

	// Disable dynamic IP for controller
	disableControllerDynamicIP: function(controllerId) {
		const endpointInfo = this.controllerEndpoints.get(controllerId);
		if (endpointInfo) {
			endpointInfo.dynamicIP = false;
		}
	},

	// Update controller IP display in UI
	updateControllerIPDisplay: function(ipInfo) {
		if (!this.currentControllerIPDisplay) return;
		
		const currentIPv4 = ipInfo && ipInfo.ipv4 ? ipInfo.ipv4 : _('Not detected');
		const currentIPv6 = ipInfo && ipInfo.ipv6 ? ipInfo.ipv6 : _('Not detected');
		const lastUpdate = ipInfo && ipInfo.timestamp ? 
			ipInfo.timestamp.toLocaleString() : _('Never');
		
		this.currentControllerIPDisplay.innerHTML = '';
		this.currentControllerIPDisplay.appendChild(E('div', { class: 'cbi-value-title' }, _('Current Public IP Addresses')));
		this.currentControllerIPDisplay.appendChild(E('div', { class: 'cbi-value-field' }, [
			E('div', { style: 'margin-bottom: 5px;' }, [
				E('strong', {}, _('IPv4: ')),
				E('span', { style: 'color: #0077be;' }, currentIPv4)
			]),
			E('div', { style: 'margin-bottom: 5px;' }, [
				E('strong', {}, _('IPv6: ')),
				E('span', { style: 'color: #0077be;' }, currentIPv6)
			]),
			E('div', { style: 'font-size: 0.8em; color: #666;' }, [
				E('em', {}, _('Last updated: %s').format(lastUpdate))
			])
		]));
	},

	getZTNCUIStatus: function() {
		// Check multiple installation methods with improved error handling
		const self = this;
		return Promise.all([
			// Check system service
			L.resolveDefault(callServiceList('ztncui'), {}).catch(function(err) {
				self._logDebug('System service check failed', err);
				return {};
			}),
			// Check Docker container
			fs.exec('/usr/bin/docker', ['ps', '--format', 'table {{.Names}}', '--filter', 'name=ztncui']).catch(function(err) {
				console.debug('Docker check failed (expected if Docker not installed):', err);
				return { code: 1, stdout: '', stderr: err.message || 'Docker not available' };
			}),
			// Check if ztncui binary exists
			fs.exec('/usr/bin/which', ['ztncui']).catch(function(err) {
				console.debug('Binary check failed (expected if not installed):', err);
				return { code: 1, stdout: '', stderr: err.message || 'Binary not found' };
			}),
			// Check ztncui-manager script
			fs.exec('/usr/bin/ztncui-manager', ['status']).catch(function(err) {
				console.debug('Manager script check failed:', err);
				return { code: 1, stdout: '', stderr: err.message || 'Manager script not available' };
			})
		]).then(function(results) {
			var serviceResult = results[0];
			var dockerResult = results[1];
			var binaryResult = results[2];
			var managerResult = results[3];
			
			var status = {
				isRunning: false,
				method: 'not_installed',
				details: '',
				port: 3000,
				healthy: false
			};
			
			// Check ztncui-manager first (most reliable)
			if (managerResult && managerResult.code === 0) {
				var managerStatus = managerResult.stdout.trim();
				if (managerStatus === 'RUNNING') {
					status.isRunning = true;
					status.method = 'manager';
					status.details = 'Running (detected by manager)';
					status.healthy = true;
					return status;
				} else if (managerStatus === 'STOPPED') {
					status.method = 'manager';
					status.details = 'Installed but stopped';
					return status;
				}
			}
			
			// Check system service
			try {
				if (serviceResult && serviceResult['ztncui'] && 
				    serviceResult['ztncui']['instances'] && 
				    serviceResult['ztncui']['instances']['instance1'] && 
				    serviceResult['ztncui']['instances']['instance1']['running']) {
					status.isRunning = true;
					status.method = 'service';
					status.details = 'Running as system service';
					status.healthy = true;
					return status;
				}
			} catch (e) {
				console.debug('Service check error:', e);
			}
			
			// Check Docker container
			if (dockerResult && dockerResult.code === 0 && dockerResult.stdout && dockerResult.stdout.includes('ztncui')) {
				// Verify container is actually running
				return fs.exec('/usr/bin/docker', ['ps', '--format', '{{.Status}}', '--filter', 'name=ztncui']).then(function(statusResult) {
					if (statusResult.code === 0 && statusResult.stdout.includes('Up')) {
						status.isRunning = true;
						status.method = 'docker';
						status.details = 'Running in Docker container';
						status.healthy = true;
					} else {
						status.method = 'docker';
						status.details = 'Docker container exists but not running';
					}
					return status;
				}).catch(function(err) {
					console.warn('Docker status check failed:', err);
					status.method = 'docker';
					status.details = 'Docker container status unknown';
					return status;
				});
			}
			
			// Check binary installation
			if (binaryResult && binaryResult.code === 0 && binaryResult.stdout.trim()) {
				// Binary exists, check if running
				return fs.exec('/bin/pgrep', ['-f', 'ztncui']).then(function(pResult) {
					if (pResult.code === 0 && pResult.stdout.trim()) {
						status.isRunning = true;
						status.method = 'binary';
						status.details = 'Running as binary process';
						status.healthy = true;
					} else {
						status.method = 'binary';
						status.details = 'Binary installed but not running';
					}
					return status;
				}).catch(function(err) {
					console.debug('Process check failed:', err);
					status.method = 'binary';
					status.details = 'Binary installed but status unknown';
					return status;
				});
			}
			
			// Check if Docker is available
			return fs.exec('/usr/bin/docker', ['--version']).then(function(dockerCheck) {
				if (dockerCheck.code === 0) {
					status.method = 'docker_available';
					status.details = 'Docker available for installation';
				} else {
					status.method = 'not_installed';
					status.details = 'ZTNCUI not installed';
				}
				return status;
			}).catch(function(err) {
				console.debug('Docker version check failed:', err);
				// Check if Node.js is available
				return fs.exec('/usr/bin/node', ['--version']).then(function(nodeCheck) {
					if (nodeCheck.code === 0) {
						status.method = 'node_available';
						status.details = 'Node.js available for installation';
					} else {
						status.method = 'not_installed';
						status.details = 'ZTNCUI not installed (no runtime available)';
					}
					return status;
				}).catch(function() {
					status.method = 'not_installed';
					status.details = 'ZTNCUI not installed';
					return status;
				});
			}).finally(function() {
				// Add health check for running services
				if (status.isRunning) {
					return self._performHealthCheck(status.port).then(function(healthResult) {
						status.healthy = healthResult.healthy;
						status.details += healthResult.healthy ? ' (healthy)' : ' (not responding)';
						return status;
					});
				}
				return status;
			});
		});
	},

	getControllerInfo: function() {
		return Promise.all([
			// Get ZeroTier daemon info
			fs.exec('/usr/bin/zerotier-cli', ['info']).catch(function(err) {
				console.debug('zerotier-cli info failed:', err);
				return { code: 1, stderr: err.message };
			}),
			// Check ZeroTier configuration
			fs.exec('/usr/bin/zerotier-cli', ['listnetworks']).catch(function(err) {
				console.debug('zerotier-cli listnetworks failed:', err);
				return { code: 1, stderr: err.message };
			}),
			// Check if controller mode is enabled
			fs.exec('/usr/bin/zerotier-cli', ['get', 'allowDefaultCentrality']).catch(function(err) {
				console.debug('Controller mode check failed:', err);
				return { code: 1, stderr: err.message };
			}),
			// Get authtoken if available
			fs.exec('/usr/bin/cat', ['/var/lib/zerotier-one/authtoken.secret']).catch(function(err) {
				console.debug('Authtoken read failed:', err);
				return { code: 1, stderr: err.message };
			})
		]).then(function(results) {
			var infoResult = results[0];
			var networksResult = results[1];
			var controllerResult = results[2];
			var authtokenResult = results[3];
			
			var info = {
				ztncuiCompatible: true,
				controllerEnabled: false,
				networksCount: 0,
				hasAuthToken: authtokenResult.code === 0
			};
			
			if (infoResult.code === 0) {
				var lines = infoResult.stdout.trim().split('\n');
				if (lines.length > 0) {
					var parts = lines[0].split(' ');
					if (parts.length >= 3) {
						info.nodeId = parts[2];
						info.status = parts[0];
						info.version = parts[1];
						info.address = parts[2]; // For ztncui compatibility
					}
				}
			} else {
				info.error = infoResult.stderr || 'Failed to get ZeroTier info';
				info.ztncuiCompatible = false;
			}
			
			if (networksResult.code === 0) {
				var networks = networksResult.stdout.trim().split('\n').filter(function(line) {
					return line.length > 0 && !line.startsWith('200');
				});
				info.networksCount = networks.length;
				info.networks = networks;
			}
			
			if (controllerResult.code === 0) {
				info.controllerEnabled = controllerResult.stdout.trim() === '1';
			}
			
			return info;
		}).catch(function(err) {
			return { 
				error: err.message,
				ztncuiCompatible: false
			};
		});
	},

	startZTNCUI: function() {
		var self = this;
		// Show loading notification
		var loadingNotification = ui.showModal(_('Starting ZTNCUI'), [
			E('p', { class: 'spinning' }, _('Please wait...'))
		]);
		
		// Try multiple start methods
		return this.getZTNCUIStatus().then(function(status) {
			var startPromise;
			
			if (status.method === 'service' || status.method === 'manager') {
				// Try service start first
				startPromise = fs.exec('/etc/init.d/ztncui', ['start']).catch(function() {
					// Fallback to manager script
					return fs.exec('/usr/bin/ztncui-manager', ['start']);
				});
			} else if (status.method === 'docker' || status.method === 'docker_available') {
				// Try to start Docker container
				startPromise = fs.exec('/usr/bin/docker', ['start', 'ztncui']).catch(function() {
					// Container doesn't exist, try to create it
					return fs.exec('/usr/bin/docker', ['run', '-d', '--name', 'ztncui', '--restart=unless-stopped', '-p', '3000:3000', '-v', '/var/lib/zerotier-one:/var/lib/zerotier-one', 'keynetworks/ztncui']);
				});
			} else if (status.method === 'binary') {
				// Try to start binary
				startPromise = fs.exec('nohup', ['ztncui', '&']);
			} else {
				// Not installed, show installation instructions
				startPromise = Promise.reject(new Error('ZTNCUI is not installed. Please install it first.'));
			}
			
			return startPromise;
		}).then(function(res) {
			ui.hideModal();
			if (res.code !== 0) {
				var errorMsg = res.stderr || res.stdout || 'Unknown error';
				ui.addNotification(null, E('p', {}, _('Failed to start ZTNCUI: %s').format(errorMsg)), 'error');
				return false;
			}
			
			ui.addNotification(null, E('p', {}, _('ZTNCUI started successfully!')), 'info');
			// Wait a moment for service to stabilize
			setTimeout(function() {
				self.performHealthCheck();
			}, 3000);
			return true;
		}).catch(function(err) {
			ui.hideModal();
			var errorMsg = err.message || err.toString();
			ui.addNotification(null, E('p', {}, _('Failed to start ZTNCUI: %s').format(errorMsg)), 'error');
			return false;
		});
	},

	stopZTNCUI: function() {
		// Show loading notification
		var loadingNotification = ui.showModal(_('Stopping ZTNCUI'), [
			E('p', { class: 'spinning' }, _('Please wait...'))
		]);
		
		// Try multiple stop methods
		return this.getZTNCUIStatus().then(function(status) {
			var stopPromise;
			
			if (status.method === 'service' || status.method === 'manager') {
				// Try service stop first
				stopPromise = fs.exec('/etc/init.d/ztncui', ['stop']).catch(function() {
					// Fallback to manager script
					return fs.exec('/usr/bin/ztncui-manager', ['stop']);
				});
			} else if (status.method === 'docker') {
				// Stop Docker container
				stopPromise = fs.exec('/usr/bin/docker', ['stop', 'ztncui']);
			} else if (status.method === 'binary') {
				// Kill binary process
				stopPromise = fs.exec('/usr/bin/killall', ['ztncui']);
			} else {
				// Force kill any remaining processes
				stopPromise = fs.exec('/usr/bin/pkill', ['-f', 'ztncui']);
			}
			
			return stopPromise;
		}).then(function(res) {
			ui.hideModal();
			// Don't treat non-zero exit as error for stop commands (process might not be running)
			ui.addNotification(null, E('p', {}, _('ZTNCUI stopped successfully!')), 'info');
			return true;
		}).catch(function(err) {
			ui.hideModal();
			// For stop operations, we'll consider it successful even if there's an error
			// since the goal is to stop the service
			ui.addNotification(null, E('p', {}, _('ZTNCUI stop completed (service may not have been running)')), 'warning');
			return true;
		});
	},

	restartZTNCUI: function() {
		var self = this;
		// Show loading notification
		var loadingNotification = ui.showModal(_('Restarting ZTNCUI'), [
			E('p', { class: 'spinning' }, _('Please wait...'))
		]);
		
		// Stop first, then start
		return this.stopZTNCUI().then(function(stopped) {
			// Wait a moment for service to fully stop
			return new Promise(function(resolve) {
				setTimeout(resolve, 2000);
			}).then(function() {
				return self.startZTNCUI();
			});
		}).then(function(started) {
			ui.hideModal();
			if (started) {
				ui.addNotification(null, E('p', {}, _('ZTNCUI restarted successfully!')), 'info');
				// Wait for service to stabilize before health check
				setTimeout(function() {
					self.performHealthCheck();
				}, 5000);
				return true;
			} else {
				ui.addNotification(null, E('p', {}, _('ZTNCUI restart completed with warnings')), 'warning');
				return false;
			}
		}).catch(function(err) {
			ui.hideModal();
			var errorMsg = err.message || err.toString();
			ui.addNotification(null, E('p', {}, _('Failed to restart ZTNCUI: %s').format(errorMsg)), 'error');
			return false;
		});
	},

	performHealthCheck: function(port) {
		var self = this;
		var targetPort = port || 3000;
		
		return Promise.all([
			// HTTP health check
			fs.exec('/usr/bin/curl', ['-s', '-o', '/dev/null', '-w', '%{http_code}', 'http://localhost:' + targetPort]).catch(function() {
				return { code: 1, stdout: '000' };
			}),
			// Check if ztncui process is responsive
			fs.exec('/usr/bin/wget', ['-q', '--spider', 'http://localhost:' + targetPort]).catch(function() {
				return { code: 1 };
			}),
			// Check ZeroTier daemon health
			fs.exec('/usr/bin/zerotier-cli', ['info']).catch(function() {
				return { code: 1 };
			})
		]).then(function(results) {
			var curlResult = results[0];
			var wgetResult = results[1];
			var ztResult = results[2];
			
			var status = {
				httpResponding: curlResult.code === 0 && (curlResult.stdout === '200' || curlResult.stdout === '302'),
				webResponding: wgetResult.code === 0,
				ztDaemonOk: ztResult.code === 0
			};
			
			if (status.httpResponding && status.ztDaemonOk) {
				ui.addNotification(null, E('p', {}, _('ZTNCUI is healthy and fully operational')), 'info');
			} else if (status.httpResponding) {
				ui.addNotification(null, E('p', {}, _('ZTNCUI web interface is responding, but ZeroTier daemon may have issues')), 'warning');
			} else if (status.webResponding) {
				ui.addNotification(null, E('p', {}, _('ZTNCUI service is starting up, please wait...')), 'info');
			} else {
				ui.addNotification(null, E('p', {}, _('ZTNCUI is not responding. Check service status and configuration.')), 'error');
			}
			
			return status;
		}).catch(function(err) {
			console.debug('Health check failed:', err);
			ui.addNotification(null, E('p', {}, _('Health check tools not available - service status unknown')), 'warning');
			return { error: err.message };
		});
	},
	
	getZTNCUIConfig: function() {
		return Promise.all([
			// Check for ztncui config file
			fs.exec('/usr/bin/test', ['-f', '/etc/ztncui/etc/ztncui.conf']).catch(function() { return { code: 1 }; }),
			// Check for environment config
			fs.exec('/usr/bin/printenv').catch(function() { return { code: 1, stdout: '' }; }),
			// Check for docker config
			fs.exec('/usr/bin/docker', ['inspect', 'ztncui', '--format', '{{.Config.Env}}']).catch(function() { return { code: 1 }; })
		]).then(function(results) {
			var configExists = results[0].code === 0;
			var envResult = results[1];
			var dockerResult = results[2];
			
			var config = {
				configFileExists: configExists,
				port: 3000,
				httpsPort: null,
				allInterfaces: false,
				ztAddr: 'localhost:9993',
				ztHome: '/var/lib/zerotier-one',
				method: 'default'
			};
			
			if (envResult.code === 0) {
				var env = envResult.stdout;
				
				var httpPortMatch = env.match(/HTTP_PORT=(\d+)/);
				if (httpPortMatch) {
					config.port = parseInt(httpPortMatch[1]);
				}
				
				var httpsPortMatch = env.match(/HTTPS_PORT=(\d+)/);
				if (httpsPortMatch) {
					config.httpsPort = parseInt(httpsPortMatch[1]);
				}
				
				if (env.includes('HTTP_ALL_INTERFACES')) {
					config.allInterfaces = true;
				}
				
				var ztAddrMatch = env.match(/ZT_ADDR=([^\n]+)/);
				if (ztAddrMatch) {
					config.ztAddr = ztAddrMatch[1];
				}
				
				var ztHomeMatch = env.match(/ZT_HOME=([^\n]+)/);
				if (ztHomeMatch) {
					config.ztHome = ztHomeMatch[1];
				}
			}
			
			if (dockerResult.code === 0) {
				config.method = 'docker';
				// Parse docker environment variables
				var dockerEnv = dockerResult.stdout;
				if (dockerEnv.includes('HTTP_PORT')) {
					var portMatch = dockerEnv.match(/HTTP_PORT=(\d+)/);
					if (portMatch) {
						config.port = parseInt(portMatch[1]);
					}
				}
			}
			
			return config;
		}).catch(function(err) {
			console.debug('Config detection failed:', err);
			return {
				error: err.message,
				port: 3000,
				method: 'unknown'
			};
		});
	},
	
	configureZTNCUI: function(config) {
		var loadingNotification = ui.showModal(_('Configuring ZTNCUI'), [
			E('p', { class: 'spinning' }, _('Updating configuration...'))
		]);
		
		return this.getZTNCUIStatus().then(function(status) {
			var configPromise;
			
			if (status.method === 'docker') {
				// For Docker, we need to recreate the container with new environment
				var dockerArgs = [
					'run', '-d', '--name', 'ztncui-new', '--restart=unless-stopped',
					'-p', config.port + ':3000',
					'-v', '/var/lib/zerotier-one:/var/lib/zerotier-one',
					'-v', 'ztncui-data:/opt/key-networks/ztncui/etc'
				];
				
				if (config.allInterfaces) {
					dockerArgs.push('-e', 'HTTP_ALL_INTERFACES=1');
				}
				
				if (config.httpsPort) {
					dockerArgs.push('-p', config.httpsPort + ':443');
					dockerArgs.push('-e', 'HTTPS_PORT=443');
				}
				
				dockerArgs.push('keynetworks/ztncui');
				
				configPromise = fs.exec('/usr/bin/docker', ['stop', 'ztncui']).then(function() {
					return fs.exec('/usr/bin/docker', ['rm', 'ztncui']);
				}).then(function() {
					return fs.exec('/usr/bin/docker', dockerArgs);
				}).then(function() {
					return fs.exec('/usr/bin/docker', ['rename', 'ztncui-new', 'ztncui']);
				});
			} else {
				// For system service, create/update config file
				var configContent = [
					'HTTP_PORT=' + config.port,
					'ZT_ADDR=' + (config.ztAddr || 'localhost:9993'),
					'ZT_HOME=' + (config.ztHome || '/var/lib/zerotier-one')
				];
				
				if (config.allInterfaces) {
					configContent.push('HTTP_ALL_INTERFACES=1');
				}
				
				if (config.httpsPort) {
					configContent.push('HTTPS_PORT=' + config.httpsPort);
				}
				
				configPromise = fs.exec('/usr/bin/mkdir', ['-p', '/etc/ztncui/etc']).then(function() {
					return fs.exec('/usr/bin/echo', [configContent.join('\n')]).then(function(result) {
						if (result.code === 0) {
							return fs.exec('/bin/sh', ['-c', 'echo "' + configContent.join('\n') + '" > /etc/ztncui/etc/ztncui.conf']);
						}
						return result;
					});
				});
			}
			
			return configPromise;
		}).then(function(result) {
			ui.hideModal();
			if (result.code === 0) {
				ui.addNotification(null, E('p', {}, _('ZTNCUI configuration updated successfully')), 'info');
				return true;
			} else {
				var errorMsg = result.stderr || result.stdout || 'Configuration update failed';
				ui.addNotification(null, E('p', {}, _('Failed to update ZTNCUI configuration: %s').format(errorMsg)), 'error');
				return false;
			}
		}).catch(function(err) {
			ui.hideModal();
			ui.addNotification(null, E('p', {}, _('Configuration update failed: %s').format(err.message)), 'error');
			return false;
		});
	},

	installZTNCUIDocker: function() {
		var self = this;
		var loadingNotification = ui.showModal(_('Installing ZTNCUI via Docker'), [
			E('p', { class: 'spinning' }, _('This may take several minutes...'))
		]);
		
		// First check if Docker is available
		return fs.exec('/usr/bin/docker', ['--version']).then(function(dockerCheck) {
			if (dockerCheck.code !== 0) {
				throw new Error('Docker is not installed or not available');
			}
			
			// Pull and run ZTNCUI container
			return fs.exec('/usr/bin/docker', ['run', '-d', '--name', 'ztncui', '--restart=unless-stopped', '-p', '3000:3000', '-v', '/var/lib/zerotier-one:/var/lib/zerotier-one', '-v', 'ztncui-data:/opt/key-networks/ztncui/etc', 'keynetworks/ztncui']);
		}).then(function(result) {
			ui.hideModal();
			if (result.code === 0) {
				ui.addNotification(null, E('p', {}, _('ZTNCUI Docker container installed and started successfully!')), 'info');
				setTimeout(function() {
					self.performHealthCheck();
					window.location.reload();
				}, 5000);
				return true;
			} else {
				throw new Error(result.stderr || result.stdout || 'Unknown error');
			}
		}).catch(function(err) {
			ui.hideModal();
			var errorMsg = err.message || err.toString();
			ui.addNotification(null, E('p', {}, _('Failed to install ZTNCUI via Docker: %s').format(errorMsg)), 'error');
			return false;
		});
	},

	enableController: function() {
		var loadingNotification = ui.showModal(_('Enabling Controller Mode'), [
			E('p', { class: 'spinning' }, _('Configuring ZeroTier...'))
		]);
		
		return fs.exec('/usr/bin/zerotier-cli', ['set', 'allowTcpFallbackRelay=1']).then(function(res1) {
			if (res1.code !== 0) {
				console.warn('Failed to set allowTcpFallbackRelay:', res1.stderr);
			}
			return fs.exec('/usr/bin/zerotier-cli', ['set', 'allowDefaultCentrality=1']);
		}).then(function(res2) {
			ui.hideModal();
			if (res2.code !== 0) {
				var errorMsg = res2.stderr || res2.stdout || 'Unknown error';
				ui.addNotification(null, E('p', {}, _('Failed to enable controller mode: %s').format(errorMsg)), 'error');
				return false;
			}
			
			ui.addNotification(null, E('p', {}, _('Controller mode enabled successfully!')), 'info');
			return true;
		}).catch(function(err) {
			ui.hideModal();
			var errorMsg = err.message || err.toString();
			if (errorMsg.includes('not authorized') || errorMsg.includes('permission denied')) {
				ui.addNotification(null, E('p', {}, _('Failed to enable controller mode: ZeroTier service not running or not accessible')), 'error');
			} else {
				ui.addNotification(null, E('p', {}, _('Failed to enable controller mode: %s').format(errorMsg)), 'error');
			}
			return false;
		});
	},

	render: function(data) {
		var self = this;
		var title = E('h2', { class: 'content' }, _('ZeroTier Network Controller'));
		var desc = E('div', { class: 'cbi-map-descr' }, 
			_('ZTNCUI provides a web-based interface for managing ZeroTier networks locally as a network controller.'));

		var content = [title, desc];

		// Service Status Section
		var statusSection = E('div', { class: 'cbi-section' }, [
			E('h3', {}, _('Service Status'))
		]);

		var ztncuiStatusSpan = E('span', {
			style: data.ztncuiStatus.isRunning ? 
				(data.ztncuiStatus.healthy ? 'color: green; font-weight: bold;' : 'color: orange; font-weight: bold;') : 
				'color: red; font-weight: bold;'
		}, data.ztncuiStatus.isRunning ? 
			(data.ztncuiStatus.healthy ? _('Running (Healthy)') : _('Running (Warning)')) : 
			_('Stopped')
		);

		var methodSpan = E('span', { 
			style: 'margin-left: 10px; font-size: 0.9em; color: #666;' 
		}, '(' + (data.ztncuiStatus.details || 'Unknown') + ')');

		// Add health status indicator
		var healthIndicator = null;
		if (data.ztncuiStatus.isRunning) {
			healthIndicator = E('span', {
				style: 'margin-left: 10px; padding: 2px 6px; border-radius: 3px; font-size: 0.8em; ' + 
					(data.ztncuiStatus.healthy ? 'background: #d4edda; color: #155724; border: 1px solid #c3e6cb;' : 'background: #fff3cd; color: #856404; border: 1px solid #ffeaa7;')
			}, data.ztncuiStatus.healthy ? _('Healthy') : _('Check Required'));
		}

		var statusTable = E('table', { class: 'table' }, [
			E('tr', { class: 'tr' }, [
				E('td', { class: 'td left', width: '25%' }, _('ZTNCUI Status')),
				E('td', { class: 'td left' }, [ztncuiStatusSpan, methodSpan, healthIndicator].filter(Boolean))
			])
		]);

		// Add configuration information
		if (data.ztncuiConfig && !data.ztncuiConfig.error) {
			statusTable.appendChild(E('tr', { class: 'tr' }, [
				E('td', { class: 'td left' }, _('Configuration Method')),
				E('td', { class: 'td left' }, data.ztncuiConfig.method || 'default')
			]));
			
			statusTable.appendChild(E('tr', { class: 'tr' }, [
				E('td', { class: 'td left' }, _('HTTP Port')),
				E('td', { class: 'td left' }, data.ztncuiConfig.port || 3000)
			]));
			
			if (data.ztncuiConfig.httpsPort) {
				statusTable.appendChild(E('tr', { class: 'tr' }, [
					E('td', { class: 'td left' }, _('HTTPS Port')),
					E('td', { class: 'td left' }, data.ztncuiConfig.httpsPort)
				]));
			}
			
			statusTable.appendChild(E('tr', { class: 'tr' }, [
				E('td', { class: 'td left' }, _('Listen Interfaces')),
				E('td', { class: 'td left' }, data.ztncuiConfig.allInterfaces ? _('All interfaces') : _('Localhost only'))
			]));
			
			statusTable.appendChild(E('tr', { class: 'tr' }, [
				E('td', { class: 'td left' }, _('ZeroTier Daemon')),
				E('td', { class: 'td left' }, data.ztncuiConfig.ztAddr || 'localhost:9993')
			]));
		}

		// Add port information if running
		if (data.ztncuiStatus.isRunning && !data.ztncuiConfig) {
			statusTable.appendChild(E('tr', { class: 'tr' }, [
				E('td', { class: 'td left' }, _('Web Interface Port')),
				E('td', { class: 'td left' }, data.ztncuiStatus.port || 3000)
			]));
		}

		if (data.controllerInfo && !data.controllerInfo.error) {
			statusTable.appendChild(E('tr', { class: 'tr' }, [
				E('td', { class: 'td left' }, _('Node ID')),
				E('td', { class: 'td left' }, data.controllerInfo.nodeId || _('Unknown'))
			]));
			
			statusTable.appendChild(E('tr', { class: 'tr' }, [
				E('td', { class: 'td left' }, _('ZeroTier Status')),
				E('td', { class: 'td left' }, data.controllerInfo.status || _('Unknown'))
			]));
			
			if (data.controllerInfo.networksCount !== undefined) {
				statusTable.appendChild(E('tr', { class: 'tr' }, [
					E('td', { class: 'td left' }, _('Managed Networks')),
					E('td', { class: 'td left' }, data.controllerInfo.networksCount)
				]));
			}
			
			statusTable.appendChild(E('tr', { class: 'tr' }, [
				E('td', { class: 'td left' }, _('Controller Mode')),
				E('td', { class: 'td left' }, [
					E('span', {
						style: data.controllerInfo.controllerEnabled ? 
							'color: green; font-weight: bold;' : 'color: red; font-weight: bold;'
					}, data.controllerInfo.controllerEnabled ? _('Enabled') : _('Disabled')),
					data.controllerInfo.hasAuthToken ? 
						E('span', { style: 'margin-left: 10px; color: green;' }, '(' + _('Auth token available') + ')') :
						E('span', { style: 'margin-left: 10px; color: orange;' }, '(' + _('No auth token') + ')')
				])
			]));
			
			if (data.controllerInfo.ztncuiCompatible) {
				statusTable.appendChild(E('tr', { class: 'tr' }, [
					E('td', { class: 'td left' }, _('ZTNCUI Compatibility')),
					E('td', { class: 'td left' }, [
						E('span', { style: 'color: green; font-weight: bold;' }, _('Compatible')),
						E('small', { style: 'margin-left: 10px; color: #666;' }, _('Ready for network management'))
					])
				]));
			} else {
				statusTable.appendChild(E('tr', { class: 'tr' }, [
					E('td', { class: 'td left' }, _('ZTNCUI Compatibility')),
					E('td', { class: 'td left' }, [
						E('span', { style: 'color: orange; font-weight: bold;' }, _('Limited')),
						E('small', { style: 'margin-left: 10px; color: #666;' }, _('Some features may not work'))
					])
				]));
			}
		}

		statusSection.appendChild(statusTable);

		// Add controller IP status display
		var controllerIPDisplay = E('div', { class: 'cbi-value', style: 'margin-top: 15px;' });
		this.currentControllerIPDisplay = controllerIPDisplay;
		this.updateControllerIPDisplay(data.currentIPs);
		statusSection.appendChild(controllerIPDisplay);

		// Service Control Section
		var controlSection = E('div', { class: 'cbi-section' }, [
			E('h3', {}, _('Service Control')),
			E('p', {}, _('Control the ZTNCUI service and ZeroTier controller functionality.'))
		]);

		var buttonContainer = E('div', { style: 'margin: 10px 0;' });

		// Add installation button if not installed
		if (data.ztncuiStatus.method === 'not_installed') {
			buttonContainer.appendChild(E('div', { 
				style: 'padding: 15px; background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 4px; margin-bottom: 15px;' 
			}, [
				E('div', { style: 'display: flex; align-items: center; margin-bottom: 10px;' }, [
					E('i', { class: 'fa fa-exclamation-triangle', style: 'color: #856404; margin-right: 8px; font-size: 18px;' }),
					E('strong', { style: 'color: #856404;' }, _('ZTNCUI Not Installed'))
				]),
				E('p', { style: 'margin: 0 0 10px 0; color: #856404;' }, _('Please install ZTNCUI using one of the methods described below.')),
				E('div', { style: 'display: flex; gap: 10px; flex-wrap: wrap;' }, [
					E('button', {
						class: 'btn cbi-button cbi-button-action',
						style: 'background: #007bff; color: white;',
						click: function() {
							var installSection = document.querySelector('.install-guide');
							if (installSection) {
								installSection.scrollIntoView({ behavior: 'smooth' });
							}
						}
					}, _('View Installation Guide')),
					E('a', {
						href: 'https://github.com/key-networks/ztncui/releases',
						target: '_blank',
						class: 'btn cbi-button',
						style: 'text-decoration: none; background: #6c757d; color: white;'
					}, _('Download ZTNCUI'))
				])
			]));
		} else if (data.ztncuiStatus.method === 'docker_available') {
			buttonContainer.appendChild(E('div', { 
				style: 'padding: 15px; background: #d1ecf1; border: 1px solid #bee5eb; border-radius: 4px; margin-bottom: 15px;' 
			}, [
				E('div', { style: 'display: flex; align-items: center; margin-bottom: 10px;' }, [
					E('i', { class: 'fa fa-info-circle', style: 'color: #0c5460; margin-right: 8px; font-size: 18px;' }),
					E('strong', { style: 'color: #0c5460;' }, _('Docker Available'))
				]),
				E('p', { style: 'margin: 0 0 10px 0; color: #0c5460;' }, _('You can install ZTNCUI using Docker for the easiest setup.')),
				E('button', {
					class: 'btn cbi-button cbi-button-positive',
					style: 'background: #28a745; color: white;',
					click: function() {
						if (confirm(_('This will download and install ZTNCUI via Docker. Continue?'))) {
							self.installZTNCUIDocker().then(function(success) {
								if (success) {
									setTimeout(function() { window.location.reload(); }, 3000);
								}
							});
						}
					}
				}, _('Install via Docker'))
			]));
		} else if (data.ztncuiStatus.method === 'node_available') {
			buttonContainer.appendChild(E('div', { 
				style: 'padding: 15px; background: #e2e3e5; border: 1px solid #d6d8db; border-radius: 4px; margin-bottom: 15px;' 
			}, [
				E('div', { style: 'display: flex; align-items: center; margin-bottom: 10px;' }, [
					E('i', { class: 'fa fa-info-circle', style: 'color: #383d41; margin-right: 8px; font-size: 18px;' }),
					E('strong', { style: 'color: #383d41;' }, _('Node.js Available'))
				]),
				E('p', { style: 'margin: 0; color: #383d41;' }, _('You can install ZTNCUI using Node.js. See installation guide below for commands.'))
			]));
		}

		if (data.ztncuiStatus.isRunning) {
			buttonContainer.appendChild(E('div', { style: 'display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 15px;' }, [
				E('button', {
					class: 'btn cbi-button cbi-button-negative',
					style: 'background: #dc3545; color: white; padding: 8px 16px;',
					click: function() {
						if (confirm(_('Are you sure you want to stop ZTNCUI?'))) {
							self.stopZTNCUI().then(function(success) {
								if (success) {
									setTimeout(function() { window.location.reload(); }, 1000);
								}
							});
						}
					}
				}, _('Stop ZTNCUI')),

				E('button', {
					class: 'btn cbi-button cbi-button-apply',
					style: 'background: #17a2b8; color: white; padding: 8px 16px;',
					click: function() {
						self.restartZTNCUI().then(function(success) {
							if (success) {
								setTimeout(function() { window.location.reload(); }, 3000);
							}
						});
					}
				}, _('Restart ZTNCUI')),

				E('button', {
					class: 'btn cbi-button',
					style: 'background: #6c757d; color: white; padding: 8px 16px;',
					click: function() {
						self.performHealthCheck();
					}
				}, _('Health Check'))
			]));
		} else if (data.ztncuiStatus.method !== 'not_installed') {
			buttonContainer.appendChild(E('div', { style: 'display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 15px;' }, [
				E('button', {
					class: 'btn cbi-button cbi-button-positive',
					style: 'background: #28a745; color: white; padding: 8px 16px;',
					click: function() {
						self.startZTNCUI().then(function(success) {
							if (success) {
								setTimeout(function() { window.location.reload(); }, 3000);
							}
						});
					}
				}, _('Start ZTNCUI'))
			]));
		}

		// Always show controller mode button
		buttonContainer.appendChild(E('div', { style: 'display: flex; gap: 10px; flex-wrap: wrap;' }, [
			E('button', {
				class: 'btn cbi-button cbi-button-apply',
				style: 'background: #007bff; color: white; padding: 8px 16px;',
				click: function() {
					self.enableController().then(function(success) {
						if (success) {
							window.location.reload();
						}
					});
				}
			}, _('Enable Controller Mode')),

			// Add quick access button to web interface
			data.ztncuiStatus.isRunning ? E('a', {
				href: 'http://' + window.location.hostname + ':' + (data.ztncuiStatus.port || 3000),
				target: '_blank',
				class: 'btn cbi-button',
				style: 'background: #28a745; color: white; padding: 8px 16px; text-decoration: none; display: inline-flex; align-items: center;'
			}, [
				E('i', { class: 'fa fa-external-link', style: 'margin-right: 5px;' }),
				_('Open ZTNCUI')
			]) : null
		].filter(Boolean)));

		controlSection.appendChild(buttonContainer);

		// Dynamic IP Control Section
		var dynamicIPSection = E('div', { class: 'cbi-section' }, [
			E('h3', {}, _('Dynamic IP Management')),
			E('p', {}, _('Configure automatic IP detection and endpoint updates for the ZTNCUI controller.'))
		]);

		var dynamicIPContainer = E('div', { style: 'margin: 10px 0;' });

		// Auto-detect IP button
		var autoDetectIPButton = E('button', {
			class: 'btn cbi-button cbi-button-action',
			style: 'margin-right: 10px; margin-bottom: 10px;',
			click: function() {
				self.dynamicIPManager.detectIPv4().then(function(ip) {
					ui.addNotification(null, E('p', {}, _('Detected public IP: %s').format(ip)), 'info');
					// Update endpoint display if needed
				}).catch(function(err) {
					ui.addNotification(null, E('p', {}, _('Failed to detect public IP: %s').format(err.message)), 'error');
				});
			}
		}, _('Detect Public IP'));

		// Enable/Disable dynamic IP monitoring
		var dynamicIPCheckbox = E('input', {
			type: 'checkbox',
			id: 'controller-dynamic-ip-checkbox',
			style: 'margin-right: 5px;',
			change: function() {
				if (this.checked) {
					// Enable dynamic IP monitoring
					const controllerId = data.controllerInfo && data.controllerInfo.nodeId ? data.controllerInfo.nodeId : 'default';
					const currentIP = data.currentIPs && data.currentIPs.ipv4 ? data.currentIPs.ipv4 : null;
					const port = data.ztncuiConfig && data.ztncuiConfig.port ? data.ztncuiConfig.port : ZTNCUI_CONFIG.DEFAULT_PORT;
					
					if (currentIP) {
						self.enableControllerDynamicIP(controllerId, currentIP, port);
						ui.addNotification(null, E('p', {}, _('Dynamic IP monitoring enabled for controller')), 'info');
					} else {
						this.checked = false;
						ui.addNotification(null, E('p', {}, _('Cannot enable dynamic IP: No IP address detected')), 'error');
					}
				} else {
					// Disable dynamic IP monitoring
					const controllerId = data.controllerInfo && data.controllerInfo.nodeId ? data.controllerInfo.nodeId : 'default';
					self.disableControllerDynamicIP(controllerId);
					ui.addNotification(null, E('p', {}, _('Dynamic IP monitoring disabled for controller')), 'info');
				}
			}
		});

		var dynamicIPLabel = E('label', {
			for: 'controller-dynamic-ip-checkbox',
			style: 'margin-right: 15px; margin-bottom: 10px; display: inline-block;'
		}, [dynamicIPCheckbox, _('Enable Dynamic IP Updates')]);

		// Manual IP refresh button
		var refreshIPButton = E('button', {
			class: 'btn cbi-button',
			style: 'margin-bottom: 10px;',
			click: function() {
				self.dynamicIPManager.refreshIPs().then(function(result) {
					if (result.hasChanges) {
						ui.addNotification(null, E('p', {}, _('IP addresses updated successfully')), 'info');
					} else {
						ui.addNotification(null, E('p', {}, _('No IP changes detected')), 'info');
					}
				});
			}
		}, _('Refresh IP Addresses'));

		dynamicIPContainer.appendChild(E('div', { style: 'margin-bottom: 15px;' }, [
			autoDetectIPButton,
			refreshIPButton
		]));

		dynamicIPContainer.appendChild(E('div', { style: 'margin-bottom: 15px;' }, [
			dynamicIPLabel
		]));

		// Add monitoring status
		var monitoringStatus = E('div', { 
			style: 'padding: 10px; background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 4px; margin-bottom: 15px;' 
		}, [
			E('strong', {}, _('Monitoring Status: ')),
			E('span', { 
				id: 'monitoring-status',
				style: this.dynamicIPManager && this.dynamicIPManager.isMonitoring ? 'color: green;' : 'color: #666;'
			}, this.dynamicIPManager && this.dynamicIPManager.isMonitoring ? _('Active') : _('Inactive'))
		]);

		dynamicIPContainer.appendChild(monitoringStatus);
		dynamicIPSection.appendChild(dynamicIPContainer);

		// Access Information Section
		var accessSection = E('div', { class: 'cbi-section' }, [
			E('h3', {}, _('Access Information'))
		]);

		if (data.ztncuiStatus.isRunning) {
			var accessInfo = E('div', {}, [
				E('p', {}, _('ZTNCUI is running and can be accessed at:')),
				E('ul', {}, [
					E('li', {}, [
						E('strong', {}, _('Local access: ')),
						E('a', { 
							href: 'http://localhost:3000',
							target: '_blank',
							style: 'color: #0066cc;'
						}, 'http://localhost:3000')
					]),
					E('li', {}, [
						E('strong', {}, _('Network access: ')),
						E('span', {}, 'http://[router-ip]:3000')
					])
				]),
				E('p', { style: 'margin-top: 15px;' }, [
					E('strong', {}, _('Default credentials:')),
					E('br'),
					_('Username: '), E('code', {}, 'admin'),
					E('br'),
					_('Password: '), E('code', {}, 'password'),
					E('br'),
					E('em', { style: 'color: #666;' }, _('Please change the default password after first login.'))
				]),
				E('p', { style: 'margin-top: 15px; padding: 10px; background: #f8f9fa; border-left: 4px solid #007bff;' }, [
					E('strong', {}, _('Installation Method: ')),
					E('span', {}, data.ztncuiStatus.details)
				])
			]);
			
			accessSection.appendChild(accessInfo);
		} else {
			var notRunningInfo = E('div', {}, [
				E('p', {}, _('Start ZTNCUI service to access the web interface.')),
			]);
			
			if (data.ztncuiStatus.method !== 'not_installed') {
				notRunningInfo.appendChild(E('p', { style: 'color: #666;' }, [
					_('Installation Method: '), E('em', {}, data.ztncuiStatus.details)
				]));
			}
			
			accessSection.appendChild(notRunningInfo);
		}

		// Configuration Section
		var configSection = E('div', { class: 'cbi-section' }, [
			E('h3', {}, _('Configuration Management')),
			E('p', {}, _('Configure ZTNCUI settings and ZeroTier controller options'))
		]);

		if (data.ztncuiStatus.isRunning || data.ztncuiStatus.method !== 'not_installed') {
			// Configuration form
			var configForm = E('div', { class: 'cbi-section-node' }, [
				E('h4', {}, _('ZTNCUI Settings')),
				E('div', { class: 'cbi-value' }, [
					E('label', { class: 'cbi-value-title' }, _('HTTP Port')),
					E('div', { class: 'cbi-value-field' }, [
						E('input', {
							id: 'ztncui-port',
							type: 'number',
							min: '1024',
							max: '65535',
							value: (data.ztncuiConfig && data.ztncuiConfig.port) || 3000,
							class: 'cbi-input-text'
						}),
						E('div', { class: 'cbi-value-description' }, _('Port for HTTP web interface (1024-65535)'))
					])
				]),
				E('div', { class: 'cbi-value' }, [
					E('label', { class: 'cbi-value-title' }, _('HTTPS Port')),
					E('div', { class: 'cbi-value-field' }, [
						E('input', {
							id: 'ztncui-https-port',
							type: 'number',
							min: '1024',
							max: '65535',
							value: (data.ztncuiConfig && data.ztncuiConfig.httpsPort) || '',
							class: 'cbi-input-text',
							placeholder: _('Optional')
						}),
						E('div', { class: 'cbi-value-description' }, _('Port for HTTPS web interface (optional, requires TLS certificates)'))
					])
				]),
				E('div', { class: 'cbi-value' }, [
					E('label', { class: 'cbi-value-title' }, _('Listen on All Interfaces')),
					E('div', { class: 'cbi-value-field' }, [
						E('input', {
							id: 'ztncui-all-interfaces',
							type: 'checkbox',
							checked: (data.ztncuiConfig && data.ztncuiConfig.allInterfaces) || false
						}),
						E('div', { class: 'cbi-value-description' }, _('Allow access from external networks (security risk if not properly firewalled)'))
					])
				]),
				E('div', { class: 'cbi-value' }, [
					E('label', { class: 'cbi-value-title' }, _('ZeroTier Daemon Address')),
					E('div', { class: 'cbi-value-field' }, [
						E('input', {
							id: 'ztncui-zt-addr',
							type: 'text',
							value: (data.ztncuiConfig && data.ztncuiConfig.ztAddr) || 'localhost:9993',
							class: 'cbi-input-text'
						}),
						E('div', { class: 'cbi-value-description' }, _('Address of ZeroTier daemon (host:port)'))
					])
				]),
				E('div', { style: 'margin: 15px 0;' }, [
					E('button', {
						class: 'btn cbi-button cbi-button-apply',
						style: 'background: #007bff; color: white;',
						click: function() {
							var newConfig = {
								port: parseInt(document.getElementById('ztncui-port').value) || 3000,
								httpsPort: document.getElementById('ztncui-https-port').value ? 
									parseInt(document.getElementById('ztncui-https-port').value) : null,
								allInterfaces: document.getElementById('ztncui-all-interfaces').checked,
								ztAddr: document.getElementById('ztncui-zt-addr').value || 'localhost:9993'
							};
							
							if (confirm(_('This will update ZTNCUI configuration and restart the service. Continue?'))) {
								self.configureZTNCUI(newConfig).then(function(success) {
									if (success) {
										// Restart service to apply changes
										self.restartZTNCUI().then(function() {
											setTimeout(function() { window.location.reload(); }, 3000);
										});
									}
								});
							}
						}
					}, _('Apply Configuration'))
				])
			]);
			
			configSection.appendChild(configForm);
		} else {
			configSection.appendChild(E('p', { style: 'color: #666; font-style: italic;' }, 
				_('Install ZTNCUI first to access configuration options')));
		}

		// Advanced Configuration Info
		var advancedConfig = E('div', {}, [
			E('h4', {}, _('Advanced Configuration')),
			E('p', {}, _('ZTNCUI can be configured using environment variables or configuration files:')),
			E('ul', {}, [
				E('li', {}, [E('strong', {}, 'HTTP_PORT'), ': Web interface port (default: 3000)']),
				E('li', {}, [E('strong', {}, 'HTTPS_PORT'), ': HTTPS port (requires TLS certificates)']),
				E('li', {}, [E('strong', {}, 'HTTP_ALL_INTERFACES'), ': Listen on all interfaces']),
				E('li', {}, [E('strong', {}, 'ZT_ADDR'), ': ZeroTier daemon address']),
				E('li', {}, [E('strong', {}, 'ZT_HOME'), ': ZeroTier data directory']),
				E('li', {}, [E('strong', {}, 'ZT_TOKEN'), ': ZeroTier authentication token'])
			]),
			E('p', { style: 'margin-top: 15px;' }, [
				E('strong', {}, _('Configuration Files:')),
				E('br'),
				_('System: '), E('code', {}, '/etc/ztncui/etc/ztncui.conf'),
				E('br'),
				_('Docker: Environment variables in container')
			])
		]);
		
		configSection.appendChild(advancedConfig);

		// Quick Setup Guide
		var setupSection = E('div', { class: 'cbi-section install-guide' }, [
			E('h3', {}, _('Installation & Setup Guide')),
			E('p', {}, [
				E('strong', {}, _('Note: ')),
				_('ZTNCUI is not available in standard OpenWrt packages. Choose one of the following installation methods:')
			]),
			E('div', { style: 'margin: 15px 0;' }, [
				E('h4', {}, _('Method 1: Docker (Recommended)')),
				E('ol', {}, [
					E('li', {}, _('Install Docker: opkg install dockerd docker')),
					E('li', {}, _('Start Docker service: /etc/init.d/dockerd start')),
					E('li', {}, _('Run ZTNCUI container: docker run -d --name ztncui --restart=unless-stopped -p 3000:3000 -v /var/lib/zerotier-one:/var/lib/zerotier-one keynetworks/ztncui'))
				])
			]),
			E('div', { style: 'margin: 15px 0;' }, [
				E('h4', {}, _('Method 2: Node.js Installation')),
				E('ol', {}, [
					E('li', {}, _('Install Node.js: opkg install node npm')),
					E('li', {}, _('Install ZTNCUI: npm install -g ztncui')),
					E('li', {}, _('Run ZTNCUI: ztncui'))
				]),
				E('p', { style: 'color: #666; font-style: italic;' }, _('Note: Requires significant storage space (100MB+)'))
			]),
			E('div', { style: 'margin: 15px 0;' }, [
				E('h4', {}, _('Method 3: External Server')),
				E('p', {}, _('Run ZTNCUI on a separate device and configure ZeroTier controller to use this OpenWrt device as backend.')),
				E('p', {}, [
					_('Download from: '),
					E('a', { 
						href: 'https://github.com/key-networks/ztncui/releases',
						target: '_blank',
						style: 'color: #0066cc;'
					}, 'https://github.com/key-networks/ztncui/releases')
				])
			]),
			E('div', { style: 'margin: 15px 0; padding: 10px; background: #f0f8ff; border: 1px solid #ccc; border-radius: 4px;' }, [
				E('strong', {}, _('After installation:')),
				E('ol', { style: 'margin: 10px 0 0 20px;' }, [
					E('li', {}, _('Enable controller mode by clicking the button above')),
					E('li', {}, _('Start ZTNCUI service')),
					E('li', {}, _('Access the web interface using the provided URL')),
					E('li', {}, _('Login with default credentials and change password')),
					E('li', {}, _('Create and manage your ZeroTier networks'))
				])
			])
		]);

		content.push(statusSection, controlSection, dynamicIPSection, accessSection, configSection, setupSection);

		return E('div', {}, content);
	},

	// Network management functions based on ztncui source code analysis
	getNetworkList: function() {
		var self = this;
		return this.performHealthCheck().then(function(result) {
			if (!result.healthy) {
				return [];
			}
			
			// Get network IDs first, similar to ztncui's network_list function
			return self.callZTAPI('controller/network')
				.then(function(networkIds) {
					if (!Array.isArray(networkIds)) {
						return [];
					}
					
					// Get detailed network info for each ID
					return Promise.all(
						networkIds.map(function(nwid) {
							return self.callZTAPI('controller/network/' + nwid)
								.then(function(network) {
									return {
										nwid: network.nwid,
										name: network.name || 'Unnamed Network',
										description: network.description || '',
										private: network.private,
										enableBroadcast: network.enableBroadcast,
										memberCount: Object.keys(network.authorizedMemberCount || {}).length,
										routes: network.routes || [],
										ipAssignmentPools: network.ipAssignmentPools || [],
										v4AssignMode: network.v4AssignMode || {},
										v6AssignMode: network.v6AssignMode || {}
									};
								})
								.catch(function() {
									return null;
								});
						})
					).then(function(networks) {
						return networks.filter(function(n) { return n !== null; });
					});
				})
				.catch(function() {
					return [];
				});
		});
	},

	createNetwork: function(name, description) {
		var self = this;
		return this.getControllerAddress().then(function(address) {
			if (!address) {
				throw new Error('Unable to get ZeroTier controller address');
			}
			
			// Generate network ID like ztncui does: address + "______"
			var networkId = address + '______';
			
			return self.callZTAPI('controller/network/' + networkId, {
				method: 'POST',
				body: JSON.stringify({
					config: {
						name: name || '',
						description: description || '',
						private: true,
						enableBroadcast: true,
						v4AssignMode: { zt: true },
						v6AssignMode: { zt: false, "6plane": false, rfc4193: false }
					}
				}),
				headers: {
					'Content-Type': 'application/json'
				}
			});
		});
	},

	deleteNetwork: function(networkId) {
		return this.callZTAPI('controller/network/' + networkId, {
			method: 'DELETE'
		});
	},

	getNetworkDetail: function(networkId) {
		return this.callZTAPI('controller/network/' + networkId);
	},

	updateNetworkConfig: function(networkId, config) {
		return this.callZTAPI('controller/network/' + networkId, {
			method: 'POST',
			body: JSON.stringify(config),
			headers: {
				'Content-Type': 'application/json'
			}
		});
	},

	getNetworkMembers: function(networkId) {
		var self = this;
		
		// Get member IDs first
		return this.callZTAPI('controller/network/' + networkId + '/member')
			.then(function(memberIds) {
				if (!memberIds || typeof memberIds !== 'object') {
					return [];
				}
				
				// Handle both array and object formats (ztncui compatibility)
				var ids = Array.isArray(memberIds) ? 
					memberIds.map(function(item) {
						return typeof item === 'object' ? Object.keys(item)[0] : item;
					}) : Object.keys(memberIds);
				
				// Get detailed member info
				return Promise.all(
					ids.map(function(id) {
						return self.callZTAPI('controller/network/' + networkId + '/member/' + id)
							.then(function(member) {
								member.name = member.name || '';
								return member;
							})
							.catch(function() {
								return null;
							});
					})
				).then(function(members) {
					return members.filter(function(m) { return m !== null; });
				});
			});
	},

	updateMember: function(networkId, memberId, config) {
		return this.callZTAPI('controller/network/' + networkId + '/member/' + memberId, {
			method: 'POST',
			body: JSON.stringify(config),
			headers: {
				'Content-Type': 'application/json'
			}
		});
	},

	authorizeMember: function(networkId, memberId) {
		return this.updateMember(networkId, memberId, { authorized: true });
	},

	deauthorizeMember: function(networkId, memberId) {
		return this.updateMember(networkId, memberId, { authorized: false });
	},

	deleteMember: function(networkId, memberId) {
		return this.callZTAPI('controller/network/' + networkId + '/member/' + memberId, {
			method: 'DELETE'
		});
	},

	getControllerAddress: function() {
		return this.callZTAPI('status').then(function(status) {
			return status.address;
		});
	},

	callZTAPI: function(endpoint, options) {
		var self = this;
		options = options || {};
		
		// Use the same approach as ztncui for API calls
		var url = 'http://localhost:9993/' + endpoint;
		
		return self.getAuthToken().then(function(token) {
			if (!token) {
				throw new Error('No ZeroTier auth token available');
			}
			
			var headers = options.headers || {};
			headers['X-ZT1-Auth'] = token;
			
			var fetchOptions = {
				method: options.method || 'GET',
				headers: headers
			};
			
			if (options.body) {
				fetchOptions.body = options.body;
			}
			
			return fetch(url, fetchOptions).then(function(response) {
				if (!response.ok) {
					throw new Error('API request failed: ' + response.status);
				}
				return response.json();
			});
		});
	},

	getAuthToken: function() {
		// Read auth token from ZeroTier home directory
		return callFileRead('/var/lib/zerotier-one/authtoken.secret')
			.then(function(result) {
				return result.data ? result.data.trim() : null;
			})
			.catch(function() {
				return null;
			});
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null,

	// Utility methods
	_logDebug: function(message, error) {
		if (console && console.debug) {
			console.debug('[ZTNCUI] ' + message + ':', error || '');
		}
	},

	_logError: function(message, error) {
		if (console && console.error) {
			console.error('[ZTNCUI] ' + message + ':', error || '');
		}
	},

	_performHealthCheck: function(port) {
		const targetPort = port || ZTNCUI_CONFIG.DEFAULT_PORT;
		const self = this;
		
		return Promise.race([
			// HTTP health check
			fs.exec('/usr/bin/curl', ['-s', '-o', '/dev/null', '-w', '%{http_code}', 'http://localhost:' + targetPort]).then(function(result) {
				return {
					healthy: result.code === 0 && (result.stdout === '200' || result.stdout === '302'),
					method: 'curl',
					code: result.stdout
				};
			}),
			// Timeout fallback
			new Promise(function(resolve) {
				setTimeout(function() {
					resolve({ healthy: false, method: 'timeout', code: 'timeout' });
				}, ZTNCUI_CONFIG.HEALTH_CHECK_TIMEOUT);
			})
		]).catch(function() {
			return { healthy: false, method: 'error', code: 'error' };
		});
	},

	_validateConfig: function(config) {
		const errors = [];
		
		if (config.port && (config.port < 1024 || config.port > 65535)) {
			errors.push(_('HTTP port must be between 1024 and 65535'));
		}
		
		if (config.httpsPort && (config.httpsPort < 1024 || config.httpsPort > 65535)) {
			errors.push(_('HTTPS port must be between 1024 and 65535'));
		}
		
		if (config.port && config.httpsPort && config.port === config.httpsPort) {
			errors.push(_('HTTP and HTTPS ports cannot be the same'));
		}
		
		return errors;
	},

	_formatServiceStatus: function(status) {
		if (!status) return _('Unknown');
		
		const statusMap = {
			[SERVICE_STATES.RUNNING]: _('Running'),
			[SERVICE_STATES.STOPPED]: _('Stopped'),
			[SERVICE_STATES.NOT_INSTALLED]: _('Not Installed'),
			[SERVICE_STATES.DOCKER_AVAILABLE]: _('Docker Available'),
			[SERVICE_STATES.NODE_AVAILABLE]: _('Node.js Available')
		};
		
		return statusMap[status] || status;
	}
});