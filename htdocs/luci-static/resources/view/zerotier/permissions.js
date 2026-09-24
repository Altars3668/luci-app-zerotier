'use strict';
'require view';
'require dom';
'require ui';
'require uci';
'require form';
'require zerotier.common as zt';

// zerotier-fw4 labels a member's rules with its name (or node address),
// every character outside [A-Za-z0-9_.-] replaced by "_"
function labelOf(name) {
	return String(name).replace(/[^A-Za-z0-9_.-]/g, '_');
}

return view.extend({
	load() {
		return Promise.all([
			zt.getPermissions(),
			zt.getHostnames(),
			uci.load('zerotier')
		]);
	},

	networks() {
		return uci.sections('zerotier', 'network').filter((s) => /^[0-9a-f]{16}$/.test(s.id || ''));
	},

	deviceNames() {
		return uci.sections('zerotier', 'zt_device').map((s) => s.name).filter((n) => n);
	},

	memberNames() {
		return uci.sections('zerotier', 'zt_member').map((s) => s.name).filter((n) => n);
	},

	// Does a zt_member section cover node `node` on network section `net`?
	hasEntry(node, net) {
		return uci.sections('zerotier', 'zt_member').some((s) =>
			(s.node || '').toLowerCase() == node && (!s.network || s.network == net));
	},

	// Suggestions for the grant lists
	grantChoices() {
		const c = {
			'router': _('This router: every service'),
			'router tcp/22 tcp/80 tcp/443 icmp': _('This router: SSH, web interface, ping'),
			'lan': _('Everything on the LAN'),
			'wan': _('The internet, through this router'),
			'device:*': _('Every LAN gateway device')
		};
		this.deviceNames().forEach((d) => { c['device:' + d] = _('LAN gateway device %s').format(d); });
		this.memberNames().forEach((m) => { c['member:' + m] = _('Member %s directly (needs member isolation)').format(m); });
		return c;
	},

	grantOption(s, withRoles) {
		const o = s.option(form.DynamicList, 'allow', _('Grants'),
			_('One grant per entry: TARGET [PORT...]. Targets: router, lan, wan, device:NAME, device:*, net:PREFIX, member:NAME. Ports: tcp/22, udp/53, tcp/8000-8100, icmp - none means all traffic. Example: "device:nas tcp/445".'));
		const choices = this.grantChoices();
		Object.keys(choices).forEach((k) => o.value(k, '%s — %s'.format(k, choices[k])));
		o.validate = (sid, v) => (v == null || v === '') ? true : zt.checkGrant(v, this.deviceNames(), this.memberNames());
		o.textvalue = (sid) => {
			const rows = L.toArray(uci.get('zerotier', sid, 'allow'))
				.map((g) => E('div', { 'class': 'zt-small' }, zt.describeGrant(g)));
			// What the member gets through its roles as well
			if (withRoles)
				L.toArray(uci.get('zerotier', sid, 'role')).forEach((r) => L.toArray(uci.get('zerotier', r, 'allow')).forEach((g) => {
					rows.push(E('div', { 'class': 'zt-small', 'style': 'opacity:.6' }, '%s (%s)'.format(zt.describeGrant(g), _('role %s').format(r))));
				}));
			return rows.length ? E('div', rows) : '-';
		};
		return o;
	},

	renderIsolation(n) {
		if (!n.controlled)
			return E('span', { 'class': 'zt-small', 'title': _('Only the network\'s controller can isolate members') }, _('not the controller'));
		if (n.isolation) {
			if (n.isolationState == 'on')
				return zt.badge(_('In force'), 'ok');
			if (n.isolationState == 'changed')
				return zt.badge(_('Changed on the controller'), 'warn', _('The flow rules were edited elsewhere since they were generated; applying the configuration puts them back'));
			return zt.badge(_('Not applied yet'), 'warn');
		}
		return (n.isolationState == 'on')
			? zt.badge(_('Still in force'), 'warn', _('Switched off, but not applied yet'))
			: zt.badge(_('Off'), 'muted', _('Members may reach each other directly'));
	},

	renderLive() {
		const perm = this.perm;
		const out = [];

		const table = new ui.Table([
			_('Network'), _('Access'), _('Rules'), _('Member isolation'), _('Refused')
		], { sortable: false }, E('em', _('No network configured')));

		table.update(perm.networks.map((n) => !n.enabled ? [
			E('div', [ E('strong', n.section), zt.small(n.id) ]),
			zt.badge(_('Disabled'), 'muted'), '-', '-', '-'
		] : [
			E('div', [ E('strong', n.section), zt.small(n.id) ]),
			(n.policy == 'acl') ? zt.badge(_('Member permissions'), 'ok') : zt.badge(_('Open to all members'), 'warn'),
			!n.dev ? zt.badge(_('Not joined'), 'muted')
				: (n.policy != 'acl') ? '-'
				: n.guarded ? zt.badge(_('Loaded'), 'ok') : zt.badge(_('Missing'), 'bad'),
			this.renderIsolation(n),
			(n.dev && n.policy == 'acl') ? _('%d packets').format(perm.denied[n.dev] || 0) : '-'
		]));
		out.push(table.render());

		if (!perm.networks.some((n) => n.enabled && n.policy == 'acl'))
			out.push(zt.note('warn', _('No network uses member permissions yet, so every member gets the same access. Switch "Access from the network" to member permissions on the Settings page.')));

		if (perm.catchall)
			out.push(E('div', { 'class': 'zt-descr' }, _('ZeroTier interfaces that are not identified yet - while ZeroTier starts - are denied.')));

		if (perm.warnings.length)
			out.push(zt.note('warn', [
				E('strong', _('Problems in the saved configuration:')),
				E('ul', perm.warnings.map((w) => E('li', w)))
			]));

		perm.networks.filter((n) => n.controlled && n.members).forEach((n) => {
			const missing = n.members.filter((m) => m.authorized && m.id != perm.self && !this.hasEntry(m.id, n.section));
			if (!missing.length)
				return;

			const t = new ui.Table([ _('Member'), _('Addresses'), _('Seen'), '' ], { sortable: false });
			t.update(missing.map((m) => {
				const peer = perm.peers[m.id];
				const host = this.hosts.filter((h) =>
					m.ipAssignments.indexOf(h.primary) >= 0 || m.ipAssignments.indexOf(h.fallback) >= 0)[0];
				return [
					E('div', [
						zt.mono(m.id),
						m.name ? zt.small(m.name) : '',
						host ? zt.small(_('Stable host name: %s').format(host.hostname)) : '',
						m.activeBridge ? zt.badge(_('Active bridge'), 'warn') : ''
					]),
					m.ipAssignments.length ? E('div', m.ipAssignments.map((ip) => E('div', {}, zt.mono(ip)))) : '-',
					peer ? E('div', [
						zt.badge(peer.direct ? _('Online') : _('Relayed'), peer.direct ? 'ok' : 'warn'),
						(peer.latency >= 0) ? zt.small('%d ms'.format(peer.latency)) : ''
					]) : zt.badge(_('Offline'), 'muted'),
					E('button', {
						'class': 'cbi-button cbi-button-add',
						'click': ui.createHandlerFn(this, 'handleAssign', m, host)
					}, _('Set permissions…'))
				];
			}));

			out.push(zt.note('warn', [
				E('strong', _('Authorized on %s, but without permissions - through this router they reach nothing:').format(n.section)),
				t.render()
			]));
		});

		return E('div', out);
	},

	updateLive() {
		const node = document.getElementById('zt-live');
		if (node)
			dom.content(node, this.renderLive());
	},

	handleRefresh() {
		return Promise.all([ zt.getPermissions(), zt.getHostnames() ]).then((data) => {
			this.perm = data[0];
			this.hosts = data[1];
			return this.map.reset();
		});
	},

	handlePreview() {
		return zt.getPreview().then((r) => {
			ui.showModal(_('Generated rules'), [
				E('p', _('What zerotier-fw4 builds from the applied configuration - pending changes are not in it yet.')),
				r.messages ? zt.note('warn', E('pre', { 'class': 'zt-pre' }, r.messages)) : '',
				E('h4', _('Router firewall')),
				E('pre', { 'class': 'zt-pre' }, r.firewall || _('Nothing: no network uses member permissions')),
				E('h4', _('Member isolation (flow rules of the controller)')),
				E('pre', { 'class': 'zt-pre' }, r.policy || _('Nothing: member isolation is off everywhere')),
				E('div', { 'class': 'right' }, E('button', { 'class': 'cbi-button', 'click': ui.hideModal }, _('Close')))
			], 'cbi-modal');
		});
	},

	// A member authorized on the controller that has no permissions yet
	handleAssign(member, host) {
		const s = this.memberSection;
		const map = s.map;
		const sid = map.data.add('zerotier', 'zt_member');
		const name = member.name || (host ? host.hostname.split('.')[0] : '');

		map.data.set('zerotier', sid, 'node', member.id);
		if (name)
			map.data.set('zerotier', sid, 'name', name);
		map.addedSection = sid;

		return s.renderMoreOptionsModal(sid);
	},

	renderMemberLive(sid) {
		const perm = this.perm;
		const node = (uci.get('zerotier', sid, 'node') || '').toLowerCase();
		const name = uci.get('zerotier', sid, 'name');
		const peer = perm.peers[node];
		const out = [];

		if (uci.get('zerotier', sid, 'enabled') == '0')
			out.push(zt.badge(_('Disabled'), 'muted'));

		out.push(peer
			? zt.badge(peer.direct ? _('Online') : _('Relayed'), peer.direct ? 'ok' : 'warn', peer.path || '')
			: zt.badge(_('Offline'), 'muted'));

		perm.networks.forEach((n) => (n.members || []).forEach((m) => {
			if (m.id != node)
				return;
			if (!m.authorized)
				out.push(zt.badge(_('Not authorized'), 'bad', n.section));
			if (m.activeBridge)
				out.push(zt.badge(_('Active bridge'), 'warn',
					_('Can send with any MAC address, other members\' included: as trusted as the most privileged member')));
		}));

		if (uci.get('zerotier', sid, 'gateway') == '1')
			out.push(zt.badge(_('Gateway'), 'info'));

		const hits = perm.hits[labelOf(name || node)];
		if (hits != null)
			out.push(zt.small(_('%d packets granted').format(hits)));

		return E('div', out);
	},

	// The MAC the router recognizes the member by, on each network it applies to
	renderNode(sid) {
		const node = (uci.get('zerotier', sid, 'node') || '').toLowerCase();
		const net = uci.get('zerotier', sid, 'network');
		const macs = this.networks()
			.filter((n) => (!net || n['.name'] == net) && n.fw_policy == 'acl')
			.map((n) => zt.mac(n.id, node))
			.filter((m, i, a) => m && a.indexOf(m) == i);

		return E('div', [ zt.mono(node || '-') ].concat(macs.map((m) => zt.small('MAC ' + m))));
	},

	render(data) {
		this.perm = data[0];
		this.hosts = data[1];
		zt.css();

		const view = this;
		const m = this.map = new form.Map('zerotier');
		let s, o;

		s = m.section(form.GridSection, 'zt_member', _('Members'),
			_('A member is recognized by the MAC address ZeroTier derives from its node address, never by IP, so it cannot borrow another member\'s grants by taking its address.'));
		s.addremove = true;
		s.anonymous = true;
		s.nodescriptions = true;
		s.addbtntitle = _('Add member…');
		s.modaltitle = (sid) => _('Member') + ' » ' + (uci.get('zerotier', sid, 'name') || uci.get('zerotier', sid, 'node') || _('new'));
		this.memberSection = s;

		o = s.option(form.Flag, 'enabled', _('Enabled'));
		o.default = '1';
		o.rmempty = false;
		o.editable = true;

		o = s.option(form.Value, 'name', _('Name'),
			_('How grants of other members refer to this one (member:NAME); also labels its firewall rules.'));
		o.validate = (sid, v) => {
			if (!v)
				return true;
			if (!/^[^\s"']+$/.test(v))
				return _('No spaces or quotes');
			return uci.sections('zerotier', 'zt_member').some((x) => x['.name'] != sid && x.name == v)
				? _('Another member already has this name') : true;
		};
		o.textvalue = (sid) => E('strong', uci.get('zerotier', sid, 'name') || '-');

		o = s.option(form.Value, 'node', _('ZeroTier address'),
			_('The 10 digit node address the member\'s ZeroTier client shows.'));
		o.rmempty = false;
		o.validate = (sid, v) => /^[0-9a-fA-F]{10}$/.test(v || '') ? true : _('A node address has 10 hexadecimal digits');
		o.write = (sid, v) => uci.set('zerotier', sid, 'node', v.toLowerCase());
		o.textvalue = (sid) => this.renderNode(sid);

		o = s.option(form.ListValue, 'network', _('Network'));
		o.value('', _('Every network with member permissions'));
		this.networks().forEach((n) => o.value(n['.name'], '%s (%s)'.format(n['.name'], n.id)));
		o.textvalue = (sid) => uci.get('zerotier', sid, 'network') || _('all');

		o = s.option(form.MultiValue, 'role', _('Roles'));
		uci.sections('zerotier', 'zt_role').forEach((r) => o.value(r['.name']));
		o.optional = true;
		o.textvalue = (sid) => L.toArray(uci.get('zerotier', sid, 'role')).join(', ') || '-';

		this.grantOption(s, true);

		o = s.option(form.Flag, 'gateway', _('Gateway'),
			_('Under member isolation every member may reach this one, and it reaches every member: for routers and other gateways.'));
		o.modalonly = true;

		o = s.option(form.DummyValue, '_live', _('Status'));
		o.modalonly = false;
		o.textvalue = (sid) => this.renderMemberLive(sid);

		s = m.section(form.GridSection, 'zt_role', _('Roles'),
			_('Grants that several members share: listing a role on a member gives it every grant of the role.'));
		s.addremove = true;
		s.anonymous = false;
		s.nodescriptions = true;
		s.addbtntitle = _('Add role…');
		s.modaltitle = (sid) => _('Role') + ' » ' + sid;

		this.grantOption(s);

		o = s.option(form.DummyValue, '_users', _('Members'));
		o.modalonly = false;
		o.textvalue = (sid) => {
			const users = uci.sections('zerotier', 'zt_member')
				.filter((x) => L.toArray(x.role).indexOf(sid) >= 0)
				.map((x) => x.name || x.node);
			return users.length ? users.join(', ') : '-';
		};

		// Keep the network panel in step with what the grids show
		const renderContents = m.renderContents;
		m.renderContents = function() {
			return renderContents.apply(this, arguments).then((node) => {
				view.updateLive();
				return node;
			});
		};

		return m.render().then((mapNode) => E([], [
			E('h2', _('Member permissions')),
			E('div', { 'class': 'cbi-map-descr' }, [
				_('Who may reach what through this router. On networks with member permissions, a member reaches this router, the LAN or the internet only as far as its grants and roles allow; members without an entry reach nothing. Traffic between members never passes the router: on networks this router controls, member isolation has the controller enforce "member:" grants instead.')
			]),
			E('div', { 'class': 'cbi-section' }, [
				E('h3', _('Networks')),
				E('div', { 'id': 'zt-live' }, this.renderLive()),
				E('div', { 'class': 'zt-actions' }, [
					E('button', { 'class': 'cbi-button cbi-button-action', 'click': ui.createHandlerFn(this, 'handlePreview') }, _('Show generated rules')),
					E('button', { 'class': 'cbi-button cbi-button-neutral', 'click': ui.createHandlerFn(this, 'handleRefresh') }, _('Refresh status'))
				])
			]),
			mapNode
		]));
	}
});
