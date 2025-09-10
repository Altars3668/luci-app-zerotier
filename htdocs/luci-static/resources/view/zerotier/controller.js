/* SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright (C) 2022 ImmortalWrt.org
 */

'use strict';
'require fs';
'require ui';
'require view';
'require form';
'require rpc';
'require uci';

const callServiceList = rpc.declare({
	object: 'service',
	method: 'list',
	params: ['name'],
	expect: { '': {} }
});

return view.extend({
	load: function() {
		return Promise.all([
			this.getZTNCUIStatus(),
			this.getControllerInfo(),
			uci.load('zerotier')
		]).then(function(results) {
			return {
				ztncuiStatus: results[0],
				controllerInfo: results[1],
				config: results[2]
			};
		});
	},

	getZTNCUIStatus: function() {
		// Check multiple installation methods
		return Promise.all([
			// Check system service
			L.resolveDefault(callServiceList('ztncui'), {}),
			// Check Docker container
			fs.exec('/usr/bin/docker', ['ps', '--format', 'table {{.Names}}', '--filter', 'name=ztncui']).catch(function() {
				return { code: 1, stdout: '' };
			}),
			// Check if ztncui binary exists
			fs.exec('/usr/bin/which', ['ztncui']).catch(function() {
				return { code: 1, stdout: '' };
			})
		]).then(function(results) {
			var serviceResult = results[0];
			var dockerResult = results[1];
			var binaryResult = results[2];
			
			var status = {
				isRunning: false,
				method: 'not_installed',
				details: ''
			};
			
			// Check system service
			try {
				if (serviceResult['ztncui'] && serviceResult['ztncui']['instances']['instance1']['running']) {
					status.isRunning = true;
					status.method = 'service';
					status.details = 'Running as system service';
					return status;
				}
			} catch (e) { }
			
			// Check Docker container
			if (dockerResult.code === 0 && dockerResult.stdout.includes('ztncui')) {
				status.isRunning = true;
				status.method = 'docker';
				status.details = 'Running in Docker container';
				return status;
			}
			
			// Check binary installation
			if (binaryResult.code === 0) {
				// Binary exists, check if running
				return fs.exec('/bin/pgrep', ['-f', 'ztncui']).then(function(pResult) {
					if (pResult.code === 0) {
						status.isRunning = true;
						status.method = 'binary';
						status.details = 'Running as binary process';
					} else {
						status.method = 'binary';
						status.details = 'Binary installed but not running';
					}
					return status;
				}).catch(function() {
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
			}).catch(function() {
				status.method = 'not_installed';
				status.details = 'ZTNCUI not installed';
				return status;
			});
		});
	},

	getControllerInfo: function() {
		return fs.exec('/usr/bin/zerotier-cli', ['info']).then(function(res) {
			if (res.code !== 0) {
				return { error: res.stderr || 'Failed to get ZeroTier info' };
			}
			
			var info = {};
			var lines = res.stdout.trim().split('\n');
			if (lines.length > 0) {
				var parts = lines[0].split(' ');
				if (parts.length >= 3) {
					info.nodeId = parts[2];
					info.status = parts[0];
					info.version = parts[1];
				}
			}
			return info;
		}).catch(function(err) {
			return { error: err.message };
		});
	},

	startZTNCUI: function() {
		return fs.exec('/etc/init.d/ztncui', ['start']).then(function(res) {
			if (res.code !== 0) {
				ui.addNotification(null, E('p', {}, _('Failed to start ZTNCUI: %s').format(res.stderr || 'Unknown error')), 'error');
				return false;
			}
			
			ui.addNotification(null, E('p', {}, _('ZTNCUI started successfully!')), 'info');
			return true;
		}).catch(function(err) {
			ui.addNotification(null, E('p', {}, _('Failed to start ZTNCUI: %s').format(err.message)), 'error');
			return false;
		});
	},

	stopZTNCUI: function() {
		return fs.exec('/etc/init.d/ztncui', ['stop']).then(function(res) {
			if (res.code !== 0) {
				ui.addNotification(null, E('p', {}, _('Failed to stop ZTNCUI: %s').format(res.stderr || 'Unknown error')), 'error');
				return false;
			}
			
			ui.addNotification(null, E('p', {}, _('ZTNCUI stopped successfully!')), 'info');
			return true;
		}).catch(function(err) {
			ui.addNotification(null, E('p', {}, _('Failed to stop ZTNCUI: %s').format(err.message)), 'error');
			return false;
		});
	},

	restartZTNCUI: function() {
		return fs.exec('/etc/init.d/ztncui', ['restart']).then(function(res) {
			if (res.code !== 0) {
				ui.addNotification(null, E('p', {}, _('Failed to restart ZTNCUI: %s').format(res.stderr || 'Unknown error')), 'error');
				return false;
			}
			
			ui.addNotification(null, E('p', {}, _('ZTNCUI restarted successfully!')), 'info');
			return true;
		}).catch(function(err) {
			ui.addNotification(null, E('p', {}, _('Failed to restart ZTNCUI: %s').format(err.message)), 'error');
			return false;
		});
	},

	enableController: function() {
		return fs.exec('/usr/bin/zerotier-cli', ['set', 'allowTcpFallbackRelay=1']).then(function(res) {
			return fs.exec('/usr/bin/zerotier-cli', ['set', 'allowDefaultCentrality=1']);
		}).then(function(res) {
			if (res.code !== 0) {
				ui.addNotification(null, E('p', {}, _('Failed to enable controller mode: %s').format(res.stderr || 'Unknown error')), 'error');
				return false;
			}
			
			ui.addNotification(null, E('p', {}, _('Controller mode enabled successfully!')), 'info');
			return true;
		}).catch(function(err) {
			ui.addNotification(null, E('p', {}, _('Failed to enable controller mode: %s').format(err.message)), 'error');
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
			style: data.ztncuiStatus.isRunning ? 'color: green; font-weight: bold;' : 'color: red; font-weight: bold;'
		}, data.ztncuiStatus.isRunning ? _('Running') : _('Stopped'));

		var methodSpan = E('span', { 
			style: 'margin-left: 10px; font-size: 0.9em; color: #666;' 
		}, '(' + (data.ztncuiStatus.details || 'Unknown') + ')');

		var statusTable = E('table', { class: 'table' }, [
			E('tr', { class: 'tr' }, [
				E('td', { class: 'td left', width: '25%' }, _('ZTNCUI Status')),
				E('td', { class: 'td left' }, [ztncuiStatusSpan, methodSpan])
			])
		]);

		if (data.controllerInfo && !data.controllerInfo.error) {
			statusTable.appendChild(E('tr', { class: 'tr' }, [
				E('td', { class: 'td left' }, _('Node ID')),
				E('td', { class: 'td left' }, data.controllerInfo.nodeId || _('Unknown'))
			]));
			
			statusTable.appendChild(E('tr', { class: 'tr' }, [
				E('td', { class: 'td left' }, _('ZeroTier Status')),
				E('td', { class: 'td left' }, data.controllerInfo.status || _('Unknown'))
			]));
		}

		statusSection.appendChild(statusTable);

		// Service Control Section
		var controlSection = E('div', { class: 'cbi-section' }, [
			E('h3', {}, _('Service Control')),
			E('p', {}, _('Control the ZTNCUI service and ZeroTier controller functionality.'))
		]);

		var buttonContainer = E('div', { style: 'margin: 10px 0;' });

		// Add installation button if not installed
		if (data.ztncuiStatus.method === 'not_installed') {
			buttonContainer.appendChild(E('div', { 
				style: 'padding: 10px; background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 4px; margin-bottom: 10px;' 
			}, [
				E('strong', {}, _('ZTNCUI Not Installed')),
				E('p', { style: 'margin: 5px 0 0 0;' }, _('Please install ZTNCUI using one of the methods described below.'))
			]));
		} else if (data.ztncuiStatus.method === 'docker_available') {
			buttonContainer.appendChild(E('div', { 
				style: 'padding: 10px; background: #d1ecf1; border: 1px solid #bee5eb; border-radius: 4px; margin-bottom: 10px;' 
			}, [
				E('strong', {}, _('Docker Available')),
				E('p', { style: 'margin: 5px 0 0 0;' }, _('You can install ZTNCUI using Docker. See installation guide below.'))
			]));
		}

		if (data.ztncuiStatus.isRunning) {
			buttonContainer.appendChild(E('button', {
				class: 'btn cbi-button cbi-button-negative',
				style: 'margin-right: 10px;',
				click: function() {
					self.stopZTNCUI().then(function(success) {
						if (success) {
							setTimeout(function() { window.location.reload(); }, 1000);
						}
					});
				}
			}, _('Stop ZTNCUI')));

			buttonContainer.appendChild(E('button', {
				class: 'btn cbi-button cbi-button-apply',
				style: 'margin-right: 10px;',
				click: function() {
					self.restartZTNCUI().then(function(success) {
						if (success) {
							setTimeout(function() { window.location.reload(); }, 2000);
						}
					});
				}
			}, _('Restart ZTNCUI')));
		} else if (data.ztncuiStatus.method !== 'not_installed') {
			buttonContainer.appendChild(E('button', {
				class: 'btn cbi-button cbi-button-positive',
				style: 'margin-right: 10px;',
				click: function() {
					self.startZTNCUI().then(function(success) {
						if (success) {
							setTimeout(function() { window.location.reload(); }, 2000);
						}
					});
				}
			}, _('Start ZTNCUI')));
		}

		// Always show controller mode button
		buttonContainer.appendChild(E('button', {
			class: 'btn cbi-button cbi-button-apply',
			style: 'margin-right: 10px;',
			click: function() {
				self.enableController().then(function(success) {
					if (success) {
						window.location.reload();
					}
				});
			}
		}, _('Enable Controller Mode')));

		controlSection.appendChild(buttonContainer);

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
			E('h3', {}, _('Configuration')),
			E('p', {}, _('ZTNCUI configuration can be modified in /etc/ztncui/etc/ztncui.conf')),
		]);

		var configInfo = E('div', {}, [
			E('h4', {}, _('Key Configuration Options:')),
			E('ul', {}, [
				E('li', {}, _('HTTP_PORT: Web interface port (default: 3000)')),
				E('li', {}, _('ZT_HOME: ZeroTier data directory')),
				E('li', {}, _('ZT_ADDR: ZeroTier daemon address')),
				E('li', {}, _('HTTP_ALL_INTERFACES: Listen on all interfaces'))
			]),
			E('p', { style: 'margin-top: 15px;' }, [
				E('strong', {}, _('Note: ')),
				_('Restart ZTNCUI service after modifying configuration.')
			])
		]);

		configSection.appendChild(configInfo);

		// Quick Setup Guide
		var setupSection = E('div', { class: 'cbi-section' }, [
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

		content.push(statusSection, controlSection, accessSection, configSection, setupSection);

		return E('div', {}, content);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});