'use strict';
'require view';
'require dom';
'require ui';
'require uci';
'require form';
'require zerotier.common as zt';

function ip2int(ip) {
	return ip.split('.').reduce((a, o) => a * 256 + (+o), 0);
}

function int2ip(n) {
	return [ n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255 ].join('.');
}

return view.extend({
	load() {
		return Promise.all([
			zt.ctlNetworks(),
			uci.load('zerotier')
		]);
	},

	memberSections() {
		const r = {};
		uci.sections('zerotier', 'zt_member').forEach((s) => {
			if (s.node)
				r[s.node.toLowerCase()] = s;
		});
		return r;
	},

	renderIsolation(n) {
		if (!n.joined)
			return zt.badge(_('Not joined here'), 'muted', _('Member isolation is configured on the network section of a joined network'));
		if (n.isolation)
			return (n.isolationState == 'on') ? zt.badge(_('Members isolated'), 'ok')
				: zt.badge(_('Isolation not applied yet'), 'warn');
		return zt.badge(_('Members see each other'), 'muted');
	},

	renderList() {
		const t = new ui.Table([
			_('Network'), _('Network ID'), _('Members'), _('Address pools'), _('Member isolation'), ''
		], { sortable: true }, E('em', _('No networks yet: create one below.')));

		t.update(this.ctl.networks.map((n) => [
			E('div', [ E('strong', n.name || _('(unnamed)')), n.joined ? zt.small(_('joined here as "%s"').format(n.section)) : '' ]),
			E('div', [ zt.mono(n.id), zt.copyButton(n.id) ]),
			[ n.members, String(n.members) ],
			n.pools.length ? E('div', n.pools.map((p) => zt.small('%s – %s'.format(p.ipRangeStart, p.ipRangeEnd)))) : '-',
			this.renderIsolation(n),
			E('div', { 'class': 'nowrap' }, [
				E('button', { 'class': 'cbi-button cbi-button-edit', 'click': ui.createHandlerFn(this, 'openNetwork', n.id) }, _('Manage')),
				' ',
				E('button', { 'class': 'cbi-button cbi-button-neutral', 'click': ui.createHandlerFn(this, 'showQR', n) }, _('QR code')),
				' ',
				E('button', { 'class': 'cbi-button cbi-button-remove', 'click': ui.createHandlerFn(this, 'handleDeleteNetwork', n) }, _('Delete'))
			])
		]));
		return t.render();
	},

	refreshList() {
		return zt.ctlNetworks().then((ctl) => {
			this.ctl = ctl;
			dom.content(this.listNode, this.renderList());
		});
	},

	showQR(n) {
		ui.showModal(_('Join %s').format(n.name || n.id), [
			E('p', _('Scan with a phone to copy the network ID, then join it in the ZeroTier app. A new member stays unauthorized until it is admitted here.')),
			E('div', { 'style': 'text-align:center' }, [ zt.qr(n.id), E('p', {}, zt.mono(n.id)) ]),
			E('div', { 'class': 'right' }, E('button', { 'class': 'cbi-button', 'click': ui.hideModal }, _('Close')))
		]);
	},

	handleCreate() {
		const input = document.getElementById('zt-new-network');
		const name = (input.value || '').trim();
		if (!name) {
			input.focus();
			return;
		}
		return zt.ctlNetworkCreate(name).then((res) => {
			if (!zt.check(res, _('Network %s created').format(name)))
				return;
			input.value = '';
			return this.refreshList().then(() => this.openNetwork(res.id));
		});
	},

	handleDeleteNetwork(n) {
		if (!confirm(_('Delete network %s (%s)? Every member loses access to it, and its configuration is gone for good.').format(n.name || '', n.id)))
			return;
		return zt.ctlNetworkDelete(n.id).then((res) => {
			if (!zt.check(res, _('Network deleted')))
				return;
			if (this.current == n.id)
				dom.content(this.detailNode, '');
			return this.refreshList();
		});
	},

	// Settings form of a network (JSONMap: not uci, but the controller)
	renderSettings(n) {
		const data = {
			net: {
				name: n.name,
				private: n.private ? '1' : '0',
				broadcast: n.enableBroadcast ? '1' : '0',
				multicast: String(n.multicastLimit != null ? n.multicastLimit : 32),
				mtu: String(n.mtu || 2800),
				v4auto: n.v4AssignMode.zt ? '1' : '0',
				pools: n.ipAssignmentPools.map((p) => p.ipRangeStart + '-' + p.ipRangeEnd),
				routes: n.routes.map((r) => r.via ? r.target + ' via ' + r.via : r.target),
				v6zt: n.v6AssignMode.zt ? '1' : '0',
				v6plane: n.v6AssignMode['6plane'] ? '1' : '0',
				v6rfc: n.v6AssignMode.rfc4193 ? '1' : '0',
				dns_domain: n.dns.domain || '',
				dns_servers: n.dns.servers || []
			}
		};
		const m = new form.JSONMap(data);
		const s = m.section(form.NamedSection, 'net', 'net');
		let o;

		s.tab('general', _('General'));
		s.tab('ipv4', _('IPv4'));
		s.tab('ipv6', _('IPv6'));
		s.tab('dns', _('DNS'));

		o = s.taboption('general', form.Value, 'name', _('Name'));

		o = s.taboption('general', form.Flag, 'private', _('Private'),
			_('Members need to be authorized here. A public network admits anyone who knows its ID.'));

		o = s.taboption('general', form.Flag, 'broadcast', _('Broadcast'),
			_('Deliver Ethernet broadcast (ff:ff:ff:ff:ff:ff) on the network.'));

		o = s.taboption('general', form.Value, 'multicast', _('Multicast recipient limit'));
		o.datatype = 'range(0,65535)';

		o = s.taboption('general', form.Value, 'mtu', _('MTU'));
		o.datatype = 'range(1280,10000)';

		o = s.taboption('ipv4', form.Value, '_subnet', _('Quick setup'),
			_('Enter a subnet such as 10.147.20.0/24 to replace the pools and routes below with it.'));
		o.datatype = 'cidr4';
		o.placeholder = '10.147.20.0/24';
		o.validate = (sid, v) => (!v || +v.split('/')[1] <= 30) ? true : _('Use a subnet of at least four addresses (/30 or larger)');

		o = s.taboption('ipv4', form.Flag, 'v4auto', _('Assign addresses'),
			_('Give each member an address from the pools.'));

		o = s.taboption('ipv4', form.DynamicList, 'pools', _('Address pools'),
			_('Ranges as FIRST-LAST, e.g. 10.147.20.10-10.147.20.200. Keep addresses you map to LAN devices outside of them.'));
		o.validate = (sid, v) => {
			if (!v)
				return true;
			const p = v.split('-');
			return (p.length == 2 && ((zt.isIPv4(p[0]) && zt.isIPv4(p[1])) || (zt.isIPv6(p[0]) && zt.isIPv6(p[1]))))
				? true : _('Use FIRST-LAST');
		};

		o = s.taboption('ipv4', form.DynamicList, 'routes', _('Managed routes'),
			_('Routes pushed to members: a subnet, optionally "via GATEWAY" - e.g. 10.147.20.0/24, or 192.168.1.0/24 via 10.147.20.1 for a LAN behind a member.'));
		o.validate = (sid, v) => {
			if (!v)
				return true;
			const p = v.trim().split(/\s+via\s+/);
			if (!zt.isPrefix(p[0]) || p[0].indexOf('/') < 0)
				return _('A route needs a subnet such as 10.147.20.0/24');
			return (p.length == 1 || zt.isIPv4(p[1]) || zt.isIPv6(p[1])) ? true : _('Invalid gateway');
		};

		o = s.taboption('ipv6', form.Flag, 'v6zt', _('Assign from pools'),
			_('Give members IPv6 addresses from IPv6 pools above.'));
		o = s.taboption('ipv6', form.Flag, 'v6rfc', _('RFC 4193 addresses'),
			_('A unique /128 per member, derived from network and node.'));
		o = s.taboption('ipv6', form.Flag, 'v6plane', _('6PLANE'),
			_('A /80 per member, for containers or VMs behind it.'));

		o = s.taboption('dns', form.Value, 'dns_domain', _('Search domain'));
		o.datatype = 'hostname';
		o = s.taboption('dns', form.DynamicList, 'dns_servers', _('DNS servers'),
			_('Only members that allow DNS from the network use these.'));
		o.datatype = 'ipaddr("nomask")';

		this.settingsMap = m;
		return m;
	},

	handleSaveSettings(id) {
		const m = this.settingsMap;
		return m.save().then(() => {
			const get = (k) => m.data.get('json', 'net', k);
			const list = (k) => L.toArray(get(k)).filter((x) => x);
			let pools = list('pools').map((p) => { const x = p.split('-'); return { ipRangeStart: x[0], ipRangeEnd: x[1] }; });
			let routes = list('routes').map((r) => { const x = r.trim().split(/\s+via\s+/); return { target: x[0], via: x[1] || null }; });

			const subnet = get('_subnet');
			if (subnet) {
				const [ net, bits ] = subnet.split('/');
				const mask = (+bits) ? (0xffffffff << (32 - bits)) >>> 0 : 0;
				const base = (ip2int(net) & mask) >>> 0;
				const last = ((base | ~mask) >>> 0) - 1;
				pools = [ { ipRangeStart: int2ip(base + 1), ipRangeEnd: int2ip(last) } ];
				routes = [ { target: '%s/%s'.format(int2ip(base), bits), via: null } ];
			}

			const config = {
				name: get('name') || '',
				private: get('private') == '1',
				enableBroadcast: get('broadcast') == '1',
				multicastLimit: +(get('multicast') || 32),
				mtu: +(get('mtu') || 2800),
				v4AssignMode: { zt: get('v4auto') == '1' },
				v6AssignMode: { zt: get('v6zt') == '1', '6plane': get('v6plane') == '1', rfc4193: get('v6rfc') == '1' },
				ipAssignmentPools: pools,
				routes: routes,
				dns: { domain: get('dns_domain') || '', servers: list('dns_servers') }
			};
			return zt.ctlNetworkUpdate(id, config);
		}).then((res) => {
			if (res && zt.check(res, _('Network settings saved')))
				return Promise.all([ this.refreshList(), this.openNetwork(id) ]);
		}).catch(() => {});
	},

	handleMember(id, member, config, text) {
		return zt.ctlMemberUpdate(id, member, config).then((res) => {
			if (zt.check(res, text))
				return this.openNetwork(id);
		});
	},

	handleDeleteMember(id, m) {
		if (!confirm(_('Remove member %s from the network? It can ask to join again; on a private network it then waits for authorization.').format(m.name || m.id)))
			return;
		return zt.ctlMemberDelete(id, m.id).then((res) => {
			if (zt.check(res, _('Member removed')))
				return Promise.all([ this.refreshList(), this.openNetwork(id) ]);
		});
	},

	handleEditMember(id, m) {
		const data = {
			member: {
				name: m.name,
				authorized: m.authorized ? '1' : '0',
				ips: m.ipAssignments,
				bridge: m.activeBridge ? '1' : '0',
				noauto: m.noAutoAssignIps ? '1' : '0'
			}
		};
		const map = new form.JSONMap(data);
		const s = map.section(form.NamedSection, 'member', 'member');
		let o;

		o = s.option(form.Value, 'name', _('Name'));
		if (m.id != this.ctl.self)
			o = s.option(form.Flag, 'authorized', _('Authorized'));
		o = s.option(form.DynamicList, 'ips', _('Addresses'),
			_('Managed addresses of the member; leave empty to have one assigned from the pools.'));
		o.datatype = 'ipaddr("nomask")';
		o = s.option(form.Flag, 'noauto', _('No automatic addresses'),
			_('Only use the addresses listed above.'));
		o = s.option(form.Flag, 'bridge', _('Active bridge'),
			_('Lets the member send and receive for any MAC address - needed to bridge a LAN into the network. It can then also impersonate every other member, so the router trusts it like the most privileged member. Only for gateways you control.'));

		return map.render().then((node) => {
			ui.showModal(_('Member %s').format(m.id), [
				node,
				E('div', { 'class': 'right' }, [
					E('button', { 'class': 'cbi-button', 'click': ui.hideModal }, _('Cancel')),
					' ',
					E('button', {
						'class': 'cbi-button cbi-button-positive',
						'click': ui.createHandlerFn(this, () => map.save().then(() => {
							const get = (k) => map.data.get('json', 'member', k);
							ui.hideModal();
							return this.handleMember(id, m.id, {
								name: get('name') || '',
								authorized: (m.id == this.ctl.self) || get('authorized') == '1',
								ipAssignments: L.toArray(get('ips')).filter((x) => x),
								activeBridge: get('bridge') == '1',
								noAutoAssignIps: get('noauto') == '1'
							}, _('Member %s saved').format(m.id));
						}).catch(() => {}))
					}, _('Save'))
				])
			], 'cbi-modal');
		});
	},

	renderMembers(id, members, self) {
		const known = this.memberSections();
		const t = new ui.Table([
			_('Member'), _('Admitted'), _('Addresses'), _('Seen'), _('Permissions'), ''
		], { sortable: true }, E('em', _('No member has asked to join yet')));

		t.update(members.map((m) => {
			const p = m.peer;
			const perm = known[m.id];
			return [
				[ m.name || m.id, E('div', [
					zt.mono(m.id),
					m.name ? zt.small(m.name) : '',
						m.activeBridge ? zt.badge(_('Active bridge'), 'warn', _('Can send for any MAC address')) : ''
				]) ],
				[ (m.id == self) ? 2 : m.authorized ? 1 : 0, (m.id == self)
					? zt.badge(_('This router'), 'info')
					: m.authorized ? zt.badge(_('Admitted'), 'ok') : zt.badge(_('Waiting'), 'warn', _('Asked to join, not authorized yet')) ],
				m.ipAssignments.length ? E('div', m.ipAssignments.map((ip) => E('div', {}, zt.mono(ip)))) : '-',
				(m.id == self) ? [ 2, zt.badge(_('Local'), 'info') ] : [ p ? (p.lastReceive || 1) : 0, p ? E('div', [
					zt.badge(p.direct ? _('Online') : _('Relayed'), p.direct ? 'ok' : 'warn', p.path || ''),
					zt.small([ p.version ? 'v' + p.version : '', (p.latency >= 0) ? '%d ms'.format(p.latency) : '' ].filter((x) => x).join(' · '))
				]) : E('div', [ zt.badge(_('Offline'), 'muted'), m.version ? zt.small('v' + m.version) : '' ]) ],
				perm ? E('div', [
					zt.badge(perm.enabled == '0' ? _('Disabled') : (perm.name || _('Configured')), perm.enabled == '0' ? 'muted' : 'ok'),
					perm.gateway == '1' ? zt.badge(_('Gateway'), 'info') : ''
				]) : (m.id == self ? '-' : E('a', { 'href': L.url('admin/vpn/zerotier/permissions') }, _('none') + ' »')),
				E('div', { 'class': 'nowrap' }, [
					// The router cannot turn itself away from its own network
					(m.id == self) ? '' : E('button', {
						'class': 'cbi-button ' + (m.authorized ? 'cbi-button-neutral' : 'cbi-button-positive'),
						'click': ui.createHandlerFn(this, 'handleMember', id, m.id, { authorized: !m.authorized },
							m.authorized ? _('%s deauthorized').format(m.id) : _('%s authorized').format(m.id))
					}, m.authorized ? _('Deauthorize') : _('Authorize')),
					' ',
					E('button', { 'class': 'cbi-button cbi-button-edit', 'click': ui.createHandlerFn(this, 'handleEditMember', id, m) }, _('Edit')),
					' ',
					(m.id == self) ? '' : E('button', { 'class': 'cbi-button cbi-button-remove', 'click': ui.createHandlerFn(this, 'handleDeleteMember', id, m) }, _('Remove'))
				])
			];
		}));
		return t.render();
	},

	openNetwork(id) {
		this.current = id;
		return zt.ctlNetwork(id).then((res) => {
			if (!zt.check(res))
				return;
			const n = res.network;
			const listed = this.ctl.networks.filter((x) => x.id == id)[0] || {};
			const pending = res.members.filter((m) => !m.authorized && m.id != this.ctl.self);

			return this.renderSettings(n).render().then((settingsNode) => {
				dom.content(this.detailNode, E('div', { 'class': 'cbi-section' }, [
					E('h3', [ _('Network %s').format(n.name || n.id), ' ', zt.mono(n.id) ]),
					E('div', [
						this.renderIsolation(listed),
						zt.badge(_('%d flow rule(s)').format(n.rules), 'muted', _('Actions in the rule set the controller distributes')),
						!listed.joined ? zt.small(_('This router is not a member of this network. Join it on the Settings page to use it here, or to isolate its members.')) : ''
					]),
					pending.length ? zt.note('warn', _('%d member(s) wait for authorization.').format(pending.length)) : '',
					E('h4', { 'class': 'zt-sub' }, _('Members')),
					this.renderMembers(id, res.members, this.ctl.self),
					E('h4', { 'class': 'zt-sub' }, _('Settings')),
					settingsNode,
					E('div', { 'class': 'zt-actions' }, [
						E('button', { 'class': 'cbi-button cbi-button-positive', 'click': ui.createHandlerFn(this, 'handleSaveSettings', id) }, _('Save settings'))
					])
				]));
			});
		});
	},

	render(data) {
		const ctl = data[0];
		zt.css();

		if (!ctl.controller)
			return E([], [
				E('h2', _('Network controller')),
				zt.note('info', _('ZeroTier is not running, or this build of it has no network controller.'))
			]);

		this.ctl = ctl;
		this.listNode = E('div', {}, this.renderList());
		this.detailNode = E('div');

		const want = new URLSearchParams(window.location.search).get('network') ||
			(ctl.networks.length == 1 ? ctl.networks[0].id : null);
		if (want)
			this.openNetwork(want);

		return E([], [
			E('h2', _('Network controller')),
			E('div', { 'class': 'cbi-map-descr' },
				_('Networks this router is the controller of: who is admitted, which addresses members get, and the routes they learn. What members may reach through a router is set on the Permissions page.')),
			E('div', { 'class': 'cbi-section' }, [
				E('h3', _('Networks')),
				this.listNode,
				E('div', { 'class': 'zt-actions' }, [
					E('input', { 'id': 'zt-new-network', 'type': 'text', 'class': 'cbi-input-text', 'placeholder': _('Name of a new network') }),
					E('button', { 'class': 'cbi-button cbi-button-add', 'click': ui.createHandlerFn(this, 'handleCreate') }, _('Create network'))
				])
			]),
			this.detailNode
		]);
	},

	handleSave: null,
	handleSaveApply: null,
	handleReset: null
});
