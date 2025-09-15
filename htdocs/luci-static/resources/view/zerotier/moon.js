/* SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright (C) 2022 ImmortalWrt.org
 * Enhanced ZeroTier Moon Node Management
 * 
 * Features:
 * - Moon node creation and management
 * - Network connectivity optimization
 * - Real-time status monitoring
 * - Improved error handling
 * - Input validation
 */

'use strict';
'require fs';
'require ui';
'require view';
'require form';
'require rpc';
'require view.zerotier.dynamic-ip as DynamicIP';

// Moon management constants
const MOON_CONFIG = {
	DEFAULT_PORT: 9993,
	MIN_PORT: 1,
	MAX_PORT: 65535,
	MOON_ID_LENGTH: 10,
	IP_REGEX: /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/,
	HOSTNAME_REGEX: /^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?))*$/,
	AUTO_UPDATE_INTERVAL: 300000, // 5 minutes
	MOON_CONFIG_PATH: '/var/lib/zerotier-one/moons.d'
};

const callExec = rpc.declare({
	object: 'file',
	method: 'exec',
	params: ['command', 'args'],
	expect: { code: 0 }
});

return view.extend({
	// Initialize dynamic IP manager
	init: function() {
		this.dynamicIPManager = DynamicIP.dynamicIPManager;
		this.currentMoonIPs = new Map(); // Track current moon IPs
		this.moonUpdateTimers = new Map(); // Track update timers
		
		// Register for IP change notifications
		this.dynamicIPManager.onIPChange(this.handleIPChange.bind(this));
	},

	load: function() {
		// Initialize if not already done
		if (!this.dynamicIPManager) {
			this.init();
		}
		
		return Promise.all([
			this.loadMoonInfo(),
			this.loadIdentity(),
			this.loadMoonsList(),
			this.dynamicIPManager.updateCurrentIPs()
		]).then(function(results) {
			return {
				moonInfo: results[0],
				identity: results[1],
				moonsList: results[2],
				currentIPs: results[3]
			};
		});
	},

	// Handle IP address changes
	handleIPChange: function(ipInfo) {
		const self = this;
		console.log('IP changed:', ipInfo);
		
		// Update all moons that are configured for dynamic IP
		this.currentMoonIPs.forEach(function(moonInfo, moonId) {
			if (moonInfo.dynamicIP) {
				self.updateMoonIP(moonId, ipInfo.ipv4, moonInfo.port);
			}
		});
		
		// Update UI if visible
		if (this.currentIPDisplay) {
			this.updateIPDisplay(ipInfo);
		}
	},

	// Update Moon IP address
	updateMoonIP: function(moonId, newIP, port) {
		if (!newIP) return;
		
		const self = this;
		console.log(`Updating Moon ${moonId} IP to ${newIP}:${port}`);
		
		// First leave the old moon
		return this.deleteMoon(moonId).then(function(success) {
			if (success) {
				// Create new moon with updated IP
				return self.createMoon(newIP, port, true).then(function(newMoonId) {
					if (newMoonId) {
						// Update tracking
						const moonInfo = self.currentMoonIPs.get(moonId);
						if (moonInfo) {
							moonInfo.ip = newIP;
							moonInfo.lastUpdate = new Date();
							self.currentMoonIPs.set(newMoonId, moonInfo);
							self.currentMoonIPs.delete(moonId);
						}
						
						ui.addNotification(null, E('p', {}, _('Moon %s IP updated to %s').format(newMoonId, newIP)), 'info');
						return newMoonId;
					}
				});
			}
		}).catch(function(err) {
			console.error('Failed to update Moon IP:', err);
			ui.addNotification(null, E('p', {}, _('Failed to update Moon IP: %s').format(err.message)), 'error');
		});
	},

	// Enable dynamic IP for a moon
	enableDynamicIP: function(moonId, ip, port) {
		this.currentMoonIPs.set(moonId, {
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

	// Disable dynamic IP for a moon
	disableDynamicIP: function(moonId) {
		const moonInfo = this.currentMoonIPs.get(moonId);
		if (moonInfo) {
			moonInfo.dynamicIP = false;
		}
	},

	// Auto-detect current public IP
	// Update IP display in UI
	updateIPDisplay: function(ipInfo) {
		if (!this.currentIPDisplay) return;
		
		const currentIPv4 = ipInfo && ipInfo.ipv4 ? ipInfo.ipv4 : _('Not detected');
		const currentIPv6 = ipInfo && ipInfo.ipv6 ? ipInfo.ipv6 : _('Not detected');
		const lastUpdate = ipInfo && ipInfo.timestamp ? 
			ipInfo.timestamp.toLocaleString() : _('Never');
		
		this.currentIPDisplay.innerHTML = '';
		this.currentIPDisplay.appendChild(E('div', { class: 'cbi-value-title' }, _('Current Public IP Addresses')));
		this.currentIPDisplay.appendChild(E('div', { class: 'cbi-value-field' }, [
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

	autoDetectIP: function() {
		const self = this;
		const loadingNotification = ui.showModal(_('Detecting Public IP'), [
			E('p', { class: 'spinning' }, _('Please wait, detecting your public IP address...'))
		]);
		
		return this.dynamicIPManager.detectIPv4().then(function(ip) {
			ui.hideModal();
			ui.addNotification(null, E('p', {}, _('Detected public IP: %s').format(ip)), 'info');
			return ip;
		}).catch(function(err) {
			ui.hideModal();
			ui.addNotification(null, E('p', {}, _('Failed to detect public IP: %s').format(err.message)), 'error');
			return null;
		});
	},

	loadMoonInfo: function() {
		return fs.exec('/usr/bin/zerotier-moon', ['info']).then(function(res) {
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

	loadIdentity: function() {
		return fs.read('/var/lib/zerotier-one/identity.public').then(function(content) {
			if (!content) return null;
			var parts = content.trim().split(':');
			return {
				nodeId: parts[0],
				publicKey: parts[1]
			};
		}).catch(function(err) {
			return null;
		});
	},

	loadMoonsList: function() {
		return fs.exec('/usr/bin/zerotier-moon', ['list']).then(function(res) {
			if (res.code !== 0) {
				return [];
			}
			
			var moons = [];
			var lines = res.stdout.trim().split('\n');
			lines.forEach(function(line) {
				if (line && line !== 'OK') {
					var parts = line.split(' ');
					if (parts.length >= 2) {
						moons.push({
							id: parts[0],
							address: parts.slice(1).join(' ')
						});
					}
				}
			});
			return moons;
		}).catch(function(err) {
			return [];
		});
	},

	createMoon: function(publicIp, publicPort, isDynamicUpdate) {
		const self = this;
		
		// Input validation
		if (!publicIp || publicIp.trim() === '') {
			ui.addNotification(null, E('p', {}, _('Public IP address is required')), 'error');
			return Promise.resolve(false);
		}
		
		publicIp = publicIp.trim();
		
		// Validate IP address or hostname
		if (!MOON_CONFIG.IP_REGEX.test(publicIp) && !MOON_CONFIG.HOSTNAME_REGEX.test(publicIp)) {
			ui.addNotification(null, E('p', {}, _('Invalid IP address or hostname format')), 'error');
			return Promise.resolve(false);
		}
		
		// Validate port
		if (publicPort) {
			const port = parseInt(publicPort);
			if (isNaN(port) || port < MOON_CONFIG.MIN_PORT || port > MOON_CONFIG.MAX_PORT) {
				ui.addNotification(null, E('p', {}, _('Port must be between %d and %d').format(MOON_CONFIG.MIN_PORT, MOON_CONFIG.MAX_PORT)), 'error');
				return Promise.resolve(false);
			}
		}
		
		const args = ['create', publicIp];
		if (publicPort && publicPort.trim() !== '') {
			args.push(publicPort.trim());
		}
		
		// Show loading notification (unless it's a dynamic update)
		let loadingNotification;
		if (!isDynamicUpdate) {
			loadingNotification = ui.showModal(_('Creating Moon Node'), [
				E('p', { class: 'spinning' }, _('Please wait, this may take a moment...'))
			]);
		}
		
		return fs.exec('/usr/bin/zerotier-moon', args).then(function(res) {
			if (loadingNotification) ui.hideModal();
			
			if (res.code !== 0) {
				const errorMsg = res.stderr || res.stdout || _('Unknown error');
				ui.addNotification(null, E('p', {}, _('Failed to create moon: %s').format(errorMsg)), 'error');
				return false;
			}
			
			// Parse moon ID from output if available
			let moonId = null;
			if (res.stdout) {
				const moonIdMatch = res.stdout.match(/([0-9a-fA-F]{10})/);
				if (moonIdMatch) {
					moonId = moonIdMatch[1];
				}
			}
			
			const successMsg = moonId ? 
				_('Moon created successfully! Moon ID: %s').format(moonId) :
				_('Moon created successfully!');
				
			if (!isDynamicUpdate) {
				ui.addNotification(null, E('p', {}, successMsg), 'info');
			}
			
			return moonId || true;
		}).catch(function(err) {
			if (loadingNotification) ui.hideModal();
			self._logError('Moon creation failed', err);
			ui.addNotification(null, E('p', {}, _('Failed to create moon: %s').format(err.message)), 'error');
			return false;
		});
	},

	deleteMoon: function(moonId) {
		return fs.exec('/usr/bin/zerotier-moon', ['leave', moonId]).then(function(res) {
			if (res.code !== 0) {
				ui.addNotification(null, E('p', {}, _('Failed to leave moon: %s').format(res.stderr || 'Unknown error')), 'error');
				return false;
			}
			
			ui.addNotification(null, E('p', {}, _('Left moon successfully!')), 'info');
			return true;
		}).catch(function(err) {
			ui.addNotification(null, E('p', {}, _('Failed to leave moon: %s').format(err.message)), 'error');
			return false;
		});
	},

	joinMoon: function(moonId) {
		return fs.exec('/usr/bin/zerotier-moon', ['join', moonId]).then(function(res) {
			if (res.code !== 0) {
				ui.addNotification(null, E('p', {}, _('Failed to join moon: %s').format(res.stderr || 'Unknown error')), 'error');
				return false;
			}
			
			ui.addNotification(null, E('p', {}, _('Joined moon successfully!')), 'info');
			return true;
		}).catch(function(err) {
			ui.addNotification(null, E('p', {}, _('Failed to join moon: %s').format(err.message)), 'error');
			return false;
		});
	},

	render: function(data) {
		var self = this;
		var title = E('h2', {class: 'content'}, _('ZeroTier Moon Manager'));
		var desc = E('div', {class: 'cbi-map-descr'}, _('Manage ZeroTier Moon nodes for better connectivity and performance.'));

		var content = [title, desc];

		// Node Info Section
		var nodeInfoSection = E('div', { class: 'cbi-section' }, [
			E('h3', {}, _('Node Information')),
		]);

		if (data.moonInfo && !data.moonInfo.error) {
			var infoTable = E('table', { class: 'table' }, [
				E('tr', { class: 'tr' }, [
					E('td', { class: 'td left', width: '25%' }, _('Node ID')),
					E('td', { class: 'td left' }, data.moonInfo.nodeId || _('Unknown'))
				]),
				E('tr', { class: 'tr' }, [
					E('td', { class: 'td left' }, _('Status')),
					E('td', { class: 'td left' }, data.moonInfo.status || _('Unknown'))
				]),
				E('tr', { class: 'tr' }, [
					E('td', { class: 'td left' }, _('Version')),
					E('td', { class: 'td left' }, data.moonInfo.version || _('Unknown'))
				])
			]);
			nodeInfoSection.appendChild(infoTable);
		} else {
			nodeInfoSection.appendChild(E('p', {}, _('Unable to get node information: %s').format(
				data.moonInfo ? data.moonInfo.error : 'ZeroTier not running')));
		}

		// Moon Creation Section
		var moonCreateSection = E('div', { class: 'cbi-section' }, [
			E('h3', {}, _('Create Moon Node')),
			E('p', {}, _('Create a moon node to improve network connectivity. This node will act as a relay for other ZeroTier nodes.')),
		]);

		// Dynamic IP Status Display
		var ipStatusDiv = E('div', { class: 'cbi-value', style: 'margin-bottom: 15px;' });
		this.currentIPDisplay = ipStatusDiv;
		this.updateIPDisplay(data.currentIPs);

		var publicIpInput = E('input', {
			type: 'text',
			class: 'cbi-input-text',
			placeholder: _('Enter public IP address or use auto-detect'),
			style: 'margin-right: 10px; margin-bottom: 10px; width: 250px;'
		});

		var autoDetectButton = E('button', {
			class: 'btn cbi-button cbi-button-action',
			style: 'margin-right: 10px; margin-bottom: 10px;',
			click: function() {
				self.autoDetectIP().then(function(ip) {
					if (ip) {
						publicIpInput.value = ip;
					}
				});
			}
		}, _('Auto-Detect IP'));

		var publicPortInput = E('input', {
			type: 'number',
			class: 'cbi-input-text',
			placeholder: _('Port (default: 9993)'),
			value: '9993',
			min: '1',
			max: '65535',
			style: 'margin-right: 10px; margin-bottom: 10px; width: 150px;'
		});

		var dynamicIPCheckbox = E('input', {
			type: 'checkbox',
			id: 'dynamic-ip-checkbox',
			style: 'margin-right: 5px;'
		});

		var dynamicIPLabel = E('label', {
			for: 'dynamic-ip-checkbox',
			style: 'margin-right: 15px; margin-bottom: 10px; display: inline-block;'
		}, [dynamicIPCheckbox, _('Enable Dynamic IP Updates')]);

		var createButton = E('button', {
			class: 'btn cbi-button cbi-button-add',
			style: 'margin-bottom: 10px;',
			click: function() {
				var publicIp = publicIpInput.value.trim();
				var publicPort = publicPortInput.value.trim();
				var enableDynamic = dynamicIPCheckbox.checked;
				
				if (!publicIp) {
					ui.addNotification(null, E('p', {}, _('Please enter a public IP address or use auto-detect')), 'error');
					return;
				}
				
				self.createMoon(publicIp, publicPort).then(function(moonId) {
					if (moonId && moonId !== true) {
						// Enable dynamic IP if requested
						if (enableDynamic) {
							self.enableDynamicIP(moonId, publicIp, publicPort || MOON_CONFIG.DEFAULT_PORT);
							ui.addNotification(null, E('p', {}, _('Dynamic IP monitoring enabled for Moon %s').format(moonId)), 'info');
						}
						
						publicIpInput.value = '';
						publicPortInput.value = '9993';
						dynamicIPCheckbox.checked = false;
						window.location.reload();
					}
				});
			}
		}, _('Create Moon'));

		moonCreateSection.appendChild(ipStatusDiv);
		moonCreateSection.appendChild(E('div', {}, [
			E('div', { style: 'margin-bottom: 10px;' }, [
				E('label', { style: 'display: block; margin-bottom: 5px;' }, _('Public IP Address:')),
				publicIpInput,
				autoDetectButton
			]),
			E('div', { style: 'margin-bottom: 10px;' }, [
				E('label', { style: 'display: block; margin-bottom: 5px;' }, _('Public Port:')),
				publicPortInput
			]),
			E('div', { style: 'margin-bottom: 10px;' }, [
				dynamicIPLabel
			]),
			E('div', {}, [createButton])
		]));

		// Join Moon Section
		var joinMoonSection = E('div', { class: 'cbi-section' }, [
			E('h3', {}, _('Join Moon Network')),
			E('p', {}, _('Join an existing moon network by entering the moon ID.')),
		]);

		var moonIdInput = E('input', {
			type: 'text',
			class: 'cbi-input-text',
			placeholder: _('Enter Moon ID'),
			style: 'margin-right: 10px; width: 300px;'
		});

		var joinButton = E('button', {
			class: 'btn cbi-button cbi-button-add',
			click: function() {
				var moonId = moonIdInput.value.trim();
				if (!moonId) {
					ui.addNotification(null, E('p', {}, _('Please enter a moon ID')), 'error');
					return;
				}
				self.joinMoon(moonId).then(function(success) {
					if (success) {
						moonIdInput.value = '';
						window.location.reload();
					}
				});
			}
		}, _('Join Moon'));

		joinMoonSection.appendChild(E('div', {}, [moonIdInput, joinButton]));

		// Moons List Section
		var moonsListSection = E('div', { class: 'cbi-section' }, [
			E('h3', {}, _('Connected Moons')),
		]);

		if (data.moonsList && data.moonsList.length > 0) {
			var moonsTable = E('table', { class: 'table' }, [
				E('tr', { class: 'tr table-titles' }, [
					E('th', { class: 'th' }, _('Moon ID')),
					E('th', { class: 'th' }, _('Address')),
					E('th', { class: 'th' }, _('Dynamic IP')),
					E('th', { class: 'th' }, _('Actions'))
				])
			]);

			data.moonsList.forEach(function(moon) {
				const moonInfo = self.currentMoonIPs.get(moon.id);
				const isDynamic = moonInfo && moonInfo.dynamicIP;
				
				var dynamicToggle = E('input', {
					type: 'checkbox',
					checked: isDynamic,
					change: function() {
						if (this.checked) {
							// Extract IP and port from moon address
							const addressParts = moon.address.match(/(\d+\.\d+\.\d+\.\d+):(\d+)/);
							if (addressParts) {
								self.enableDynamicIP(moon.id, addressParts[1], addressParts[2]);
								ui.addNotification(null, E('p', {}, _('Dynamic IP enabled for Moon %s').format(moon.id)), 'info');
							} else {
								this.checked = false;
								ui.addNotification(null, E('p', {}, _('Cannot enable dynamic IP: Invalid address format')), 'error');
							}
						} else {
							self.disableDynamicIP(moon.id);
							ui.addNotification(null, E('p', {}, _('Dynamic IP disabled for Moon %s').format(moon.id)), 'info');
						}
					}
				});

				var row = E('tr', { class: 'tr' }, [
					E('td', { class: 'td' }, moon.id),
					E('td', { class: 'td' }, [
						E('span', {}, moon.address),
						isDynamic ? E('span', { 
							style: 'margin-left: 10px; color: #28a745; font-size: 0.8em;' 
						}, _('(Auto-updating)')) : ''
					]),
					E('td', { class: 'td' }, [
						dynamicToggle,
						E('label', { 
							style: 'margin-left: 5px; font-size: 0.9em;' 
						}, _('Auto-update'))
					]),
					E('td', { class: 'td' }, [
						E('button', {
							class: 'btn cbi-button cbi-button-action',
							style: 'margin-right: 5px;',
							click: function() {
								// Force IP update for this moon
								self.dynamicIPManager.refreshIPs().then(function(result) {
									if (result.hasChanges && isDynamic) {
										ui.addNotification(null, E('p', {}, _('IP refresh triggered for Moon %s').format(moon.id)), 'info');
									} else {
										ui.addNotification(null, E('p', {}, _('No IP changes detected')), 'info');
									}
								});
							}
						}, _('Refresh IP')),
						E('button', {
							class: 'btn cbi-button cbi-button-remove',
							click: function() {
								if (confirm(_('Are you sure you want to leave this moon?'))) {
									self.deleteMoon(moon.id).then(function(success) {
										if (success) {
											// Remove from dynamic tracking
											self.currentMoonIPs.delete(moon.id);
											window.location.reload();
										}
									});
								}
							}
						}, _('Leave'))
					])
				]);
				moonsTable.appendChild(row);
			});

			moonsListSection.appendChild(moonsTable);
		} else {
			moonsListSection.appendChild(E('p', {}, _('No moons connected.')));
		}

		content.push(nodeInfoSection, moonCreateSection, joinMoonSection, moonsListSection);

		return E('div', {}, content);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null,

	// Utility methods for Moon management
	_logError: function(message, error) {
		if (console && console.error) {
			console.error('[ZeroTier Moon] ' + message + ':', error || '');
		}
	},

	_logDebug: function(message, data) {
		if (console && console.debug) {
			console.debug('[ZeroTier Moon] ' + message + ':', data || '');
		}
	},

	_validateMoonId: function(moonId) {
		if (!moonId || typeof moonId !== 'string') {
			return false;
		}
		
		// Moon ID should be 10 characters hexadecimal
		return /^[0-9a-fA-F]{10}$/.test(moonId.trim());
	},

	_formatMoonStatus: function(moon) {
		if (!moon) return _('Unknown');
		
		return {
			id: moon.id || _('Unknown'),
			address: moon.address || _('Unknown'),
			status: _('Connected')
		};
	}
});