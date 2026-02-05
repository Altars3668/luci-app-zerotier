local fs = require "nixio.fs"
local sys = require "luci.sys"
local uci = require "luci.model.uci".cursor()

local m, s, o

m = Map("zerotier", translate("ZeroTier Network Controller"), 
    translate("Configure ZeroTier network controller settings for ztncui or official controller"))

-- Controller Configuration Section
s = m:section(NamedSection, "sample_config", "zerotier", translate("Controller Configuration"))
s.anonymous = true
s.addremove = false

-- Controller Type Selection
o = s:option(ListValue, "controller_type", translate("Controller Type"))
o.default = "official"
o:value("official", translate("Official ZeroTier Controller"))
o:value("ztncui", translate("Custom ztncui Controller"))
o.description = translate("Select the type of ZeroTier network controller to use")

-- Official Controller Settings
o = s:option(DummyValue, "official_info", translate("Official Controller Info"))
o.description = translate("Using official ZeroTier controller at my.zerotier.com - free for up to 25 devices")
o:depends("controller_type", "official")

-- Custom ztncui Settings
o = s:option(Value, "ztncui_url", translate("ztncui Server URL"))
o.default = "http://192.168.1.100:3000"
o.datatype = "string"
o.rmempty = false
o.description = translate("URL of your ztncui server (e.g., http://192.168.1.100:3000)")
o:depends("controller_type", "ztncui")

o = s:option(Value, "ztncui_token", translate("ztncui API Token"))
o.datatype = "string"
o.password = true
o.rmempty = true
o.description = translate("API token for ztncui authentication (optional)")
o:depends("controller_type", "ztncui")

-- Test Connection Button
o = s:option(Button, "test_connection", translate("Test Connection"))
o.inputtitle = translate("Test")
o.inputstyle = "apply"
o.description = translate("Test connection to the selected controller")
o:depends("controller_type", "ztncui")

function o.write(self, section)
    local ztncui_url = m:formvalue("cbid.zerotier.sample_config.ztncui_url")
    if ztncui_url then
        local test_cmd = string.format("curl -s -o /dev/null -w '%%{http_code}' --connect-timeout 5 '%s' 2>/dev/null", ztncui_url)
        local result = sys.exec(test_cmd):gsub("%s+", "")
        
        if result == "200" or result == "302" or result == "301" then
            m.message = translate("Connection test successful!")
        else
            m.error = translate("Connection test failed. Please check the URL and network connectivity.")
        end
    end
end

-- Controller Access Section
s = m:section(TypedSection, "zerotier", translate("Controller Access"))
s.anonymous = true
s.addremove = false
s.template = "cbi/tblsection"

-- Quick Access Button
o = s:option(DummyValue, "controller_access", translate("Access Controller"))

function o.cfgvalue(self, section)
    local controller_type = uci:get("zerotier", "sample_config", "controller_type") or "official"
    local button_text = translate("Open Controller")
    local url = "https://my.zerotier.com"
    
    if controller_type == "ztncui" then
        local ztncui_url = uci:get("zerotier", "sample_config", "ztncui_url")
        if ztncui_url then
            url = ztncui_url
        end
    end
    
    return string.format([[
        <input type="button" class="cbi-button cbi-button-apply" value="%s" 
               onclick="window.open('%s', '_blank')" />
    ]], button_text, url)
end

-- Network Management Section
s = m:section(TypedSection, "zerotier", translate("Network Management"))
s.anonymous = true
s.addremove = false

-- Current Node ID Display
o = s:option(DummyValue, "node_id", translate("This Device Node ID"))
function o.cfgvalue(self, section)
    local node_id = sys.exec("zerotier-cli info 2>/dev/null | awk '{print $3}'"):gsub("%s+", "")
    if node_id and node_id ~= "" then
        return string.format('<code style="background:#f5f5f5;padding:5px;border-radius:3px;">%s</code>', node_id)
    else
        return translate("ZeroTier service not running")
    end
end
o.description = translate("This is your device's ZeroTier node ID - you'll need this when authorizing in the controller")

-- Quick Network Join
o = s:option(Value, "quick_join_network", translate("Quick Join Network"))
o.datatype = "string"
o.rmempty = true
o.description = translate("Enter a network ID to quickly join (will be added to the network list)")

o = s:option(Button, "join_network_btn", translate("Join Network"))
o.inputtitle = translate("Join")
o.inputstyle = "apply"

function o.write(self, section)
    local network_id = m:formvalue("cbid.zerotier." .. section .. ".quick_join_network")
    if network_id and network_id ~= "" then
        -- Get current network list
        local current_networks = uci:get("zerotier", "sample_config", "join") or {}
        
        -- Check if network is already in the list
        local already_joined = false
        if type(current_networks) == "string" then
            if current_networks == network_id then
                already_joined = true
            end
        elseif type(current_networks) == "table" then
            for _, nw in ipairs(current_networks) do
                if nw == network_id then
                    already_joined = true
                    break
                end
            end
        end
        
        if not already_joined then
            -- Add to network list
            if type(current_networks) == "string" and current_networks ~= "" then
                uci:set_list("zerotier", "sample_config", "join", {current_networks, network_id})
            elseif type(current_networks) == "table" then
                table.insert(current_networks, network_id)
                uci:set_list("zerotier", "sample_config", "join", current_networks)
            else
                uci:set("zerotier", "sample_config", "join", network_id)
            end
            uci:commit("zerotier")
            
            -- Restart ZeroTier service to join the network
            sys.exec("/etc/init.d/zerotier restart")
            
            m.message = translate("Network joined successfully! Please authorize this device in your controller.")
        else
            m.error = translate("This network is already in your network list.")
        end
    end
end

-- Network Creation Helper (for ztncui)
o = s:option(DummyValue, "network_helper", translate("Network Creation Helper"))
o.description = translate("Quick guide for creating and managing networks")

function o.cfgvalue(self, section)
    local controller_type = uci:get("zerotier", "sample_config", "controller_type") or "official"
    
    if controller_type == "ztncui" then
        return translate("Steps to create a network:") .. "<br/>" ..
               "1. " .. translate("Open ztncui controller") .. "<br/>" ..
               "2. " .. translate("Click 'Add Network' to create a new network") .. "<br/>" ..
               "3. " .. translate("Configure network settings (IP range, routes, etc.)") .. "<br/>" ..
               "4. " .. translate("Copy the Network ID") .. "<br/>" ..
               "5. " .. translate("Add the Network ID in Base Settings tab") .. "<br/>" ..
               "6. " .. translate("Authorize this device in ztncui controller")
    else
        return translate("Steps to create a network:") .. "<br/>" ..
               "1. " .. translate("Visit my.zerotier.com and sign up/login") .. "<br/>" ..
               "2. " .. translate("Click 'Create A Network'") .. "<br/>" ..
               "3. " .. translate("Configure network settings") .. "<br/>" ..
               "4. " .. translate("Copy the Network ID") .. "<br/>" ..
               "5. " .. translate("Add the Network ID in Base Settings tab") .. "<br/>" ..
               "6. " .. translate("Authorize this device in ZeroTier Central")
    end
end

-- ztncui Installation Guide
s = m:section(TypedSection, "zerotier", translate("ztncui Installation Guide"))
s.anonymous = true
s.addremove = false

o = s:option(DummyValue, "ztncui_guide", translate("How to Install ztncui"))
o.description = translate("ztncui is a web-based network controller for ZeroTier that you can self-host")

function o.cfgvalue(self, section)
    return [[
<div style="background: #f9f9f9; padding: 10px; border-radius: 5px; margin: 10px 0;">
<h4>]] .. translate("Docker Installation (Recommended)") .. [[</h4>
<pre style="background: #333; color: #fff; padding: 10px; border-radius: 3px; overflow-x: auto;">
# ]] .. translate("Pull and run ztncui container") .. [[
docker run -d --name ztncui \
  -p 3000:3000 \
  -v ztncui_data:/opt/key-networks/ztncui/etc \
  keynetworks/ztncui

# ]] .. translate("Access ztncui at http://your-server-ip:3000") .. [[
# ]] .. translate("Default credentials: admin/password") .. [[
</pre>

<h4>]] .. translate("Manual Installation") .. [[</h4>
<pre style="background: #333; color: #fff; padding: 10px; border-radius: 3px; overflow-x: auto;">
# ]] .. translate("Install Node.js and npm") .. [[
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt-get install -y nodejs

# ]] .. translate("Install ztncui") .. [[
sudo npm install -g ztncui
sudo ztncui-setup

# ]] .. translate("Start ztncui service") .. [[
sudo systemctl start ztncui
sudo systemctl enable ztncui
</pre>

<h4>]] .. translate("Important Notes") .. [[</h4>
<ul>
<li>]] .. translate("ztncui requires ZeroTier One to be installed on the same machine") .. [[</li>
<li>]] .. translate("The server running ztncui will become your network controller") .. [[</li>
<li>]] .. translate("Make sure to secure your ztncui installation with proper authentication") .. [[</li>
<li>]] .. translate("Backup your ztncui data directory regularly") .. [[</li>
</ul>
</div>
    ]]
end

return m