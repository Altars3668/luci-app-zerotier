'use strict';
'require view';
'require dom';
'require poll';
'require ui';
'require uci';
'require zerotier.common as zt';

const ROLE_KIND = { PLANET: 'info', MOON: 'ok', LEAF: 'muted' };

return view.extend({
	load() {
		return Promise.all([
			zt.getStatus(),
			zt.getPeers(),
			zt.getDevices(),
			zt.getLog(60),
			uci.load('zerotier')
		]);
	},

	// Names the permission page knows members by
	memberNames() {
		const names = {};
		uci.sections('zerotier', 'zt_member', (s) => {
			if (s.node && s.name)
				names[s.node.toLowerCase()] = s.name;
		});
		return names;
	},

	handleService(action) {
		return zt.initAction('zerotier', action)
			.then(() => new Promise((resolve) => window.setTimeout(resolve, action == 'stop' ? 1500 : 4000)))
			.then(() => this.refresh());
	},

	renderCards(st) {
		const acl = st.networks.filter((n) => n.policy == 'acl' && n.status == 'OK');
		const open = st.networks.filter((n) => n.policy != 'acl' && n.status == 'OK');
		const controlled = st.networks.filter((n) => n.controlled);
		const unguarded = acl.filter((n) => !n.guarded);

		const service = E('div', { 'class': 'zt-card' }, [
			E('h4', _('Service')),
			E('div', { 'class': 'zt-big' }, st.running ? zt.badge(_('Running'), 'ok') : zt.badge(_('Stopped'), 'bad')),
			E('div', [
				st.running
					? E('button', { 'class': 'cbi-button cbi-button-action', 'click': ui.createHandlerFn(this, 'handleService', 'restart') }, _('Restart'))
					: E('button', { 'class': 'cbi-button cbi-button-positive', 'click': ui.createHandlerFn(this, 'handleService', 'start') }, _('Start')),
				st.running
					? E('button', { 'class': 'cbi-button cbi-button-negative', 'click': ui.createHandlerFn(this, 'handleService', 'stop') }, _('Stop'))
					: ''
			])
		]);

		const node = E('div', { 'class': 'zt-card' }, [
			E('h4', _('This node')),
			st.address
				? E('div', { 'class': 'zt-big' }, [ zt.mono(st.address), zt.copyButton(st.address) ])
				: E('div', { 'class': 'zt-big' }, '-'),
			E('div', [
				st.running ? (st.online ? zt.badge(_('Online'), 'ok') : zt.badge(_('Offline'), 'bad')) : '',
				st.tcpFallback ? zt.badge(_('TCP relay'), 'warn', _('No UDP path: traffic goes through the ZeroTier TCP relay')) : '',
				st.version ? zt.badge('v' + st.version, 'muted') : ''
			]),
			st.running ? zt.small(_('Ports: %s').format(st.ports.filter((p) => p).join(', '))) : ''
		]);

		const controller = E('div', { 'class': 'zt-card' }, [
			E('h4', _('Controller')),
			E('div', { 'class': 'zt-big' }, st.controller
				? zt.badge(_('Available'), 'ok')
				: zt.badge(_('Not available'), 'muted')),
			st.controller
				? E('div', [
					zt.small(_('Networks joined here that this node controls: %d').format(controlled.length)),
					E('a', { 'href': L.url('admin/vpn/zerotier/controller') }, _('Manage networks and members') + ' »')
				])
				: zt.small(_('Networks are managed by another controller'))
		]);

		const fw = E('div', { 'class': 'zt-card' }, [
			E('h4', _('Firewall')),
			E('div', { 'class': 'zt-big' }, unguarded.length
				? zt.badge(_('Rules missing'), 'bad')
				: acl.length ? zt.badge(_('Member permissions'), 'ok') : open.length ? zt.badge(_('Open'), 'warn') : zt.badge(_('No networks'), 'muted')),
			acl.length ? zt.small(_('%d network(s) under member permissions').format(acl.length)) : '',
			open.length ? zt.small(_('%d network(s) open to every member').format(open.length)) : '',
			st.firewall.catchall ? zt.small(_('ZeroTier interfaces not identified yet are denied')) : '',
			E('a', { 'href': L.url('admin/vpn/zerotier/permissions') }, _('Member permissions') + ' »')
		]);

		return E('div', { 'class': 'zt-cards' }, [ service, node, controller, fw ]);
	},

	renderAccess(n) {
		const out = [];
		if (n.policy == 'acl') {
			out.push(zt.badge(_('Member permissions'), 'ok', _('Default deny: members only reach what they were granted')));
			if (n.status == 'OK' && !n.guarded)
				out.push(zt.badge(_('Rules missing'), 'bad', _('The permission rules of this interface are not loaded')));
		}
		else if (n.status == 'OK' || n.status == 'REQUESTING_CONFIGURATION')
			out.push(zt.badge(_('Open to all members'), 'warn', _('Every member gets what fw_allow_input / fw_allow_forward open')));

		if (n.controlled)
			out.push(n.isolation
				? zt.badge(_('Members isolated'), 'ok', _('Members only reach the gateways and what member grants allow'))
				: zt.badge(_('Members see each other'), 'muted', _('Member to member traffic is not restricted')));

		return out;
	},

	renderNetworks(st, devices) {
		const table = new ui.Table([
			_('Network'), _('Network ID'), _('Status'), _('Interface'), _('Addresses'), _('Traffic'), _('Access')
		], { sortable: true }, E('em', _('No network joined yet. Add one on the Settings page.')));

		table.update(st.networks.map((n) => {
			const stats = (devices[n.dev] || {}).stats || {};
			return [
				[ n.name || n.section || '-', E('div', [ E('strong', n.name || '-'), n.section ? zt.small(n.section) : '' ]) ],
				E('div', [ zt.mono(n.id), zt.copyButton(n.id) ]),
				[ n.status, zt.statusBadge(n.status) ],
				n.dev ? E('div', [ zt.mono(n.dev), n.mac ? zt.small(n.mac) : '' ]) : '-',
				n.addresses.length ? E('div', n.addresses.map((a) => E('div', {}, zt.mono(a)))) : '-',
				n.dev ? E('div', [ zt.small('↓ ' + zt.bytes(stats.rx_bytes)), zt.small('↑ ' + zt.bytes(stats.tx_bytes)) ]) : '-',
				E('div', {}, this.renderAccess(n))
			];
		}));

		return table.render();
	},

	renderPeers(peers) {
		const names = this.memberNames();
		const order = { LEAF: 0, MOON: 1, PLANET: 2 };
		const table = new ui.Table([
			_('Peer'), _('Role'), _('Version'), _('Latency'), _('Path'), _('Last activity')
		], { sortable: true }, E('em', _('No peers')));

		table.update(peers.slice().sort((a, b) => (order[a.role] - order[b.role]) || (a.address > b.address ? 1 : -1)).map((p) => {
			const active = p.paths.filter((x) => x.active);
			const path = active.filter((x) => x.preferred)[0] || active[0];
			return [
				E('div', [ zt.mono(p.address), names[p.address] ? zt.small(names[p.address]) : '' ]),
				[ p.role, zt.badge(p.role, ROLE_KIND[p.role] || 'muted') ],
				p.version || '-',
				[ p.latency, (p.latency >= 0) ? '%d ms'.format(p.latency) : '-' ],
				path ? E('div', [ zt.mono(path.address), active.length > 1 ? zt.small(_('%d paths').format(active.length)) : '' ])
					: zt.badge(_('Relayed'), 'warn', _('No direct path to this peer')),
				[ path ? path.lastReceive : 0, zt.ago(path ? path.lastReceive : 0) ]
			];
		}));

		return table.render();
	},

	refresh() {
		return Promise.all([ zt.getStatus(), zt.getPeers(), zt.getDevices(), zt.getLog(60) ]).then((data) => {
			const [ st, peers, devices, log ] = data;
			dom.content(document.getElementById('zt-cards'), this.renderCards(st));
			dom.content(document.getElementById('zt-networks'), this.renderNetworks(st, devices));
			dom.content(document.getElementById('zt-peers'), this.renderPeers(peers));
			dom.content(document.getElementById('zt-log'), log || _('Nothing logged yet'));
		});
	},

	render(data) {
		const [ st, peers, devices, log ] = data;
		zt.css();

		const view = E([], [
			E('h2', _('ZeroTier')),
			E('div', { 'class': 'cbi-map-descr' },
				_('Status of the ZeroTier service, the networks this router has joined and the peers it talks to.')),
			E('div', { 'id': 'zt-cards' }, this.renderCards(st)),
			E('div', { 'class': 'cbi-section' }, [
				E('h3', _('Networks')),
				E('div', { 'id': 'zt-networks' }, this.renderNetworks(st, devices))
			]),
			E('div', { 'class': 'cbi-section' }, [
				E('h3', _('Peers')),
				E('div', { 'class': 'cbi-section-descr' },
					_('Planets and moons are the root servers that introduce peers to each other; leaves are other ZeroTier nodes.')),
				E('div', { 'id': 'zt-peers' }, this.renderPeers(peers))
			]),
			E('div', { 'class': 'cbi-section' }, [
				E('h3', _('Log')),
				E('pre', { 'id': 'zt-log', 'class': 'zt-pre' }, log || _('Nothing logged yet'))
			])
		]);

		poll.add(L.bind(this.refresh, this), 5);
		return view;
	},

	handleSave: null,
	handleSaveApply: null,
	handleReset: null
});
