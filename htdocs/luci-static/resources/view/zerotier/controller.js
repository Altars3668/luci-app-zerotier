/* SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright (C) 2022 ImmortalWrt.org
 * External ZeroTier Controller Connection (ZTNCUI / Zero-UI)
 */

'use strict';
'require fs';
'require ui';
'require view';
'require uci';

// Default configurations
const CONTROLLER_CONFIG = {
DEFAULT_ZTNCUI_PORT: 3000,
DEFAULT_ZEROUI_PORT: 4000,
DEFAULT_ZT_API_PORT: 9993,
CONFIG_FILE: '/etc/config/zerotier'
};

return view.extend({
load: function() {
return Promise.all([
uci.load('zerotier'),
this.loadSavedConfig()
]).then(function(results) {
return {
uciConfig: results[0],
savedConfig: results[1]
};
});
},

loadSavedConfig: function() {
return fs.read('/etc/zerotier-controller.conf').then(function(content) {
if (!content) return {};

var config = {};
content.split('\n').forEach(function(line) {
var match = line.match(/^(\w+)=(.*)$/);
if (match) {
config[match[1]] = match[2];
}
});
return config;
}).catch(function() {
return {};
});
},

saveConfig: function(config) {
var content = Object.entries(config).map(function(entry) {
return entry[0] + '=' + entry[1];
}).join('\n');

return fs.write('/etc/zerotier-controller.conf', content).then(function() {
ui.addNotification(null, E('p', {}, _('Configuration saved')), 'info');
return true;
}).catch(function(err) {
ui.addNotification(null, E('p', {}, _('Failed to save: %s').format(err.message)), 'error');
return false;
});
},

testConnection: function(url, type) {
ui.showModal(_('Testing Connection'), [
E('p', { class: 'spinning' }, _('Connecting to %s...').format(url))
]);

// Use iframe to test connection (works cross-origin)
return new Promise(function(resolve) {
var timeout = setTimeout(function() {
ui.hideModal();
resolve({ success: false, error: 'Connection timeout' });
}, 10000);

// Try fetch with no-cors mode (will succeed or fail based on network)
fetch(url, { 
method: 'HEAD',
mode: 'no-cors',
cache: 'no-cache'
}).then(function() {
clearTimeout(timeout);
ui.hideModal();
resolve({ success: true });
}).catch(function(err) {
clearTimeout(timeout);
ui.hideModal();
resolve({ success: false, error: err.message });
});
});
},

openController: function(url) {
window.open(url, '_blank', 'noopener,noreferrer');
},

render: function(data) {
var self = this;
var savedConfig = data.savedConfig || {};
var content = [];

// Title
content.push(E('h2', { class: 'content' }, _('External Controller')));
content.push(E('div', { class: 'cbi-map-descr' }, 
_('Connect to external ZeroTier controller interfaces like ZTNCUI or Zero-UI.')));

// ZTNCUI Section
var ztncuiSection = E('div', { class: 'cbi-section' }, [
E('h3', {}, _('ZTNCUI')),
E('p', {}, _('ZTNCUI is a web interface for ZeroTier network controllers. It can run on the same device or a remote server.'))
]);

var ztncuiUrlInput = E('input', {
type: 'text',
class: 'cbi-input-text',
placeholder: _('https://your-ztncui-server:3000'),
value: savedConfig.ZTNCUI_URL || '',
style: 'width: 350px; margin-right: 10px;'
});

ztncuiSection.appendChild(E('div', { class: 'cbi-value' }, [
E('label', { class: 'cbi-value-title' }, _('ZTNCUI URL')),
E('div', { class: 'cbi-value-field' }, [
ztncuiUrlInput,
E('button', {
class: 'btn cbi-button',
style: 'margin-right: 5px;',
click: function() {
var url = ztncuiUrlInput.value.trim();
if (!url) {
ui.addNotification(null, E('p', {}, _('Please enter URL')), 'error');
return;
}
self.testConnection(url, 'ztncui').then(function(result) {
if (result.success) {
ui.addNotification(null, E('p', {}, _('Connection successful!')), 'info');
} else {
ui.addNotification(null, E('p', {}, 
_('Connection might work - browser security prevents full test. Try opening the URL.')), 'warning');
}
});
}
}, _('Test')),
E('button', {
class: 'btn cbi-button cbi-button-action',
style: 'margin-right: 5px;',
click: function() {
var url = ztncuiUrlInput.value.trim();
if (!url) {
ui.addNotification(null, E('p', {}, _('Please enter URL')), 'error');
return;
}
self.openController(url);
}
}, _('Open')),
E('button', {
class: 'btn cbi-button cbi-button-save',
click: function() {
savedConfig.ZTNCUI_URL = ztncuiUrlInput.value.trim();
self.saveConfig(savedConfig);
}
}, _('Save'))
])
]));

// Quick setup tips for ZTNCUI
ztncuiSection.appendChild(E('div', { 
class: 'cbi-value',
style: 'background: #f5f5f5; padding: 10px; border-radius: 5px; margin-top: 10px;'
}, [
E('strong', {}, _('Quick Setup (Docker):')),
E('pre', { style: 'margin: 10px 0; font-size: 0.9em; overflow-x: auto;' }, 
'docker run -d --name ztncui \\\n' +
'  -p 3000:3000 \\\n' +
'  -v /var/lib/zerotier-one:/var/lib/zerotier-one \\\n' +
'  -e NODE_ENV=production \\\n' +
'  keynetworks/ztncui')
]));
content.push(ztncuiSection);

// Zero-UI Section
var zerouiSection = E('div', { class: 'cbi-section' }, [
E('h3', {}, _('Zero-UI')),
E('p', {}, _('Zero-UI is a modern web interface for ZeroTier with a React frontend.'))
]);

var zerouiUrlInput = E('input', {
type: 'text',
class: 'cbi-input-text',
placeholder: _('http://your-zeroui-server:4000'),
value: savedConfig.ZEROUI_URL || '',
style: 'width: 350px; margin-right: 10px;'
});

zerouiSection.appendChild(E('div', { class: 'cbi-value' }, [
E('label', { class: 'cbi-value-title' }, _('Zero-UI URL')),
E('div', { class: 'cbi-value-field' }, [
zerouiUrlInput,
E('button', {
class: 'btn cbi-button',
style: 'margin-right: 5px;',
click: function() {
var url = zerouiUrlInput.value.trim();
if (!url) {
ui.addNotification(null, E('p', {}, _('Please enter URL')), 'error');
return;
}
self.testConnection(url, 'zeroui').then(function(result) {
if (result.success) {
ui.addNotification(null, E('p', {}, _('Connection successful!')), 'info');
} else {
ui.addNotification(null, E('p', {}, 
_('Connection might work - browser security prevents full test. Try opening the URL.')), 'warning');
}
});
}
}, _('Test')),
E('button', {
class: 'btn cbi-button cbi-button-action',
style: 'margin-right: 5px;',
click: function() {
var url = zerouiUrlInput.value.trim();
if (!url) {
ui.addNotification(null, E('p', {}, _('Please enter URL')), 'error');
return;
}
self.openController(url);
}
}, _('Open')),
E('button', {
class: 'btn cbi-button cbi-button-save',
click: function() {
savedConfig.ZEROUI_URL = zerouiUrlInput.value.trim();
self.saveConfig(savedConfig);
}
}, _('Save'))
])
]));

// Quick setup tips for Zero-UI
zerouiSection.appendChild(E('div', { 
class: 'cbi-value',
style: 'background: #f5f5f5; padding: 10px; border-radius: 5px; margin-top: 10px;'
}, [
E('strong', {}, _('Quick Setup (Docker):')),
E('pre', { style: 'margin: 10px 0; font-size: 0.9em; overflow-x: auto;' }, 
'docker run -d --name zero-ui \\\n' +
'  -p 4000:4000 \\\n' +
'  -v /var/lib/zerotier-one:/var/lib/zerotier-one \\\n' +
'  -e ZU_CONTROLLER_ENDPOINT=http://localhost:9993 \\\n' +
'  dec0dos/zero-ui')
]));
content.push(zerouiSection);

// Direct ZeroTier API Section
var apiSection = E('div', { class: 'cbi-section' }, [
E('h3', {}, _('ZeroTier Controller API')),
E('p', {}, _('Connect directly to ZeroTier controller API for advanced management.'))
]);

var apiUrlInput = E('input', {
type: 'text',
class: 'cbi-input-text',
placeholder: _('http://localhost:9993'),
value: savedConfig.ZT_API_URL || 'http://localhost:9993',
style: 'width: 250px; margin-right: 10px;'
});

var apiTokenInput = E('input', {
type: 'password',
class: 'cbi-input-text',
placeholder: _('API Token (from authtoken.secret)'),
value: savedConfig.ZT_API_TOKEN || '',
style: 'width: 300px; margin-right: 10px;'
});

apiSection.appendChild(E('div', { class: 'cbi-value' }, [
E('label', { class: 'cbi-value-title' }, _('API Endpoint')),
E('div', { class: 'cbi-value-field' }, [apiUrlInput])
]));

apiSection.appendChild(E('div', { class: 'cbi-value' }, [
E('label', { class: 'cbi-value-title' }, _('API Token')),
E('div', { class: 'cbi-value-field' }, [
apiTokenInput,
E('button', {
class: 'btn cbi-button',
style: 'margin-left: 10px;',
click: function() {
fs.read('/var/lib/zerotier-one/authtoken.secret').then(function(token) {
if (token) {
apiTokenInput.value = token.trim();
ui.addNotification(null, E('p', {}, _('Token loaded from local ZeroTier')), 'info');
}
}).catch(function() {
ui.addNotification(null, E('p', {}, _('Could not read local token')), 'error');
});
}
}, _('Load Local Token'))
])
]));

apiSection.appendChild(E('div', { class: 'cbi-value' }, [
E('label', { class: 'cbi-value-title' }, ''),
E('div', { class: 'cbi-value-field' }, [
E('button', {
class: 'btn cbi-button cbi-button-save',
click: function() {
savedConfig.ZT_API_URL = apiUrlInput.value.trim();
savedConfig.ZT_API_TOKEN = apiTokenInput.value.trim();
self.saveConfig(savedConfig);
}
}, _('Save API Settings'))
])
]));

content.push(apiSection);

// Saved Controllers Section
var savedSection = E('div', { class: 'cbi-section' }, [
E('h3', {}, _('Quick Access'))
]);

var quickLinks = [];
if (savedConfig.ZTNCUI_URL) {
quickLinks.push(E('button', {
class: 'btn cbi-button cbi-button-action',
style: 'margin-right: 10px; margin-bottom: 10px;',
click: function() { self.openController(savedConfig.ZTNCUI_URL); }
}, [E('span', {}, '🌐 '), _('Open ZTNCUI')]));
}
if (savedConfig.ZEROUI_URL) {
quickLinks.push(E('button', {
class: 'btn cbi-button cbi-button-action',
style: 'margin-right: 10px; margin-bottom: 10px;',
click: function() { self.openController(savedConfig.ZEROUI_URL); }
}, [E('span', {}, '🎛️ '), _('Open Zero-UI')]));
}

if (quickLinks.length > 0) {
savedSection.appendChild(E('div', {}, quickLinks));
} else {
savedSection.appendChild(E('p', { style: 'color: #666;' }, 
_('No controllers configured. Add URLs above to enable quick access.')));
}

content.push(savedSection);

return E('div', {}, content);
},

handleSaveApply: null,
handleSave: null,
handleReset: null
});
