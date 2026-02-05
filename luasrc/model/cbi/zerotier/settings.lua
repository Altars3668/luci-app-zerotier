
a=Map("zerotier",translate("ZeroTier"),translate("Zerotier is an open source, cross-platform and easy to use virtual LAN"))
a:section(SimpleSection).template  = "zerotier/zerotier_status"

t=a:section(NamedSection,"sample_config","zerotier")
t.anonymous=true
t.addremove=false

e=t:option(Flag,"enabled",translate("Enable"))
e.default=0
e.rmempty=false

e=t:option(DynamicList,"join",translate('ZeroTier Network ID'))
e.password=true
e.rmempty=false

e=t:option(Flag,"nat",translate("Auto NAT Clients"))
e.default=0
e.rmempty=false

e = t:option(MultiValue, "access", translate("Zerotier access control"))
e.default="lanfwzt ztfwwan ztfwlan"
e.rmempty=false
e:value("lanfwzt",translate("lan access zerotier"))
e:value("wanfwzt",translate("wan access zerotier"))
e:value("ztfwwan",translate("remote access wan"))
e:value("ztfwlan",translate("remote access lan"))
e.widget = "checkbox"

e=t:option(DummyValue,"opennewwindow" , 
	translate("<input type=\"button\" class=\"cbi-button cbi-button-apply\" value=\"Open Controller\" onclick=\"openController()\" />"))
e.description = translate("Open ZeroTier network controller to create or manage networks")

local controller_script = [[
<script type="text/javascript">
function openController() {
	var controllerType = '';
	var controllerTypeInputs = document.querySelectorAll('input[name="cbid.zerotier.sample_config.controller_type"]');
	for (var i = 0; i < controllerTypeInputs.length; i++) {
		if (controllerTypeInputs[i].checked) {
			controllerType = controllerTypeInputs[i].value;
			break;
		}
	}
	
	if (controllerType === 'ztncui') {
		var ztncuiUrl = '';
		var ztncuiUrlInput = document.querySelector('input[name="cbid.zerotier.sample_config.ztncui_url"]');
		if (ztncuiUrlInput) {
			ztncuiUrl = ztncuiUrlInput.value;
		}
		
		if (ztncuiUrl) {
			window.open(ztncuiUrl, '_blank');
		} else {
			alert('Please configure ztncui URL in Controller settings first');
		}
	} else {
		window.open('https://my.zerotier.com/network', '_blank');
	}
}

// Update button text based on controller type
document.addEventListener('DOMContentLoaded', function() {
	function updateButtonText() {
		var controllerType = '';
		var controllerTypeInputs = document.querySelectorAll('input[name="cbid.zerotier.sample_config.controller_type"]');
		for (var i = 0; i < controllerTypeInputs.length; i++) {
			if (controllerTypeInputs[i].checked) {
				controllerType = controllerTypeInputs[i].value;
				break;
			}
		}
		
		var button = document.querySelector('input[onclick="openController()"]');
		if (button) {
			if (controllerType === 'ztncui') {
				button.value = 'Open ztncui';
			} else {
				button.value = 'Open ZeroTier.com';
			}
		}
	}
	
	// Update on page load
	updateButtonText();
	
	// Update when controller type changes
	var controllerTypeInputs = document.querySelectorAll('input[name="cbid.zerotier.sample_config.controller_type"]');
	for (var i = 0; i < controllerTypeInputs.length; i++) {
		controllerTypeInputs[i].addEventListener('change', updateButtonText);
	}
});
</script>
]]

e=t:option(DummyValue,"controller_script")
e.description = controller_script

return a
