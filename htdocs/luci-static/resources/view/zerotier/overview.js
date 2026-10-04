'use strict';
'require view';
'require dom';
'require poll';
'require ui';
'require rpc';
'require uci';
'require zerotier.common as zt';

const callBondStatus = rpc.declare({
	object: 'luci.zerotier',
	method: 'bondStatus',
	expect: { bonds: [] }
});

return view.extend({
	load() {
		return Promise.all([
			zt.getStatus(),
			zt.getPeers(),
			zt.getDevices(),
			zt.getLog(100),
			uci.load('zerotier'),
			L.resolveDefault(callBondStatus(), [])
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

	problems(st) {
		const out = [];
		st.networks.forEach((n) => {
			if (n.policy == 'acl' && n.status == 'OK' && !n.guarded)
				out.push(zt.alert('warning', _('The permission rules of network %s are not loaded: its members are only held back by the default firewall rules.').format(n.name || n.section || n.id)));
		});
		return out;
	},

	renderStatus(st) {
		const acl = st.networks.filter((n) => n.policy == 'acl' && n.status == 'OK');
		const open = st.networks.filter((n) => n.policy != 'acl' && n.status == 'OK');
		const controlled = st.networks.filter((n) => n.controlled);

		const service = E('span', {}, [
			st.running ? _('Running') : _('Stopped'), ' ',
			st.running
				? E('button', { 'class': 'cbi-button cbi-button-action', 'click': ui.createHandlerFn(this, 'handleService', 'restart') }, _('Restart'))
				: E('button', { 'class': 'cbi-button cbi-button-apply', 'click': ui.createHandlerFn(this, 'handleService', 'start') }, _('Start')),
			' ',
			st.running
				? E('button', { 'class': 'cbi-button cbi-button-reset', 'click': ui.createHandlerFn(this, 'handleService', 'stop') }, _('Stop'))
				: ''
		]);

		const firewall = [];
		if (acl.length)
			firewall.push(_('%d network(s) under member permissions').format(acl.length));
		if (open.length)
			firewall.push(_('%d network(s) open to every member').format(open.length));
		if (st.firewall.catchall)
			firewall.push(_('ZeroTier interfaces not identified yet are denied'));

		return zt.kvTable([
			[ _('Service'), service ],
			st.running ? [ _('Node address'), st.address ] : null,
			st.running ? [ _('Version'), st.version || '-' ] : null,
			st.running ? [ _('Connection'), st.online
				? (st.tcpFallback ? _('Online, through the ZeroTier TCP relay (no UDP path)') : _('Online'))
				: _('Offline') ] : null,
			st.running ? [ _('Ports'), st.ports.filter((p) => p).join(', ') ] : null,
			[ _('Network controller'), st.controller
				? E('span', {}, [ _('Available, controls %d of the joined networks').format(controlled.length), ' ',
					E('a', { 'href': L.url('admin/vpn/zerotier/controller') }, _('Manage networks and members')) ])
				: _('Not available') ],
			[ _('Firewall'), E('span', {}, [
				firewall.length ? firewall.join('; ') : _('No networks'), ' ',
				E('a', { 'href': L.url('admin/vpn/zerotier/permissions') }, _('Member permissions'))
			]) ]
		]);
	},

	renderAccess(n) {
		let text;
		if (n.policy == 'acl')
			text = (n.status == 'OK' && !n.guarded) ? zt.label(_('Rules missing'), 'important') : _('Member permissions');
		else if (n.status == 'OK' || n.status == 'REQUESTING_CONFIGURATION')
			text = _('Open to all members');
		else
			text = '-';

		if (!n.controlled)
			return text;
		return zt.text(text, n.isolation ? _('Members isolated') : _('Members see each other'));
	},

	renderNetworks(st, devices) {
		const table = new ui.Table([
			_('Network'), _('Network ID'), _('Status'), _('Interface'), _('Addresses'), _('Traffic'), _('Access')
		], { sortable: true }, E('em', {}, _('No network joined yet. Add one on the Settings page.')));

		table.update(st.networks.map((n) => {
			const stats = (devices[n.dev] || {}).stats || {};
			return [
				zt.text(n.name || '-', n.section),
				n.id,
				[ n.status, zt.statusLabel(n.status) ],
				n.dev ? zt.text(E('span', { 'class': 'ifacebadge' }, n.dev), n.mac) : '-',
				n.addresses.length ? zt.lines(n.addresses) : '-',
				n.dev ? zt.text('↓ ' + zt.bytes(stats.rx_bytes), '↑ ' + zt.bytes(stats.tx_bytes)) : '-',
				this.renderAccess(n)
			];
		}));

		return table.render();
	},

	renderPeers(peers) {
		const names = this.memberNames();
		const order = { LEAF: 0, MOON: 1, PLANET: 2 };
		const table = new ui.Table([
			_('Peer'), _('Role'), _('Version'), _('Latency'), _('Path'), _('Last activity')
		], { sortable: true }, E('em', {}, _('No peers')));

		table.update(peers.slice().sort((a, b) => (order[a.role] - order[b.role]) || (a.address > b.address ? 1 : -1)).map((p) => {
			const active = p.paths.filter((x) => x.active);
			const path = active.filter((x) => x.preferred)[0] || active[0];
			return [
				zt.text(p.address, names[p.address]),
				p.role,
				p.version || '-',
				[ p.latency, (p.latency >= 0) ? '%d ms'.format(p.latency) : '-' ],
				path ? zt.text(path.address, active.length > 1 ? _('%d paths').format(active.length) : null) : _('Relayed'),
				[ path ? path.lastReceive : 0, zt.ago(path ? path.lastReceive : 0) ]
			];
		}));

		return table.render();
	},

	renderBonds(bonds) {
		const table = new ui.Table([
			_('Peer'), _('Policy'), _('State'), _('Paths')
		], { sortable: true }, E('em', {}, _('No peer bonds configured.')));

		table.update((bonds || []).map((b) => {
			const paths = b.paths || [];
			const state = b.error
				? zt.label(b.error, 'warning')
				: b.waiting
					? zt.label(_('Waiting for zerotier-one'), 'notice')
					: b.policy == 'None'
						? zt.label(_('No active bond policy'), 'warning')
						: b.isBonded
							? zt.label(_('Bonded'), 'success')
							: zt.label(_('Not bonded'), 'warning');
			return [
				zt.text(b.peer, b.alias),
				b.policy || '-',
				zt.text(state, _('%d/%d path(s) alive').format(b.alive || 0, b.total || paths.length || 0)),
				paths.length ? zt.lines(paths.map((p) => {
					const bits = [];
					if (p.ifname)
						bits.push(p.ifname);
					if (p.eligible != null)
						bits.push(p.eligible ? _('eligible') : _('not eligible'));
					if (p.bonded != null)
						bits.push(p.bonded ? _('bonded') : _('not bonded'));
					if (p.assignedFlowCount != null)
						bits.push(_('%d flow(s)').format(p.assignedFlowCount));
					if (p.latency != null)
						bits.push(_('%d ms').format(p.latency));
					if (p.quality != null)
						bits.push(_('quality %s').format(p.quality));
					return zt.text(p.addr || '-', bits.join('; '));
				})) : '-'
			];
		}));

		return table.render();
	},

	refresh() {
		return Promise.all([ zt.getStatus(), zt.getPeers(), zt.getDevices(), zt.getLog(100), L.resolveDefault(callBondStatus(), []) ]).then((data) => {
			const [ st, peers, devices, log, bonds ] = data;
			dom.content(document.getElementById('zt-problems'), this.problems(st));
			dom.content(document.getElementById('zt-status'), this.renderStatus(st));
			dom.content(document.getElementById('zt-networks'), this.renderNetworks(st, devices));
			dom.content(document.getElementById('zt-peers'), this.renderPeers(peers));
			dom.content(document.getElementById('zt-bonds'), this.renderBonds(bonds || []));
			const log_el = document.getElementById('zt-log');
			log_el.value = log || _('Nothing logged yet');
		});
	},

	render(data) {
		const [ st, peers, devices, log,, bonds ] = data;
		zt.css();

		poll.add(L.bind(this.refresh, this), 5);

		return E([], [
			E('h2', {}, _('ZeroTier')),
			E('div', { 'class': 'cbi-map-descr' },
				_('Status of the ZeroTier service, the networks this router has joined and the peers it talks to.')),
			E('div', { 'id': 'zt-problems' }, this.problems(st)),
			zt.section(_('Status'), [ E('div', { 'id': 'zt-status' }, this.renderStatus(st)) ]),
			zt.section(_('Networks'), [ E('div', { 'id': 'zt-networks' }, this.renderNetworks(st, devices)) ]),
			zt.section(_('Peers'), [ E('div', { 'id': 'zt-peers' }, this.renderPeers(peers)) ],
				_('Planets and moons are the root servers that introduce peers to each other; leaves are other ZeroTier nodes.')),
			zt.section(_('Peer bonds'), [ E('div', { 'id': 'zt-bonds' }, this.renderBonds(bonds || [])) ],
				_('Bond status is read from zerotier-one. A saved configuration may still be waiting for the daemon to create or rebuild the bond.')),
			zt.section(_('Log'), [
				E('textarea', {
					'id': 'zt-log',
					'style': 'width:100%;font-size:12px',
					'rows': 12,
					'readonly': 'readonly',
					'wrap': 'off'
				}, log || _('Nothing logged yet'))
			])
		]);
	},

	handleSave: null,
	handleSaveApply: null,
	handleReset: null
});
