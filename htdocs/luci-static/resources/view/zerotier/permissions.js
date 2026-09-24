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

	roleNames() {
		return uci.sections('zerotier', 'zt_role').map((s) => s['.name']);
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
		this.roleNames().forEach((r) => { c['group:' + r] = _('The members of group %s (needs member isolation)').format(r); });
		this.memberNames().forEach((m) => { c['member:' + m] = _('Member %s directly (needs member isolation)').format(m); });
		return c;
	},

	grantOption(s, withRoles) {
		const o = s.option(form.DynamicList, 'allow', _('Grants'),
			_('One grant per entry: TARGET [PORT...]. Targets: router, lan, wan, device:NAME, device:*, net:PREFIX, and - between members, under member isolation - member:NAME, group:ROLE. Ports: tcp/22, udp/53, tcp/8000-8100, icmp - none means all traffic. Example: "device:nas tcp/445".'));
		const choices = this.grantChoices();
		Object.keys(choices).forEach((k) => o.value(k, '%s — %s'.format(k, choices[k])));
		o.validate = (sid, v) => (v == null || v === '') ? true
			: zt.checkGrant(v, this.deviceNames(), this.memberNames(), this.roleNames());
		o.textvalue = (sid) => {
			const rows = L.toArray(uci.get('zerotier', sid, 'allow')).map((g) => zt.describeGrant(g));
			// What the member gets through its roles as well
			if (withRoles)
				L.toArray(uci.get('zerotier', sid, 'role')).forEach((r) => L.toArray(uci.get('zerotier', r, 'allow')).forEach((g) => {
					rows.push(E('small', {}, '%s (%s)'.format(zt.describeGrant(g), _('role %s').format(r))));
				}));
			return rows.length ? zt.lines(rows) : '-';
		};
		return o;
	},

	isolationText(n) {
		if (!n.controlled)
			return E('span', { 'title': _('Only the network\'s controller can isolate members') }, _('not the controller'));
		if (n.isolation) {
			if (n.isolationState == 'on')
				return _('In force');
			if (n.isolationState == 'changed')
				return zt.label(_('Changed on the controller'), 'warning', _('The flow rules were edited elsewhere since they were generated; applying the configuration puts them back'));
			return zt.label(_('Not applied yet'), 'warning');
		}
		return (n.isolationState == 'on')
			? zt.label(_('Still in force'), 'warning', _('Switched off, but not applied yet'))
			: _('Off');
	},

	renderLive() {
		const perm = this.perm;
		const out = [];

		if (perm.warnings.length)
			out.push(zt.alert('warning', [
				E('h4', {}, _('Problems in the saved configuration:')),
				E('ul', {}, perm.warnings.map((w) => E('li', {}, w)))
			]));

		const table = new ui.Table([
			_('Network'), _('Access'), _('Rules'), _('Member isolation'), _('Refused')
		], { sortable: false }, E('em', {}, _('No network configured')));

		table.update(perm.networks.map((n) => !n.enabled ? [
			zt.text(n.section, n.id), _('Disabled'), '-', '-', '-'
		] : [
			zt.text(n.section, n.id),
			(n.policy == 'acl') ? _('Member permissions') : _('Open to all members'),
			!n.dev ? _('Not joined')
				: (n.policy != 'acl') ? '-'
				: n.guarded ? _('Loaded') : zt.label(_('Missing'), 'important'),
			this.isolationText(n),
			(n.dev && n.policy == 'acl') ? _('%d packets').format(perm.denied[n.dev] || 0) : '-'
		]));

		const descr = [];
		if (!perm.networks.some((n) => n.enabled && n.policy == 'acl'))
			descr.push(_('No network uses member permissions yet, so every member gets the same access. Switch "Access from the network" to member permissions on the Settings page.'));
		if (perm.catchall)
			descr.push(_('ZeroTier interfaces that are not identified yet - while ZeroTier starts - are denied.'));

		out.push(zt.section(_('Networks'), [
			table.render(),
			E('div', { 'class': 'cbi-section-create' }, [
				E('button', { 'class': 'cbi-button cbi-button-action', 'click': ui.createHandlerFn(this, 'handlePreview') }, _('Show generated rules')),
				' ',
				E('button', { 'class': 'cbi-button cbi-button-neutral', 'click': ui.createHandlerFn(this, 'handleRefresh') }, _('Refresh status'))
			])
		], descr.length ? descr.join(' ') : null));

		perm.networks.filter((n) => n.controlled && n.members).forEach((n) => {
			const missing = n.members.filter((m) => m.authorized && m.id != perm.self && !this.hasEntry(m.id, n.section));
			if (!missing.length)
				return;

			const t = new ui.Table([ _('Member'), _('Addresses'), _('Seen'), '' ], { sortable: false });
			t.update(missing.map((m) => {
				const peer = perm.peers[m.id];
				const host = this.hosts.filter((h) =>
					m.ipAssignments.indexOf(h.primary) >= 0 || m.ipAssignments.indexOf(h.fallback) >= 0)[0];
				const notes = [ m.id ];
				if (m.name)
					notes.push(E('small', {}, m.name));
				if (host)
					notes.push(E('small', {}, _('Stable host name: %s').format(host.hostname)));
				if (m.activeBridge)
					notes.push(zt.label(_('Active bridge'), 'warning'));
				return [
					zt.lines(notes),
					m.ipAssignments.length ? zt.lines(m.ipAssignments) : '-',
					peer ? zt.text(peer.direct ? _('Online') : _('Relayed'), (peer.latency >= 0) ? '%d ms'.format(peer.latency) : null) : _('Offline'),
					E('button', {
						'class': 'cbi-button cbi-button-add',
						'click': ui.createHandlerFn(this, 'handleAssign', m, host)
					}, _('Set permissions…'))
				];
			}));

			out.push(zt.section(_('Members without permissions on %s').format(n.section), [ t.render() ],
				_('The controller admitted them, but no member entry covers them: through this router they reach nothing.')));
		});

		return out;
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
				E('p', {}, _('What zerotier-fw4 builds from the applied configuration - pending changes are not in it yet.')),
				r.messages ? zt.alert('warning', E('pre', {}, r.messages)) : '',
				E('h4', {}, _('Router firewall')),
				E('textarea', { 'style': 'width:100%;font-size:12px', 'rows': 14, 'readonly': 'readonly', 'wrap': 'off' },
					r.firewall || _('Nothing: no network uses member permissions')),
				E('h4', {}, _('Member isolation (flow rules of the controller)')),
				E('textarea', { 'style': 'width:100%;font-size:12px', 'rows': 10, 'readonly': 'readonly', 'wrap': 'off' },
					r.policy || _('Nothing: member isolation is off everywhere')),
				E('div', { 'class': 'right' }, [ E('button', { 'class': 'cbi-button', 'click': ui.hideModal }, _('Close')) ])
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

	memberStatus(sid) {
		const perm = this.perm;
		const node = (uci.get('zerotier', sid, 'node') || '').toLowerCase();
		const name = uci.get('zerotier', sid, 'name');
		const peer = perm.peers[node];
		const out = [];

		if (uci.get('zerotier', sid, 'enabled') == '0')
			out.push(_('Disabled'));
		else
			out.push(peer ? (peer.direct ? _('Online') : _('Relayed')) + ((peer.latency >= 0) ? ' · %d ms'.format(peer.latency) : '') : _('Offline'));

		perm.networks.forEach((n) => (n.members || []).forEach((m) => {
			if (m.id != node)
				return;
			if (!m.authorized)
				out.push(zt.label(_('Not authorized'), 'important', n.section));
			if (m.activeBridge)
				out.push(zt.label(_('Active bridge'), 'warning',
					_('Can send with any MAC address, other members\' included: as trusted as the most privileged member')));
		}));

		if (uci.get('zerotier', sid, 'gateway') == '1')
			out.push(zt.label(_('Gateway'), 'notice'));

		const hits = perm.hits[labelOf(name || node)];
		if (hits != null)
			out.push(E('small', {}, _('%d packets granted').format(hits)));

		return zt.lines(out);
	},

	// The MAC the router recognizes the member by, on each network it applies to
	nodeText(sid) {
		const node = (uci.get('zerotier', sid, 'node') || '').toLowerCase();
		const net = uci.get('zerotier', sid, 'network');
		const macs = this.networks()
			.filter((n) => (!net || n['.name'] == net) && n.fw_policy == 'acl')
			.map((n) => zt.mac(n.id, node))
			.filter((m, i, a) => m && a.indexOf(m) == i);

		return zt.lines([ node || '-' ].concat(macs.map((m) => E('small', {}, 'MAC ' + m))));
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
		o.textvalue = (sid) => uci.get('zerotier', sid, 'name') || '-';

		o = s.option(form.Value, 'node', _('ZeroTier address'),
			_('The 10 digit node address the member\'s ZeroTier client shows.'));
		o.rmempty = false;
		o.validate = (sid, v) => /^[0-9a-fA-F]{10}$/.test(v || '') ? true : _('A node address has 10 hexadecimal digits');
		o.write = (sid, v) => uci.set('zerotier', sid, 'node', v.toLowerCase());
		o.textvalue = (sid) => this.nodeText(sid);

		o = s.option(form.ListValue, 'network', _('Network'));
		o.value('', _('Every network with member permissions'));
		this.networks().forEach((n) => o.value(n['.name'], '%s (%s)'.format(n['.name'], n.id)));
		o.textvalue = (sid) => uci.get('zerotier', sid, 'network') || _('all');

		o = s.option(form.MultiValue, 'role', _('Roles and groups'));
		this.roleNames().forEach((r) => o.value(r));
		o.optional = true;
		o.textvalue = (sid) => L.toArray(uci.get('zerotier', sid, 'role')).join(', ') || '-';

		this.grantOption(s, true);

		o = s.option(form.Flag, 'gateway', _('Gateway'),
			_('Under member isolation every member may reach this one, and it reaches every member: for routers and other gateways.'));
		o.modalonly = true;

		o = s.option(form.DummyValue, '_status', _('Status'));
		o.modalonly = false;
		o.textvalue = (sid) => this.memberStatus(sid);

		s = m.section(form.GridSection, 'zt_role', _('Roles and groups'),
			_('A role is a set of grants several members share: listing a role on a member gives it every grant of the role. A role is also a group: under member isolation, "group:ROLE" grants reach its members, and with "Members reach each other" they reach one another directly.'));
		s.addremove = true;
		s.anonymous = false;
		s.nodescriptions = true;
		s.addbtntitle = _('Add role…');
		s.modaltitle = (sid) => _('Role') + ' » ' + sid;

		o = s.option(form.Flag, 'peers', _('Members reach each other'),
			_('Under member isolation, the members of this group reach one another directly, with all traffic.'));
		o.editable = true;

		this.grantOption(s, false);

		o = s.option(form.DummyValue, '_users', _('Members'));
		o.modalonly = false;
		o.textvalue = (sid) => {
			const users = uci.sections('zerotier', 'zt_member')
				.filter((x) => L.toArray(x.role).indexOf(sid) >= 0)
				.map((x) => x.name || x.node);
			return users.length ? users.join(', ') : '-';
		};

		// Keep the live sections in step with what the grids show
		const renderContents = m.renderContents;
		m.renderContents = function() {
			return renderContents.apply(this, arguments).then((node) => {
				view.updateLive();
				return node;
			});
		};

		return m.render().then((mapNode) => E([], [
			E('h2', {}, _('Member permissions')),
			E('div', { 'class': 'cbi-map-descr' },
				_('Who may reach what through this router. On networks with member permissions, a member reaches this router, the LAN or the internet only as far as its grants and roles allow; members without an entry reach nothing. Traffic between members never passes the router: on networks this router controls, member isolation has the controller enforce groups and "member:" / "group:" grants instead.')),
			E('div', { 'id': 'zt-live' }, this.renderLive()),
			mapNode
		]));
	}
});
