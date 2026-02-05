/* SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright (C) 2024 LuCI-app-zerotier
 * Lightweight ZeroTier Network Controller
 * 
 * Features:
 * - Network management (create, list, edit, delete)
 * - Member management (authorize, IP assignment)
 * - Route and IP pool configuration
 * - Quick setup wizard
 */

'use strict';
'require fs';
'require ui';
'require view';
'require rpc';

// RPC declarations for zerotier-controller
const callCheckController = rpc.declare({
	object: 'zerotier-controller',
	method: 'check_controller',
	expect: { '': {} }
});

const callControllerStatus = rpc.declare({
	object: 'zerotier-controller',
	method: 'status',
	expect: { '': {} }
});

const callListNetworks = rpc.declare({
	object: 'zerotier-controller',
	method: 'list_networks',
	expect: { '': {} }
});

const callGetNetwork = rpc.declare({
	object: 'zerotier-controller',
	method: 'get_network',
	params: ['nwid'],
	expect: { '': {} }
});

const callCreateNetwork = rpc.declare({
	object: 'zerotier-controller',
	method: 'create_network',
	params: ['name'],
	expect: { '': {} }
});

const callUpdateNetwork = rpc.declare({
	object: 'zerotier-controller',
	method: 'update_network',
	params: ['nwid', 'config'],
	expect: { '': {} }
});

const callDeleteNetwork = rpc.declare({
	object: 'zerotier-controller',
	method: 'delete_network',
	params: ['nwid'],
	expect: { '': {} }
});

const callListMembers = rpc.declare({
	object: 'zerotier-controller',
	method: 'list_members',
	params: ['nwid'],
	expect: { '': {} }
});

const callGetMember = rpc.declare({
	object: 'zerotier-controller',
	method: 'get_member',
	params: ['nwid', 'mid'],
	expect: { '': {} }
});

const callAuthorizeMember = rpc.declare({
	object: 'zerotier-controller',
	method: 'authorize_member',
	params: ['nwid', 'mid', 'authorized'],
	expect: { '': {} }
});

const callUpdateMember = rpc.declare({
	object: 'zerotier-controller',
	method: 'update_member',
	params: ['nwid', 'mid', 'config'],
	expect: { '': {} }
});

const callDeleteMember = rpc.declare({
	object: 'zerotier-controller',
	method: 'delete_member',
	params: ['nwid', 'mid'],
	expect: { '': {} }
});

const callUpdateRoutes = rpc.declare({
	object: 'zerotier-controller',
	method: 'update_routes',
	params: ['nwid', 'routes'],
	expect: { '': {} }
});

const callUpdateIPPools = rpc.declare({
	object: 'zerotier-controller',
	method: 'update_ip_pools',
	params: ['nwid', 'pools'],
	expect: { '': {} }
});

const callEasySetup = rpc.declare({
	object: 'zerotier-controller',
	method: 'easy_setup',
	params: ['nwid', 'cidr'],
	expect: { '': {} }
});

// Helper function to format timestamps
function formatTime(timestamp) {
	if (!timestamp) return '-';
	const date = new Date(timestamp);
	return date.toLocaleString();
}

// Helper function to format bytes
function formatBytes(bytes) {
	if (!bytes) return '0 B';
	const units = ['B', 'KB', 'MB', 'GB'];
	let i = 0;
	while (bytes >= 1024 && i < units.length - 1) {
		bytes /= 1024;
		i++;
	}
	return bytes.toFixed(1) + ' ' + units[i];
}

return view.extend({
	// Current state
	currentNetwork: null,
	networks: [],
	members: [],

	load: function() {
		return Promise.all([
			L.resolveDefault(callCheckController(), { available: false }),
			L.resolveDefault(callControllerStatus(), {}),
			L.resolveDefault(callListNetworks(), { networks: [] })
		]).then(function(results) {
			return {
				controllerAvailable: results[0].available || false,
				controllerReason: results[0].reason || '',
				status: results[1],
				networks: results[2].networks || []
			};
		});
	},

	// Refresh networks list
	refreshNetworks: function() {
		var self = this;
		return callListNetworks().then(function(result) {
			self.networks = result.networks || [];
			self.renderNetworkList();
		}).catch(function(err) {
			ui.addNotification(null, E('p', {}, _('Failed to refresh networks: %s').format(err.message)), 'error');
		});
	},

	// Refresh members list for current network
	refreshMembers: function(nwid) {
		var self = this;
		if (!nwid) return Promise.resolve();
		
		return callListMembers(nwid).then(function(result) {
			self.members = result.members || [];
			self.renderMemberList(nwid);
		}).catch(function(err) {
			ui.addNotification(null, E('p', {}, _('Failed to refresh members: %s').format(err.message)), 'error');
		});
	},

	// Create new network
	createNetwork: function() {
		var self = this;
		
		ui.showModal(_('Create Network'), [
			E('div', { class: 'cbi-section' }, [
				E('div', { class: 'cbi-value' }, [
					E('label', { class: 'cbi-value-title' }, _('Network Name')),
					E('div', { class: 'cbi-value-field' }, [
						E('input', {
							type: 'text',
							id: 'new-network-name',
							class: 'cbi-input-text',
							placeholder: _('My Network')
						})
					])
				])
			]),
			E('div', { class: 'right' }, [
				E('button', {
					class: 'btn',
					click: function() { ui.hideModal(); }
				}, _('Cancel')),
				' ',
				E('button', {
					class: 'btn cbi-button-positive',
					click: function() {
						var name = document.getElementById('new-network-name').value || 'Untitled Network';
						ui.hideModal();
						
						ui.showModal(_('Creating Network'), [
							E('p', { class: 'spinning' }, _('Please wait...'))
						]);
						
						callCreateNetwork(name).then(function(result) {
							ui.hideModal();
							if (result.error) {
								ui.addNotification(null, E('p', {}, _('Failed to create network: %s').format(result.error)), 'error');
							} else {
								ui.addNotification(null, E('p', {}, _('Network created successfully!')), 'info');
								self.refreshNetworks();
							}
						}).catch(function(err) {
							ui.hideModal();
							ui.addNotification(null, E('p', {}, _('Failed to create network: %s').format(err.message)), 'error');
						});
					}
				}, _('Create'))
			])
		]);
	},

	// Delete network
	deleteNetwork: function(nwid, name) {
		var self = this;
		
		if (!confirm(_('Are you sure you want to delete network "%s" (%s)?').format(name || 'Unnamed', nwid))) {
			return;
		}
		
		ui.showModal(_('Deleting Network'), [
			E('p', { class: 'spinning' }, _('Please wait...'))
		]);
		
		callDeleteNetwork(nwid).then(function(result) {
			ui.hideModal();
			if (result.error) {
				ui.addNotification(null, E('p', {}, _('Failed to delete network: %s').format(result.error)), 'error');
			} else {
				ui.addNotification(null, E('p', {}, _('Network deleted successfully!')), 'info');
				self.refreshNetworks();
			}
		}).catch(function(err) {
			ui.hideModal();
			ui.addNotification(null, E('p', {}, _('Failed to delete network: %s').format(err.message)), 'error');
		});
	},

	// Edit network settings
	editNetwork: function(network) {
		var self = this;
		
		ui.showModal(_('Edit Network'), [
			E('div', { class: 'cbi-section' }, [
				E('div', { class: 'cbi-value' }, [
					E('label', { class: 'cbi-value-title' }, _('Network ID')),
					E('div', { class: 'cbi-value-field' }, [
						E('code', {}, network.nwid || network.id)
					])
				]),
				E('div', { class: 'cbi-value' }, [
					E('label', { class: 'cbi-value-title' }, _('Network Name')),
					E('div', { class: 'cbi-value-field' }, [
						E('input', {
							type: 'text',
							id: 'edit-network-name',
							class: 'cbi-input-text',
							value: network.name || ''
						})
					])
				]),
				E('div', { class: 'cbi-value' }, [
					E('label', { class: 'cbi-value-title' }, _('Private Network')),
					E('div', { class: 'cbi-value-field' }, [
						E('input', {
							type: 'checkbox',
							id: 'edit-network-private',
							checked: network.private !== false
						}),
						E('div', { class: 'cbi-value-description' }, 
							_('Private networks require authorization for members'))
					])
				]),
				E('div', { class: 'cbi-value' }, [
					E('label', { class: 'cbi-value-title' }, _('Enable Broadcast')),
					E('div', { class: 'cbi-value-field' }, [
						E('input', {
							type: 'checkbox',
							id: 'edit-network-broadcast',
							checked: network.enableBroadcast !== false
						})
					])
				])
			]),
			E('div', { class: 'right' }, [
				E('button', {
					class: 'btn',
					click: function() { ui.hideModal(); }
				}, _('Cancel')),
				' ',
				E('button', {
					class: 'btn cbi-button-positive',
					click: function() {
						var config = JSON.stringify({
							name: document.getElementById('edit-network-name').value,
							private: document.getElementById('edit-network-private').checked,
							enableBroadcast: document.getElementById('edit-network-broadcast').checked
						});
						
						ui.hideModal();
						
						ui.showModal(_('Saving'), [
							E('p', { class: 'spinning' }, _('Please wait...'))
						]);
						
						callUpdateNetwork(network.nwid || network.id, config).then(function(result) {
							ui.hideModal();
							if (result.error) {
								ui.addNotification(null, E('p', {}, _('Failed to update network: %s').format(result.error)), 'error');
							} else {
								ui.addNotification(null, E('p', {}, _('Network updated successfully!')), 'info');
								self.refreshNetworks();
							}
						}).catch(function(err) {
							ui.hideModal();
							ui.addNotification(null, E('p', {}, _('Failed to update network: %s').format(err.message)), 'error');
						});
					}
				}, _('Save'))
			])
		]);
	},

	// Show network details and members
	showNetworkDetails: function(network) {
		var self = this;
		this.currentNetwork = network;
		
		// Load members for this network
		var nwid = network.nwid || network.id;
		
		ui.showModal(_('Loading'), [
			E('p', { class: 'spinning' }, _('Loading network details...'))
		]);
		
		callListMembers(nwid).then(function(result) {
			ui.hideModal();
			self.members = result.members || [];
			self.renderNetworkDetailsModal(network);
		}).catch(function(err) {
			ui.hideModal();
			ui.addNotification(null, E('p', {}, _('Failed to load members: %s').format(err.message)), 'error');
		});
	},

	// Render network details modal
	renderNetworkDetailsModal: function(network) {
		var self = this;
		var nwid = network.nwid || network.id;
		
		// Build routes table
		var routesTable = E('table', { class: 'table' }, [
			E('tr', { class: 'tr table-titles' }, [
				E('th', { class: 'th' }, _('Target')),
				E('th', { class: 'th' }, _('Via')),
				E('th', { class: 'th' }, _('Actions'))
			])
		]);
		
		var routes = network.routes || [];
		routes.forEach(function(route) {
			routesTable.appendChild(E('tr', { class: 'tr' }, [
				E('td', { class: 'td' }, route.target || '-'),
				E('td', { class: 'td' }, route.via || _('(LAN)')),
				E('td', { class: 'td' }, [
					E('button', {
						class: 'btn cbi-button-remove',
						'data-target': route.target,
						click: function() {
							var newRoutes = routes.filter(function(r) {
								return r.target !== route.target;
							});
							self.updateNetworkRoutes(nwid, newRoutes);
						}
					}, _('Delete'))
				])
			]));
		});
		
		if (routes.length === 0) {
			routesTable.appendChild(E('tr', { class: 'tr' }, [
				E('td', { class: 'td', colspan: 3 }, _('No routes configured'))
			]));
		}
		
		// Build IP pools table
		var poolsTable = E('table', { class: 'table' }, [
			E('tr', { class: 'tr table-titles' }, [
				E('th', { class: 'th' }, _('Start IP')),
				E('th', { class: 'th' }, _('End IP')),
				E('th', { class: 'th' }, _('Actions'))
			])
		]);
		
		var pools = network.ipAssignmentPools || [];
		pools.forEach(function(pool, idx) {
			poolsTable.appendChild(E('tr', { class: 'tr' }, [
				E('td', { class: 'td' }, pool.ipRangeStart || '-'),
				E('td', { class: 'td' }, pool.ipRangeEnd || '-'),
				E('td', { class: 'td' }, [
					E('button', {
						class: 'btn cbi-button-remove',
						click: function() {
							var newPools = pools.filter(function(p, i) {
								return i !== idx;
							});
							self.updateNetworkIPPools(nwid, newPools);
						}
					}, _('Delete'))
				])
			]));
		});
		
		if (pools.length === 0) {
			poolsTable.appendChild(E('tr', { class: 'tr' }, [
				E('td', { class: 'td', colspan: 3 }, _('No IP pools configured'))
			]));
		}
		
		// Build members table
		var membersTable = E('table', { class: 'table' }, [
			E('tr', { class: 'tr table-titles' }, [
				E('th', { class: 'th' }, _('Member ID')),
				E('th', { class: 'th' }, _('Name')),
				E('th', { class: 'th' }, _('Authorized')),
				E('th', { class: 'th' }, _('IP Address')),
				E('th', { class: 'th' }, _('Actions'))
			])
		]);
		
		this.members.forEach(function(member) {
			var mid = member.id || member.address;
			var ips = (member.ipAssignments || []).join(', ') || '-';
			
			membersTable.appendChild(E('tr', { class: 'tr' }, [
				E('td', { class: 'td' }, E('code', {}, mid)),
				E('td', { class: 'td' }, member.name || '-'),
				E('td', { class: 'td' }, [
					E('input', {
						type: 'checkbox',
						checked: member.authorized,
						change: function() {
							self.authorizeMember(nwid, mid, this.checked);
						}
					})
				]),
				E('td', { class: 'td' }, ips),
				E('td', { class: 'td' }, [
					E('button', {
						class: 'btn',
						style: 'margin-right: 5px;',
						click: function() {
							self.editMemberIP(nwid, mid, member);
						}
					}, _('Edit IP')),
					E('button', {
						class: 'btn cbi-button-remove',
						click: function() {
							if (confirm(_('Delete member %s?').format(mid))) {
								self.deleteMember(nwid, mid);
							}
						}
					}, _('Delete'))
				])
			]));
		});
		
		if (this.members.length === 0) {
			membersTable.appendChild(E('tr', { class: 'tr' }, [
				E('td', { class: 'td', colspan: 5 }, _('No members in this network'))
			]));
		}
		
		ui.showModal(_('Network: %s').format(network.name || nwid), [
			E('div', { style: 'max-height: 70vh; overflow-y: auto;' }, [
				// Network Info
				E('div', { class: 'cbi-section' }, [
					E('h4', {}, _('Network Information')),
					E('table', { class: 'table' }, [
						E('tr', { class: 'tr' }, [
							E('td', { class: 'td left', width: '30%' }, _('Network ID')),
							E('td', { class: 'td left' }, E('code', { 
								style: 'cursor: pointer;',
								click: function() {
									navigator.clipboard.writeText(nwid);
									ui.addNotification(null, E('p', {}, _('Network ID copied to clipboard')), 'info');
								}
							}, nwid))
						]),
						E('tr', { class: 'tr' }, [
							E('td', { class: 'td left' }, _('Private')),
							E('td', { class: 'td left' }, network.private ? _('Yes') : _('No'))
						]),
						E('tr', { class: 'tr' }, [
							E('td', { class: 'td left' }, _('Broadcast')),
							E('td', { class: 'td left' }, network.enableBroadcast ? _('Yes') : _('No'))
						]),
						E('tr', { class: 'tr' }, [
							E('td', { class: 'td left' }, _('Members')),
							E('td', { class: 'td left' }, this.members.length)
						])
					])
				]),
				
				// Quick Setup
				E('div', { class: 'cbi-section' }, [
					E('h4', {}, _('Quick Setup')),
					E('p', {}, _('Enter a CIDR to automatically configure routes and IP pool')),
					E('div', { style: 'display: flex; gap: 10px; align-items: center;' }, [
						E('input', {
							type: 'text',
							id: 'easy-setup-cidr',
							class: 'cbi-input-text',
							placeholder: '10.147.17.0/24',
							style: 'flex: 1;'
						}),
						E('button', {
							class: 'btn cbi-button-action',
							click: function() {
								var cidr = document.getElementById('easy-setup-cidr').value;
								if (!cidr) {
									ui.addNotification(null, E('p', {}, _('Please enter a CIDR')), 'error');
									return;
								}
								self.easySetup(nwid, cidr);
							}
						}, _('Apply'))
					])
				]),
				
				// Routes
				E('div', { class: 'cbi-section' }, [
					E('h4', {}, _('Routes')),
					routesTable,
					E('div', { style: 'margin-top: 10px;' }, [
						E('button', {
							class: 'btn cbi-button-add',
							click: function() {
								self.addRoute(nwid, routes);
							}
						}, _('Add Route'))
					])
				]),
				
				// IP Pools
				E('div', { class: 'cbi-section' }, [
					E('h4', {}, _('IP Assignment Pools')),
					poolsTable,
					E('div', { style: 'margin-top: 10px;' }, [
						E('button', {
							class: 'btn cbi-button-add',
							click: function() {
								self.addIPPool(nwid, pools);
							}
						}, _('Add IP Pool'))
					])
				]),
				
				// Members
				E('div', { class: 'cbi-section' }, [
					E('h4', {}, _('Members')),
					membersTable
				])
			]),
			E('div', { class: 'right', style: 'margin-top: 20px;' }, [
				E('button', {
					class: 'btn',
					click: function() { ui.hideModal(); }
				}, _('Close'))
			])
		]);
	},

	// Authorize/deauthorize member
	authorizeMember: function(nwid, mid, authorized) {
		var self = this;
		
		callAuthorizeMember(nwid, mid, authorized).then(function(result) {
			if (result.error) {
				ui.addNotification(null, E('p', {}, _('Failed to update member: %s').format(result.error)), 'error');
			} else {
				ui.addNotification(null, E('p', {}, 
					authorized ? _('Member authorized') : _('Member deauthorized')), 'info');
			}
		}).catch(function(err) {
			ui.addNotification(null, E('p', {}, _('Failed to update member: %s').format(err.message)), 'error');
		});
	},

	// Edit member IP assignment
	editMemberIP: function(nwid, mid, member) {
		var self = this;
		var currentIPs = (member.ipAssignments || []).join('\n');
		
		ui.showModal(_('Edit IP Assignments'), [
			E('div', { class: 'cbi-section' }, [
				E('p', {}, _('Enter IP addresses (one per line)')),
				E('textarea', {
					id: 'member-ips',
					class: 'cbi-input-textarea',
					rows: 5,
					style: 'width: 100%;'
				}, currentIPs)
			]),
			E('div', { class: 'right' }, [
				E('button', {
					class: 'btn',
					click: function() { 
						ui.hideModal();
						self.showNetworkDetails(self.currentNetwork);
					}
				}, _('Cancel')),
				' ',
				E('button', {
					class: 'btn cbi-button-positive',
					click: function() {
						var ips = document.getElementById('member-ips').value
							.split('\n')
							.map(function(ip) { return ip.trim(); })
							.filter(function(ip) { return ip.length > 0; });
						
						var config = JSON.stringify({
							ipAssignments: ips
						});
						
						callUpdateMember(nwid, mid, config).then(function(result) {
							ui.hideModal();
							if (result.error) {
								ui.addNotification(null, E('p', {}, _('Failed to update member: %s').format(result.error)), 'error');
							} else {
								ui.addNotification(null, E('p', {}, _('Member IP updated')), 'info');
							}
							self.showNetworkDetails(self.currentNetwork);
						}).catch(function(err) {
							ui.hideModal();
							ui.addNotification(null, E('p', {}, _('Failed to update member: %s').format(err.message)), 'error');
						});
					}
				}, _('Save'))
			])
		]);
	},

	// Delete member
	deleteMember: function(nwid, mid) {
		var self = this;
		
		callDeleteMember(nwid, mid).then(function(result) {
			if (result.error) {
				ui.addNotification(null, E('p', {}, _('Failed to delete member: %s').format(result.error)), 'error');
			} else {
				ui.addNotification(null, E('p', {}, _('Member deleted')), 'info');
			}
			self.showNetworkDetails(self.currentNetwork);
		}).catch(function(err) {
			ui.addNotification(null, E('p', {}, _('Failed to delete member: %s').format(err.message)), 'error');
		});
	},

	// Add route
	addRoute: function(nwid, existingRoutes) {
		var self = this;
		
		ui.showModal(_('Add Route'), [
			E('div', { class: 'cbi-section' }, [
				E('div', { class: 'cbi-value' }, [
					E('label', { class: 'cbi-value-title' }, _('Target (CIDR)')),
					E('div', { class: 'cbi-value-field' }, [
						E('input', {
							type: 'text',
							id: 'route-target',
							class: 'cbi-input-text',
							placeholder: '10.0.0.0/24'
						})
					])
				]),
				E('div', { class: 'cbi-value' }, [
					E('label', { class: 'cbi-value-title' }, _('Via (Gateway)')),
					E('div', { class: 'cbi-value-field' }, [
						E('input', {
							type: 'text',
							id: 'route-via',
							class: 'cbi-input-text',
							placeholder: _('Leave empty for LAN route')
						})
					])
				])
			]),
			E('div', { class: 'right' }, [
				E('button', {
					class: 'btn',
					click: function() { 
						ui.hideModal();
						self.showNetworkDetails(self.currentNetwork);
					}
				}, _('Cancel')),
				' ',
				E('button', {
					class: 'btn cbi-button-positive',
					click: function() {
						var target = document.getElementById('route-target').value;
						var via = document.getElementById('route-via').value || null;
						
						if (!target) {
							ui.addNotification(null, E('p', {}, _('Target is required')), 'error');
							return;
						}
						
						var newRoutes = existingRoutes.slice();
						newRoutes.push({ target: target, via: via });
						
						ui.hideModal();
						self.updateNetworkRoutes(nwid, newRoutes);
					}
				}, _('Add'))
			])
		]);
	},

	// Update network routes
	updateNetworkRoutes: function(nwid, routes) {
		var self = this;
		
		ui.showModal(_('Saving'), [
			E('p', { class: 'spinning' }, _('Please wait...'))
		]);
		
		callUpdateRoutes(nwid, JSON.stringify(routes)).then(function(result) {
			ui.hideModal();
			if (result.error) {
				ui.addNotification(null, E('p', {}, _('Failed to update routes: %s').format(result.error)), 'error');
			} else {
				ui.addNotification(null, E('p', {}, _('Routes updated')), 'info');
			}
			// Refresh network details
			callGetNetwork(nwid).then(function(network) {
				self.currentNetwork = network;
				self.showNetworkDetails(network);
			});
		}).catch(function(err) {
			ui.hideModal();
			ui.addNotification(null, E('p', {}, _('Failed to update routes: %s').format(err.message)), 'error');
		});
	},

	// Add IP pool
	addIPPool: function(nwid, existingPools) {
		var self = this;
		
		ui.showModal(_('Add IP Pool'), [
			E('div', { class: 'cbi-section' }, [
				E('div', { class: 'cbi-value' }, [
					E('label', { class: 'cbi-value-title' }, _('Start IP')),
					E('div', { class: 'cbi-value-field' }, [
						E('input', {
							type: 'text',
							id: 'pool-start',
							class: 'cbi-input-text',
							placeholder: '10.0.0.1'
						})
					])
				]),
				E('div', { class: 'cbi-value' }, [
					E('label', { class: 'cbi-value-title' }, _('End IP')),
					E('div', { class: 'cbi-value-field' }, [
						E('input', {
							type: 'text',
							id: 'pool-end',
							class: 'cbi-input-text',
							placeholder: '10.0.0.254'
						})
					])
				])
			]),
			E('div', { class: 'right' }, [
				E('button', {
					class: 'btn',
					click: function() { 
						ui.hideModal();
						self.showNetworkDetails(self.currentNetwork);
					}
				}, _('Cancel')),
				' ',
				E('button', {
					class: 'btn cbi-button-positive',
					click: function() {
						var start = document.getElementById('pool-start').value;
						var end = document.getElementById('pool-end').value;
						
						if (!start || !end) {
							ui.addNotification(null, E('p', {}, _('Both start and end IP are required')), 'error');
							return;
						}
						
						var newPools = existingPools.slice();
						newPools.push({ ipRangeStart: start, ipRangeEnd: end });
						
						ui.hideModal();
						self.updateNetworkIPPools(nwid, newPools);
					}
				}, _('Add'))
			])
		]);
	},

	// Update network IP pools
	updateNetworkIPPools: function(nwid, pools) {
		var self = this;
		
		ui.showModal(_('Saving'), [
			E('p', { class: 'spinning' }, _('Please wait...'))
		]);
		
		callUpdateIPPools(nwid, JSON.stringify(pools)).then(function(result) {
			ui.hideModal();
			if (result.error) {
				ui.addNotification(null, E('p', {}, _('Failed to update IP pools: %s').format(result.error)), 'error');
			} else {
				ui.addNotification(null, E('p', {}, _('IP pools updated')), 'info');
			}
			// Refresh network details
			callGetNetwork(nwid).then(function(network) {
				self.currentNetwork = network;
				self.showNetworkDetails(network);
			});
		}).catch(function(err) {
			ui.hideModal();
			ui.addNotification(null, E('p', {}, _('Failed to update IP pools: %s').format(err.message)), 'error');
		});
	},

	// Easy setup
	easySetup: function(nwid, cidr) {
		var self = this;
		
		ui.showModal(_('Applying Configuration'), [
			E('p', { class: 'spinning' }, _('Please wait...'))
		]);
		
		callEasySetup(nwid, cidr).then(function(result) {
			ui.hideModal();
			if (result.error) {
				ui.addNotification(null, E('p', {}, _('Failed to apply configuration: %s').format(result.error)), 'error');
			} else {
				ui.addNotification(null, E('p', {}, _('Configuration applied successfully!')), 'info');
			}
			// Refresh network details
			callGetNetwork(nwid).then(function(network) {
				self.currentNetwork = network;
				self.showNetworkDetails(network);
			});
		}).catch(function(err) {
			ui.hideModal();
			ui.addNotification(null, E('p', {}, _('Failed to apply configuration: %s').format(err.message)), 'error');
		});
	},

	// Render network list
	renderNetworkList: function() {
		var self = this;
		var container = document.getElementById('network-list-container');
		if (!container) return;
		
		container.innerHTML = '';
		
		var table = E('table', { class: 'table' }, [
			E('tr', { class: 'tr table-titles' }, [
				E('th', { class: 'th' }, _('Network ID')),
				E('th', { class: 'th' }, _('Name')),
				E('th', { class: 'th' }, _('Private')),
				E('th', { class: 'th' }, _('Members')),
				E('th', { class: 'th' }, _('Actions'))
			])
		]);
		
		this.networks.forEach(function(network) {
			var nwid = network.nwid || network.id;
			var memberCount = Object.keys(network.authorizedMemberCount || {}).length || 
				(network.activeMemberCount || 0);
			
			table.appendChild(E('tr', { class: 'tr' }, [
				E('td', { class: 'td' }, E('code', {}, nwid)),
				E('td', { class: 'td' }, network.name || _('Unnamed')),
				E('td', { class: 'td' }, network.private ? _('Yes') : _('No')),
				E('td', { class: 'td' }, memberCount.toString()),
				E('td', { class: 'td' }, [
					E('button', {
						class: 'btn',
						style: 'margin-right: 5px;',
						click: function() {
							self.showNetworkDetails(network);
						}
					}, _('Manage')),
					E('button', {
						class: 'btn',
						style: 'margin-right: 5px;',
						click: function() {
							self.editNetwork(network);
						}
					}, _('Edit')),
					E('button', {
						class: 'btn cbi-button-remove',
						click: function() {
							self.deleteNetwork(nwid, network.name);
						}
					}, _('Delete'))
				])
			]));
		});
		
		if (this.networks.length === 0) {
			table.appendChild(E('tr', { class: 'tr' }, [
				E('td', { class: 'td', colspan: 5, style: 'text-align: center; padding: 20px;' }, 
					_('No networks found. Click "Create Network" to get started.'))
			]));
		}
		
		container.appendChild(table);
	},

	render: function(data) {
		var self = this;
		this.networks = data.networks || [];
		
		var title = E('h2', { class: 'content' }, _('ZeroTier Network Controller'));
		var desc = E('div', { class: 'cbi-map-descr' }, 
			_('Manage your ZeroTier networks directly from this router. Create networks, authorize members, and configure routes.'));

		var content = [title, desc];

		// Check if controller is available
		if (!data.controllerAvailable) {
			var unavailableSection = E('div', { class: 'cbi-section' }, [
				E('h3', {}, _('Controller Not Available')),
				E('div', { class: 'alert-message warning', style: 'padding: 15px; background: #fff3cd; border: 1px solid #ffc107; border-radius: 5px; margin: 10px 0;' }, [
					E('p', { style: 'margin: 0 0 10px 0; font-weight: bold;' }, _('The ZeroTier Controller API is not available on this device.')),
					E('p', { style: 'margin: 0 0 10px 0;' }, data.controllerReason || _('The OpenWrt zerotier package may not include controller support.')),
					E('p', { style: 'margin: 0;' }, _('Solutions:')),
					E('ul', { style: 'margin: 10px 0 0 20px;' }, [
						E('li', {}, [
							_('Install zerotier-controller package: '),
							E('a', { href: 'https://github.com/AltarsCN/luci-app-zerotier/tree/main/packages/zerotier-controller', target: '_blank' }, _('Build Instructions'))
						]),
						E('li', {}, _('Use ZTNCUI (available in the ZTNCUI tab) for a full-featured web interface')),
						E('li', {}, _('Use ZeroTier Central (my.zerotier.com) for cloud-hosted controller'))
					])
				])
			]);
			content.push(unavailableSection);
			return E('div', { class: 'cbi-map' }, content);
		}

		// Status Section
		var statusSection = E('div', { class: 'cbi-section' }, [
			E('h3', {}, _('Controller Status'))
		]);

		var statusTable = E('table', { class: 'table' });

		if (data.status.running) {
			statusTable.appendChild(E('tr', { class: 'tr' }, [
				E('td', { class: 'td left', width: '25%' }, _('Status')),
				E('td', { class: 'td left' }, [
					E('span', { style: 'color: green; font-weight: bold;' }, _('Running'))
				])
			]));
			
			statusTable.appendChild(E('tr', { class: 'tr' }, [
				E('td', { class: 'td left' }, _('Node ID')),
				E('td', { class: 'td left' }, E('code', {}, data.status.address || '-'))
			]));
			
			statusTable.appendChild(E('tr', { class: 'tr' }, [
				E('td', { class: 'td left' }, _('Version')),
				E('td', { class: 'td left' }, data.status.version || '-')
			]));
			
			statusTable.appendChild(E('tr', { class: 'tr' }, [
				E('td', { class: 'td left' }, _('Networks')),
				E('td', { class: 'td left' }, this.networks.length.toString())
			]));
		} else {
			statusTable.appendChild(E('tr', { class: 'tr' }, [
				E('td', { class: 'td left', width: '25%' }, _('Status')),
				E('td', { class: 'td left' }, [
					E('span', { style: 'color: red; font-weight: bold;' }, _('Not Running')),
					E('p', { style: 'margin-top: 10px; color: #666;' }, 
						_('ZeroTier daemon is not running. Please start the ZeroTier service first.'))
				])
			]));
		}

		statusSection.appendChild(statusTable);

		// Networks Section
		var networksSection = E('div', { class: 'cbi-section' }, [
			E('h3', {}, _('Networks')),
			E('div', { style: 'margin-bottom: 15px;' }, [
				E('button', {
					class: 'btn cbi-button-add',
					style: 'margin-right: 10px;',
					click: function() {
						self.createNetwork();
					}
				}, _('Create Network')),
				E('button', {
					class: 'btn',
					click: function() {
						self.refreshNetworks();
					}
				}, _('Refresh'))
			]),
			E('div', { id: 'network-list-container' })
		]);

		content.push(statusSection, networksSection);

		// Render the initial network list
		var mainView = E('div', { class: 'cbi-map' }, content);
		
		// Use setTimeout to render the network list after the DOM is ready
		setTimeout(function() {
			self.renderNetworkList();
		}, 0);

		return mainView;
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
