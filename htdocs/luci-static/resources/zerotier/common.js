'use strict';
'require baseclass';
'require rpc';
'require ui';
'require uqr';

// Shared by the ZeroTier views: backend calls, ZeroTier specifics and a few
// small rendering helpers.

function declare(method, params, expect) {
	return rpc.declare({
		object: 'luci.zerotier',
		method: method,
		params: params || [],
		expect: expect || { '': {} }
	});
}

const STATUS = {
	OK: [ 'ok', _('Connected') ],
	REQUESTING_CONFIGURATION: [ 'warn', _('Waiting for the controller') ],
	ACCESS_DENIED: [ 'bad', _('Not authorized') ],
	NOT_FOUND: [ 'bad', _('Network not found') ],
	PORT_ERROR: [ 'bad', _('Interface error') ],
	CLIENT_TOO_OLD: [ 'bad', _('Client too old') ],
	AUTHENTICATION_REQUIRED: [ 'warn', _('Authentication required') ],
	NOT_JOINED: [ 'muted', _('Not joined') ],
	DISABLED: [ 'muted', _('Disabled') ]
};

// The last rule: newer LuCI gives the name of a named section a cell of its
// own, while the Argon theme still prints it in front of the row as well -
// hide Argon's copy, but only where LuCI's cell is there
const CSS = `
.zt-badge{display:inline-block;padding:0 .6em;border-radius:1em;font-size:.85em;line-height:1.7;white-space:nowrap;border:1px solid rgba(128,128,128,.35);margin:.1em .25em .1em 0}
.zt-ok{background:rgba(46,160,67,.14);color:#2a9142;border-color:rgba(46,160,67,.45)}
.zt-warn{background:rgba(210,153,34,.15);color:#a36d0b;border-color:rgba(210,153,34,.5)}
.zt-bad{background:rgba(218,54,51,.13);color:#cf2c29;border-color:rgba(218,54,51,.45)}
.zt-info{background:rgba(56,139,253,.13);color:#2f6fd0;border-color:rgba(56,139,253,.45)}
.zt-muted{opacity:.75}
.zt-mono{font-family:monospace;white-space:nowrap}
.zt-small{font-size:.85em;opacity:.8}
.zt-cards{display:flex;flex-wrap:wrap;gap:1em;margin:0 0 1.5em}
.zt-card{flex:1 1 230px;border:1px solid rgba(128,128,128,.3);border-radius:6px;padding:.8em 1em}
.zt-card h4{margin:0 0 .5em;font-size:.9em;font-weight:normal;opacity:.75;text-transform:uppercase;letter-spacing:.03em}
.zt-card .zt-big{font-size:1.35em;font-weight:bold;margin:.1em 0 .3em}
.zt-card .cbi-button{margin:.4em .4em 0 0}
.zt-note{border-left:3px solid #388bfd;padding:.5em .9em;margin:.6em 0;background:rgba(56,139,253,.07)}
.zt-note.zt-warn{border-left-color:#d29922;background:rgba(210,153,34,.08);color:inherit}
.zt-note.zt-bad{border-left-color:#da3633;background:rgba(218,54,51,.07);color:inherit}
.zt-note.zt-info{border-left-color:#388bfd;background:rgba(56,139,253,.07);color:inherit}
.zt-note ul{margin:.3em 0 0 1.2em}
.zt-pre{max-height:28em;overflow:auto;font-size:.85em;white-space:pre;padding:.6em;border:1px solid rgba(128,128,128,.3);border-radius:4px}
.zt-actions{display:flex;flex-wrap:wrap;gap:.4em;margin:.6em 0}
.zt-qr svg{width:180px;height:180px}
.zt-sub{font-size:1.1em;font-weight:600;margin:1.4em 0 .5em}
.zt-body{padding:0 1em}
.zt-body>div{margin:.25em 0}
.zt-descr{font-size:.9em;opacity:.8;margin:.4em 0}
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

	badge(text, kind, title) {
		return E('span', { 'class': 'zt-badge zt-' + (kind || 'muted'), 'title': title || '' }, text);
	},

	statusBadge(status) {
		const s = STATUS[status] || [ 'warn', status || _('Unknown') ];
		return this.badge(s[1], s[0], status);
	},

	mono(text) {
		return E('span', { 'class': 'zt-mono' }, text);
	},

	small(text) {
		return E('div', { 'class': 'zt-small' }, text);
	},

	note(kind, content) {
		return E('div', { 'class': 'zt-note zt-' + kind }, content);
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
			ui.addNotification(null, E('p', _('Failed: %s').format(res.error)), 'error');
			return false;
		}
		if (okText)
			ui.addTimeLimitedNotification(null, E('p', okText), 4000, 'info');
		return true;
	},

	copyButton(text) {
		return E('button', {
			'class': 'cbi-button cbi-button-neutral',
			'style': 'padding:0 .5em;margin-left:.4em',
			'title': _('Copy'),
			'click': function(ev) {
				ev.preventDefault();
				const done = () => ui.addTimeLimitedNotification(null, E('p', _('Copied: %s').format(text)), 2500, 'info');
				if (navigator.clipboard && window.isSecureContext)
					navigator.clipboard.writeText(text).then(done);
				else {
					const t = E('textarea', { 'style': 'position:fixed;opacity:0' }, text);
					document.body.appendChild(t);
					t.select();
					document.execCommand('copy');
					document.body.removeChild(t);
					done();
				}
			}
		}, '⧉');
	},

	qr(text) {
		const svg = uqr.renderSVG(text, { pixelSize: 4, ecc: 'M' });
		const node = E('div', { 'class': 'zt-qr' });
		node.innerHTML = svg;
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

	// Validate one grant ("<target> [<port>...]"); names are the zt_device
	// and zt_member names known in the configuration
	checkGrant(value, devices, members) {
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
		else
			what = target;

		return '%s: %s'.format(what, ports);
	}
});
