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
				ui.addNotification(null, [ E('p', {}, _('The command failed:')), E('pre', {}, out) ], 'error');
			else if (okText)
				ui.addTimeLimitedNotification(null, [ E('p', {}, okText), out ? E('pre', {}, out) : '' ], 8000, 'info');
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

	input(id, value, placeholder, width) {
		return E('input', { 'id': id, 'type': 'text', 'class': 'cbi-input-text', 'value': value || '',
			'placeholder': placeholder || '', 'style': width ? 'width:' + width : null });
	},

	button(kind, text, fn) {
		return E('button', { 'class': 'cbi-button cbi-button-' + kind, 'click': ui.createHandlerFn(this, fn) }, text);
	},

	// What the moon announces, next to what it should announce now (loaded
	// lazily: finding the public addresses may take a moment)
	checkEndpoints(node) {
		dom.content(node, E('em', { 'class': 'spinning' }, _('Checking the current addresses…')));
		return zt.moonEndpoints().then((ep) => {
			const cur = (ep.current || []).slice().sort();
			const want = (ep.desired || []).slice().sort();
			const d = this.st.dynamic;
			const out = [ want.length ? zt.lines(want) : _('unknown') ];

			if (want.length && cur.join(' ') != want.join(' ')) {
				if (d.configured && d.enabled)
					out.push(zt.alert('warning', [
						_('The moon announces addresses this router no longer has: nodes cannot use it.'), ' ',
						this.button('action', _('Update the moon now'), () => this.run('update', {}, _('Moon updated')))
					]));
				else
					out.push(zt.alert('warning', [
						_('The moon announces other addresses than this router has on the WAN. That is right if they were set on purpose, e.g. for a port forwarding in front of the router.'), ' ',
						this.button('action', _('Announce the WAN addresses'),
							() => this.run('create', { endpoint: 'auto', port: +(want[0].split('/').pop()) }, _('Moon updated')))
					]));
			}
			dom.content(node, out);
		});
	},

	renderOwn() {
		const st = this.st;
		const own = st.orbits.filter((o) => o.id == '000000' + st.self)[0];

		if (!st.created)
			return zt.section(_('This router as a moon'), [
				zt.kvTable([
					[ _('State'), _('Not created') ],
					[ _('Endpoint'), this.input('zt-moon-endpoint', 'auto', _('auto, a public IP or a domain')) ],
					[ _('Port'), this.input('zt-moon-port', '9993', '9993', '6em') ]
				]),
				E('div', { 'class': 'cbi-section-create' }, [
					this.button('add', _('Create moon'), () => this.run('create',
						{ endpoint: this.value('zt-moon-endpoint') || 'auto', port: this.port('zt-moon-port') }, _('Moon created')))
				])
			], _('A moon is a root server of your own: nodes that orbit it find each other through it, faster and without depending on the public roots. Its endpoints have to be reachable from where those nodes are.'));

		const d = st.dynamic;
		const epNode = E('div', {}, E('em', { 'class': 'spinning' }, _('Checking the current addresses…')));
		this.checkEndpoints(epNode);

		const dynamic = (d.configured && d.enabled)
			? E('span', {}, [
				_('On: %s, port %d').format(d.endpoint, d.port), E('br'),
				E('small', {}, _('Last change: %s').format(d.lastUpdate ? zt.date(d.lastUpdate * 1000) : '-')), E('br'),
				this.button('action', _('Check now'), () => this.run('update', {}, _('Checked'))), ' ',
				this.button('reset', _('Turn off'), () => this.run('dynamic-disable', {}, _('Stopped following address changes')))
			])
			: E('span', {}, [
				_('Off'), E('br'),
				this.input('zt-dyn-endpoint', d.endpoint || 'auto', _('auto or a domain')), ' ',
				this.input('zt-dyn-port', String(d.port || 9993), '9993', '6em'), ' ',
				this.button('apply', _('Turn on'), () => this.run('dynamic-enable',
					{ endpoint: this.value('zt-dyn-endpoint') || 'auto', port: this.port('zt-dyn-port') }, _('Following address changes')))
			]);

		const fw = st.firewall;
		const firewall = fw
			? E('span', {}, [
				fw.enabled ? _('Port %s open from the WAN').format(fw.port) : _('Rule disabled'), ' ',
				this.button('remove', _('Remove rule'), () => this.run('firewall-remove', {}, _('Firewall rule removed')))
			])
			: E('span', {}, [
				_('No rule: nodes outside the LAN may not reach the moon'), ' ',
				this.button('add', _('Open the port'), () => this.run('firewall-add', { port: d.port || 9993 }, _('Firewall rule added')))
			]);

		return zt.section(_('This router as a moon'), [
			zt.kvTable([
				[ _('Moon ID'), st.self ],
				[ _('Other nodes join it with'), E('code', {}, 'zerotier-cli orbit %s %s'.format(st.self, st.self)) ],
				[ _('Announced addresses'), own && own.seeds[0] ? zt.lines(own.seeds[0].endpoints) : '-' ],
				[ _('Current addresses'), epNode ],
				[ _('Follow address changes'), dynamic ],
				[ _('Firewall'), firewall ]
			])
		], _('Every 10 minutes, and whenever the WAN comes up, the moon is re-signed if the router\'s public addresses changed. "auto" follows the WAN address; a domain follows what it resolves to.'));
	},

	renderOrbits() {
		const st = this.st;
		const t = new ui.Table([ _('Moon'), _('Seed'), _('Endpoints'), _('State'), '' ], { sortable: true },
			E('em', {}, _('This router orbits no moon')));

		t.update(st.orbits.map((o) => {
			const own = o.id == '000000' + st.self;
			const seed = o.seeds[0] || { endpoints: [] };
			return [
				o.id,
				seed.address || '-',
				zt.lines(seed.endpoints),
				o.waiting ? _('Waiting for the moon') : _('Loaded'),
				own ? _('This router')
					: this.button('remove', _('Leave'), () => this.run('leave', { moon: o.id }, _('Left the moon')))
			];
		}));

		return zt.section(_('Moons this router orbits'), [
			t.render(),
			E('div', { 'class': 'cbi-section-create' }, [
				this.input('zt-orbit', '', _('Moon ID (10 hexadecimal digits)')), ' ',
				this.button('add', _('Orbit'), () => {
					const id = this.value('zt-orbit').toLowerCase();
					if (!/^(000000)?[0-9a-f]{10}$/.test(id)) {
						ui.addNotification(null, E('p', {}, _('A moon ID has 10 hexadecimal digits')), 'warning');
						return;
					}
					return this.run('join', { moon: id }, _('Joined the moon'));
				})
			])
		]);
	},

	renderAll() {
		if (!this.st.self)
			return zt.alert('warning', _('ZeroTier is not running.'));
		return [ this.renderOwn(), this.renderOrbits() ];
	},

	render(st) {
		this.st = st;
		zt.css();
		this.root = E('div', {}, this.renderAll());

		return E([], [
			E('h2', {}, _('Moons')),
			E('div', { 'class': 'cbi-map-descr' },
				_('Moons are root servers you run yourself. Nodes that orbit a moon learn about each other through it, which helps where the public roots are slow or unreachable.')),
			this.root
		]);
	},

	handleSave: null,
	handleSaveApply: null,
	handleReset: null
});
