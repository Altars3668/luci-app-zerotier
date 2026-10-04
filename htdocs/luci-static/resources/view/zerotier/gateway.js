'use strict';
'require view';
'require dom';
'require ui';
'require uci';
'require rpc';
'require form';
'require zerotier.common as zt';

const callHostHints = rpc.declare({
	object: 'luci-rpc',
	method: 'getHostHints',
	expect: { '': {} }
});

const callSmbRelayStatus = rpc.declare({
	object: 'luci.zerotier',
	method: 'smbRelayStatus',
	expect: { relays: [] }
});

function ip2int(ip) {
	return ip.split('.').reduce((a, o) => a * 256 + (+o), 0);
}

function int2ip(n) {
	return [ n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255 ].join('.');
}

// "10.0.1.36/24" -> { net, mask, bits, text }
function subnetOf(cidr) {
	const p = (cidr || '').split('/');
	if (!zt.isIPv4(p[0]) || !/^\d+$/.test(p[1] || '') || +p[1] > 32)
		return null;
	const bits = +p[1];
	const mask = bits ? (0xffffffff << (32 - bits)) >>> 0 : 0;
	const net = (ip2int(p[0]) & mask) >>> 0;
	return { net, mask, bits, text: '%s/%d'.format(int2ip(net), bits) };
}

function inSubnet(ip, sn) {
	return zt.isIPv4(ip) && ((ip2int(ip) & sn.mask) >>> 0) == sn.net;
}

return view.extend({
	load() {
		return zt.getStatus().then((st) => Promise.all([
			st,
			callHostHints(),
			zt.getHostnames(),
			Promise.all(st.networks.filter((n) => n.controlled).map((n) => zt.ctlNetwork(n.id))),
			uci.load('zerotier'),
			L.resolveDefault(uci.load('zerotier-phone-dns'), null),
			L.resolveDefault(callSmbRelayStatus(), [])
		]));
	},

	// IPv4 subnets this router has on its ZeroTier networks
	subnets() {
		const out = [];
		this.status.networks.forEach((n) => (n.addresses || []).forEach((a) => {
			const sn = subnetOf(a);
			if (sn && !out.some((x) => x.text == sn.text))
				out.push(Object.assign(sn, { network: n.name || n.section || n.id, own: a.split('/')[0] }));
		}));
		return out;
	},

	// ZeroTier addresses taken by someone other than mapping `sid`
	usedAddresses(sid) {
		const used = {};
		this.status.networks.forEach((n) => (n.addresses || []).forEach((a) => { used[a.split('/')[0]] = _('this router'); }));
		this.controlled.forEach((c) => (c.members || []).forEach((m) => {
			if (m.id != this.status.address)
				(m.ipAssignments || []).forEach((ip) => { used[ip] = _('member %s').format(m.name || m.id); });
		}));
		uci.sections('zerotier', 'zt_device').forEach((d) => {
			if (d['.name'] != sid && d.zt_ip && d.enabled != '0')
				used[d.zt_ip] = _('device %s').format(d.name || d.ip);
		});
		return used;
	},

	// Controller pools an address falls into
	poolsHolding(ip) {
		const out = [];
		this.controlled.forEach((c) => (c.network.ipAssignmentPools || []).forEach((p) => {
			if (zt.isIPv4(p.ipRangeStart) && zt.isIPv4(p.ipRangeEnd) &&
			    ip2int(ip) >= ip2int(p.ipRangeStart) && ip2int(ip) <= ip2int(p.ipRangeEnd))
				out.push('%s (%s-%s)'.format(c.network.name || c.network.id, p.ipRangeStart, p.ipRangeEnd));
		}));
		return out;
	},

	// A free address in the router's ZeroTier subnet, outside the controller
	// pools: the LAN address's own host part if that is free, else the first
	suggest(lanIp, sid) {
		const sn = this.subnets()[0];
		if (!sn || !zt.isIPv4(lanIp))
			return null;
		const used = this.usedAddresses(sid);
		const free = (ip) => !used[ip] && !this.poolsHolding(ip).length;
		const size = (~sn.mask) >>> 0;
		const host = ip2int(lanIp) & size;
		if (host > 0 && host < size && free(int2ip((sn.net | host) >>> 0)))
			return int2ip((sn.net | host) >>> 0);
		for (let h = 1; h < Math.min(size, 65535); h++)
			if (free(int2ip((sn.net | h) >>> 0)))
				return int2ip((sn.net | h) >>> 0);
		return null;
	},

	lanHosts() {
		const out = [];
		Object.keys(this.hints).forEach((mac) => {
			const h = this.hints[mac];
			(h.ipaddrs || h.ipv4 || []).forEach((ip) => {
				if (zt.isIPv4(ip) && !this.subnets().some((sn) => inSubnet(ip, sn)))
					out.push({ mac: mac.toLowerCase(), ip, name: h.name || '' });
			});
		});
		return out.sort((a, b) => ip2int(a.ip) - ip2int(b.ip));
	},

	grantsUsing(name) {
		const out = [];
		uci.sections('zerotier', 'zt_member').concat(uci.sections('zerotier', 'zt_role')).forEach((s) => {
			L.toArray(s.allow).forEach((g) => {
				const t = String(g).trim().split(/\s+/)[0];
				if (t == 'device:' + name || t == 'device:*')
					out.push((s['.type'] == 'zt_role') ? _('role %s').format(s['.name']) : (s.name || s.node));
			});
		});
		return out.filter((x, i, a) => a.indexOf(x) == i);
	},

	relayStatus(sid) {
		const st = this.relays[sid];
		if (!st)
			return _('No relay status yet');
		if (!st.enabled)
			return '-';
		if (st.error)
			return zt.label(st.error, 'warning');

		const state = st.accelerated
			? zt.label(_('Ready'), 'success')
			: st.listening
				? zt.label(_('Listening, not accelerated'), 'warning')
				: st.readyFile
					? zt.label(_('Ready marker present, check listener'), 'warning')
					: zt.label(_('Not listening'), 'important');

		const details = [
			_('Client %s to %s:%d').format(st.client || '-', st.target || '-', st.externalPort || 445),
			st.congestion == 'bbr'
				? (st.bbrReady ? _('BBR available') : _('BBR not loaded'))
				: _('CUBIC selected'),
			st.vipReady ? _('VIP ready') : _('VIP not ready'),
			st.procdRunning ? _('procd reports running') : _('procd not running')
		];
		return zt.text(state, details.join('; '));
	},

	handleMapHost(host) {
		const s = this.deviceSection;
		const map = s.map;
		const sid = map.data.add('zerotier', 'zt_device');
		const name = (host.name || '').split('.')[0].replace(/[^A-Za-z0-9_.-]/g, '-') || 'device-' + host.ip.split('.').pop();

		map.data.set('zerotier', sid, 'enabled', '1');
		map.data.set('zerotier', sid, 'name', name);
		map.data.set('zerotier', sid, 'ip', host.ip);
		map.data.set('zerotier', sid, 'mac', host.mac);
		const zip = this.suggest(host.ip, sid);
		if (zip)
			map.data.set('zerotier', sid, 'zt_ip', zip);
		map.addedSection = sid;
		ui.hideModal();
		return s.renderMoreOptionsModal(sid);
	},

	handlePickHost() {
		const mapped = {};
		uci.sections('zerotier', 'zt_device').forEach((d) => { if (d.ip) mapped[d.ip] = true; });
		const t = new ui.Table([ _('Host'), _('LAN address'), _('MAC address'), '' ], { sortable: true },
			E('em', {}, _('No LAN hosts known')));
		t.update(this.lanHosts().map((h) => [
			h.name || '-',
			h.ip,
			h.mac,
			mapped[h.ip] ? _('Mapped')
				: E('button', { 'class': 'cbi-button cbi-button-add', 'click': ui.createHandlerFn(this, 'handleMapHost', h) }, _('Map'))
		]));
		ui.showModal(_('Map a LAN host'), [
			E('p', {}, _('Hosts the router knows from DHCP and its neighbour table.')),
			t.render(),
			E('div', { 'class': 'right' }, [ E('button', { 'class': 'cbi-button', 'click': ui.hideModal }, _('Cancel')) ])
		], 'cbi-modal');
	},

	renderDeviceMap() {
		const m = new form.Map('zerotier');
		let s, o;

		s = m.section(form.GridSection, 'zt_device', _('Mapped devices'));
		s.addremove = true;
		s.anonymous = true;
		s.nodescriptions = true;
		s.addbtntitle = _('Add mapping…');
		s.modaltitle = (sid) => _('Mapped device') + ' » ' + (uci.get('zerotier', sid, 'name') || _('new'));
		this.deviceSection = s;

		o = s.option(form.Flag, 'enabled', _('Enabled'));
		o.default = '1';
		o.rmempty = false;
		o.editable = true;

		o = s.option(form.Value, 'name', _('Name'),
			_('Grants refer to the device by this name (device:NAME).'));
		o.rmempty = false;
		o.validate = (sid, v) => {
			if (!/^[A-Za-z0-9_.-]+$/.test(v || ''))
				return _('Letters, digits, ".", "-" and "_" only');
			return uci.sections('zerotier', 'zt_device').some((d) => d['.name'] != sid && d.name == v)
				? _('Another device already has this name') : true;
		};

		o = s.option(form.Value, 'ip', _('LAN address'));
		o.datatype = 'ip4addr("nomask")';
		o.rmempty = false;
		this.lanHosts().forEach((h) => o.value(h.ip, '%s (%s)'.format(h.ip, h.name || h.mac)));
		o.textvalue = (sid) => {
			const ip = uci.get('zerotier', sid, 'ip');
			const host = this.lanHosts().filter((h) => h.ip == ip)[0];
			return zt.text(ip || '-', host ? host.name : null);
		};

		o = s.option(form.Value, 'zt_ip', _('ZeroTier address'),
			_('The address members reach the device at. It has to lie in a ZeroTier subnet of this router, must not be taken, and should stay outside the address pools of the controller.'));
		o.datatype = 'ip4addr("nomask")';
		o.rmempty = false;
		o.validate = (sid, v) => {
			if (!v)
				return _('Required');
			const sns = this.subnets();
			if (sns.length && !sns.some((sn) => inSubnet(v, sn)))
				return _('Not in a ZeroTier subnet of this router: %s').format(sns.map((sn) => sn.text).join(', '));
			const used = this.usedAddresses(sid)[v];
			return used ? _('Already taken by %s').format(used) : true;
		};
		o.textvalue = (sid) => {
			const ip = uci.get('zerotier', sid, 'zt_ip');
			const pools = ip ? this.poolsHolding(ip) : [];
			return pools.length
				? zt.text(ip, zt.label(_('In an auto-assign pool'), 'warning',
					_('The controller may hand this address to a new member: %s. Narrow the pool on the Controller page.').format(pools.join(', '))))
				: (ip || '-');
		};

		o = s.option(form.Value, 'mac', _('MAC address'),
			_('Optional; lets the page recognize the device.'));
		o.datatype = 'macaddr';
		o.modalonly = true;

		o = s.option(form.DummyValue, '_grants', _('Granted to'));
		o.modalonly = false;
		o.textvalue = (sid) => {
			const users = this.grantsUsing(uci.get('zerotier', sid, 'name'));
			return users.length ? users.join(', ') : E('em', {}, _('nobody (on networks with member permissions)'));
		};

		o = s.option(form.Flag, 'smb_relay', _('SMB relay'),
			_('Enable a pure TCP byte relay for this device only. Windows SMB authentication, signing and sealing stay end-to-end; the Windows audit source address becomes this router on the LAN, not the remote client.'));
		o.default = '0';
		o.rmempty = false;
		o.modalonly = true;

		o = s.option(form.Value, 'relay_client_ip', _('Allowed client'),
			_('Single IPv4 address of the ZeroTier client allowed to use the relay. Revoking this device grant also revokes the forwarding path.'));
		o.depends('smb_relay', '1');
		o.datatype = 'ip4addr("nomask")';
		o.validate = (sid, v) => zt.isIPv4(v) ? true : _('A single IPv4 address is required');
		o.modalonly = true;

		o = s.option(form.Value, 'relay_port', _('Internal relay port'),
			_('High port bound on the device ZeroTier address. Do not use 1445 or privileged ports.'));
		o.depends('smb_relay', '1');
		o.default = '14445';
		o.placeholder = '14445';
		o.validate = (sid, v) => {
			const n = +v;
			return (/^\d+$/.test(v || '') && n > 1024 && n <= 65535 && n != 1445)
				? true : _('Use a high TCP port above 1024, but not 1445');
		};
		o.modalonly = true;

		o = s.option(form.ListValue, 'relay_external_port', _('SMB port'));
		o.depends('smb_relay', '1');
		o.value('445', _('445 (SMB)'));
		o.value('19445', _('19445 (canary)'));
		o.default = '445';
		o.rmempty = false;
		o.modalonly = true;

		o = s.option(form.ListValue, 'relay_congestion', _('Congestion control'),
			_('BBR can help long-distance Linux socket forwarding. This page shows acceleration only when BBR is available, the VIP is ready and the relay is listening.'));
		o.depends('smb_relay', '1');
		o.value('bbr', _('BBR'));
		o.value('cubic', _('CUBIC'));
		o.default = 'bbr';
		o.rmempty = false;
		o.modalonly = true;

		o = s.option(form.DummyValue, '_relay_status', _('Relay status'),
			_('Read-only status from the relay service and listener. The ready marker alone is only a clue, not proof that the relay is running.'));
		o.modalonly = false;
		o.textvalue = L.bind(this.relayStatus, this);

		return m;
	},

	renderHostMap() {
		const m = new form.Map('zerotier-phone-dns');
		let s, o;

		s = m.section(form.GridSection, 'device', _('Stable host names'),
			_('A local host name that follows a device between its own ZeroTier client and its mapped LAN address: the router checks every minute which of the two answers and points the name there (dnsmasq).'));
		s.addremove = true;
		s.anonymous = false;
		s.nodescriptions = true;
		s.addbtntitle = _('Add host name…');

		o = s.option(form.Value, 'hostname', _('Host name'));
		o.datatype = 'hostname';
		o.rmempty = false;

		o = s.option(form.Value, 'primary_ip', _('Preferred address'),
			_('Used whenever it answers, e.g. the address of the device\'s own ZeroTier client.'));
		o.datatype = 'ipaddr("nomask")';
		o.rmempty = false;

		o = s.option(form.Value, 'fallback_ip', _('Fallback address'),
			_('Used otherwise, e.g. the ZeroTier address mapped to the device on the LAN.'));
		o.datatype = 'ipaddr("nomask")';

		o = s.option(form.DummyValue, '_current', _('Points to'));
		o.modalonly = false;
		o.textvalue = (sid) => {
			const h = this.hosts.filter((x) => x.section == sid)[0];
			return (h && h.current) ? h.current : '-';
		};

		return m;
	},

	render(data) {
		const [ st, hints, hosts, controlled ] = data;
		this.status = st;
		this.hints = hints || {};
		this.hosts = hosts || [];
		this.controlled = (controlled || []).filter((c) => c && c.network);
		const hasHostConf = data[5] != null;
		this.relays = {};
		(data[6] || []).forEach((r) => { this.relays[r.section] = r; });
		zt.css();

		const sns = this.subnets();
		const maps = [ this.renderDeviceMap() ];
		if (hasHostConf)
			maps.push(this.renderHostMap());

		return Promise.all(maps.map((m) => m.render())).then((nodes) => E([], [
			E('h2', {}, _('LAN gateway')),
			E('div', { 'class': 'cbi-map-descr' },
				_('Give devices on the LAN an address on the ZeroTier network, so that members reach them without ZeroTier installed on the device (1:1 NAT through this router). Who may reach them is decided on the Permissions page.')),
			sns.length ? '' : zt.alert('warning', _('This router has no IPv4 address on a ZeroTier network yet, so no device can be mapped.')),
			zt.section(null, [
				zt.kvTable(sns.map((sn) => [ _('ZeroTier subnet'), _('%s on %s, this router at %s').format(sn.text, sn.network, sn.own) ])),
				E('div', { 'class': 'cbi-section-create' }, [
					E('button', { 'class': 'cbi-button cbi-button-add', 'click': ui.createHandlerFn(this, 'handlePickHost') }, _('Map a LAN host…'))
				])
			]),
			nodes[0],
			nodes[1] || ''
		]));
	},

	handleSaveApply: null
});
