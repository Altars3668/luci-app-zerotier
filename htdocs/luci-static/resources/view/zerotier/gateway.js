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

function ip2int(ip) {
	return ip.split('.').reduce((a, o) => a * 256 + (+o), 0);
}

function int2ip(n) {
	return [ n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255 ].join('.');
}

// "10.0.1.36/24" -> { net, mask, bits }
function subnetOf(cidr) {
	const p = (cidr || '').split('/');
	if (!zt.isIPv4(p[0]) || !/^\d+$/.test(p[1] || '') || +p[1] > 32)
		return null;
	const bits = +p[1];
	const mask = bits ? (0xffffffff << (32 - bits)) >>> 0 : 0;
	return { net: (ip2int(p[0]) & mask) >>> 0, mask, bits, text: '%s/%d'.format(int2ip((ip2int(p[0]) & mask) >>> 0), bits) };
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
			L.resolveDefault(uci.load('zerotier-phone-dns'), null)
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

	// Same last octet in the router's ZeroTier subnet, unless taken
	suggest(lanIp, sid) {
		const sn = this.subnets()[0];
		if (!sn || !zt.isIPv4(lanIp))
			return null;
		const used = this.usedAddresses(sid);
		const host = ip2int(lanIp) & ~sn.mask;
		const first = int2ip((sn.net | host) >>> 0);
		if (!used[first] && host > 0 && (host | sn.mask) >>> 0 != 0xffffffff)
			return first;
		for (let h = 2; h < Math.min(~sn.mask >>> 0, 65534); h++) {
			const ip = int2ip((sn.net | h) >>> 0);
			if (!used[ip])
				return ip;
		}
		return null;
	},

	// Controller pools a mapping address falls into
	poolsHolding(ip) {
		const out = [];
		this.controlled.forEach((c) => (c.network.ipAssignmentPools || []).forEach((p) => {
			if (zt.isIPv4(p.ipRangeStart) && zt.isIPv4(p.ipRangeEnd) &&
			    ip2int(ip) >= ip2int(p.ipRangeStart) && ip2int(ip) <= ip2int(p.ipRangeEnd))
				out.push('%s (%s-%s)'.format(c.network.name || c.network.id, p.ipRangeStart, p.ipRangeEnd));
		}));
		return out;
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
		const t = new ui.Table([ _('Host'), _('LAN address'), _('MAC'), '' ], { sortable: true }, E('em', _('No LAN hosts known')));
		t.update(this.lanHosts().map((h) => [
			h.name || '-',
			zt.mono(h.ip),
			zt.mono(h.mac),
			mapped[h.ip] ? zt.badge(_('Mapped'), 'ok')
				: E('button', { 'class': 'cbi-button cbi-button-add', 'click': ui.createHandlerFn(this, 'handleMapHost', h) }, _('Map'))
		]));
		ui.showModal(_('Map a LAN host'), [
			E('p', _('Hosts the router knows from DHCP and its neighbour table.')),
			t.render(),
			E('div', { 'class': 'right' }, E('button', { 'class': 'cbi-button', 'click': ui.hideModal }, _('Cancel')))
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
		o.textvalue = (sid) => E('strong', uci.get('zerotier', sid, 'name') || '-');

		o = s.option(form.Value, 'ip', _('LAN address'));
		o.datatype = 'ip4addr("nomask")';
		o.rmempty = false;
		this.lanHosts().forEach((h) => o.value(h.ip, '%s (%s)'.format(h.ip, h.name || h.mac)));
		o.textvalue = (sid) => {
			const ip = uci.get('zerotier', sid, 'ip');
			const host = this.lanHosts().filter((h) => h.ip == ip)[0];
			return E('div', [ zt.mono(ip || '-'), host && host.name ? zt.small(host.name) : '' ]);
		};

		o = s.option(form.Value, 'zt_ip', _('ZeroTier address'),
			_('The address members reach the device at. It has to lie in a ZeroTier subnet of this router and must not be taken.'));
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
			return E('div', [
				zt.mono(ip || '-'),
				pools.length ? E('div', {}, zt.badge(_('In an auto-assign pool'), 'warn',
					_('The controller may hand this address to a new member: %s. Narrow the pool on the Controller page.').format(pools.join(', ')))) : ''
			]);
		};

		o = s.option(form.Value, 'mac', _('MAC address'),
			_('Optional; lets the page recognize the device.'));
		o.datatype = 'macaddr';
		o.modalonly = true;

		o = s.option(form.DummyValue, '_grants', _('Granted to'));
		o.modalonly = false;
		o.textvalue = (sid) => {
			const users = this.grantsUsing(uci.get('zerotier', sid, 'name'));
			return users.length ? users.join(', ') : E('span', { 'class': 'zt-small' }, _('nobody (on networks with member permissions)'));
		};

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
			return (h && h.current) ? zt.mono(h.current) : '-';
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
		zt.css();

		const sns = this.subnets();
		const maps = [ this.renderDeviceMap() ];
		if (hasHostConf)
			maps.push(this.renderHostMap());

		return Promise.all(maps.map((m) => m.render())).then((nodes) => E([], [
			E('h2', _('LAN gateway')),
			E('div', { 'class': 'cbi-map-descr' },
				_('Give devices on the LAN an address on the ZeroTier network, so that members reach them without ZeroTier installed on the device (1:1 NAT through this router). Who may reach them is decided on the Permissions page.')),
			sns.length
				? zt.note('info', _('ZeroTier subnets of this router: %s').format(sns.map((sn) => '%s (%s, %s)'.format(sn.text, sn.network, _('own address %s').format(sn.own))).join('; ')))
				: zt.note('warn', _('This router has no IPv4 address on a ZeroTier network yet, so no device can be mapped.')),
			E('div', { 'class': 'zt-actions' }, [
				E('button', { 'class': 'cbi-button cbi-button-add', 'click': ui.createHandlerFn(this, 'handlePickHost') }, _('Map a LAN host…'))
			]),
			nodes[0],
			nodes[1] || ''
		]));
	}
});
