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

const callExec = rpc.declare({
	object: 'file',
	method: 'exec',
	params: ['command', 'args'],
	expect: { code: 0 }
});

return view.extend({
	load: function() {
		return Promise.all([
			this.loadMoonInfo(),
			this.loadIdentity(),
			this.loadMoonsList()
		]).then(function(results) {
			return {
				moonInfo: results[0],
				identity: results[1],
				moonsList: results[2]
			};
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

	createMoon: function(publicIp, publicPort) {
		var self = this;
		if (!publicIp) {
			ui.addNotification(null, E('p', {}, _('Public IP address is required')), 'error');
			return Promise.resolve(false);
		}
		
		var args = ['create', publicIp];
		if (publicPort) {
			args.push(publicPort);
		}
		
		return fs.exec('/usr/bin/zerotier-moon', args).then(function(res) {
			if (res.code !== 0) {
				ui.addNotification(null, E('p', {}, _('Failed to create moon: %s').format(res.stderr || 'Unknown error')), 'error');
				return false;
			}
			
			ui.addNotification(null, E('p', {}, _('Moon created successfully!')), 'info');
			return true;
		}).catch(function(err) {
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

		var publicIpInput = E('input', {
			type: 'text',
			class: 'cbi-input-text',
			placeholder: _('Enter public IP address'),
			style: 'margin-right: 10px; margin-bottom: 10px; width: 200px;'
		});

		var publicPortInput = E('input', {
			type: 'number',
			class: 'cbi-input-text',
			placeholder: _('Port (default: 9993)'),
			value: '9993',
			min: '1',
			max: '65535',
			style: 'margin-right: 10px; margin-bottom: 10px; width: 150px;'
		});

		var createButton = E('button', {
			class: 'btn cbi-button cbi-button-add',
			style: 'margin-bottom: 10px;',
			click: function() {
				var publicIp = publicIpInput.value.trim();
				var publicPort = publicPortInput.value.trim();
				
				if (!publicIp) {
					ui.addNotification(null, E('p', {}, _('Please enter a public IP address')), 'error');
					return;
				}
				
				self.createMoon(publicIp, publicPort).then(function(success) {
					if (success) {
						publicIpInput.value = '';
						publicPortInput.value = '9993';
						window.location.reload();
					}
				});
			}
		}, _('Create Moon'));

		moonCreateSection.appendChild(E('div', {}, [
			E('div', {}, [
				E('label', { style: 'display: block; margin-bottom: 5px;' }, _('Public IP Address:')),
				publicIpInput
			]),
			E('div', {}, [
				E('label', { style: 'display: block; margin-bottom: 5px;' }, _('Public Port:')),
				publicPortInput
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
					E('th', { class: 'th' }, _('Actions'))
				])
			]);

			data.moonsList.forEach(function(moon) {
				var row = E('tr', { class: 'tr' }, [
					E('td', { class: 'td' }, moon.id),
					E('td', { class: 'td' }, moon.address),
					E('td', { class: 'td' }, [
						E('button', {
							class: 'btn cbi-button cbi-button-remove',
							click: function() {
								if (confirm(_('Are you sure you want to leave this moon?'))) {
									self.deleteMoon(moon.id).then(function(success) {
										if (success) {
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
	handleReset: null
});