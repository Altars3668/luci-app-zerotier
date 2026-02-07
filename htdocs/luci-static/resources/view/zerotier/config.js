/* SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright (C) 2022 ImmortalWrt.org
 * Enhanced ZeroTier Configuration Management
 * 
 * Features:
 * - Real-time service status monitoring
 * - Intelligent network configuration
 * - Moon and Controller integration
 * - Advanced firewall settings
 * - Multi-language support
 */

'use strict';
'require form';
'require fs';
'require poll';
'require rpc';
'require uci';
'require view';
'require tools.widgets as widgets';

// Configuration constants
const ZEROTIER_CONFIG = {
	DEFAULT_PORT: 9993,
	POLL_INTERVAL: 5000,
	NETWORK_ID_LENGTH: 16,
	MOON_PORT_DEFAULT: 9993,
	CONTROLLER_PORT_DEFAULT: 3000
};

const SERVICE_STATUS = {
	RUNNING: 'RUNNING',
	STOPPED: 'NOT RUNNING'
};

const callServiceList = rpc.declare({
	object: 'service',
	method: 'list',
	params: ['name'],
	expect: { '': {} }
});

function getServiceStatus() {
	return L.resolveDefault(callServiceList('zerotier'), {}).then(function(res) {
		let isRunning = false;
		let serviceInfo = null;
		
		try {
			if (res && res['zerotier'] && res['zerotier']['instances'] && res['zerotier']['instances']['instance1']) {
				serviceInfo = res['zerotier']['instances']['instance1'];
				isRunning = serviceInfo['running'] === true;
			}
		} catch (e) {
			console.debug('[ZeroTier] Service status check failed:', e);
		}
		
		return {
			isRunning: isRunning,
			serviceInfo: serviceInfo,
			lastUpdate: Date.now()
		};
	}).catch(function(err) {
		console.error('[ZeroTier] Failed to get service status:', err);
		return {
			isRunning: false,
			error: err.message || 'Unknown error',
			lastUpdate: Date.now()
		};
	});
}

function renderStatus(isRunning, lastUpdate) {
	const statusColor = isRunning ? 'green' : 'red';
	const statusText = isRunning ? SERVICE_STATUS.RUNNING : SERVICE_STATUS.STOPPED;
	const timestamp = lastUpdate ? ' (' + _('Updated') + ': ' + new Date(lastUpdate).toLocaleTimeString() + ')' : '';
	
	const spanTemplate = '<em><span style="color:%s"><strong>%s %s</strong></span></em><small style="color:#666;">%s</small>';
	return String.format(spanTemplate, statusColor, _('ZeroTier'), _(statusText), timestamp);
}

return view.extend({
	load: function() {
		return Promise.all([
			uci.load('zerotier'),
			fs.read('/etc/zerotier-controller.conf').catch(function() { return ''; })
		]);
	},

	parseControllerConfig: function(content) {
		if (!content) return {};
		var config = {};
		content.split('\n').forEach(function(line) {
			var match = line.match(/^(\w+)=(.*)$/);
			if (match) {
				config[match[1]] = match[2];
			}
		});
		return config;
	},

	render: function(data) {
		var savedConfig = this.parseControllerConfig(data[1]);
		var localControllerUrl = savedConfig.ZTNCUI_URL || savedConfig.ZEROUI_URL || null;
		var enableController = uci.get('zerotier', 'global', 'enable_controller') === '1';
		var controllerPort = uci.get('zerotier', 'global', 'controller_port') || '3000';
		
		// Determine the best controller URL
		var hasLocalController = enableController || localControllerUrl;
		
		let m, s, o;

		m = new form.Map('zerotier', _('ZeroTier'),
			_('ZeroTier is an open source, cross-platform and easy to use virtual LAN.'));

		s = m.section(form.TypedSection);
		s.anonymous = true;
		s.render = function() {
			// Enhanced polling with error handling
			poll.add(function() {
				return L.resolveDefault(getServiceStatus()).then(function(status) {
					const statusElement = document.getElementById('service_status');
					const errorElement = document.getElementById('service_error');
					
					if (statusElement) {
						statusElement.innerHTML = renderStatus(status.isRunning, status.lastUpdate);
					}
					
					if (errorElement) {
						if (status.error) {
							errorElement.innerHTML = '<div class="alert-message warning">' + 
								_('Error checking service status') + ': ' + status.error + '</div>';
							errorElement.style.display = 'block';
						} else {
							errorElement.style.display = 'none';
						}
					}
				}).catch(function(err) {
					console.error('[ZeroTier] Polling error:', err);
					const statusElement = document.getElementById('service_status');
					if (statusElement) {
						statusElement.innerHTML = '<em><span style="color:orange">' + 
							_('Status check failed') + '</span></em>';
					}
				});
			}, ZEROTIER_CONFIG.POLL_INTERVAL);

			return E('div', { class: 'cbi-section', id: 'status_bar' }, [
				E('p', { id: 'service_status' }, _('Collecting data…')),
				E('div', { id: 'service_error', style: 'display: none' })
			]);
		}

		s = m.section(form.NamedSection, 'global', 'zerotier', _('Global configuration'));

		o = s.option(form.Flag, 'enabled', _('Enable'));

		o = s.option(form.Value, 'port', _('Listen port'));
		o.datatype = 'port';

		o = s.option(form.Value, 'secret', _('Client secret'));
		o.password = true;

		o = s.option(form.Value, 'local_conf_path', _('Local config path'),
			_('Path of the optional file local.conf (see <a target="_blank" href="%s">documentation</a>).').format(
				'https://docs.zerotier.com/config/#local-configuration-options'));
		o.value('/etc/zerotier.conf');

		o = s.option(form.Value, 'config_path', _('Config path'),
				_('Persistent configuration directory (to keep other configurations such as controller or moons, etc.).'));
		o.value('/etc/zerotier');

		o = s.option(form.Flag, 'copy_config_path', _('Copy config path'),
				_('Copy the contents of the persistent configuration directory to memory instead of linking it, this avoids writing to flash.'));
		o.depends({'config_path': '', '!reverse': true});

		o = s.option(form.Flag, 'auto_moon', _('Auto-create moon'),
				_('Automatically create a moon node on startup if none exists.'));

		o = s.option(form.Value, 'moon_root_public_port', _('Moon public port'),
				_('Public port for moon node (required for moon creation).'));
		o.datatype = 'port';
		o.depends('auto_moon', '1');

		o = s.option(form.Value, 'moon_root_public_addr', _('Moon public address'),
				_('Public IP address or domain name for moon node (required for moon creation).'));
		o.depends('auto_moon', '1');

		o = s.option(form.Flag, 'enable_controller', _('Enable network controller'),
				_('Enable ZeroTier network controller functionality with ZTNCUI web interface.'));

		o = s.option(form.Value, 'controller_port', _('Controller web port'),
				_('Port for ZTNCUI web interface (default: 3000).'));
		o.datatype = 'port';
		o.value('3000');
		o.depends('enable_controller', '1');

		o = s.option(form.Flag, 'fw_allow_input', _('Allow input traffic'),
			_('Allow input traffic to the ZeroTier daemon.'));

		o = s.option(form.Button, '_panel', _('ZeroTier Central'),
			_('Create or manage your ZeroTier network, and auth clients who could access.'));
		o.inputtitle = _('Open website');
		o.inputstyle = 'apply';
		o.onclick = function() {
			window.open("https://my.zerotier.com/network", '_blank');
		}

		// Smart local controller button - auto-detect configured controller
		o = s.option(form.Button, '_local_controller', 
			hasLocalController ? _('Local Controller (Active)') : _('Local Controller'),
			hasLocalController 
				? _('Local controller is configured. Click to manage your self-hosted ZeroTier networks.')
				: _('Configure a local ZTNCUI or Zero-UI controller in the Controller page.'));
		o.inputtitle = hasLocalController ? _('Open Local Panel') : _('Configure');
		o.inputstyle = hasLocalController ? 'positive' : 'action';
		o.onclick = function() {
			if (localControllerUrl) {
				window.open(localControllerUrl, '_blank');
			} else if (enableController) {
				window.open('http://' + window.location.hostname + ':' + controllerPort, '_blank');
			} else {
				location.href = L.url('admin/vpn/zerotier/local-controller');
			}
		}

		o = s.option(form.Button, '_controller', _('Controller Settings'),
			_('Configure external ZTNCUI or Zero-UI controller connection.'));
		o.inputtitle = _('Settings');
		o.inputstyle = 'action';
		o.onclick = function() {
			location.href = L.url('admin/vpn/zerotier/external-controller');
		}

		o = s.option(form.Button, '_moon', _('Moon Manager'),
			_('Manage ZeroTier Moon nodes for better connectivity and performance.'));
		o.inputtitle = _('Open Moon Manager');
		o.inputstyle = 'apply';
		o.onclick = function() {
			location.href = L.url('admin/vpn/zerotier/moon');
		}

		s = m.section(form.GridSection, 'network', _('Network configuration'));
		s.addremove = true;
		s.rowcolors = true;
		s.sortable = true;
		s.nodescriptions = true;

		o = s.option(form.Flag, 'enabled', _('Enable'));
		o.default = o.enabled;
		o.editable = true;

		o = s.option(form.Value, 'id', _('Network ID'));
		o.rmempty = false;
		o.width = '20%';

		o = s.option(form.Flag, 'allow_managed', _('Allow managed IP/route'),
			_('Allow ZeroTier to set IP addresses and routes (local/private ranges only).'));
		o.default = o.enabled;
		o.editable = true;

		o = s.option(form.Flag, 'allow_global', _('Allow global IP/route'),
			_('Allow ZeroTier to set global/public/not-private range IPs and routes.'));
		o.editable = true;

		o = s.option(form.Flag, 'allow_default', _('Allow default route'),
			_('Allow ZeroTier to set the default route on the system.'));
		o.editable = true;

		o = s.option(form.Flag, 'allow_dns', _('Allow DNS'),
			_('Allow ZeroTier to set DNS servers.'));
		o.editable = true;

		o = s.option(form.Flag, 'fw_allow_input', _('Allow input'),
			_('Allow input traffic from the ZeroTier network.'));
		o.editable = true;

		o = s.option(form.Flag, 'fw_allow_forward', _('Allow forward'),
			_('Allow forward traffic from/to the ZeroTier network.'));
		o.editable = true;

		o = s.option(widgets.DeviceSelect, 'fw_forward_ifaces', _('Forward interfaces'),
			_('Leave empty for all.'));
		o.multiple = true;
		o.noaliases = true;
		o.depends('fw_allow_forward', '1');
		o.modalonly = true;

		o = s.option(form.Flag, 'fw_allow_masq', _('Masquerading'),
			_('Enable network address and port translation (NAT) for outbound traffic for this network.'));
		o.editable = true;

		o = s.option(widgets.DeviceSelect, 'fw_masq_ifaces', _('Masquerade interfaces'),
			_('Leave empty for all.'));
		o.multiple = true;
		o.noaliases = true;
		o.depends('fw_allow_masq', '1');
		o.modalonly = true;

		return m.render();
	}
});
