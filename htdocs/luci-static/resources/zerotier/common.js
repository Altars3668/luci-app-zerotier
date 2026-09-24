'use strict';
'require baseclass';
'require rpc';
'require ui';
'require uqr';

// Shared by the ZeroTier views: backend calls, ZeroTier specifics, and small
// helpers that build the same elements LuCI's own pages use.

function declare(method, params, expect) {
	return rpc.declare({
		object: 'luci.zerotier',
		method: method,
		params: params || [],
		expect: expect || { '': {} }
	});
}

const STATUS = {
	OK: [ 'success', _('Connected') ],
	REQUESTING_CONFIGURATION: [ 'notice', _('Waiting for the controller') ],
	ACCESS_DENIED: [ 'important', _('Not authorized') ],
	NOT_FOUND: [ 'important', _('Network not found') ],
	PORT_ERROR: [ 'important', _('Interface error') ],
	CLIENT_TOO_OLD: [ 'important', _('Client too old') ],
	AUTHENTICATION_REQUIRED: [ 'warning', _('Authentication required') ],
	NOT_JOINED: [ null, _('Not joined') ],
	DISABLED: [ null, _('Disabled') ]
};

// Newer LuCI gives the name of a named section a cell of its own, while the
// Argon theme still prints it in front of the row as well: hide Argon's copy,
// but only where LuCI's cell is there.
const CSS = `
@media screen and (min-width:768px){
#cbi-zerotier .cbi-section-table-titles.named.cbi-value-first-field::before,#cbi-zerotier .cbi-section-table-row[data-title]:has(>td.cbi-value-first-field)::before,
#cbi-zerotier-phone-dns .cbi-section-table-titles.named.cbi-value-first-field::before,#cbi-zerotier-phone-dns .cbi-section-table-row[data-title]:has(>td.cbi-value-first-field)::before{content:none!important;display:none!important}
}
`;

return baseclass.extend({
	getStatus: declare('status'),
	getPeers: declare('peers', [], { peers: [] }),
	getPermissions: declare('permissions'),
	getPreview: declare('preview'),
	getLog: declare('log', [ 'lines' ], { log: '' }),
	probe: declare('probe', [ 'ip' ]),
	ctlNetworks: declare('ctlNetworks'),
	ctlNetwork: declare('ctlNetwork', [ 'id' ]),
	ctlNetworkCreate: declare('ctlNetworkCreate', [ 'name' ]),
	ctlNetworkUpdate: declare('ctlNetworkUpdate', [ 'id', 'config' ]),
	ctlNetworkDelete: declare('ctlNetworkDelete', [ 'id' ]),
	ctlMemberUpdate: declare('ctlMemberUpdate', [ 'id', 'member', 'config' ]),
	ctlMemberDelete: declare('ctlMemberDelete', [ 'id', 'member' ]),
	moonStatus: declare('moonStatus'),
	moonAction: declare('moonAction', [ 'action', 'endpoint', 'port', 'moon' ]),
	moonEndpoints: declare('moonEndpoints', [], { '': { current: [], desired: [] } }),
	getHostnames: declare('hostnames', [], { hosts: [] }),

	getDevices: rpc.declare({
		object: 'luci-rpc',
		method: 'getNetworkDevices',
		expect: { '': {} }
	}),

	initAction: rpc.declare({
		object: 'rc',
		method: 'init',
		params: [ 'name', 'action' ]
	}),

	css() {
		if (!document.getElementById('zt-style'))
			document.head.appendChild(E('style', { id: 'zt-style' }, CSS));
	},

	// A status label, as LuCI's own pages show them; kind is one of the
	// theme's label classes: success, notice, warning, important
	label(text, kind, title) {
		return E('span', { 'class': kind ? 'label ' + kind : 'label', 'title': title || null }, text);
	},

	statusLabel(status) {
		const s = STATUS[status] || [ 'warning', status || _('Unknown') ];
		return this.label(s[1], s[0], status);
	},

	// Items one per line (LuCI's dom.append does not flatten nested arrays)
	lines(items) {
		const out = [];
		items.forEach((it, i) => {
			if (i)
				out.push(E('br'));
			out.push(it);
		});
		return E('span', {}, out);
	},

	// Main text with a smaller second line
	text(main, sub) {
		return sub ? E('span', {}, [ main, E('br'), E('small', {}, sub) ]) : main;
	},

	// A two-column table of names and values, as on Status > Overview
	kvTable(rows) {
		return E('table', { 'class': 'table' }, rows.filter((r) => r).map((r) =>
			E('tr', { 'class': 'tr' }, [
				E('td', { 'class': 'td left', 'width': '33%' }, r[0]),
				E('td', { 'class': 'td left' }, r[1])
			])));
	},

	// kind: warning or error
	alert(kind, content) {
		return E('div', { 'class': 'alert-message ' + kind }, content);
	},

	section(title, children, descr) {
		return E('div', { 'class': 'cbi-section' }, [
			title ? E('h3', {}, title) : '',
			descr ? E('div', { 'class': 'cbi-section-descr' }, descr) : ''
		].concat(children));
	},

	bytes(n) {
		return (n == null) ? '-' : '%1024.2mB'.format(n);
	},

	// Time since a millisecond timestamp
	ago(ms) {
		if (!ms)
			return '-';
		const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
		return s < 5 ? _('just now') : _('%s ago').format('%t'.format(s));
	},

	date(ms) {
		return ms ? new Date(ms).toLocaleString() : '-';
	},

	// Result of a backend call that answers { error: ... } on failure
	check(res, okText) {
		if (res && res.error) {
			ui.addNotification(null, E('p', {}, _('Failed: %s').format(res.error)), 'error');
			return false;
		}
		if (okText)
			ui.addTimeLimitedNotification(null, E('p', {}, okText), 4000, 'info');
		return true;
	},

	qr(text) {
		const node = E('div', { 'style': 'display:inline-block;width:180px' });
		node.innerHTML = uqr.renderSVG(text, { pixelSize: 4, ecc: 'M' });
		return node;
	},

	// The MAC ZeroTier gives node `node` on network `nwid` (MAC::fromAddress):
	// what the router's firewall recognizes a member by
	mac(nwid, node) {
		if (!/^[0-9a-f]{16}$/.test(nwid) || !/^[0-9a-f]{10}$/.test(node))
			return null;
		const n = (i) => parseInt(nwid.substr(i, 2), 16);
		const a = (i) => parseInt(node.substr(i, 2), 16);
		let first = (n(14) & 0xfe) | 0x02;
		if (first == 0x52)
			first = 0x32;
		return [ first, a(0) ^ n(12), a(2) ^ n(10), a(4) ^ n(8), a(6) ^ n(6), a(8) ^ n(4) ]
			.map((b) => ('0' + b.toString(16)).slice(-2)).join(':');
	},

	isIPv4(s) {
		const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s || '');
		return !!m && m.slice(1).every((o) => +o <= 255 && (o.length == 1 || o[0] != '0'));
	},

	isIPv6(s) {
		if (!/^[0-9a-fA-F:]+$/.test(s || '') || s.indexOf(':') < 0 || /:::/.test(s) ||
		    /^:[^:]/.test(s) || /[^:]:$/.test(s))
			return false;
		const dbl = s.split('::').length - 1;
		const groups = s.split(':').filter((g) => g != '');
		if (dbl > 1 || groups.some((g) => g.length > 4))
			return false;
		return dbl ? groups.length < 8 : groups.length == 8;
	},

	isPrefix(s) {
		const p = (s || '').split('/');
		if (p.length > 2 || (p.length == 2 && !/^\d{1,3}$/.test(p[1])))
			return false;
		if (this.isIPv4(p[0]))
			return p.length == 1 || +p[1] <= 32;
		return this.isIPv6(p[0]) && (p.length == 1 || +p[1] <= 128);
	},

	// A port token of a grant, as zerotier-fw4 accepts it
	checkPort(tok) {
		if (tok == 'icmp')
			return true;
		const m = /^(tcp|udp)\/(\d+)(?:-(\d+))?$/.exec(tok);
		if (!m)
			return false;
		const lo = +m[2], hi = (m[3] != null) ? +m[3] : lo;
		return lo >= 1 && hi <= 65535 && lo <= hi;
	},

	// Validate one grant ("<target> [<port>...]") against the zt_device,
	// zt_member and zt_role names of the configuration
	checkGrant(value, devices, members, roles) {
		const parts = String(value || '').trim().split(/\s+/);
		const target = parts.shift();
		let m;

		if (!target)
			return _('Empty grant');
		if (target == 'router' || target == 'lan' || target == 'wan' || target == 'device:*')
			;
		else if ((m = /^device:(.+)$/.exec(target))) {
			if (devices && devices.indexOf(m[1]) < 0)
				return _('No LAN gateway device named "%s"').format(m[1]);
		}
		else if ((m = /^net:(.+)$/.exec(target))) {
			if (!this.isPrefix(m[1]))
				return _('"%s" is not an IPv4 or IPv6 prefix').format(m[1]);
		}
		else if ((m = /^member:(.+)$/.exec(target))) {
			if (members && members.indexOf(m[1]) < 0 && !/^[0-9a-f]{10}$/.test(m[1]))
				return _('No member named "%s"').format(m[1]);
		}
		else if ((m = /^group:(.+)$/.exec(target))) {
			if (roles && roles.indexOf(m[1]) < 0)
				return _('No role named "%s"').format(m[1]);
		}
		else
			return _('Unknown target "%s"').format(target);

		for (let i = 0; i < parts.length; i++)
			if (!this.checkPort(parts[i]))
				return _('Invalid port "%s": use tcp/22, udp/53, tcp/8000-8100 or icmp').format(parts[i]);

		return true;
	},

	// Human readable form of a grant
	describeGrant(value) {
		const parts = String(value || '').trim().split(/\s+/);
		const target = parts.shift();
		const ports = parts.length ? parts.join(' ') : _('all traffic');
		let m, what;

		if (target == 'router')
			what = _('this router');
		else if (target == 'lan')
			what = _('the LAN');
		else if (target == 'wan')
			what = _('the internet');
		else if (target == 'device:*')
			what = _('every LAN gateway device');
		else if ((m = /^device:(.+)$/.exec(target)))
			what = _('device %s').format(m[1]);
		else if ((m = /^net:(.+)$/.exec(target)))
			what = _('network %s').format(m[1]);
		else if ((m = /^member:(.+)$/.exec(target)))
			what = _('member %s').format(m[1]);
		else if ((m = /^group:(.+)$/.exec(target)))
			what = _('group %s').format(m[1]);
		else
			what = target;

		return '%s: %s'.format(what, ports);
	}
});
