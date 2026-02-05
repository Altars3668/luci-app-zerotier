module("luci.controller.zerotier",package.seeall)

function index()
  if not nixio.fs.access("/etc/config/zerotier")then
return
end

entry({"admin","vpn"}, firstchild(), "VPN", 45).dependent = false

entry({"admin", "vpn", "zerotier"},firstchild(), _("ZeroTier")).dependent = false

entry({"admin", "vpn", "zerotier", "general"},cbi("zerotier/settings"), _("Base Setting"), 1)
entry({"admin", "vpn", "zerotier", "log"},form("zerotier/info"), _("Interface Info"), 2)
entry({"admin", "vpn", "zerotier", "controller"},cbi("zerotier/controller"), _("Controller"), 3)
entry({"admin", "vpn", "zerotier", "moon"},cbi("zerotier/moon"), _("Moon Server"), 4)
entry({"admin", "vpn", "zerotier", "manual"},cbi("zerotier/manual"), _("Manual Config"), 5)

entry({"admin","vpn","zerotier","status"},call("act_status"))
entry({"admin","vpn","zerotier","download_moon"},call("download_moon"))
end

function act_status()
local e={}
  e.running=luci.sys.call("pgrep /usr/bin/zerotier-one >/dev/null")==0
  luci.http.prepare_content("application/json")
  luci.http.write_json(e)
end

function download_moon()
    local fs = require "nixio.fs"
    local sys = require "luci.sys"
    
    local moon_file = sys.exec("ls /var/lib/zerotier-one/*.moon 2>/dev/null | head -1"):gsub("%s+", "")
    
    if moon_file and moon_file ~= "" and fs.access(moon_file) then
        local filename = moon_file:match("/([^/]+)$")
        local content = fs.readfile(moon_file)
        
        if content then
            luci.http.header("Content-Type", "application/octet-stream")
            luci.http.header("Content-Disposition", 'attachment; filename="' .. filename .. '"')
            luci.http.write(content)
        else
            luci.http.status(404, "File not found")
            luci.http.write("Moon file not found or empty")
        end
    else
        luci.http.status(404, "File not found")
        luci.http.write("No moon file available")
    end
end
