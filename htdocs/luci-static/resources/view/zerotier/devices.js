/* SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright (C) 2024 AltarsCN
 * ZeroTier LAN Device Gateway Management
 *
 * Allow selected LAN devices to access ZeroTier networks
 * through the router as a gateway (no ZT client needed on devices).
 */

'use strict';
'require fs';
'require ui';
'require uci';
'require view';
'require poll';

// Parse /tmp/dhcp.leases: "timestamp mac ip hostname clientid"
function parseDHCPLeases(res) {
	var leases = [];
	if (!res || res.code !== 0 || !res.stdout) return leases;

	res.stdout.trim().split('\n').forEach(function(line) {
		var p = line.trim().split(/\s+/);
		if (p.length >= 4) {
			leases.push({
				expires: parseInt(p[0]) || 0,
				mac: p[1].toLowerCase(),
				ip: p[2],
				hostname: (p[3] === '*') ? '' : p[3]
			});
		}
	});
	return leases;
}

// Parse /proc/net/arp
function parseARP(res) {
	var entries = {};
	if (!res || res.code !== 0 || !res.stdout) return entries;

	res.stdout.trim().split('\n').forEach(function(line, idx) {
		if (idx === 0) return; // skip header
		var p = line.trim().split(/\s+/);
		// IP HWtype Flags HWaddress Mask Device
		if (p.length >= 6 && p[2] !== '0x0' && p[3] !== '00:00:00:00:00:00') {
			entries[p[3].toLowerCase()] = {
				ip: p[0],
				mac: p[3].toLowerCase(),
				device: p[5]
			};
		}
	});
	return entries;
}

// Parse zerotier-cli listnetworks
function parseZTNetworks(res) {
	var networks = [];
	if (!res || res.code !== 0 || !res.stdout) return networks;

	res.stdout.trim().split('\n').forEach(function(line) {
		if (line.indexOf('200 listnetworks') === 0 && line.indexOf('<nwid>') < 0) {
			var p = line.split(/\s+/);
			// 200 listnetworks nwid name mac status type dev ips...
			if (p.length >= 8) {
				networks.push({
					nwid: p[2],
					name: p[3],
					status: p[5],
					dev: p[7],
					ips: p.slice(8).join(' ')
				});
			}
		}
	});
	return networks;
}

return view.extend({
	load: function() {
		return Promise.all([
			fs.exec('/bin/cat', ['/tmp/dhcp.leases']),
			fs.exec('/bin/cat', ['/proc/net/arp']),
			uci.load('zerotier'),
			fs.exec('/usr/bin/zerotier-cli', ['listnetworks'])
		]);
	},

	// Get all zt_device UCI sections
	getDeviceSections: function() {
		return uci.sections('zerotier', 'zt_device') || [];
	},

	// Find UCI section for a MAC
	findDeviceSection: function(mac) {
		var sections = this.getDeviceSections();
		for (var i = 0; i < sections.length; i++) {
			if (sections[i].mac === mac) return sections[i]['.name'];
		}
		return null;
	},

	// Check if device is enabled
	isDeviceEnabled: function(mac) {
		var sections = this.getDeviceSections();
		for (var i = 0; i < sections.length; i++) {
			if (sections[i].mac === mac && sections[i].enabled === '1')
				return true;
		}
		return false;
	},

	// Get access mode: 'all', 'selected', 'none'
	getAccessMode: function() {
		return uci.get('zerotier', 'global', 'lan_access_mode') || 'all';
	},

	// Toggle device ZT access
	handleToggleDevice: function(mac, hostname, ip, row, ev) {
		var self = this;
		var enabled = !this.isDeviceEnabled(mac);
		var section = this.findDeviceSection(mac);

		if (enabled) {
			if (!section) {
				section = 'dev_' + mac.replace(/:/g, '');
				uci.add('zerotier', 'zt_device', section);
				uci.set('zerotier', section, 'mac', mac);
			}
			uci.set('zerotier', section, 'enabled', '1');
			uci.set('zerotier', section, 'name', hostname || ip);
			uci.set('zerotier', section, 'ip', ip);
		} else {
			if (section) {
				uci.set('zerotier', section, 'enabled', '0');
			}
		}

		// Update button state immediately
		var btn = row.querySelector('.zt-toggle-btn');
		if (btn) {
			btn.textContent = enabled ? _('Revoke') : _('Grant');
			btn.className = 'cbi-button ' + (enabled ? 'cbi-button-remove' : 'cbi-button-action');
		}
		var statusCell = row.querySelector('.zt-status');
		if (statusCell) {
			statusCell.innerHTML = enabled
				? '<span style="color:#28a745">' + _('Allowed') + '</span>'
				: '<span style="color:#6c757d">' + _('Denied') + '</span>';
		}
	},

	// Apply all changes: save UCI, regenerate nft rules
	handleApply: function(ev) {
		var self = this;

		ui.showModal(_('Applying'), [
			E('p', { class: 'spinning' }, _('Saving configuration and applying firewall rules...'))
		]);

		return uci.save().then(function() {
			return uci.apply();
		}).then(function() {
			return self.applyFirewallRules();
		}).then(function() {
			ui.hideModal();
			ui.addNotification(null, E('p', _('Configuration applied successfully.')), 'info');
		}).catch(function(err) {
			ui.hideModal();
			ui.addNotification(null, E('p', _('Failed to apply: %s').format(err.message)), 'error');
		});
	},

	// Regenerate nft rules for allowed devices
	applyFirewallRules: function() {
		var mode = this.getAccessMode();
		var sections = this.getDeviceSections();

		// Find ZT interfaces
		return fs.exec('/usr/bin/zerotier-cli', ['listnetworks']).then(function(res) {
			var zt_ifaces = [];
			if (res && res.code === 0 && res.stdout) {
				res.stdout.trim().split('\n').forEach(function(line) {
					if (line.indexOf('200 listnetworks') === 0 && line.indexOf('<nwid>') < 0) {
						var p = line.split(/\s+/);
						if (p.length >= 8 && p[7].indexOf('zt') === 0) {
							zt_ifaces.push(p[7]);
						}
					}
				});
			}

			if (zt_ifaces.length === 0) return;

			var cmds = [];

			// Build the nft rules script
			var script = '#!/bin/sh\n';

			// First, remove old device-specific rules
			script += 'nft -a list chain inet fw4 forward 2>/dev/null | grep "zt_device_access" | awk \'{print $NF}\' | while read handle; do\n';
			script += '  nft delete rule inet fw4 forward handle $handle 2>/dev/null\n';
			script += 'done\n';
			script += 'nft -a list chain inet fw4 srcnat 2>/dev/null | grep "zt_device_masq" | awk \'{print $NF}\' | while read handle; do\n';
			script += '  nft delete rule inet fw4 srcnat handle $handle 2>/dev/null\n';
			script += 'done\n';

			if (mode === 'none') {
				// No LAN access to ZT at all — done after cleanup
			} else if (mode === 'selected') {
				// Per-device rules
				var enabledIPs = [];
				sections.forEach(function(s) {
					if (s.enabled === '1' && s.ip) {
						enabledIPs.push(s.ip);
					}
				});

				if (enabledIPs.length > 0) {
					zt_ifaces.forEach(function(iface) {
						// Forward rules for allowed device IPs
						enabledIPs.forEach(function(ip) {
							script += 'nft insert rule inet fw4 forward iifname "br-lan" ip saddr ' + ip;
							script += ' oifname "' + iface + '" counter accept comment "zt_device_access"\n';
						});
						// Masquerade for allowed devices
						enabledIPs.forEach(function(ip) {
							script += 'nft insert rule inet fw4 srcnat iifname "br-lan" ip saddr ' + ip;
							script += ' oifname "' + iface + '" counter masquerade comment "zt_device_masq"\n';
						});
					});
				}
			}
			// mode === 'all': uses the existing blanket forward/masquerade rules from zerotier-fw4

			// Write and execute the script
			return fs.exec('/bin/sh', ['-c', script]);
		});
	},

	// Handle access mode change
	handleModeChange: function(ev) {
		var mode = ev.target.value;
		uci.set('zerotier', 'global', 'lan_access_mode', mode);

		// Show/hide device list based on mode
		var devTable = document.getElementById('zt-device-table');
		if (devTable) {
			devTable.style.display = (mode === 'selected') ? '' : 'none';
		}

		var applyBtn = document.getElementById('zt-apply-btn');
		if (applyBtn) applyBtn.disabled = false;
	},

	render: function(data) {
		var self = this;
		var leases = parseDHCPLeases(data[0]);
		var arpMap = parseARP(data[1]);
		var ztNetworks = parseZTNetworks(data[3]);
		var accessMode = this.getAccessMode();

		// Merge DHCP + ARP to get unique device list
		var deviceMap = {};

		// DHCP leases (primary)
		leases.forEach(function(l) {
			deviceMap[l.mac] = {
				mac: l.mac,
				ip: l.ip,
				hostname: l.hostname,
				source: 'DHCP',
				enabled: self.isDeviceEnabled(l.mac)
			};
		});

		// ARP entries (supplement with non-DHCP devices, filter br-lan only)
		Object.keys(arpMap).forEach(function(mac) {
			var arp = arpMap[mac];
			if (arp.device === 'br-lan' && !deviceMap[mac]) {
				deviceMap[mac] = {
					mac: mac,
					ip: arp.ip,
					hostname: '',
					source: 'ARP',
					enabled: self.isDeviceEnabled(mac)
				};
			}
		});

		var devices = Object.values(deviceMap).sort(function(a, b) {
			// Sort: enabled first, then by IP
			if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
			var ipA = a.ip.split('.').map(Number);
			var ipB = b.ip.split('.').map(Number);
			for (var i = 0; i < 4; i++) {
				if (ipA[i] !== ipB[i]) return ipA[i] - ipB[i];
			}
			return 0;
		});

		// --- Build UI ---
		var title = E('h2', { class: 'content' }, _('ZeroTier LAN Gateway'));
		var desc = E('div', { class: 'cbi-map-descr' },
			_('Allow LAN devices to access ZeroTier networks through this router without installing ZeroTier client. The router acts as a gateway with NAT.'));

		// ZT Network Status
		var netSection = E('div', { class: 'cbi-section' }, [
			E('h3', {}, _('ZeroTier Networks'))
		]);

		if (ztNetworks.length > 0) {
			var netTable = E('table', { class: 'table cbi-section-table' }, [
				E('tr', { class: 'tr table-titles' }, [
					E('th', { class: 'th' }, _('Network ID')),
					E('th', { class: 'th' }, _('Name')),
					E('th', { class: 'th' }, _('Interface')),
					E('th', { class: 'th' }, _('IP')),
					E('th', { class: 'th' }, _('Status'))
				])
			]);
			ztNetworks.forEach(function(net) {
				netTable.appendChild(E('tr', { class: 'tr' }, [
					E('td', { class: 'td' }, E('code', {}, net.nwid)),
					E('td', { class: 'td' }, net.name),
					E('td', { class: 'td' }, net.dev),
					E('td', { class: 'td' }, net.ips),
					E('td', { class: 'td' },
						E('span', { style: 'color:' + (net.status === 'OK' ? '#28a745' : '#dc3545') }, net.status))
				]));
			});
			netSection.appendChild(netTable);
		} else {
			netSection.appendChild(E('p', { style: 'color:#dc3545' },
				_('No active ZeroTier networks. Join a network first.')));
		}

		// Access Mode
		var modeSection = E('div', { class: 'cbi-section' }, [
			E('h3', {}, _('LAN Access Mode')),
			E('div', { class: 'cbi-value' }, [
				E('label', { class: 'cbi-value-title' }, _('Access Mode')),
				E('div', { class: 'cbi-value-field' }, [
					E('select', {
						class: 'cbi-input-select',
						style: 'width:300px',
						change: ui.createHandlerFn(this, 'handleModeChange')
					}, [
						E('option', { value: 'all', selected: accessMode === 'all' },
							_('All LAN devices (no restriction)')),
						E('option', { value: 'selected', selected: accessMode === 'selected' },
							_('Selected devices only')),
						E('option', { value: 'none', selected: accessMode === 'none' },
							_('Disabled (no LAN access to ZT)'))
					])
				])
			]),
			E('div', { class: 'cbi-value-description' },
				_('Controls which LAN devices can reach remote ZeroTier peers. "All" uses the router-level masquerade rules. "Selected" applies per-device firewall rules.'))
		]);

		// Device Table (only visible in 'selected' mode)
		var devSection = E('div', {
			class: 'cbi-section',
			id: 'zt-device-table',
			style: accessMode === 'selected' ? '' : 'display:none'
		}, [
			E('h3', {}, _('LAN Devices')),
			E('div', { class: 'cbi-value-description', style: 'margin-bottom:10px' },
				_('Grant or revoke ZeroTier network access for individual LAN devices. Devices with access can reach remote ZT peers via this router.'))
		]);

		if (devices.length > 0) {
			var devTable = E('table', { class: 'table cbi-section-table' }, [
				E('tr', { class: 'tr table-titles' }, [
					E('th', { class: 'th' }, _('Hostname')),
					E('th', { class: 'th' }, _('IP Address')),
					E('th', { class: 'th' }, _('MAC Address')),
					E('th', { class: 'th' }, _('Source')),
					E('th', { class: 'th' }, _('ZT Access')),
					E('th', { class: 'th cbi-section-actions' }, _('Actions'))
				])
			]);

			devices.forEach(function(dev) {
				var row = E('tr', { class: 'tr' }, [
					E('td', { class: 'td' }, dev.hostname || E('em', {}, _('unknown'))),
					E('td', { class: 'td' }, dev.ip),
					E('td', { class: 'td' }, E('code', {}, dev.mac)),
					E('td', { class: 'td' }, dev.source),
					E('td', { class: 'td zt-status' },
						dev.enabled
							? E('span', { style: 'color:#28a745' }, _('Allowed'))
							: E('span', { style: 'color:#6c757d' }, _('Denied'))),
					E('td', { class: 'td' }, [
						E('button', {
							class: 'cbi-button zt-toggle-btn ' + (dev.enabled ? 'cbi-button-remove' : 'cbi-button-action'),
							click: ui.createHandlerFn(self, function(mac, hostname, ip, ev) {
								var tr = ev.target.closest('tr');
								self.handleToggleDevice(mac, hostname, ip, tr, ev);
								document.getElementById('zt-apply-btn').disabled = false;
							}, dev.mac, dev.hostname, dev.ip)
						}, dev.enabled ? _('Revoke') : _('Grant'))
					])
				]);
				devTable.appendChild(row);
			});
			devSection.appendChild(devTable);
		} else {
			devSection.appendChild(E('p', { style: 'color:#6c757d' },
				_('No LAN devices detected. Devices will appear after connecting to this router.')));
		}

		// Apply Button
		var applySection = E('div', { class: 'cbi-section', style: 'text-align:right' }, [
			E('button', {
				class: 'cbi-button cbi-button-action important',
				id: 'zt-apply-btn',
				click: ui.createHandlerFn(this, 'handleApply')
			}, _('Save & Apply'))
		]);

		// Help Section
		var helpSection = E('div', { class: 'cbi-section' }, [
			E('h3', {}, _('How it works')),
			E('div', { class: 'cbi-value-description' }, [
				E('p', {}, _('This feature uses the router as a ZeroTier gateway:')),
				E('ul', {}, [
					E('li', {}, _('The router joins ZeroTier networks and gets a virtual IP (e.g., 10.0.1.x).')),
					E('li', {}, _('LAN devices send traffic to the router, which forwards it through the ZeroTier tunnel.')),
					E('li', {}, _('NAT (masquerade) ensures replies return correctly to the originating LAN device.')),
					E('li', {}, _('LAN devices can access remote ZT peers without installing any software.'))
				]),
				E('p', { style: 'color:#856404; background:#fff3cd; padding:8px; border-radius:4px; margin-top:8px' },
					_('Note: LAN devices can reach remote ZeroTier IPs, but remote peers cannot initiate connections to LAN devices (one-way NAT). For bidirectional access, install ZeroTier on the device directly.'))
			])
		]);

		return E('div', {}, [title, desc, netSection, modeSection, devSection, applySection, helpSection]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
