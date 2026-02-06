/* SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright (C) 2022 ImmortalWrt.org
 * ZeroTier Moon Node Management
 */

'use strict';
'require fs';
'require form';
'require poll';
'require ui';
'require view';

// Moon management constants
var MOON_CONFIG = {
	DEFAULT_PORT: 9993,
	MIN_PORT: 1,
	MAX_PORT: 65535,
	IP_REGEX: /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/,
	HOSTNAME_REGEX: /^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?))*$/,
	POLL_INTERVAL: 10000
};

// Helper functions
function execMoonCmd(args) {
	return fs.exec('/usr/bin/zerotier-moon', args);
}

function getMoonInfo() {
	return execMoonCmd(['info']).then(function(res) {
		if (res.code !== 0) {
			return { error: res.stderr || 'Failed to get ZeroTier info' };
		}
		var info = {};
		var stdout = res.stdout || '';
		var match = stdout.match(/(\d+)\s+info\s+([0-9a-f]+)\s+([\d.]+)\s+(\w+)/i);
		if (match) {
			info.nodeId = match[2];
			info.version = match[3];
			info.status = match[4];
		}
		return info;
	}).catch(function(err) {
		return { error: err.message };
	});
}

function getMoonsList() {
	return execMoonCmd(['list']).then(function(res) {
		if (res.code !== 0) return [];
		try {
			var data = JSON.parse(res.stdout || '[]');
			return data.map(function(moon) {
				var endpoints = [];
				if (moon.roots && moon.roots.length > 0) {
					moon.roots.forEach(function(root) {
						if (root.stableEndpoints) {
							endpoints = endpoints.concat(root.stableEndpoints);
						}
					});
				}
				return {
					id: moon.id,
					endpoints: endpoints,
					waiting: moon.waiting
				};
			});
		} catch (e) {
			return [];
		}
	}).catch(function() {
		return [];
	});
}

function getDynamicStatus() {
	return execMoonCmd(['dynamic', 'status']).then(function(res) {
		var status = { enabled: false, endpoint: '', port: 9993, lastIP: '', lastUpdate: '' };
		if (res.code === 0 && res.stdout) {
			var lines = res.stdout.split('\n');
			lines.forEach(function(line) {
				if (line.startsWith('ENABLED=')) status.enabled = line.includes('1');
				else if (line.startsWith('ENDPOINT=')) status.endpoint = line.split('=')[1] || '';
				else if (line.startsWith('PORT=')) status.port = parseInt(line.split('=')[1]) || 9993;
				else if (line.startsWith('LAST_IP=')) status.lastIP = line.split('=')[1] || '';
				else if (line.startsWith('LAST_UPDATE=')) {
					var ts = parseInt(line.split('=')[1]);
					if (ts) status.lastUpdate = new Date(ts * 1000).toLocaleString();
				}
			});
		}
		return status;
	}).catch(function() {
		return { enabled: false };
	});
}

function getFirewallStatus() {
	return execMoonCmd(['firewall', 'status']).then(function(res) {
		var status = { enabled: false, port: 9993, name: '' };
		if (res.code === 0 && res.stdout) {
			if (res.stdout.includes('Status: Enabled')) status.enabled = true;
			var portMatch = res.stdout.match(/Port:\s*(\d+)/);
			if (portMatch) status.port = parseInt(portMatch[1]);
			var nameMatch = res.stdout.match(/Name:\s*(.+)/);
			if (nameMatch) status.name = nameMatch[1].trim();
		}
		return status;
	}).catch(function() {
		return { enabled: false, port: 9993 };
	});
}

return view.extend({
	load: function() {
		return Promise.all([
			getMoonInfo(),
			getMoonsList(),
			getDynamicStatus(),
			getFirewallStatus()
		]);
	},

	pollStatus: function() {
		var self = this;
		poll.add(function() {
			return Promise.all([
				getMoonInfo(),
				getMoonsList(),
				getDynamicStatus(),
				getFirewallStatus()
			]).then(function(results) {
				self.updateStatusDisplay(results[0], results[1], results[2], results[3]);
			});
		}, MOON_CONFIG.POLL_INTERVAL);
	},

	updateStatusDisplay: function(moonInfo, moonsList, dynamicStatus, firewallStatus) {
		// Update node info
		var nodeIdEl = document.getElementById('moon_node_id');
		var nodeStatusEl = document.getElementById('moon_node_status');
		var nodeVersionEl = document.getElementById('moon_node_version');
		
		if (nodeIdEl && moonInfo.nodeId) nodeIdEl.textContent = moonInfo.nodeId;
		if (nodeStatusEl && moonInfo.status) {
			nodeStatusEl.innerHTML = '<span style="color:' + 
				(moonInfo.status === 'ONLINE' || moonInfo.status === 'TUNNELED' ? 'green' : 'orange') + 
				'">' + moonInfo.status + '</span>';
		}
		if (nodeVersionEl && moonInfo.version) nodeVersionEl.textContent = moonInfo.version;

		// Update dynamic IP status
		var dynStatusEl = document.getElementById('dynamic_status');
		if (dynStatusEl) {
			if (dynamicStatus.enabled) {
				dynStatusEl.innerHTML = '<span style="color:green">' + _('Enabled') + '</span> - ' +
					_('Current IP') + ': <strong>' + (dynamicStatus.lastIP || _('detecting...')) + '</strong>';
			} else {
				dynStatusEl.innerHTML = '<span style="color:#6c757d">' + _('Disabled') + '</span>';
			}
		}

		// Update firewall status
		var fwStatusEl = document.getElementById('firewall_status');
		if (fwStatusEl) {
			if (firewallStatus.enabled) {
				fwStatusEl.innerHTML = '<span style="color:green">' + _('Enabled') + '</span> - ' +
					_('Port %s/UDP from WAN').format(firewallStatus.port);
			} else {
				fwStatusEl.innerHTML = '<span style="color:#dc3545">' + _('Disabled') + '</span>';
			}
		}

		// Update moons table
		this.updateMoonsTable(moonsList);
	},

	updateMoonsTable: function(moonsList) {
		var tbody = document.getElementById('moons_tbody');
		if (!tbody) return;

		tbody.innerHTML = '';
		
		if (!moonsList || moonsList.length === 0) {
			tbody.innerHTML = '<tr class="tr placeholder"><td class="td" colspan="4">' + 
				_('No moons connected.') + '</td></tr>';
			return;
		}

		var self = this;
		moonsList.forEach(function(moon) {
			var endpointsStr = moon.endpoints.join(', ') || '-';
			var statusColor = moon.waiting ? '#dc3545' : '#28a745';
			var statusText = moon.waiting ? _('Waiting') : _('Connected');
			var nodeId = moon.id.replace(/^0+/, '');

			var tr = E('tr', { class: 'tr' }, [
				E('td', { class: 'td' }, E('code', {}, moon.id)),
				E('td', { class: 'td' }, endpointsStr),
				E('td', { class: 'td' }, E('span', { style: 'color:' + statusColor }, statusText)),
				E('td', { class: 'td' }, [
					E('button', {
						class: 'cbi-button cbi-button-remove',
						click: ui.createHandlerFn(self, 'handleLeaveMoon', nodeId)
					}, _('Leave'))
				])
			]);
			tbody.appendChild(tr);
		});
	},

	handleCreateMoon: function(ev) {
		var ipInput = document.getElementById('create_moon_ip');
		var portInput = document.getElementById('create_moon_port');
		
		var publicIp = ipInput ? ipInput.value.trim() : '';
		var publicPort = portInput ? portInput.value.trim() : '9993';

		if (!publicIp) {
			ui.addNotification(null, E('p', _('Public IP address is required')), 'error');
			return;
		}

		if (!MOON_CONFIG.IP_REGEX.test(publicIp) && !MOON_CONFIG.HOSTNAME_REGEX.test(publicIp)) {
			ui.addNotification(null, E('p', _('Invalid IP address or hostname format')), 'error');
			return;
		}

		var args = ['create', publicIp];
		if (publicPort) args.push(publicPort);

		return execMoonCmd(args).then(function(res) {
			if (res.code !== 0 || (res.stdout && res.stdout.includes('ERROR'))) {
				ui.addNotification(null, E('p', _('Failed to create moon: %s').format(res.stderr || res.stdout)), 'error');
			} else {
				ui.addNotification(null, E('p', _('Moon created successfully!')), 'info');
				window.location.reload();
			}
		});
	},

	handleJoinMoon: function(ev) {
		var input = document.getElementById('join_moon_id');
		var moonId = input ? input.value.trim() : '';

		if (!moonId) {
			ui.addNotification(null, E('p', _('Moon ID is required')), 'error');
			return;
		}

		return execMoonCmd(['join', moonId]).then(function(res) {
			if (res.code !== 0 || (res.stdout && res.stdout.includes('ERROR'))) {
				ui.addNotification(null, E('p', _('Failed to join moon: %s').format(res.stderr || res.stdout)), 'error');
			} else {
				ui.addNotification(null, E('p', _('Joined moon successfully!')), 'info');
				window.location.reload();
			}
		});
	},

	handleLeaveMoon: function(moonId, ev) {
		if (!confirm(_('Leave this moon?')))
			return;

		return execMoonCmd(['leave', moonId]).then(function(res) {
			if (res.code !== 0 || (res.stdout && res.stdout.includes('ERROR'))) {
				ui.addNotification(null, E('p', _('Failed to leave moon: %s').format(res.stderr || res.stdout)), 'error');
			} else {
				ui.addNotification(null, E('p', _('Left moon successfully!')), 'info');
				window.location.reload();
			}
		});
	},

	handleEnableDynamicIP: function(ev) {
		var endpointInput = document.getElementById('dynamic_endpoint');
		var portInput = document.getElementById('dynamic_port');
		
		var endpoint = endpointInput ? endpointInput.value.trim() : '';
		var port = portInput ? portInput.value.trim() : '9993';

		var args = ['dynamic', 'enable'];
		if (endpoint) args.push(endpoint);
		if (port) args.push(port);

		ui.showModal(_('Enabling Dynamic IP'), [
			E('p', { class: 'spinning' }, _('Detecting public IP and configuring...'))
		]);

		return execMoonCmd(args).then(function(res) {
			ui.hideModal();
			if (res.code !== 0 || (res.stdout && res.stdout.includes('ERROR'))) {
				ui.addNotification(null, E('p', _('Failed: %s').format(res.stderr || res.stdout)), 'error');
			} else {
				ui.addNotification(null, E('p', _('Dynamic IP enabled!')), 'info');
				window.location.reload();
			}
		});
	},

	handleDisableDynamicIP: function(ev) {
		return execMoonCmd(['dynamic', 'disable']).then(function() {
			ui.addNotification(null, E('p', _('Dynamic IP disabled')), 'info');
			window.location.reload();
		});
	},

	handleUpdateDynamicIP: function(ev) {
		ui.showModal(_('Updating IP'), [
			E('p', { class: 'spinning' }, _('Please wait...'))
		]);

		return execMoonCmd(['update']).then(function(res) {
			ui.hideModal();
			if (res.stdout && res.stdout.includes('SUCCESS')) {
				ui.addNotification(null, E('p', _('Moon IP updated!')), 'info');
			} else if (res.stdout && res.stdout.includes('unchanged')) {
				ui.addNotification(null, E('p', _('IP unchanged')), 'info');
			} else {
				ui.addNotification(null, E('p', res.stdout || _('Update complete')), 'info');
			}
			window.location.reload();
		});
	},

	handleFirewallAdd: function(ev) {
		var portInput = document.getElementById('firewall_port');
		var port = portInput ? portInput.value.trim() : '9993';

		return execMoonCmd(['firewall', 'add', port]).then(function(res) {
			if (res.code !== 0) {
				ui.addNotification(null, E('p', _('Firewall configuration failed: %s').format(res.stderr || res.stdout)), 'error');
			} else {
				ui.addNotification(null, E('p', _('Firewall rule added for port %s/UDP').format(port)), 'info');
				window.location.reload();
			}
		});
	},

	handleFirewallRemove: function(ev) {
		if (!confirm(_('Remove firewall rule? Moon connections from WAN may be blocked.')))
			return;

		return execMoonCmd(['firewall', 'remove']).then(function() {
			ui.addNotification(null, E('p', _('Firewall rule removed')), 'info');
			window.location.reload();
		});
	},

	render: function(data) {
		var moonInfo = data[0] || {};
		var moonsList = data[1] || [];
		var dynamicStatus = data[2] || {};
		var firewallStatus = data[3] || {};

		var m, s, o;

		m = new form.Map('zerotier', _('ZeroTier Moon Manager'),
			_('Manage ZeroTier Moon nodes for better connectivity and reduced latency.'));

		// Node Information Section
		s = m.section(form.NamedSection, '_status', 'status', _('Node Information'));
		s.anonymous = true;
		s.render = L.bind(function() {
			var statusColor = 'orange';
			var statusText = moonInfo.status || _('Unknown');
			if (statusText === 'ONLINE' || statusText === 'TUNNELED') statusColor = 'green';
			else if (statusText === 'OFFLINE') statusColor = 'red';

			return E('div', { class: 'cbi-section' }, [
				E('h3', {}, _('Node Information')),
				E('table', { class: 'table' }, [
					E('tr', { class: 'tr' }, [
						E('td', { class: 'td', width: '200px' }, E('strong', {}, _('Node ID'))),
						E('td', { class: 'td' }, E('code', { id: 'moon_node_id' }, moonInfo.nodeId || '-'))
					]),
					E('tr', { class: 'tr' }, [
						E('td', { class: 'td' }, E('strong', {}, _('Status'))),
						E('td', { class: 'td', id: 'moon_node_status' }, 
							E('span', { style: 'color:' + statusColor }, statusText))
					]),
					E('tr', { class: 'tr' }, [
						E('td', { class: 'td' }, E('strong', {}, _('Version'))),
						E('td', { class: 'td', id: 'moon_node_version' }, moonInfo.version || '-')
					])
				])
			]);
		}, this);

		// Dynamic IP Section
		s = m.section(form.NamedSection, '_dynamic', 'dynamic', _('Dynamic IP Configuration'));
		s.anonymous = true;
		s.render = L.bind(function() {
			var dynStatusHtml;
			if (dynamicStatus.enabled) {
				dynStatusHtml = E('span', { style: 'color:green' }, _('Enabled'));
				dynStatusHtml = [dynStatusHtml, ' - ', _('Current IP'), ': ', 
					E('strong', {}, dynamicStatus.lastIP || _('detecting...'))];
			} else {
				dynStatusHtml = E('span', { style: 'color:#6c757d' }, _('Disabled'));
			}

			var buttons = [];
			if (!dynamicStatus.enabled) {
				buttons.push(E('button', {
					class: 'cbi-button cbi-button-action',
					click: ui.createHandlerFn(this, 'handleEnableDynamicIP')
				}, _('Enable Dynamic IP')));
			} else {
				buttons.push(E('button', {
					class: 'cbi-button cbi-button-action',
					style: 'margin-right: 8px;',
					click: ui.createHandlerFn(this, 'handleUpdateDynamicIP')
				}, _('Update Now')));
				buttons.push(E('button', {
					class: 'cbi-button cbi-button-reset',
					click: ui.createHandlerFn(this, 'handleDisableDynamicIP')
				}, _('Disable')));
			}

			return E('div', { class: 'cbi-section' }, [
				E('h3', {}, _('Dynamic IP Configuration')),
				E('div', { class: 'cbi-value' }, [
					E('label', { class: 'cbi-value-title' }, _('Status')),
					E('div', { class: 'cbi-value-field', id: 'dynamic_status' }, dynStatusHtml)
				]),
				dynamicStatus.lastUpdate ? E('div', { class: 'cbi-value' }, [
					E('label', { class: 'cbi-value-title' }, _('Last Update')),
					E('div', { class: 'cbi-value-field' }, dynamicStatus.lastUpdate)
				]) : '',
				!dynamicStatus.enabled ? E('div', { class: 'cbi-value' }, [
					E('label', { class: 'cbi-value-title' }, _('Endpoint')),
					E('div', { class: 'cbi-value-field' }, [
						E('input', { 
							type: 'text', 
							class: 'cbi-input-text', 
							id: 'dynamic_endpoint',
							placeholder: _('IP or domain (leave empty for auto-detect)'),
							style: 'width: 300px;'
						})
					])
				]) : '',
				!dynamicStatus.enabled ? E('div', { class: 'cbi-value' }, [
					E('label', { class: 'cbi-value-title' }, _('Port')),
					E('div', { class: 'cbi-value-field' }, [
						E('input', { 
							type: 'number', 
							class: 'cbi-input-text', 
							id: 'dynamic_port',
							value: '9993',
							min: '1',
							max: '65535',
							style: 'width: 100px;'
						})
					])
				]) : '',
				E('div', { class: 'cbi-value' }, [
					E('label', { class: 'cbi-value-title' }, ''),
					E('div', { class: 'cbi-value-field' }, buttons)
				])
			]);
		}, this);

		// Firewall Section
		s = m.section(form.NamedSection, '_firewall', 'firewall', _('Firewall Configuration'));
		s.anonymous = true;
		s.render = L.bind(function() {
			var fwStatusHtml;
			if (firewallStatus.enabled) {
				fwStatusHtml = [
					E('span', { style: 'color:green' }, _('Enabled')),
					' - ',
					_('Port %s/UDP from WAN').format(firewallStatus.port)
				];
			} else {
				fwStatusHtml = E('span', { style: 'color:#dc3545' }, _('Disabled - Moon port may be blocked'));
			}

			var buttons = [];
			if (!firewallStatus.enabled) {
				buttons.push(E('button', {
					class: 'cbi-button cbi-button-action',
					click: ui.createHandlerFn(this, 'handleFirewallAdd')
				}, _('Enable Firewall Rule')));
			} else {
				buttons.push(E('button', {
					class: 'cbi-button cbi-button-action',
					style: 'margin-right: 8px;',
					click: ui.createHandlerFn(this, 'handleFirewallAdd')
				}, _('Update Port')));
				buttons.push(E('button', {
					class: 'cbi-button cbi-button-reset',
					click: ui.createHandlerFn(this, 'handleFirewallRemove')
				}, _('Disable')));
			}

			return E('div', { class: 'cbi-section' }, [
				E('h3', {}, _('Firewall Configuration')),
				E('div', { class: 'cbi-value' }, [
					E('label', { class: 'cbi-value-title' }, _('Status')),
					E('div', { class: 'cbi-value-field', id: 'firewall_status' }, fwStatusHtml)
				]),
				E('div', { class: 'cbi-value' }, [
					E('label', { class: 'cbi-value-title' }, _('Port')),
					E('div', { class: 'cbi-value-field' }, [
						E('input', { 
							type: 'number', 
							class: 'cbi-input-text', 
							id: 'firewall_port',
							value: (firewallStatus.port || 9993).toString(),
							min: '1',
							max: '65535',
							style: 'width: 100px;'
						})
					])
				]),
				E('div', { class: 'cbi-value' }, [
					E('label', { class: 'cbi-value-title' }, ''),
					E('div', { class: 'cbi-value-field' }, buttons)
				]),
				E('div', { class: 'cbi-value-description' }, 
					_('Allow incoming UDP connections to the Moon port from WAN. Required for other nodes to connect.'))
			]);
		}, this);

		// Create Moon Section
		s = m.section(form.NamedSection, '_create', 'create', _('Create Moon Node'));
		s.anonymous = true;
		s.render = L.bind(function() {
			return E('div', { class: 'cbi-section' }, [
				E('h3', {}, _('Create Moon Node')),
				E('div', { class: 'cbi-value' }, [
					E('label', { class: 'cbi-value-title' }, _('Public IP/Domain')),
					E('div', { class: 'cbi-value-field' }, [
						E('input', { 
							type: 'text', 
							class: 'cbi-input-text', 
							id: 'create_moon_ip',
							placeholder: _('e.g. 1.2.3.4 or moon.example.com'),
							style: 'width: 300px;'
						})
					])
				]),
				E('div', { class: 'cbi-value' }, [
					E('label', { class: 'cbi-value-title' }, _('Port')),
					E('div', { class: 'cbi-value-field' }, [
						E('input', { 
							type: 'number', 
							class: 'cbi-input-text', 
							id: 'create_moon_port',
							value: '9993',
							min: '1',
							max: '65535',
							style: 'width: 100px;'
						})
					])
				]),
				E('div', { class: 'cbi-value' }, [
					E('label', { class: 'cbi-value-title' }, ''),
					E('div', { class: 'cbi-value-field' }, [
						E('button', {
							class: 'cbi-button cbi-button-action important',
							click: ui.createHandlerFn(this, 'handleCreateMoon')
						}, _('Create Moon'))
					])
				])
			]);
		}, this);

		// Join Moon Section
		s = m.section(form.NamedSection, '_join', 'join', _('Join Moon'));
		s.anonymous = true;
		s.render = L.bind(function() {
			return E('div', { class: 'cbi-section' }, [
				E('h3', {}, _('Join Moon')),
				E('div', { class: 'cbi-value' }, [
					E('label', { class: 'cbi-value-title' }, _('Moon ID')),
					E('div', { class: 'cbi-value-field' }, [
						E('input', { 
							type: 'text', 
							class: 'cbi-input-text', 
							id: 'join_moon_id',
							placeholder: _('10-character hex ID'),
							style: 'width: 200px; margin-right: 8px;'
						}),
						E('button', {
							class: 'cbi-button cbi-button-action',
							click: ui.createHandlerFn(this, 'handleJoinMoon')
						}, _('Join'))
					])
				])
			]);
		}, this);

		// Connected Moons Section
		s = m.section(form.NamedSection, '_moons', 'moons', _('Connected Moons'));
		s.anonymous = true;
		s.render = L.bind(function() {
			var tableRows = [];
			
			if (moonsList.length === 0) {
				tableRows.push(E('tr', { class: 'tr placeholder' }, [
					E('td', { class: 'td', colspan: '4' }, _('No moons connected.'))
				]));
			} else {
				moonsList.forEach(L.bind(function(moon) {
					var endpointsStr = moon.endpoints.join(', ') || '-';
					var statusColor = moon.waiting ? '#dc3545' : '#28a745';
					var statusText = moon.waiting ? _('Waiting') : _('Connected');
					var nodeId = moon.id.replace(/^0+/, '');

					tableRows.push(E('tr', { class: 'tr' }, [
						E('td', { class: 'td' }, E('code', {}, moon.id)),
						E('td', { class: 'td' }, endpointsStr),
						E('td', { class: 'td' }, E('span', { style: 'color:' + statusColor }, statusText)),
						E('td', { class: 'td' }, [
							E('button', {
								class: 'cbi-button cbi-button-remove',
								click: ui.createHandlerFn(this, 'handleLeaveMoon', nodeId)
							}, _('Leave'))
						])
					]));
				}, this));
			}

			return E('div', { class: 'cbi-section' }, [
				E('h3', {}, _('Connected Moons')),
				E('table', { class: 'table cbi-section-table' }, [
					E('tr', { class: 'tr table-titles' }, [
						E('th', { class: 'th' }, _('Moon ID')),
						E('th', { class: 'th' }, _('Endpoints')),
						E('th', { class: 'th' }, _('Status')),
						E('th', { class: 'th cbi-section-actions' }, _('Actions'))
					]),
					E('tbody', { id: 'moons_tbody' }, tableRows)
				])
			]);
		}, this);

		// Start polling
		this.pollStatus();

		return m.render();
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
