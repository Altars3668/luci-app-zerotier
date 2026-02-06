/* SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright (C) 2024 AltarsCN
 * ZeroTier LAN Device Gateway Management
 *
 * Allow selected LAN devices to access ZeroTier networks through the router.
 * Supports 1:1 NAT mapping: each device gets its own ZeroTier virtual IP,
 * enabling bidirectional access without installing ZT client on devices.
 */

'use strict';
'require fs';
'require ui';
'require uci';
'require view';

// Parse /tmp/dhcp.leases
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
		if (idx === 0) return;
		var p = line.trim().split(/\s+/);
		if (p.length >= 6 && p[2] !== '0x0' && p[3] !== '00:00:00:00:00:00') {
			entries[p[3].toLowerCase()] = {
				ip: p[0], mac: p[3].toLowerCase(), device: p[5]
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
			if (p.length >= 8) {
				var ipStr = p.slice(8).join(' ');
				var subnet = '';
				var m = ipStr.match(/(\d+\.\d+\.\d+)\.\d+\/\d+/);
				if (m) subnet = m[1];
				networks.push({
					nwid: p[2], name: p[3], status: p[5],
					dev: p[7], ips: ipStr, subnet: subnet
				});
			}
		}
	});
	return networks;
}

// Suggest ZT IP from LAN IP: 10.0.0.135 → 10.0.1.135
function suggestZTIP(lanIP, ztSubnet) {
	if (!ztSubnet) return '';
	var lastOctet = lanIP.split('.').pop();
	return ztSubnet + '.' + lastOctet;
}

// Validate IP format
function isValidIP(ip) {
	return /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/.test(ip);
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

	getDeviceSections: function() {
		return uci.sections('zerotier', 'zt_device') || [];
	},

	findDeviceSection: function(mac) {
		var sections = this.getDeviceSections();
		for (var i = 0; i < sections.length; i++) {
			if (sections[i].mac === mac) return sections[i]['.name'];
		}
		return null;
	},

	getDeviceInfo: function(mac) {
		var sections = this.getDeviceSections();
		for (var i = 0; i < sections.length; i++) {
			if (sections[i].mac === mac)
				return { enabled: sections[i].enabled === '1', zt_ip: sections[i].zt_ip || '' };
		}
		return { enabled: false, zt_ip: '' };
	},

	// Enable device with ZT IP assignment
	enableDevice: function(mac, hostname, lanIP, ztIP) {
		var section = this.findDeviceSection(mac);
		if (!section) {
			section = 'dev_' + mac.replace(/:/g, '');
			uci.add('zerotier', 'zt_device', section);
			uci.set('zerotier', section, 'mac', mac);
		}
		uci.set('zerotier', section, 'enabled', '1');
		uci.set('zerotier', section, 'name', hostname || lanIP);
		uci.set('zerotier', section, 'ip', lanIP);
		uci.set('zerotier', section, 'zt_ip', ztIP);
	},

	disableDevice: function(mac) {
		var section = this.findDeviceSection(mac);
		if (section) uci.set('zerotier', section, 'enabled', '0');
	},

	// Show add/edit dialog
	handleAddDevice: function(mac, hostname, lanIP, currentZtIP, ztSubnet, ev) {
		var self = this;
		var suggested = currentZtIP || suggestZTIP(lanIP, ztSubnet);

		var ztInput = E('input', {
			type: 'text', class: 'cbi-input-text',
			value: suggested, style: 'width:200px',
			placeholder: 'e.g. ' + (ztSubnet ? ztSubnet + '.x' : '10.0.1.x')
		});

		ui.showModal(_('Assign ZeroTier IP'), [
			E('div', { style: 'margin-bottom:12px' }, [
				E('p', {}, [
					E('strong', {}, _('Device: ')),
					hostname ? hostname + ' ' : '',
					E('code', {}, lanIP), ' (' + mac + ')'
				])
			]),
			E('div', { class: 'cbi-value', style: 'margin-bottom:12px' }, [
				E('label', { class: 'cbi-value-title', style: 'width:auto; margin-right:12px' }, _('ZeroTier IP')),
				E('div', { class: 'cbi-value-field' }, [ztInput])
			]),
			E('div', { style: 'font-size:0.85em; color:#666; margin-bottom:16px' }, [
				_('This IP will be added to the ZT interface. LAN IP %s will be mapped 1:1 to this ZT IP via NAT.').format(lanIP),
				E('br', {}),
				_('Remote ZT peers can reach this device at this IP (bidirectional).')
			]),
			E('div', { class: 'right' }, [
				E('button', {
					class: 'cbi-button', style: 'margin-right:8px',
					click: ui.hideModal
				}, _('Cancel')),
				E('button', {
					class: 'cbi-button cbi-button-action important',
					click: function() {
						var ztIP = ztInput.value.trim();
						if (!ztIP || !isValidIP(ztIP)) {
							ui.addNotification(null, E('p', _('Invalid IP address')), 'error');
							return;
						}
						self.enableDevice(mac, hostname, lanIP, ztIP);
						ui.hideModal();
						self.handleApply();
					}
				}, _('Apply'))
			])
		]);
	},

	// Remove device mapping
	handleRemoveDevice: function(mac, ev) {
		this.disableDevice(mac);
		this.handleApply();
	},

	// Save UCI + apply nft rules + ip addr
	handleApply: function() {
		var self = this;

		ui.showModal(_('Applying'), [
			E('p', { class: 'spinning' }, _('Saving and applying 1:1 NAT rules...'))
		]);

		return uci.save().then(function() {
			return uci.apply();
		}).then(function() {
			return self.applyNATRules();
		}).then(function() {
			ui.hideModal();
			window.location.reload();
		}).catch(function(err) {
			ui.hideModal();
			ui.addNotification(null, E('p', _('Failed: %s').format(err.message)), 'error');
		});
	},

	// Generate and execute 1:1 NAT rules
	applyNATRules: function() {
		var sections = this.getDeviceSections();

		return fs.exec('/usr/bin/zerotier-cli', ['listnetworks']).then(function(res) {
			var zt_ifaces = [];
			if (res && res.code === 0 && res.stdout) {
				res.stdout.trim().split('\n').forEach(function(line) {
					if (line.indexOf('200 listnetworks') === 0 && line.indexOf('<nwid>') < 0) {
						var p = line.split(/\s+/);
						if (p.length >= 8 && p[7].indexOf('zt') === 0)
							zt_ifaces.push(p[7]);
					}
				});
			}
			if (zt_ifaces.length === 0) return;

			// Build cleanup + setup script
			var script = '#!/bin/sh\nset -e\n';

			// 1. Clean old rules (by comment tag)
			script += '# Cleanup old 1:1 NAT rules\n';
			script += 'for chain in forward srcnat dstnat; do\n';
			script += '  nft -a list chain inet fw4 $chain 2>/dev/null | grep "zt_dev_" | awk \'{print $NF}\' | while read h; do\n';
			script += '    nft delete rule inet fw4 $chain handle $h 2>/dev/null\n';
			script += '  done\n';
			script += 'done\n';

			// 2. Remove old alias IPs (/32) from ZT interfaces — keep the primary /24
			zt_ifaces.forEach(function(iface) {
				script += 'ip addr show dev ' + iface + ' 2>/dev/null | grep "inet " | grep "/32" | awk \'{print $2}\' | while read cidr; do\n';
				script += '  ip addr del $cidr dev ' + iface + ' 2>/dev/null || true\n';
				script += 'done\n';
			});

			// 3. Add rules for each enabled device
			sections.forEach(function(s) {
				if (s.enabled !== '1' || !s.ip || !s.zt_ip) return;

				var lanIP = s.ip;
				var ztIP = s.zt_ip;
				var devName = (s.name || lanIP).replace(/[^a-zA-Z0-9_.-]/g, '');

				zt_ifaces.forEach(function(iface) {
					// Add alias IP to ZT interface
					script += 'ip addr add ' + ztIP + '/32 dev ' + iface + ' 2>/dev/null || true\n';

					// Forward: allow LAN→ZT and ZT→LAN for this device
					script += 'nft insert rule inet fw4 forward iifname "br-lan" ip saddr ' + lanIP;
					script += ' oifname "' + iface + '" counter accept comment "zt_dev_fwd_' + devName + '"\n';
					script += 'nft insert rule inet fw4 forward iifname "' + iface + '" ip daddr ' + lanIP;
					script += ' oifname "br-lan" counter accept comment "zt_dev_fwd_in_' + devName + '"\n';

					// SNAT: LAN IP → ZT IP (outgoing)
					script += 'nft insert rule inet fw4 srcnat iifname "br-lan" ip saddr ' + lanIP;
					script += ' oifname "' + iface + '" counter snat to ' + ztIP + ' comment "zt_dev_snat_' + devName + '"\n';

					// DNAT: ZT IP → LAN IP (incoming)
					script += 'nft insert rule inet fw4 dstnat iifname "' + iface + '" ip daddr ' + ztIP;
					script += ' counter dnat to ' + lanIP + ' comment "zt_dev_dnat_' + devName + '"\n';
				});
			});

			return fs.exec('/bin/sh', ['-c', script]);
		});
	},

	render: function(data) {
		var self = this;
		var leases = parseDHCPLeases(data[0]);
		var arpMap = parseARP(data[1]);
		var ztNetworks = parseZTNetworks(data[3]);

		// Detect ZT subnet prefix (e.g., "10.0.1")
		var ztSubnet = '';
		if (ztNetworks.length > 0) ztSubnet = ztNetworks[0].subnet;

		// Build device list from DHCP + ARP
		var deviceMap = {};
		leases.forEach(function(l) {
			var info = self.getDeviceInfo(l.mac);
			deviceMap[l.mac] = {
				mac: l.mac, ip: l.ip, hostname: l.hostname,
				source: 'DHCP', enabled: info.enabled, zt_ip: info.zt_ip
			};
		});
		Object.keys(arpMap).forEach(function(mac) {
			var arp = arpMap[mac];
			if (arp.device === 'br-lan' && !deviceMap[mac]) {
				var info = self.getDeviceInfo(mac);
				deviceMap[mac] = {
					mac: mac, ip: arp.ip, hostname: '',
					source: 'ARP', enabled: info.enabled, zt_ip: info.zt_ip
				};
			}
		});

		var devices = Object.values(deviceMap).sort(function(a, b) {
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
			_('Assign ZeroTier virtual IPs to LAN devices. Each device gets a dedicated ZT address with 1:1 NAT — bidirectional access without installing ZeroTier client.'));

		// ZT Network Status
		var netSection = E('div', { class: 'cbi-section' }, [E('h3', {}, _('ZeroTier Networks'))]);
		if (ztNetworks.length > 0) {
			var netTable = E('table', { class: 'table cbi-section-table' }, [
				E('tr', { class: 'tr table-titles' }, [
					E('th', { class: 'th' }, _('Network ID')),
					E('th', { class: 'th' }, _('Name')),
					E('th', { class: 'th' }, _('Interface')),
					E('th', { class: 'th' }, _('Router ZT IP')),
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

		// Device Table
		var devSection = E('div', { class: 'cbi-section' }, [
			E('h3', {}, _('LAN Devices')),
			E('div', { class: 'cbi-value-description', style: 'margin-bottom:12px' },
				_('Click "Assign IP" to map a LAN device to a ZeroTier virtual IP. The device can then be reached by remote ZT peers at the assigned IP.'))
		]);

		if (devices.length > 0) {
			var devTable = E('table', { class: 'table cbi-section-table' }, [
				E('tr', { class: 'tr table-titles' }, [
					E('th', { class: 'th' }, _('Hostname')),
					E('th', { class: 'th' }, _('LAN IP')),
					E('th', { class: 'th' }, _('ZeroTier IP')),
					E('th', { class: 'th' }, _('MAC')),
					E('th', { class: 'th' }, _('Status')),
					E('th', { class: 'th cbi-section-actions' }, _('Actions'))
				])
			]);

			devices.forEach(function(dev) {
				var ztIPDisplay = dev.enabled && dev.zt_ip
					? E('code', { style: 'color:#0077be' }, dev.zt_ip)
					: E('span', { style: 'color:#aaa' }, '-');

				var statusSpan = dev.enabled
					? E('span', { style: 'color:#28a745; font-weight:bold' }, _('Mapped'))
					: E('span', { style: 'color:#6c757d' }, _('Not mapped'));

				var actions = [];
				if (dev.enabled) {
					actions.push(E('button', {
						class: 'cbi-button cbi-button-action',
						style: 'margin-right:4px',
						title: _('Change ZT IP'),
						click: ui.createHandlerFn(self, 'handleAddDevice',
							dev.mac, dev.hostname, dev.ip, dev.zt_ip, ztSubnet)
					}, _('Edit')));
					actions.push(E('button', {
						class: 'cbi-button cbi-button-remove',
						click: ui.createHandlerFn(self, 'handleRemoveDevice', dev.mac)
					}, _('Remove')));
				} else {
					actions.push(E('button', {
						class: 'cbi-button cbi-button-action',
						click: ui.createHandlerFn(self, 'handleAddDevice',
							dev.mac, dev.hostname, dev.ip, '', ztSubnet)
					}, _('Assign IP')));
				}

				devTable.appendChild(E('tr', { class: 'tr' }, [
					E('td', { class: 'td' }, dev.hostname || E('em', { style: 'color:#aaa' }, _('unknown'))),
					E('td', { class: 'td' }, dev.ip),
					E('td', { class: 'td' }, ztIPDisplay),
					E('td', { class: 'td' }, E('code', { style: 'font-size:0.85em' }, dev.mac)),
					E('td', { class: 'td' }, statusSpan),
					E('td', { class: 'td' }, actions)
				]));
			});
			devSection.appendChild(devTable);
		} else {
			devSection.appendChild(E('p', { style: 'color:#6c757d' },
				_('No LAN devices detected.')));
		}

		// Help Section
		var helpSection = E('div', { class: 'cbi-section' }, [
			E('h3', {}, _('How it works')),
			E('div', { class: 'cbi-value-description' }, [
				E('p', {}, _('Each mapped device gets full bidirectional access:')),
				E('ul', {}, [
					E('li', {}, _('The assigned ZT IP is added as an alias on the ZeroTier interface.')),
					E('li', {}, _('Outgoing: device LAN IP is translated (SNAT) to its ZT IP.')),
					E('li', {}, _('Incoming: traffic to the ZT IP is translated (DNAT) to the device LAN IP.')),
					E('li', {}, _('Remote ZT peers see each device as a separate IP — like native ZT members.'))
				]),
				E('p', { style: 'background:#d4edda; padding:8px; border-radius:4px; color:#155724; margin-top:8px' },
					_('Unlike simple masquerade, 1:1 NAT allows remote peers to initiate connections to your LAN devices via their assigned ZT IPs.'))
			])
		]);

		return E('div', {}, [title, desc, netSection, devSection, helpSection]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
