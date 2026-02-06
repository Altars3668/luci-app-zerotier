/* SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright (C) 2024 AltarsCN
 * ZeroTier Network Controller — Full-Featured Management
 *
 * Features:
 * - Network CRUD with QR code for mobile joining
 * - DNS configuration (domain + servers)
 * - Member management with online status
 * - Route and IP pool management
 * - Quick setup wizard
 * - Network sharing via QR / clipboard
 */

'use strict';
'require fs';
'require ui';
'require view';
'require rpc';

// ── RPC declarations ──
var callCheckController = rpc.declare({
object: 'zerotier-controller', method: 'check_controller', expect: { '': {} }
});
var callControllerStatus = rpc.declare({
object: 'zerotier-controller', method: 'status', expect: { '': {} }
});
var callListNetworks = rpc.declare({
object: 'zerotier-controller', method: 'list_networks', expect: { '': {} }
});
var callGetNetwork = rpc.declare({
object: 'zerotier-controller', method: 'get_network', params: ['nwid'], expect: { '': {} }
});
var callCreateNetwork = rpc.declare({
object: 'zerotier-controller', method: 'create_network', params: ['name'], expect: { '': {} }
});
var callUpdateNetwork = rpc.declare({
object: 'zerotier-controller', method: 'update_network', params: ['nwid', 'config'], expect: { '': {} }
});
var callDeleteNetwork = rpc.declare({
object: 'zerotier-controller', method: 'delete_network', params: ['nwid'], expect: { '': {} }
});
var callListMembers = rpc.declare({
object: 'zerotier-controller', method: 'list_members', params: ['nwid'], expect: { '': {} }
});
var callGetMember = rpc.declare({
object: 'zerotier-controller', method: 'get_member', params: ['nwid', 'mid'], expect: { '': {} }
});
var callAuthorizeMember = rpc.declare({
object: 'zerotier-controller', method: 'authorize_member', params: ['nwid', 'mid', 'authorized'], expect: { '': {} }
});
var callUpdateMember = rpc.declare({
object: 'zerotier-controller', method: 'update_member', params: ['nwid', 'mid', 'config'], expect: { '': {} }
});
var callDeleteMember = rpc.declare({
object: 'zerotier-controller', method: 'delete_member', params: ['nwid', 'mid'], expect: { '': {} }
});
var callUpdateRoutes = rpc.declare({
object: 'zerotier-controller', method: 'update_routes', params: ['nwid', 'routes'], expect: { '': {} }
});
var callUpdateIPPools = rpc.declare({
object: 'zerotier-controller', method: 'update_ip_pools', params: ['nwid', 'pools'], expect: { '': {} }
});
var callEasySetup = rpc.declare({
object: 'zerotier-controller', method: 'easy_setup', params: ['nwid', 'cidr'], expect: { '': {} }
});

// ── Helpers ──
function formatTime(ts) {
if (!ts) return '-';
var d = new Date(ts);
if (isNaN(d.getTime())) return '-';
return d.toLocaleString();
}

// ── Embedded QR Code Generator (no external dependency) ──
// Minimal QR encoder for alphanumeric data, produces SVG
var QRCode = (function() {
// GF(256) tables for Reed-Solomon
var EXP = new Array(256), LOG = new Array(256);
(function() {
var x = 1;
for (var i = 0; i < 256; i++) {
EXP[i] = x;
LOG[x] = i;
x = (x << 1) ^ (x & 128 ? 285 : 0);
}
})();

function gfMul(a, b) { return a && b ? EXP[(LOG[a] + LOG[b]) % 255] : 0; }

function polyMul(a, b) {
var r = new Array(a.length + b.length - 1).fill(0);
for (var i = 0; i < a.length; i++)
for (var j = 0; j < b.length; j++)
r[i + j] ^= gfMul(a[i], b[j]);
return r;
}

function polyRem(dividend, divisor) {
var result = dividend.slice();
for (var i = 0; i <= result.length - divisor.length; i++) {
if (!result[i]) continue;
for (var j = 1; j < divisor.length; j++)
result[i + j] ^= gfMul(divisor[j], result[i]);
result[i] = 0;
}
return result.slice(result.length - divisor.length + 1);
}

function generatorPoly(n) {
var g = [1];
for (var i = 0; i < n; i++)
g = polyMul(g, [1, EXP[i]]);
return g;
}

// Version/ECC parameters for versions 1-10, ECC level L
var VERSIONS = [
null,
{ total: 26,  data: 19,  ecc: 7,   groups: [[1, 19]] },
{ total: 44,  data: 34,  ecc: 10,  groups: [[1, 34]] },
{ total: 70,  data: 55,  ecc: 15,  groups: [[1, 55]] },
{ total: 100, data: 80,  ecc: 20,  groups: [[1, 80]] },
{ total: 134, data: 108, ecc: 26,  groups: [[1, 108]] },
{ total: 172, data: 136, ecc: 18,  groups: [[2, 68]] },
{ total: 196, data: 156, ecc: 20,  groups: [[2, 78]] },
{ total: 242, data: 192, ecc: 24,  groups: [[2, 97]] },
{ total: 292, data: 230, ecc: 30,  groups: [[2, 116]] },  // version 9 simplified
{ total: 346, data: 271, ecc: 18,  groups: [[2, 68], [2, 69]] }
];

// Byte mode capacity per version (ECC L)
var BYTE_CAP = [0, 17, 32, 53, 78, 106, 134, 154, 192, 230, 271];

function selectVersion(len) {
for (var v = 1; v <= 10; v++)
if (len <= BYTE_CAP[v]) return v;
return -1;
}

var ALPHANUM_TABLE = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

function encodeAlphanumeric(str) {
var bits = [];
for (var i = 0; i < str.length; i += 2) {
if (i + 1 < str.length) {
var val = ALPHANUM_TABLE.indexOf(str[i]) * 45 + ALPHANUM_TABLE.indexOf(str[i + 1]);
for (var b = 10; b >= 0; b--) bits.push((val >> b) & 1);
} else {
var val2 = ALPHANUM_TABLE.indexOf(str[i]);
for (var b2 = 5; b2 >= 0; b2--) bits.push((val2 >> b2) & 1);
}
}
return bits;
}

function encodeByte(str) {
var bits = [];
for (var i = 0; i < str.length; i++) {
var c = str.charCodeAt(i);
for (var b = 7; b >= 0; b--) bits.push((c >> b) & 1);
}
return bits;
}

function bitsToBytes(bits) {
var bytes = [];
for (var i = 0; i < bits.length; i += 8) {
var b = 0;
for (var j = 0; j < 8 && i + j < bits.length; j++)
b = (b << 1) | bits[i + j];
if (i + 8 > bits.length) b <<= (8 - bits.length % 8) % 8;
bytes.push(b);
}
return bytes;
}

function makeDataCodewords(str, version) {
var info = VERSIONS[version];
var totalDataBits = info.data * 8;

// Always use Byte mode to preserve case (important for hex network IDs)
var bits = [];
bits.push(0, 1, 0, 0);
var ccLen = version <= 9 ? 8 : 16;
for (var b = ccLen - 1; b >= 0; b--) bits.push((str.length >> b) & 1);
bits = bits.concat(encodeByte(str));

// Terminator
var termLen = Math.min(4, totalDataBits - bits.length);
for (var t = 0; t < termLen; t++) bits.push(0);

// Pad to byte boundary
while (bits.length % 8 !== 0) bits.push(0);

// Pad codewords
var bytes = bitsToBytes(bits);
var padPatterns = [0xEC, 0x11];
var pi = 0;
while (bytes.length < info.data) {
bytes.push(padPatterns[pi]);
pi = (pi + 1) % 2;
}

return bytes;
}

function makeECCCodewords(data, eccCount) {
var gen = generatorPoly(eccCount);
var msg = data.concat(new Array(eccCount).fill(0));
return polyRem(msg, gen);
}

function interleave(data, version) {
var info = VERSIONS[version];
var dataBlocks = [], eccBlocks = [];
var offset = 0;

for (var gi = 0; gi < info.groups.length; gi++) {
var count = info.groups[gi][0], size = info.groups[gi][1];
for (var bi = 0; bi < count; bi++) {
var block = data.slice(offset, offset + size);
dataBlocks.push(block);
eccBlocks.push(makeECCCodewords(block, info.ecc));
offset += size;
}
}

var result = [];
var maxData = Math.max.apply(null, dataBlocks.map(function(b) { return b.length; }));
for (var i = 0; i < maxData; i++)
for (var j = 0; j < dataBlocks.length; j++)
if (i < dataBlocks[j].length) result.push(dataBlocks[j][i]);

for (var i2 = 0; i2 < info.ecc; i2++)
for (var j2 = 0; j2 < eccBlocks.length; j2++)
if (i2 < eccBlocks[j2].length) result.push(eccBlocks[j2][i2]);

return result;
}

// Alignment pattern positions by version
var ALIGN_POS = [null, [], [6,18], [6,22], [6,26], [6,30], [6,34], [6,22,38], [6,24,42], [6,26,46], [6,28,50]];

function createMatrix(version) {
var size = version * 4 + 17;
var matrix = [], reserved = [];
for (var i = 0; i < size; i++) {
matrix.push(new Array(size).fill(0));
reserved.push(new Array(size).fill(false));
}
return { matrix: matrix, reserved: reserved, size: size };
}

function setModule(m, row, col, val) {
if (row >= 0 && row < m.size && col >= 0 && col < m.size) {
m.matrix[row][col] = val ? 1 : 0;
m.reserved[row][col] = true;
}
}

function placeFinderPattern(m, row, col) {
for (var dr = -1; dr <= 7; dr++)
for (var dc = -1; dc <= 7; dc++) {
var r = row + dr, c = col + dc;
if (r < 0 || r >= m.size || c < 0 || c >= m.size) continue;
var inOuter = dr === -1 || dr === 7 || dc === -1 || dc === 7;
var inBorder = dr === 0 || dr === 6 || dc === 0 || dc === 6;
var inInner = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
setModule(m, r, c, !inOuter && (inBorder || inInner));
}
}

function placeAlignmentPattern(m, row, col) {
for (var dr = -2; dr <= 2; dr++)
for (var dc = -2; dc <= 2; dc++) {
var val = Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0);
setModule(m, row + dr, col + dc, val);
}
}

function placePatterns(m, version) {
// Finder patterns
placeFinderPattern(m, 0, 0);
placeFinderPattern(m, 0, m.size - 7);
placeFinderPattern(m, m.size - 7, 0);

// Timing patterns
for (var i = 8; i < m.size - 8; i++) {
setModule(m, 6, i, i % 2 === 0);
setModule(m, i, 6, i % 2 === 0);
}

// Alignment patterns
var positions = ALIGN_POS[version] || [];
for (var ai = 0; ai < positions.length; ai++)
for (var aj = 0; aj < positions.length; aj++) {
var ar = positions[ai], ac = positions[aj];
if (m.reserved[ar] && m.reserved[ar][ac]) continue;
placeAlignmentPattern(m, ar, ac);
}

// Dark module
setModule(m, m.size - 8, 8, 1);

// Reserve format info areas
for (var f = 0; f < 8; f++) {
m.reserved[8][f] = true;
m.reserved[8][m.size - 1 - f] = true;
m.reserved[f][8] = true;
m.reserved[m.size - 1 - f][8] = true;
}
m.reserved[8][8] = true;

// Reserve version info areas (version >= 7 only, skip for simplicity)
}

function placeData(m, codewords) {
var bitIndex = 0;
var bits = [];
for (var i = 0; i < codewords.length; i++)
for (var b = 7; b >= 0; b--)
bits.push((codewords[i] >> b) & 1);

var upward = true;
for (var right = m.size - 1; right >= 1; right -= 2) {
if (right === 6) right = 5; // skip timing column
for (var vert = 0; vert < m.size; vert++) {
var row = upward ? m.size - 1 - vert : vert;
for (var dc = 0; dc <= 1; dc++) {
var col = right - dc;
if (m.reserved[row][col]) continue;
m.matrix[row][col] = bitIndex < bits.length ? bits[bitIndex++] : 0;
}
}
upward = !upward;
}
}

// Format info for mask 0, ECC L = 0x77C4
var FORMAT_BITS = [
0x77C4, 0x72F3, 0x7DAA, 0x789D, 0x662F, 0x6318, 0x6C41, 0x6976,
];

function applyMask(m, maskNum) {
var maskFunc;
switch (maskNum) {
case 0: maskFunc = function(r, c) { return (r + c) % 2 === 0; }; break;
case 1: maskFunc = function(r) { return r % 2 === 0; }; break;
case 2: maskFunc = function(r, c) { return c % 3 === 0; }; break;
case 3: maskFunc = function(r, c) { return (r + c) % 3 === 0; }; break;
case 4: maskFunc = function(r, c) { return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0; }; break;
case 5: maskFunc = function(r, c) { return (r * c) % 2 + (r * c) % 3 === 0; }; break;
case 6: maskFunc = function(r, c) { return ((r * c) % 2 + (r * c) % 3) % 2 === 0; }; break;
case 7: maskFunc = function(r, c) { return ((r + c) % 2 + (r * c) % 3) % 2 === 0; }; break;
}
for (var r = 0; r < m.size; r++)
for (var c = 0; c < m.size; c++)
if (!m.reserved[r][c] && maskFunc(r, c))
m.matrix[r][c] ^= 1;
}

function placeFormatInfo(m, maskNum) {
var bits = FORMAT_BITS[maskNum];
// Around top-left finder
for (var i = 0; i <= 5; i++) m.matrix[8][i] = (bits >> (14 - i)) & 1;
m.matrix[8][7] = (bits >> 8) & 1;
m.matrix[8][8] = (bits >> 7) & 1;
m.matrix[7][8] = (bits >> 6) & 1;
for (var i2 = 0; i2 <= 5; i2++) m.matrix[5 - i2][8] = (bits >> (i2)) & 1;
// Around other finders
for (var j = 0; j <= 7; j++) m.matrix[m.size - 1 - j][8] = (bits >> (14 - j)) & 1;
for (var j2 = 0; j2 <= 7; j2++) m.matrix[8][m.size - 8 + j2] = (bits >> (7 - j2)) & 1;
}

function toSVG(matrix, size, pixelSize) {
pixelSize = pixelSize || 4;
var quiet = 4;
var totalPx = (size + quiet * 2) * pixelSize;
var rects = [];
for (var r = 0; r < size; r++)
for (var c = 0; c < size; c++)
if (matrix[r][c])
rects.push('<rect x="' + ((c + quiet) * pixelSize) + '" y="' + ((r + quiet) * pixelSize) + '" width="' + pixelSize + '" height="' + pixelSize + '"/>');

return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + totalPx + ' ' + totalPx + '" shape-rendering="crispEdges">' +
'<rect width="100%" height="100%" fill="white"/>' +
'<g fill="black">' + rects.join('') + '</g></svg>';
}

return {
generate: function(text, svgSize) {
var version = selectVersion(text.length);
if (version < 0) version = 5; // fallback

var data = makeDataCodewords(text, version);
var codewords = interleave(data, version);
var m = createMatrix(version);
placePatterns(m, version);
placeData(m, codewords);
applyMask(m, 0);
placeFormatInfo(m, 0);

var svg = toSVG(m.matrix, m.size, 4);
var div = document.createElement('div');
div.style.width = (svgSize || 200) + 'px';
div.style.height = (svgSize || 200) + 'px';
div.style.display = 'inline-block';
div.innerHTML = svg;
return div;
}
};
})();

// Copy text to clipboard with visual feedback
function copyToClipboard(text, label) {
if (navigator.clipboard && navigator.clipboard.writeText) {
navigator.clipboard.writeText(text).then(function() {
ui.addNotification(null, E('p', {}, _('已复制 %s 到剪贴板').format(label || text)), 'info');
setTimeout(function() {
var notes = document.querySelectorAll('.alert-message.notice');
if (notes.length > 0) notes[notes.length - 1].classList.add('fade-out');
}, 2000);
});
} else {
var ta = document.createElement('textarea');
ta.value = text;
ta.style.position = 'fixed';
ta.style.left = '-9999px';
document.body.appendChild(ta);
ta.select();
try { document.execCommand('copy'); } catch(e) {}
document.body.removeChild(ta);
ui.addNotification(null, E('p', {}, _('已复制 %s 到剪贴板').format(label || text)), 'info');
}
}

// Badge helper
function badge(text, color) {
return E('span', {
style: 'display:inline-block; padding:2px 8px; border-radius:12px; font-size:0.8em; font-weight:bold; color:#fff; background:' + color
}, text);
}

return view.extend({
currentNetwork: null,
networks: [],
members: [],

load: function() {
return Promise.all([
L.resolveDefault(callCheckController(), { available: false }),
L.resolveDefault(callControllerStatus(), {}),
L.resolveDefault(callListNetworks(), { networks: [] })
]).then(function(results) {
return {
controllerAvailable: results[0].available || false,
controllerReason: results[0].reason || '',
status: results[1],
networks: results[2].networks || []
};
});
},

// ── Network CRUD ──
refreshNetworks: function() {
var self = this;
return callListNetworks().then(function(r) {
self.networks = r.networks || [];
self.renderNetworkList();
}).catch(function(e) {
ui.addNotification(null, E('p', _('刷新失败: %s').format(e.message)), 'error');
});
},

createNetwork: function() {
var self = this;
var nameInput = E('input', { type: 'text', class: 'cbi-input-text', placeholder: _('My Network'), style: 'width:100%' });

ui.showModal(_('Create Network'), [
E('div', { class: 'cbi-value', style: 'margin-bottom:16px' }, [
E('label', { class: 'cbi-value-title' }, _('Network Name')),
E('div', { class: 'cbi-value-field' }, [nameInput])
]),
E('div', { class: 'right' }, [
E('button', { class: 'btn', click: ui.hideModal }, _('Cancel')), ' ',
E('button', { class: 'btn cbi-button-positive', click: function() {
var name = nameInput.value || 'Untitled';
ui.hideModal();
ui.showModal(_('Creating...'), [E('p', { class: 'spinning' }, _('Please wait...'))]);
callCreateNetwork(name).then(function(r) {
ui.hideModal();
if (r.error) { ui.addNotification(null, E('p', r.error), 'error'); return; }
ui.addNotification(null, E('p', _('Network created!')), 'info');
self.refreshNetworks();
}).catch(function(e) { ui.hideModal(); ui.addNotification(null, E('p', e.message), 'error'); });
}}, _('Create'))
])
]);
},

deleteNetwork: function(nwid, name) {
var self = this;
if (!confirm(_('确认删除网络 "%s" (%s)？此操作不可撤销。').format(name || 'Unnamed', nwid))) return;
ui.showModal(_('Deleting...'), [E('p', { class: 'spinning' }, _('Please wait...'))]);
callDeleteNetwork(nwid).then(function() {
ui.hideModal();
ui.addNotification(null, E('p', _('Network deleted')), 'info');
self.refreshNetworks();
}).catch(function(e) { ui.hideModal(); ui.addNotification(null, E('p', e.message), 'error'); });
},

// ── Network Details Modal (main feature panel) ──
showNetworkDetails: function(network) {
var self = this;
this.currentNetwork = network;
var nwid = network.nwid || network.id;

ui.showModal(_('Loading'), [E('p', { class: 'spinning' }, _('Loading network details...'))]);

Promise.all([
callGetNetwork(nwid),
callListMembers(nwid)
]).then(function(results) {
ui.hideModal();
var net = results[0];
self.currentNetwork = net;
self.members = results[1].members || [];
self.renderDetailsPage(net);
}).catch(function(e) {
ui.hideModal();
ui.addNotification(null, E('p', e.message), 'error');
});
},

renderDetailsPage: function(network) {
var self = this;
var nwid = network.nwid || network.id;
var routes = network.routes || [];
var pools = network.ipAssignmentPools || [];
var dns = network.dns || {};
var dnsServers = [];
var dnsDomain = '';

// DNS may be object {domain, servers} or empty array []
if (dns && !Array.isArray(dns)) {
dnsServers = dns.servers || [];
dnsDomain = dns.domain || '';
}

// ── 1. Network Info + QR Code ──
var infoSection = E('div', { class: 'cbi-section' }, [
E('h4', {}, _('Network Information')),
E('div', { style: 'display:flex; gap:24px; flex-wrap:wrap; align-items:flex-start' }, [
E('div', { style: 'flex:1; min-width:300px' }, [
E('table', { class: 'table' }, [
E('tr', { class: 'tr' }, [
E('td', { class: 'td', style: 'width:30%; font-weight:bold' }, _('Network ID')),
E('td', { class: 'td' }, [
E('code', { style: 'font-size:1.1em; cursor:pointer; user-select:all',
click: function() { copyToClipboard(nwid, _('Network ID')); }
}, nwid),
E('button', { class: 'btn', style: 'margin-left:8px; padding:2px 8px; font-size:0.8em',
title: _('Copy Network ID'),
click: function() { copyToClipboard(nwid, _('Network ID')); }
}, '\u{1F4CB}')
])
]),
E('tr', { class: 'tr' }, [
E('td', { class: 'td', style: 'font-weight:bold' }, _('Name')),
E('td', { class: 'td' }, network.name || '-')
]),
E('tr', { class: 'tr' }, [
E('td', { class: 'td', style: 'font-weight:bold' }, _('Type')),
E('td', { class: 'td' }, network.private !== false ? badge(_('Private'), '#6f42c1') : badge(_('Public'), '#28a745'))
]),
E('tr', { class: 'tr' }, [
E('td', { class: 'td', style: 'font-weight:bold' }, _('Broadcast')),
E('td', { class: 'td' }, network.enableBroadcast ?
E('span', { style: 'color:#28a745' }, '\u2705 ' + _('Enabled')) :
E('span', { style: 'color:#dc3545' }, '\u274C ' + _('Disabled')))
]),
E('tr', { class: 'tr' }, [
E('td', { class: 'td', style: 'font-weight:bold' }, _('MTU')),
E('td', { class: 'td' }, String(network.mtu || 2800))
]),
E('tr', { class: 'tr' }, [
E('td', { class: 'td', style: 'font-weight:bold' }, _('Members')),
E('td', { class: 'td' }, String(this.members.length))
]),
E('tr', { class: 'tr' }, [
E('td', { class: 'td', style: 'font-weight:bold' }, _('Created')),
E('td', { class: 'td' }, formatTime(network.creationTime))
])
])
]),
// QR Code panel
E('div', { style: 'text-align:center; padding:12px; background:#f8f9fa; border-radius:12px; min-width:220px' }, [
QRCode.generate('zerotier://network/' + nwid, 180),
E('p', { style: 'margin:8px 0 0; font-size:0.85em; color:#666' }, _('Scan to join this network')),
E('p', { style: 'margin:4px 0 0; font-size:0.75em; color:#999; word-break:break-all' },
'zerotier://network/' + nwid)
])
])
]);

// ── 2. Quick Actions ──
var quickSection = E('div', { class: 'cbi-section' }, [
E('h4', {}, _('Quick Actions')),
E('div', { style: 'display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px' }, [
E('button', { class: 'btn cbi-button-action', click: function() {
copyToClipboard('zerotier-cli join ' + nwid, _('Join command'));
}}, '\u{1F4CB} ' + _('Copy Join Command')),
E('button', { class: 'btn cbi-button-action', click: function() {
self.showShareModal(nwid, network.name);
}}, '\u{1F517} ' + _('Share Network')),
E('button', { class: 'btn', click: function() {
self.editNetwork(network);
}}, '\u270F\uFE0F ' + _('Edit Settings')),
E('button', { class: 'btn', click: function() {
self.showNetworkDetails(network);
}}, '\u{1F504} ' + _('Refresh'))
]),
// Quick Setup
E('div', { style: 'display:flex; gap:8px; align-items:center; margin-top:8px' }, [
E('span', { style: 'font-weight:bold; white-space:nowrap' }, _('Quick Setup CIDR:')),
E('input', { type: 'text', id: 'easy-setup-cidr', class: 'cbi-input-text',
placeholder: '10.147.17.0/24', style: 'width:200px',
value: routes.length > 0 ? routes[0].target : '' }),
E('button', { class: 'btn cbi-button-positive', click: function() {
var cidr = document.getElementById('easy-setup-cidr').value;
if (!cidr) { ui.addNotification(null, E('p', _('Please enter a CIDR')), 'error'); return; }
self.easySetup(nwid, cidr);
}}, _('Apply'))
])
]);

// ── 3. DNS Configuration ──
var dnsSection = E('div', { class: 'cbi-section' }, [
E('h4', {}, _('DNS Configuration')),
E('div', { class: 'cbi-value-description', style: 'margin-bottom:12px' },
_('Configure DNS for ZeroTier members. Clients that enable "Allow DNS" will use these settings. This is useful for resolving hostnames within the ZT network.')),
E('div', { class: 'cbi-value' }, [
E('label', { class: 'cbi-value-title' }, _('Search Domain')),
E('div', { class: 'cbi-value-field' }, [
E('input', { type: 'text', id: 'dns-domain', class: 'cbi-input-text',
placeholder: 'zt.home.lan', value: dnsDomain, style: 'width:250px' })
])
]),
E('div', { class: 'cbi-value' }, [
E('label', { class: 'cbi-value-title' }, _('DNS Servers')),
E('div', { class: 'cbi-value-field' }, [
E('input', { type: 'text', id: 'dns-servers', class: 'cbi-input-text',
placeholder: '10.0.1.1, 8.8.8.8',
value: dnsServers.join(', '), style: 'width:350px' }),
E('div', { class: 'cbi-value-description' },
_('Comma-separated IPs. Use a ZT IP of this router for internal DNS resolution.'))
])
]),
E('div', { style: 'margin-top:8px' }, [
E('button', { class: 'btn cbi-button-positive', click: function() {
var domain = document.getElementById('dns-domain').value.trim();
var serversStr = document.getElementById('dns-servers').value.trim();
var servers = serversStr ? serversStr.split(/[,\s]+/).filter(function(s) { return s; }) : [];

var dnsConfig;
if (domain || servers.length > 0) {
dnsConfig = { domain: domain, servers: servers };
} else {
dnsConfig = {};
}

ui.showModal(_('Saving DNS...'), [E('p', { class: 'spinning' }, _('Please wait...'))]);
callUpdateNetwork(nwid, JSON.stringify({ dns: dnsConfig })).then(function(r) {
ui.hideModal();
if (r.error) { ui.addNotification(null, E('p', r.error), 'error'); return; }
ui.addNotification(null, E('p', _('DNS configuration saved')), 'info');
self.showNetworkDetails(self.currentNetwork);
}).catch(function(e) { ui.hideModal(); ui.addNotification(null, E('p', e.message), 'error'); });
}}, _('Save DNS')),
dnsServers.length > 0 ?
E('span', { style: 'margin-left:12px; color:#28a745' },
'\u2705 ' + _('DNS active: %s \u2192 %s').format(dnsDomain || _('(no domain)'), dnsServers.join(', '))) :
E('span', { style: 'margin-left:12px; color:#6c757d' }, _('DNS not configured'))
])
]);

// ── 4. Routes ──
var routeRows = routes.map(function(route) {
return E('tr', { class: 'tr' }, [
E('td', { class: 'td' }, route.target || '-'),
E('td', { class: 'td' }, route.via || E('em', { style: 'color:#999' }, _('(LAN)'))),
E('td', { class: 'td' }, [
E('button', { class: 'btn cbi-button-remove', style: 'padding:2px 8px',
click: function() { self.updateNetworkRoutes(nwid, routes.filter(function(r) { return r.target !== route.target; })); }
}, '\u2715')
])
]);
});
if (routeRows.length === 0) {
routeRows.push(E('tr', { class: 'tr' }, [
E('td', { class: 'td', colspan: '3', style: 'color:#999; text-align:center' }, _('No routes configured'))
]));
}

var routeSection = E('div', { class: 'cbi-section' }, [
E('h4', {}, _('Managed Routes')),
E('table', { class: 'table cbi-section-table' }, [
E('tr', { class: 'tr table-titles' }, [
E('th', { class: 'th' }, _('Target')),
E('th', { class: 'th' }, _('Via (Gateway)')),
E('th', { class: 'th cbi-section-actions' }, _('Actions'))
])
].concat(routeRows)),
E('div', { style: 'margin-top:8px' }, [
E('button', { class: 'btn cbi-button-add', click: function() { self.addRoute(nwid, routes); }}, _('Add Route'))
])
]);

// ── 5. IP Pools ──
var poolRows = pools.map(function(pool, idx) {
return E('tr', { class: 'tr' }, [
E('td', { class: 'td' }, pool.ipRangeStart || '-'),
E('td', { class: 'td' }, pool.ipRangeEnd || '-'),
E('td', { class: 'td' }, [
E('button', { class: 'btn cbi-button-remove', style: 'padding:2px 8px',
click: function() { self.updateNetworkIPPools(nwid, pools.filter(function(_, i) { return i !== idx; })); }
}, '\u2715')
])
]);
});
if (poolRows.length === 0) {
poolRows.push(E('tr', { class: 'tr' }, [
E('td', { class: 'td', colspan: '3', style: 'color:#999; text-align:center' }, _('No IP pools configured'))
]));
}

var poolSection = E('div', { class: 'cbi-section' }, [
E('h4', {}, _('IP Assignment Pools')),
E('table', { class: 'table cbi-section-table' }, [
E('tr', { class: 'tr table-titles' }, [
E('th', { class: 'th' }, _('Start IP')),
E('th', { class: 'th' }, _('End IP')),
E('th', { class: 'th cbi-section-actions' }, _('Actions'))
])
].concat(poolRows)),
E('div', { style: 'margin-top:8px' }, [
E('button', { class: 'btn cbi-button-add', click: function() { self.addIPPool(nwid, pools); }}, _('Add IP Pool'))
])
]);

// ── 6. Members ──
var memberRows = this.members.map(function(member) {
var mid = member.id || member.address;
var ips = (member.ipAssignments || []).join(', ') || '-';
var auth = member.authorized;
var lastSeen = member.lastSeen || member.lastOnline || 0;
var isOnline = lastSeen && (Date.now() - lastSeen < 300000); // 5 min threshold
var memberName = member.name || '';

return E('tr', { class: 'tr' }, [
E('td', { class: 'td' }, [
E('code', { style: 'font-size:0.9em' }, mid),
memberName ? E('div', { style: 'font-size:0.8em; color:#666' }, memberName) : ''
]),
E('td', { class: 'td' }, [
auth ? badge(_('Authorized'), '#28a745') : badge(_('Pending'), '#ffc107'),
isOnline ?
E('span', { style: 'margin-left:6px; color:#28a745; font-size:0.85em' }, '\u25CF ' + _('Online')) :
E('span', { style: 'margin-left:6px; color:#999; font-size:0.85em' }, '\u25CB ' + _('Offline'))
]),
E('td', { class: 'td' }, ips),
E('td', { class: 'td' }, [
E('button', { class: auth ? 'btn cbi-button-remove' : 'btn cbi-button-positive',
style: 'padding:2px 8px; margin-right:4px; font-size:0.85em',
click: function() { self.authorizeMember(nwid, mid, !auth); }
}, auth ? _('Deauth') : _('Authorize')),
E('button', { class: 'btn', style: 'padding:2px 8px; margin-right:4px; font-size:0.85em',
click: function() { self.editMember(nwid, mid, member); }
}, _('Edit')),
E('button', { class: 'btn cbi-button-remove', style: 'padding:2px 8px; font-size:0.85em',
click: function() { if (confirm(_('确认删除成员 %s?').format(mid))) self.deleteMember(nwid, mid); }
}, '\u2715')
])
]);
});

if (memberRows.length === 0) {
memberRows.push(E('tr', { class: 'tr' }, [
E('td', { class: 'td', colspan: '4', style: 'text-align:center; color:#999; padding:20px' },
_('No members yet. Share the Network ID or QR code for others to join.'))
]));
}

var memberSection = E('div', { class: 'cbi-section' }, [
E('h4', {}, _('Members (%d)').format(this.members.length)),
E('table', { class: 'table cbi-section-table' }, [
E('tr', { class: 'tr table-titles' }, [
E('th', { class: 'th' }, _('Member ID')),
E('th', { class: 'th' }, _('Status')),
E('th', { class: 'th' }, _('IP Assignments')),
E('th', { class: 'th cbi-section-actions' }, _('Actions'))
])
].concat(memberRows))
]);

// ── Assemble ──
ui.showModal(_('Network: %s').format(network.name || nwid), [
E('div', { style: 'max-height:75vh; overflow-y:auto; padding-right:8px' }, [
infoSection, quickSection, dnsSection, routeSection, poolSection, memberSection
]),
E('div', { class: 'right', style: 'margin-top:16px; border-top:1px solid #ddd; padding-top:12px' }, [
E('button', { class: 'btn cbi-button-remove', style: 'margin-right:auto; float:left',
click: function() { ui.hideModal(); self.deleteNetwork(nwid, network.name); }
}, _('Delete Network')),
E('button', { class: 'btn', click: ui.hideModal }, _('Close'))
])
]);
},

// ── Share Modal with QR ──
showShareModal: function(nwid, name) {
var joinCmd = 'zerotier-cli join ' + nwid;
var ztUri = 'zerotier://network/' + nwid;
var qrContainer = E('div', { id: 'share-qr-container' });
var qrLabel = E('p', { style: 'margin:4px 0 0; font-size:0.75em; color:#999; word-break:break-all', id: 'share-qr-label' });
var currentFormat = 'uri';

function updateQR(format) {
	currentFormat = format;
	var content, label;
	switch(format) {
		case 'uri': content = ztUri; label = ztUri; break;
		case 'id': content = nwid; label = _('Network ID: ') + nwid; break;
		case 'cmd': content = joinCmd; label = joinCmd; break;
		default: content = ztUri; label = ztUri;
	}
	qrContainer.innerHTML = '';
	qrContainer.appendChild(QRCode.generate(content, 250));
	qrLabel.textContent = label;
	// Update button styles
	document.querySelectorAll('.qr-format-btn').forEach(function(btn) {
		btn.classList.remove('cbi-button-positive');
		btn.classList.add('cbi-button-neutral');
	});
	var activeBtn = document.getElementById('qr-fmt-' + format);
	if (activeBtn) { activeBtn.classList.remove('cbi-button-neutral'); activeBtn.classList.add('cbi-button-positive'); }
}

// Initial QR generation
qrContainer.appendChild(QRCode.generate(ztUri, 250));
qrLabel.textContent = ztUri;

ui.showModal(_('Share Network'), [
E('div', { style: 'text-align:center; padding:16px' }, [
E('h3', { style: 'margin-top:0' }, name || _('ZeroTier Network')),
// QR Format selector
E('div', { style: 'display:flex; gap:4px; justify-content:center; margin-bottom:12px; flex-wrap:wrap' }, [
E('button', { id: 'qr-fmt-uri', class: 'btn cbi-button-positive qr-format-btn', style: 'font-size:0.8em; padding:2px 8px',
click: function() { updateQR('uri'); }
}, 'URI'),
E('button', { id: 'qr-fmt-id', class: 'btn cbi-button-neutral qr-format-btn', style: 'font-size:0.8em; padding:2px 8px',
click: function() { updateQR('id'); }
}, _('Network ID')),
E('button', { id: 'qr-fmt-cmd', class: 'btn cbi-button-neutral qr-format-btn', style: 'font-size:0.8em; padding:2px 8px',
click: function() { updateQR('cmd'); }
}, _('Join Command'))
]),
qrContainer,
qrLabel,
E('p', { style: 'margin:16px 0 8px; font-size:1.1em' }, [
_('Network ID: '),
E('code', { style: 'font-size:1.1em; user-select:all; cursor:pointer',
click: function() { copyToClipboard(nwid, _('Network ID')); }
}, nwid)
]),
E('div', { style: 'background:#f5f5f5; padding:12px; border-radius:8px; margin:12px 0; text-align:left' }, [
E('p', { style: 'margin:0 0 8px; font-weight:bold' }, _('How to join:')),
E('p', { style: 'margin:4px 0' }, [
'\u{1F4F1} ', E('strong', {}, _('Mobile: ')), _('Open ZeroTier app → "+" → enter Network ID below')
]),
E('p', { style: 'margin:4px 0' }, [
'\u{1F4BB} ', E('strong', {}, _('Desktop: ')),
E('code', { style: 'background:#e9ecef; padding:2px 6px; border-radius:3px' }, joinCmd)
]),
E('p', { style: 'margin:4px 0' }, [
'\u{1F5A5}\uFE0F ', E('strong', {}, _('OpenWrt: ')),
_('Add network ID in ZeroTier Configuration page')
]),
E('p', { style: 'margin:8px 0 0; font-size:0.8em; color:#888; font-style:italic' },
_('Note: ZeroTier official app does not support QR scan to join. Please copy the Network ID and paste it manually.'))
]),
E('div', { style: 'display:flex; gap:8px; justify-content:center; margin-top:12px' }, [
E('button', { class: 'btn cbi-button-action',
click: function() { copyToClipboard(nwid, _('Network ID')); }
}, '\u{1F4CB} ' + _('Copy ID')),
E('button', { class: 'btn cbi-button-action',
click: function() { copyToClipboard(joinCmd, _('Join command')); }
}, '\u{1F4CB} ' + _('Copy Command')),
E('button', { class: 'btn cbi-button-action',
click: function() { copyToClipboard(ztUri, _('URI')); }
}, '\u{1F4CB} ' + _('Copy URI'))
])
]),
E('div', { class: 'right', style: 'margin-top:12px' }, [
E('button', { class: 'btn', click: ui.hideModal }, _('Close'))
])
]);
},

// ── Edit Network Settings ──
editNetwork: function(network) {
var self = this;
var nwid = network.nwid || network.id;

var nameInput = E('input', { type: 'text', class: 'cbi-input-text', value: network.name || '', style: 'width:100%' });
var privateCheck = E('input', { type: 'checkbox', checked: network.private !== false ? 'checked' : null });
var broadcastCheck = E('input', { type: 'checkbox', checked: network.enableBroadcast !== false ? 'checked' : null });
var mtuInput = E('input', { type: 'number', class: 'cbi-input-text', value: String(network.mtu || 2800), style: 'width:120px', min: '1280', max: '10000' });
var multicastInput = E('input', { type: 'number', class: 'cbi-input-text', value: String(network.multicastLimit || 32), style: 'width:120px', min: '0', max: '1024' });

ui.showModal(_('Edit Network Settings'), [
E('div', { class: 'cbi-section' }, [
E('div', { class: 'cbi-value' }, [
E('label', { class: 'cbi-value-title' }, _('Name')),
E('div', { class: 'cbi-value-field' }, [nameInput])
]),
E('div', { class: 'cbi-value' }, [
E('label', { class: 'cbi-value-title' }, _('Private')),
E('div', { class: 'cbi-value-field' }, [
privateCheck,
E('span', { style: 'margin-left:8px; color:#666; font-size:0.85em' },
_('Members must be authorized to join'))
])
]),
E('div', { class: 'cbi-value' }, [
E('label', { class: 'cbi-value-title' }, _('Broadcast')),
E('div', { class: 'cbi-value-field' }, [
broadcastCheck,
E('span', { style: 'margin-left:8px; color:#666; font-size:0.85em' },
_('Enable Ethernet broadcast/multicast'))
])
]),
E('div', { class: 'cbi-value' }, [
E('label', { class: 'cbi-value-title' }, _('MTU')),
E('div', { class: 'cbi-value-field' }, [
mtuInput,
E('span', { style: 'margin-left:8px; color:#666; font-size:0.85em' }, _('Default: 2800'))
])
]),
E('div', { class: 'cbi-value' }, [
E('label', { class: 'cbi-value-title' }, _('Multicast Limit')),
E('div', { class: 'cbi-value-field' }, [
multicastInput,
E('span', { style: 'margin-left:8px; color:#666; font-size:0.85em' }, _('Max recipients per multicast (0 = disable)'))
])
])
]),
E('div', { class: 'right' }, [
E('button', { class: 'btn', click: function() { ui.hideModal(); self.showNetworkDetails(self.currentNetwork); } }, _('Cancel')), ' ',
E('button', { class: 'btn cbi-button-positive', click: function() {
var config = JSON.stringify({
name: nameInput.value,
private: privateCheck.checked,
enableBroadcast: broadcastCheck.checked,
mtu: parseInt(mtuInput.value) || 2800,
multicastLimit: parseInt(multicastInput.value) || 32
});
ui.hideModal();
ui.showModal(_('Saving...'), [E('p', { class: 'spinning' }, _('Please wait...'))]);
callUpdateNetwork(nwid, config).then(function(r) {
ui.hideModal();
if (r.error) { ui.addNotification(null, E('p', r.error), 'error'); return; }
ui.addNotification(null, E('p', _('Settings saved')), 'info');
callGetNetwork(nwid).then(function(net) { self.currentNetwork = net; self.showNetworkDetails(net); });
self.refreshNetworks();
}).catch(function(e) { ui.hideModal(); ui.addNotification(null, E('p', e.message), 'error'); });
}}, _('Save'))
])
]);
},

// ── Edit Member (IP + Name) ──
editMember: function(nwid, mid, member) {
var self = this;
var currentIPs = (member.ipAssignments || []).join('\n');
var nameInput = E('input', { type: 'text', class: 'cbi-input-text', value: member.name || '', style: 'width:100%',
placeholder: _('e.g. Geoffrey-PC') });
var ipTextarea = E('textarea', { class: 'cbi-input-textarea', rows: '4', style: 'width:100%',
placeholder: _('One IP per line, e.g. 10.0.1.100') }, currentIPs);

ui.showModal(_('Edit Member: %s').format(mid), [
E('div', { class: 'cbi-section' }, [
E('div', { class: 'cbi-value' }, [
E('label', { class: 'cbi-value-title' }, _('Name')),
E('div', { class: 'cbi-value-field' }, [nameInput])
]),
E('div', { class: 'cbi-value' }, [
E('label', { class: 'cbi-value-title' }, _('IP Assignments')),
E('div', { class: 'cbi-value-field' }, [ipTextarea])
]),
E('div', { class: 'cbi-value' }, [
E('label', { class: 'cbi-value-title' }, _('Authorization')),
E('div', { class: 'cbi-value-field' }, [
member.authorized ? badge(_('Authorized'), '#28a745') : badge(_('Pending'), '#ffc107')
])
])
]),
E('div', { class: 'right' }, [
E('button', { class: 'btn', click: function() { ui.hideModal(); self.showNetworkDetails(self.currentNetwork); } }, _('Cancel')), ' ',
E('button', { class: 'btn cbi-button-positive', click: function() {
var ips = ipTextarea.value.split('\n').map(function(s) { return s.trim(); }).filter(function(s) { return s; });
var config = JSON.stringify({ ipAssignments: ips, name: nameInput.value.trim() });
callUpdateMember(nwid, mid, config).then(function(r) {
ui.hideModal();
if (r.error) { ui.addNotification(null, E('p', r.error), 'error'); return; }
ui.addNotification(null, E('p', _('Member updated')), 'info');
self.showNetworkDetails(self.currentNetwork);
}).catch(function(e) { ui.hideModal(); ui.addNotification(null, E('p', e.message), 'error'); });
}}, _('Save'))
])
]);
},

// ── Member actions ──
authorizeMember: function(nwid, mid, authorized) {
var self = this;
callAuthorizeMember(nwid, mid, authorized).then(function(r) {
if (r.error) { ui.addNotification(null, E('p', r.error), 'error'); return; }
ui.addNotification(null, E('p', authorized ? _('Member authorized') : _('Member deauthorized')), 'info');
self.showNetworkDetails(self.currentNetwork);
}).catch(function(e) { ui.addNotification(null, E('p', e.message), 'error'); });
},

deleteMember: function(nwid, mid) {
var self = this;
callDeleteMember(nwid, mid).then(function() {
ui.addNotification(null, E('p', _('Member deleted')), 'info');
self.showNetworkDetails(self.currentNetwork);
}).catch(function(e) { ui.addNotification(null, E('p', e.message), 'error'); });
},

// ── Route / Pool management ──
addRoute: function(nwid, existingRoutes) {
var self = this;
var targetInput = E('input', { type: 'text', class: 'cbi-input-text', placeholder: '10.0.0.0/24', style: 'width:100%' });
var viaInput = E('input', { type: 'text', class: 'cbi-input-text', placeholder: _('Leave empty for managed route'), style: 'width:100%' });

ui.showModal(_('Add Route'), [
E('div', { class: 'cbi-section' }, [
E('div', { class: 'cbi-value' }, [
E('label', { class: 'cbi-value-title' }, _('Target (CIDR)')),
E('div', { class: 'cbi-value-field' }, [targetInput])
]),
E('div', { class: 'cbi-value' }, [
E('label', { class: 'cbi-value-title' }, _('Via (Gateway)')),
E('div', { class: 'cbi-value-field' }, [viaInput])
])
]),
E('div', { class: 'right' }, [
E('button', { class: 'btn', click: function() { ui.hideModal(); self.showNetworkDetails(self.currentNetwork); } }, _('Cancel')), ' ',
E('button', { class: 'btn cbi-button-positive', click: function() {
var target = targetInput.value.trim();
if (!target) { ui.addNotification(null, E('p', _('Target is required')), 'error'); return; }
var newRoutes = existingRoutes.slice();
var via = viaInput.value.trim() || null;
newRoutes.push({ target: target, via: via });
ui.hideModal();
self.updateNetworkRoutes(nwid, newRoutes);
}}, _('Add'))
])
]);
},

updateNetworkRoutes: function(nwid, routes) {
var self = this;
ui.showModal(_('Saving...'), [E('p', { class: 'spinning' }, _('Please wait...'))]);
callUpdateRoutes(nwid, JSON.stringify(routes)).then(function(r) {
ui.hideModal();
if (r.error) { ui.addNotification(null, E('p', r.error), 'error'); return; }
ui.addNotification(null, E('p', _('Routes updated')), 'info');
callGetNetwork(nwid).then(function(net) { self.currentNetwork = net; self.showNetworkDetails(net); });
}).catch(function(e) { ui.hideModal(); ui.addNotification(null, E('p', e.message), 'error'); });
},

addIPPool: function(nwid, existingPools) {
var self = this;
var startInput = E('input', { type: 'text', class: 'cbi-input-text', placeholder: '10.0.1.1', style: 'width:100%' });
var endInput = E('input', { type: 'text', class: 'cbi-input-text', placeholder: '10.0.1.254', style: 'width:100%' });

ui.showModal(_('Add IP Pool'), [
E('div', { class: 'cbi-section' }, [
E('div', { class: 'cbi-value' }, [
E('label', { class: 'cbi-value-title' }, _('Start IP')),
E('div', { class: 'cbi-value-field' }, [startInput])
]),
E('div', { class: 'cbi-value' }, [
E('label', { class: 'cbi-value-title' }, _('End IP')),
E('div', { class: 'cbi-value-field' }, [endInput])
])
]),
E('div', { class: 'right' }, [
E('button', { class: 'btn', click: function() { ui.hideModal(); self.showNetworkDetails(self.currentNetwork); } }, _('Cancel')), ' ',
E('button', { class: 'btn cbi-button-positive', click: function() {
var s = startInput.value.trim(), e = endInput.value.trim();
if (!s || !e) { ui.addNotification(null, E('p', _('Both IPs required')), 'error'); return; }
var newPools = existingPools.slice();
newPools.push({ ipRangeStart: s, ipRangeEnd: e });
ui.hideModal();
self.updateNetworkIPPools(nwid, newPools);
}}, _('Add'))
])
]);
},

updateNetworkIPPools: function(nwid, pools) {
var self = this;
ui.showModal(_('Saving...'), [E('p', { class: 'spinning' }, _('Please wait...'))]);
callUpdateIPPools(nwid, JSON.stringify(pools)).then(function(r) {
ui.hideModal();
if (r.error) { ui.addNotification(null, E('p', r.error), 'error'); return; }
ui.addNotification(null, E('p', _('IP pools updated')), 'info');
callGetNetwork(nwid).then(function(net) { self.currentNetwork = net; self.showNetworkDetails(net); });
}).catch(function(e) { ui.hideModal(); ui.addNotification(null, E('p', e.message), 'error'); });
},

easySetup: function(nwid, cidr) {
var self = this;
ui.showModal(_('Applying...'), [E('p', { class: 'spinning' }, _('Please wait...'))]);
callEasySetup(nwid, cidr).then(function(r) {
ui.hideModal();
if (r.error) { ui.addNotification(null, E('p', r.error), 'error'); return; }
ui.addNotification(null, E('p', _('Quick setup applied!')), 'info');
callGetNetwork(nwid).then(function(net) { self.currentNetwork = net; self.showNetworkDetails(net); });
}).catch(function(e) { ui.hideModal(); ui.addNotification(null, E('p', e.message), 'error'); });
},

// ── Network List ──
renderNetworkList: function() {
var self = this;
var container = document.getElementById('network-list-container');
if (!container) return;
container.innerHTML = '';

var table = E('table', { class: 'table cbi-section-table' }, [
E('tr', { class: 'tr table-titles' }, [
E('th', { class: 'th' }, _('Network ID')),
E('th', { class: 'th' }, _('Name')),
E('th', { class: 'th' }, _('Subnet')),
E('th', { class: 'th' }, _('Type')),
E('th', { class: 'th cbi-section-actions' }, _('Actions'))
])
]);

this.networks.forEach(function(network) {
var nwid = network.nwid || network.id;
var routes = network.routes || [];
var subnet = routes.length > 0 ? routes[0].target : '-';

table.appendChild(E('tr', { class: 'tr' }, [
E('td', { class: 'td' }, E('code', { style: 'cursor:pointer', click: function() { copyToClipboard(nwid, 'Network ID'); }}, nwid)),
E('td', { class: 'td' }, network.name || E('em', { style: 'color:#999' }, _('Unnamed'))),
E('td', { class: 'td' }, subnet),
E('td', { class: 'td' }, network.private ? badge(_('Private'), '#6f42c1') : badge(_('Public'), '#28a745')),
E('td', { class: 'td' }, [
E('button', { class: 'btn cbi-button-action', style: 'margin-right:4px',
click: function() { self.showNetworkDetails(network); }
}, _('Manage')),
E('button', { class: 'btn', style: 'margin-right:4px',
click: function() { self.showShareModal(nwid, network.name); }
}, '\u{1F517}'),
E('button', { class: 'btn cbi-button-remove',
click: function() { self.deleteNetwork(nwid, network.name); }
}, '\u2715')
])
]));
});

if (this.networks.length === 0) {
table.appendChild(E('tr', { class: 'tr' }, [
E('td', { class: 'td', colspan: '5', style: 'text-align:center; padding:24px; color:#666' },
_('No networks. Click "Create Network" to get started.'))
]));
}

container.appendChild(table);
},

// ── Main Render ──
render: function(data) {
var self = this;
this.networks = data.networks || [];

var title = E('h2', { class: 'content' }, _('ZeroTier Network Controller'));
var desc = E('div', { class: 'cbi-map-descr' },
_('Manage ZeroTier networks from this router. Create networks, authorize members, configure DNS, routes, and share via QR code.'));

var content = [title, desc];

if (!data.controllerAvailable) {
content.push(E('div', { class: 'cbi-section' }, [
E('h3', {}, _('Controller Not Available')),
E('div', { style: 'padding:16px; background:#fff3cd; border:1px solid #ffc107; border-radius:8px' }, [
E('p', { style: 'font-weight:bold; margin:0 0 8px' }, _('The ZeroTier Controller API is not available on this device.')),
E('p', { style: 'margin:0' }, data.controllerReason || _('The zerotier package may not include controller support.'))
])
]));
return E('div', { class: 'cbi-map' }, content);
}

// Status
var statusSection = E('div', { class: 'cbi-section' }, [
E('h3', {}, _('Controller Status'))
]);

if (data.status.running) {
statusSection.appendChild(E('table', { class: 'table' }, [
E('tr', { class: 'tr' }, [
E('td', { class: 'td', style: 'width:25%' }, _('Status')),
E('td', { class: 'td' }, badge(_('Running'), '#28a745'))
]),
E('tr', { class: 'tr' }, [
E('td', { class: 'td' }, _('Node ID')),
E('td', { class: 'td' }, [
E('code', { style: 'font-size:1.05em' }, data.status.address || '-'),
E('span', { style: 'color:#666; margin-left:12px; font-size:0.85em' },
_('This is the controller node. Network IDs start with this prefix.'))
])
]),
E('tr', { class: 'tr' }, [
E('td', { class: 'td' }, _('Version')),
E('td', { class: 'td' }, data.status.version || '-')
]),
E('tr', { class: 'tr' }, [
E('td', { class: 'td' }, _('Networks')),
E('td', { class: 'td' }, String(this.networks.length))
])
]));
} else {
statusSection.appendChild(E('p', { style: 'color:#dc3545; font-weight:bold' },
_('ZeroTier daemon not running. Start the service first.')));
}

// Networks
var networksSection = E('div', { class: 'cbi-section' }, [
E('h3', {}, _('Networks')),
E('div', { style: 'margin-bottom:12px; display:flex; gap:8px' }, [
E('button', { class: 'btn cbi-button-add', click: function() { self.createNetwork(); } }, _('Create Network')),
E('button', { class: 'btn', click: function() { self.refreshNetworks(); } }, _('Refresh'))
]),
E('div', { id: 'network-list-container' })
]);

content.push(statusSection, networksSection);

var mainView = E('div', { class: 'cbi-map' }, content);
setTimeout(function() { self.renderNetworkList(); }, 0);
return mainView;
},

handleSaveApply: null,
handleSave: null,
handleReset: null
});
