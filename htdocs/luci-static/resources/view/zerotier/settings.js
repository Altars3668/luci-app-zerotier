'use strict';
'require view';
'require form';
'require uci';
'require tools.widgets as widgets';
'require zerotier.common as zt';

return view.extend({
	load() {
		return Promise.all([
			zt.getStatus(),
			zt.getPeers(),
			uci.load('zerotier')
		]);
	},

	render(data) {
		const st = data[0];
		const peers = data[1] || [];
		const joined = {};
		const peerRoles = {};
		st.networks.forEach((n) => { if (n.id) joined[n.id] = n; });
		peers.forEach((p) => { if (p.address) peerRoles[p.address] = p.role; });
		zt.css();

		const m = new form.Map('zerotier', _('ZeroTier settings'),
			_('The ZeroTier service, the networks this router joins, and peer bond configuration. Saving this page writes UCI only; it does not reload firewall rules, restart WAN, or restart zerotier-one.'));

		let s, o;

		s = m.section(form.TypedSection, 'zerotier', _('Service'));
		s.anonymous = true;
		s.addremove = false;

		o = s.option(form.Flag, 'enabled', _('Enable ZeroTier'));
		o.rmempty = false;

		o = s.option(form.DummyValue, '_address', _('Node address'),
			_('Identity of this router on every network. It is kept with the configuration, readable by root only.'));
		o.cfgvalue = () => st.address || _('(ZeroTier is not running)');

		o = s.option(form.Value, 'port', _('Port'),
			_('UDP port ZeroTier listens on; it picks a secondary and a tertiary port by itself.'));
		o.datatype = 'port';
		o.placeholder = '9993';

		o = s.option(form.Value, 'config_path', _('Persistent directory'),
			_('Where identity, moons, peers and - on a controller - its networks are kept across reboots. Empty: everything lives in RAM, only the identity survives.'));
		o.placeholder = '/etc/zerotier';

		o = s.option(form.Flag, 'copy_config_path', _('Copy into RAM'),
			_('Copy the persistent directory into RAM at start instead of using it in place: fewer flash writes, but changes made while running are lost.'));
		o.depends({ config_path: /.+/ });

		o = s.option(form.Value, 'local_conf_path', _('local.conf'),
			_('Optional local.conf with advanced zerotier-one settings.'));
		o.placeholder = '/etc/zerotier.conf';

		o = s.option(form.Flag, 'multicore', _('Multithreading'),
			_('Spread packet processing over several threads. Encrypting what this router sends runs in parallel, and so does handing received frames to the network interface; decrypting what arrives stays on one thread. Written into local.conf.'));
		if (st.cpus && st.cpus < 3)
			o.description += ' ' + _('This router has %d CPU core(s): too few, ZeroTier keeps to one thread.').format(st.cpus);

		o = s.option(form.Value, 'concurrency', _('Threads'),
			st.cpus ? _('More than 1 and fewer than the CPU cores of this router (%d). Empty: 2 with 4 cores or more.').format(st.cpus)
				: _('More than 1 and fewer than the CPU cores of this router. Empty: 2 with 4 cores or more.'));
		o.depends('multicore', '1');
		o.datatype = (st.cpus > 2) ? 'range(2,%d)'.format(st.cpus - 1) : 'uinteger';
		o.placeholder = '2';

		o = s.option(form.Flag, 'cpu_pinning', _('Pin threads to CPU cores'),
			_('Keep each thread on a CPU core of its own.'));
		o.depends('multicore', '1');

		s = m.section(form.GridSection, 'network', _('Networks'),
			_('Networks this router joins. A network that is not authorized yet stays "Not authorized" until its controller admits this router.'));
		s.addremove = true;
		s.anonymous = false;
		s.nodescriptions = true;
		s.addbtntitle = _('Join a network…');
		s.modaltitle = (sid) => _('Network') + ' » ' + sid;

		s.tab('general', _('General'));
		s.tab('firewall', _('Firewall'));
		s.tab('controller', _('Controller'));

		o = s.taboption('general', form.Flag, 'enabled', _('Enabled'));
		o.default = '1';
		o.rmempty = false;
		o.editable = true;

		o = s.taboption('general', form.Value, 'id', _('Network ID'));
		o.rmempty = false;
		o.validate = (sid, v) => /^[0-9a-fA-F]{16}$/.test(v || '') ? true : _('A network ID has 16 hexadecimal digits');
		o.write = (sid, v) => uci.set('zerotier', sid, 'id', v.toLowerCase());
		o.textvalue = (sid) => uci.get('zerotier', sid, 'id') || '-';

		o = s.taboption('general', form.DummyValue, '_status', _('Status'));
		o.modalonly = false;
		o.textvalue = (sid) => {
			const n = joined[uci.get('zerotier', sid, 'id')];
			if (uci.get('zerotier', sid, 'enabled') == '0')
				return zt.statusLabel('DISABLED');
			return n ? zt.text(zt.statusLabel(n.status), n.name) : zt.statusLabel('NOT_JOINED');
		};

		o = s.taboption('general', form.Flag, 'allow_managed', _('Managed addresses and routes'),
			_('Take the addresses and routes the controller assigns.'));
		o.default = '1';
		o.rmempty = false;
		o.modalonly = true;

		o = s.taboption('general', form.Flag, 'allow_global', _('Public address ranges'),
			_('Accept managed addresses and routes that overlap public IP space.'));
		o.modalonly = true;

		o = s.taboption('general', form.Flag, 'allow_default', _('Default route'),
			_('Let the network replace the default route: all traffic of this router goes through it.'));
		o.modalonly = true;

		o = s.taboption('general', form.Flag, 'allow_dns', _('DNS'),
			_('Accept DNS settings the controller pushes.'));
		o.modalonly = true;

		o = s.taboption('firewall', form.ListValue, 'fw_policy', _('Access from the network'),
			_('Under member permissions a member reaches this router, the LAN or the internet only as far as the Permissions page grants it, and members without an entry there reach nothing.'));
		o.value('open', _('Open: every member gets the same access'));
		o.value('acl', _('Member permissions: default deny'));
		o.default = 'open';
		o.textvalue = (sid) => (uci.get('zerotier', sid, 'fw_policy') == 'acl')
			? _('Member permissions') : _('Open to all members');

		o = s.taboption('firewall', form.Flag, 'fw_allow_input', _('Allow access to this router'),
			_('Every member may reach every service of this router.'));
		o.depends('fw_policy', 'open');
		o.modalonly = true;

		o = s.taboption('firewall', form.Flag, 'fw_allow_forward', _('Allow forwarding'),
			_('Every member may reach other networks through this router.'));
		o.depends('fw_policy', 'open');
		o.modalonly = true;

		o = s.taboption('firewall', widgets.DeviceSelect, 'fw_forward_ifaces', _('Forward to'),
			_('Limit forwarding to these interfaces (default: any).'));
		o.multiple = true;
		o.noaliases = true;
		o.depends({ fw_policy: 'open', fw_allow_forward: '1' });
		o.modalonly = true;

		o = s.taboption('firewall', widgets.DeviceSelect, 'fw_lan_ifaces', _('LAN interfaces'),
			_('What a "lan" grant reaches, and where LAN hosts may open connections into the network from. Default: the devices of the firewall zone "lan".'));
		o.multiple = true;
		o.noaliases = true;
		o.depends('fw_policy', 'acl');
		o.modalonly = true;

		o = s.taboption('firewall', widgets.DeviceSelect, 'fw_wan_ifaces', _('WAN interfaces'),
			_('What a "wan" grant reaches. Default: the devices of the firewall zone "wan".'));
		o.multiple = true;
		o.noaliases = true;
		o.depends('fw_policy', 'acl');
		o.modalonly = true;

		o = s.taboption('firewall', form.Flag, 'fw_lan_to_zt', _('LAN hosts may open connections'),
			_('Let hosts on the LAN interfaces connect to members of the network.'));
		o.default = '1';
		o.depends('fw_policy', 'acl');
		o.modalonly = true;

		o = s.taboption('firewall', form.Flag, 'fw_allow_masq', _('Masquerade'),
			_('Traffic from the LAN into the network leaves with this router\'s ZeroTier address.'));
		o.modalonly = true;

		o = s.taboption('firewall', widgets.DeviceSelect, 'fw_masq_ifaces', _('Masquerade traffic from'),
			_('Only traffic entering from these interfaces (default: any).'));
		o.multiple = true;
		o.noaliases = true;
		o.depends('fw_allow_masq', '1');
		o.modalonly = true;

		o = s.taboption('controller', form.Flag, 'member_isolation', _('Isolate members'),
			_('Only when this router is the network\'s controller. Members then reach only the gateways - this router, and members marked as gateway on the Permissions page - the other members of their groups, and what their "member:" and "group:" grants allow. ZeroTier itself drops everything else between members, on both ends.'));
		o.textvalue = (sid) => {
			const n = joined[uci.get('zerotier', sid, 'id')];
			if (!n || !n.controlled)
				return '-';
			return (uci.get('zerotier', sid, 'member_isolation') == '1')
				? _('Members isolated') : _('Members see each other');
		};

		s = m.section(form.GridSection, 'zt_bond', _('Peer bonds'),
			_('Bonding is only for the specific leaf peers listed here. Saving this page only writes UCI; zerotier-one may create a new bond when it scans the configuration. Once a bond is enabled, changing or disabling it needs a controlled rebuild by the backend package, not an automatic service restart from LuCI.'));
		s.addremove = true;
		s.anonymous = true;
		s.nodescriptions = true;
		s.addbtntitle = _('Add peer bond…');
		s.modaltitle = (sid) => _('Peer bond') + ' » ' + (uci.get('zerotier', sid, 'peer') || _('new'));

		o = s.option(form.Flag, 'enabled', _('Enabled'));
		o.default = '0';
		o.rmempty = false;
		o.editable = true;

		o = s.option(form.Value, 'peer', _('Peer'),
			_('ZeroTier node address of the leaf peer to bond with. Planet and moon peers are not eligible.'));
		o.rmempty = false;
		peers.filter((p) => p.role == 'LEAF' && p.address).forEach((p) => o.value(p.address));
		o.validate = (sid, v) => {
			const peer = (v || '').toLowerCase();
			if (!/^[0-9a-f]{10}$/.test(peer))
				return _('A node address has 10 hexadecimal digits');
			if (peerRoles[peer] && peerRoles[peer] != 'LEAF')
				return _('Planet and moon peers cannot be bonded');
			return true;
		};
		o.write = (sid, v) => uci.set('zerotier', sid, 'peer', (v || '').toLowerCase());
		o.textvalue = (sid) => {
			const peer = uci.get('zerotier', sid, 'peer');
			return peer ? zt.text(peer, peerRoles[peer] || null) : '-';
		};

		o = s.option(form.ListValue, 'policy', _('Policy'));
		o.value('balance-xor', _('Balance XOR'));
		o.value('active-backup', _('Active backup'));
		o.default = 'balance-xor';
		o.rmempty = false;
		o.textvalue = (sid) => uci.get('zerotier', sid, 'policy') || 'balance-xor';

		o = s.option(widgets.DeviceSelect, 'interface', _('Interface'),
			_('Real network interface name that may carry one path of this bond.'));
		o.noaliases = true;
		o.rmempty = false;
		o.validate = (sid, v) => /^[A-Za-z0-9_.@-]{1,15}$/.test(v || '')
			? true : _('Use a real interface name, without spaces or shell characters');

		o = s.option(form.ListValue, 'ipv_pref', _('IP preference'),
			_('Paths of the two address families can differ a lot in latency. Preferring one family uses the other only when no path of the preferred family works.'));
		o.value('46', _('IPv4 preferred, IPv6 standby'));
		o.value('64', _('IPv6 preferred, IPv4 standby'));
		o.value('0', _('IPv4 and IPv6'));
		o.value('4', _('IPv4 only'));
		o.value('6', _('IPv6 only'));
		o.default = '46';
		o.rmempty = false;
		o.textvalue = (sid) => ({
			'0': _('IPv4 and IPv6'), '4': _('IPv4 only'), '6': _('IPv6 only'),
			'64': _('IPv6 preferred, IPv4 standby')
		})[uci.get('zerotier', sid, 'ipv_pref')] || _('IPv4 preferred, IPv6 standby');

		o = s.option(form.DummyValue, '_policyalias', _('Policy alias'));
		o.textvalue = (sid) => {
			const peer = uci.get('zerotier', sid, 'peer');
			return peer ? 'uci-bond-' + peer : '-';
		};

		return m.render();
	},

	handleSaveApply: null
});
