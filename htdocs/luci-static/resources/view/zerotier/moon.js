'use strict';
'require view';
'require dom';
'require ui';
'require zerotier.common as zt';

return view.extend({
	load() {
		return zt.moonStatus();
	},

	run(action, args, okText) {
		return zt.moonAction(action, args.endpoint || '', args.port || 9993, args.moon || '').then((res) => {
			if (!zt.check(res))
				return;
			const out = (res.output || '').trim();
			if (res.code != 0)
				ui.addNotification(null, [ E('p', _('The command failed:')), E('pre', { 'class': 'zt-pre' }, out) ], 'error');
			else if (okText)
				ui.addTimeLimitedNotification(null, [ E('p', okText), out ? E('pre', { 'class': 'zt-pre' }, out) : '' ], 8000, 'info');
			return this.refresh();
		});
	},

	refresh() {
		return zt.moonStatus().then((st) => {
			this.st = st;
			dom.content(this.root, this.renderAll());
		});
	},

	value(id) {
		return (document.getElementById(id).value || '').trim();
	},

	port(id) {
		const p = +(this.value(id) || 9993);
		return (p >= 1 && p <= 65535) ? p : 9993;
	},

	// Compare what the moon announces with what it should (loaded lazily)
	checkEndpoints(node) {
		dom.content(node, E('em', { 'class': 'spinning' }, _('Checking the current addresses…')));
		return zt.moonEndpoints().then((ep) => {
			const cur = (ep.current || []).slice().sort();
			const want = (ep.desired || []).slice().sort();
			const same = cur.length && cur.join(' ') == want.join(' ');
			const d = this.st.dynamic;

			dom.content(node, E('div', [
				E('div', [ E('strong', _('Announced: ')), cur.length ? E('span', {}, cur.map((e) => zt.badge(e, same ? 'ok' : 'bad'))) : '-' ]),
				E('div', [ E('strong', _('Current addresses: ')), want.length ? E('span', {}, want.map((e) => zt.badge(e, 'info'))) : _('unknown') ]),
				same ? zt.small(_('The moon announces the current addresses.'))
					: !want.length ? ''
					: (d.configured && d.enabled) ? zt.note('bad', [
						_('The moon announces addresses this router no longer has: nodes cannot use it.'), ' ',
						E('button', {
							'class': 'cbi-button cbi-button-action',
							'click': ui.createHandlerFn(this, 'run', 'update', {}, _('Moon updated'))
						}, _('Update the moon now'))
					]) : zt.note('warn', [
						_('The moon announces other addresses than this router has on the WAN. That is right if they were set on purpose, e.g. for a port forwarding in front of the router.'), ' ',
						E('button', {
							'class': 'cbi-button cbi-button-action',
							'click': ui.createHandlerFn(this, 'run', 'create', { endpoint: 'auto', port: +(want[0].split('/').pop()) }, _('Moon updated'))
						}, _('Announce the WAN addresses'))
					])
			]));
		});
	},

	renderOwn() {
		const st = this.st;
		const own = st.orbits.filter((o) => o.id == '000000' + st.self)[0];
		const children = [ E('h3', _('This router as a moon')) ];

		if (!st.created) {
			children.push(E('div', { 'class': 'cbi-section-descr' },
				_('A moon is a root server of your own: nodes that orbit it find each other through it, faster and without depending on the public roots. Its endpoints have to be reachable from where those nodes are.')));
			children.push(E('div', { 'class': 'zt-actions' }, [
				E('input', { 'id': 'zt-moon-endpoint', 'class': 'cbi-input-text', 'placeholder': _('auto, a public IP or a domain'), 'value': 'auto' }),
				E('input', { 'id': 'zt-moon-port', 'class': 'cbi-input-text', 'style': 'width:6em', 'placeholder': '9993', 'value': '9993' }),
				E('button', {
					'class': 'cbi-button cbi-button-add',
					'click': ui.createHandlerFn(this, () => this.run('create',
						{ endpoint: this.value('zt-moon-endpoint') || 'auto', port: this.port('zt-moon-port') }, _('Moon created')))
				}, _('Create moon'))
			]));
			return E('div', { 'class': 'cbi-section' }, children);
		}

		const epNode = E('div');
		children.push(E('div', { 'class': 'zt-body' }, [
			E('div', [ E('strong', _('Moon ID: ')), zt.mono(st.self), zt.copyButton(st.self) ]),
			E('div', [ E('strong', _('Other nodes join it with: ')), zt.mono('zerotier-cli orbit %s %s'.format(st.self, st.self)) ]),
			epNode
		]));
		this.checkEndpoints(epNode);

		// Dynamic endpoints
		const d = st.dynamic;
		children.push(E('h4', { 'class': 'zt-sub' }, _('Follow address changes')));
		children.push(E('div', { 'class': 'cbi-section-descr' },
			_('Every 10 minutes, and whenever the WAN comes up, the moon is re-signed if the router\'s public addresses changed. "auto" follows the WAN address; a domain follows what it resolves to.')));
		if (d.configured && d.enabled) {
			children.push(E('div', { 'class': 'zt-body' }, [
				zt.badge(_('On'), 'ok'),
				zt.small(_('Endpoint: %s, port %d').format(d.endpoint, d.port)),
				zt.small(_('Last change: %s').format(d.lastUpdate ? zt.date(d.lastUpdate * 1000) : '-'))
			]));
			children.push(E('div', { 'class': 'zt-actions' }, [
				E('button', { 'class': 'cbi-button cbi-button-action', 'click': ui.createHandlerFn(this, 'run', 'update', {}, _('Checked')) }, _('Check now')),
				E('button', { 'class': 'cbi-button cbi-button-negative', 'click': ui.createHandlerFn(this, 'run', 'dynamic-disable', {}, _('Stopped following address changes')) }, _('Turn off'))
			]));
		}
		else {
			children.push(E('div', { 'class': 'zt-actions' }, [
				zt.badge(_('Off'), 'muted'),
				E('input', { 'id': 'zt-dyn-endpoint', 'class': 'cbi-input-text', 'value': d.endpoint || 'auto', 'placeholder': _('auto or a domain') }),
				E('input', { 'id': 'zt-dyn-port', 'class': 'cbi-input-text', 'style': 'width:6em', 'value': String(d.port || 9993) }),
				E('button', {
					'class': 'cbi-button cbi-button-positive',
					'click': ui.createHandlerFn(this, () => this.run('dynamic-enable',
						{ endpoint: this.value('zt-dyn-endpoint') || 'auto', port: this.port('zt-dyn-port') }, _('Following address changes')))
				}, _('Turn on'))
			]));
		}

		// Firewall
		children.push(E('h4', { 'class': 'zt-sub' }, _('Firewall')));
		const fw = st.firewall;
		children.push(E('div', { 'class': 'zt-actions' }, fw
			? [ zt.badge(fw.enabled ? _('Port %s open from the WAN').format(fw.port) : _('Rule disabled'), fw.enabled ? 'ok' : 'warn'),
				E('button', { 'class': 'cbi-button cbi-button-remove', 'click': ui.createHandlerFn(this, 'run', 'firewall-remove', {}, _('Firewall rule removed')) }, _('Remove rule')) ]
			: [ zt.badge(_('No rule'), 'warn', _('Nodes outside the LAN may not reach the moon')),
				E('button', { 'class': 'cbi-button cbi-button-add', 'click': ui.createHandlerFn(this, 'run', 'firewall-add', { port: d.port || 9993 }, _('Firewall rule added')) }, _('Open the port')) ]));

		return E('div', { 'class': 'cbi-section' }, children);
	},

	renderOrbits() {
		const st = this.st;
		const t = new ui.Table([ _('Moon'), _('Seed'), _('Endpoints'), _('State'), '' ], { sortable: true },
			E('em', _('This router orbits no moon')));

		t.update(st.orbits.map((o) => {
			const own = o.id == '000000' + st.self;
			const seed = o.seeds[0] || { endpoints: [] };
			return [
				zt.mono(o.id),
				zt.mono(seed.address || '-'),
				E('div', seed.endpoints.map((e) => E('div', {}, zt.mono(e)))),
				o.waiting ? zt.badge(_('Waiting for the moon'), 'warn') : zt.badge(_('Loaded'), 'ok'),
				own ? zt.badge(_('This router'), 'info')
					: E('button', { 'class': 'cbi-button cbi-button-remove', 'click': ui.createHandlerFn(this, 'run', 'leave', { moon: o.id }, _('Left the moon')) }, _('Leave'))
			];
		}));

		return E('div', { 'class': 'cbi-section' }, [
			E('h3', _('Moons this router orbits')),
			t.render(),
			E('div', { 'class': 'zt-actions' }, [
				E('input', { 'id': 'zt-orbit', 'class': 'cbi-input-text', 'placeholder': _('Moon ID (10 hexadecimal digits)') }),
				E('button', {
					'class': 'cbi-button cbi-button-add',
					'click': ui.createHandlerFn(this, () => {
						const id = this.value('zt-orbit').toLowerCase();
						if (!/^(000000)?[0-9a-f]{10}$/.test(id)) {
							ui.addNotification(null, E('p', _('A moon ID has 10 hexadecimal digits')), 'warning');
							return;
						}
						return this.run('join', { moon: id }, _('Joined the moon'));
					})
				}, _('Orbit'))
			])
		]);
	},

	renderAll() {
		if (!this.st.self)
			return zt.note('warn', _('ZeroTier is not running.'));
		return E([], [ this.renderOwn(), this.renderOrbits() ]);
	},

	render(st) {
		this.st = st;
		zt.css();
		this.root = E('div', {}, this.renderAll());

		return E([], [
			E('h2', _('Moons')),
			E('div', { 'class': 'cbi-map-descr' },
				_('Moons are root servers you run yourself. Nodes that orbit a moon learn about each other through it, which helps where the public roots are slow or unreachable.')),
			this.root
		]);
	},

	handleSave: null,
	handleSaveApply: null,
	handleReset: null
});
