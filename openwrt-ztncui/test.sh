#!/bin/bash
# ZTNCUI OpenWrt Package Test Script
# Copyright (C) 2024 AltarsCN

echo "=== ZTNCUI OpenWrt Package Test Suite ==="
echo "Based on ztncui source code analysis and optimization"
echo

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test results
TESTS_TOTAL=0
TESTS_PASSED=0
TESTS_FAILED=0

# Helper functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((TESTS_PASSED++))
}

log_error() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((TESTS_FAILED++))
}

log_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

run_test() {
    local test_name="$1"
    local test_command="$2"
    
    echo -n "Testing $test_name... "
    ((TESTS_TOTAL++))
    
    if eval "$test_command" >/dev/null 2>&1; then
        log_success "$test_name"
        return 0
    else
        log_error "$test_name"
        return 1
    fi
}

# Test 1: Source code structure
test_source_structure() {
    log_info "Testing source code structure (based on ztncui analysis)..."
    
    run_test "Main server source" "[ -f src/ztncui-server.c ]"
    run_test "ZeroTier API client" "[ -f src/zt-api.c ]"
    run_test "Web server module" "[ -f src/web-server.c ]"
    run_test "Authentication module" "[ -f src/auth.c ]"
    run_test "Configuration headers" "[ -f src/config.h ]"
    run_test "API headers" "[ -f src/zt-api.h ]"
    run_test "Web server headers" "[ -f src/web-server.h ]"
    run_test "Auth headers" "[ -f src/auth.h ]"
    run_test "Build configuration" "[ -f src/Makefile ]"
}

# Test 2: OpenWrt package structure
test_package_structure() {
    log_info "Testing OpenWrt package structure..."
    
    run_test "Package Makefile" "[ -f Makefile ]"
    run_test "UCI config template" "[ -f files/etc/config/ztncui ]"
    run_test "Init script" "[ -f files/etc/init.d/ztncui ]"
    run_test "Package README" "[ -f README.md ]"
    run_test "Build guide" "[ -f BUILD.md ]"
    run_test "Features documentation" "[ -f FEATURES.md ]"
}

# Test 3: LuCI integration
test_luci_integration() {
    log_info "Testing LuCI integration (enhanced with ztncui features)..."
    
    run_test "LuCI controller script" "[ -f ../htdocs/luci-static/resources/view/zerotier/controller.js ]"
    run_test "Translation templates" "[ -f ../po/templates/zerotier.pot ]"
    run_test "Chinese translations" "[ -f ../po/zh_Hans/zerotier.po ]"
    run_test "Menu configuration" "[ -f ../root/usr/share/luci/menu.d/luci-app-zerotier.json ]"
}

# Test 4: Code quality checks
test_code_quality() {
    log_info "Testing code quality and ztncui compatibility..."
    
    # Check for essential ztncui API functions
    if [ -f src/zt-api.c ]; then
        run_test "Network list API" "grep -q 'zt_api_get_networks' src/zt-api.c"
        run_test "Network create API" "grep -q 'zt_api_create_network' src/zt-api.c"
        run_test "Network delete API" "grep -q 'zt_api_delete_network' src/zt-api.c"
        run_test "Member management API" "grep -q 'zt_api_get_members' src/zt-api.c"
        run_test "Member update API" "grep -q 'zt_api_update_member' src/zt-api.c"
    fi
    
    # Check authentication system
    if [ -f src/auth.c ]; then
        run_test "Authentication init" "grep -q 'auth_init' src/auth.c"
        run_test "User authentication" "grep -q 'auth_authenticate' src/auth.c"
        run_test "Session management" "grep -q 'auth_validate_session' src/auth.c"
        run_test "Password management" "grep -q 'auth_change_password' src/auth.c"
    fi
    
    # Check web server routes (similar to ztncui's zt_controller.js)
    if [ -f src/web-server.c ]; then
        run_test "Login routes" "grep -q '/login' src/web-server.c"
        run_test "API status route" "grep -q '/api/status' src/web-server.c"
        run_test "API networks route" "grep -q '/api/networks' src/web-server.c"
        run_test "Authentication middleware" "grep -q 'auth_check_request' src/web-server.c"
    fi
}

# Test 5: Build system validation
test_build_system() {
    log_info "Testing build system..."
    
    if [ -f src/Makefile ]; then
        run_test "Makefile syntax" "cd src && make -n > /dev/null 2>&1"
        run_test "Source dependencies" "grep -q 'auth.o.*auth.c' src/Makefile"
        run_test "Library dependencies" "grep -q 'ljson-c.*lmicrohttpd' src/Makefile"
        run_test "Target definition" "grep -q 'ztncui-server' src/Makefile"
    fi
    
    if [ -f Makefile ]; then
        run_test "OpenWrt Makefile syntax" "grep -q 'PKG_NAME.*ztncui' Makefile"
        run_test "Package dependencies" "grep -q 'DEPENDS.*zerotier.*json-c.*microhttpd' Makefile"
        run_test "Install rules" "grep -q 'Package.*install' Makefile"
    fi
}

# Test 6: Configuration validation
test_configuration() {
    log_info "Testing configuration files..."
    
    if [ -f files/etc/config/ztncui ]; then
        run_test "UCI config syntax" "grep -q 'config main' files/etc/config/ztncui"
        run_test "Auth config section" "grep -q 'config auth' files/etc/config/ztncui"
        run_test "Network config section" "grep -q 'config network' files/etc/config/ztncui"
        run_test "Default port setting" "grep -q \"option port '3000'\" files/etc/config/ztncui"
    fi
    
    if [ -f files/etc/init.d/ztncui ]; then
        run_test "Init script syntax" "sh -n files/etc/init.d/ztncui"
        run_test "ProCD integration" "grep -q 'procd_open_instance' files/etc/init.d/ztncui"
        run_test "Health check function" "grep -q 'service_healthy' files/etc/init.d/ztncui"
        run_test "UCI integration" "grep -q 'config_get' files/etc/init.d/ztncui"
    fi
}

# Test 7: LuCI controller validation (enhanced functionality)
test_luci_controller() {
    log_info "Testing LuCI controller enhancements..."
    
    if [ -f ../htdocs/luci-static/resources/view/zerotier/controller.js ]; then
        # Test for ztncui-inspired network management functions
        run_test "Network creation function" "grep -q 'createNetwork.*function' ../htdocs/luci-static/resources/view/zerotier/controller.js"
        run_test "Network list function" "grep -q 'getNetworkList.*function' ../htdocs/luci-static/resources/view/zerotier/controller.js"
        run_test "Member management" "grep -q 'getNetworkMembers.*function' ../htdocs/luci-static/resources/view/zerotier/controller.js"
        run_test "Health check integration" "grep -q 'performHealthCheck' ../htdocs/luci-static/resources/view/zerotier/controller.js"
        run_test "ZT API calls" "grep -q 'callZTAPI.*function' ../htdocs/luci-static/resources/view/zerotier/controller.js"
        run_test "Authentication token handling" "grep -q 'getAuthToken' ../htdocs/luci-static/resources/view/zerotier/controller.js"
    fi
}

# Test 8: Documentation completeness
test_documentation() {
    log_info "Testing documentation completeness..."
    
    run_test "README file exists" "[ -f README.md ]"
    run_test "Build instructions" "[ -f BUILD.md ]"
    run_test "Features documentation" "[ -f FEATURES.md ]"
    
    if [ -f README.md ]; then
        run_test "Installation instructions" "grep -q -i 'install' README.md"
        run_test "Configuration guide" "grep -q -i 'config' README.md"
        run_test "ztncui comparison" "grep -q -i 'ztncui' README.md"
    fi
    
    if [ -f FEATURES.md ]; then
        run_test "Feature comparison table" "grep -q '|.*|.*|' FEATURES.md"
        run_test "API compatibility notes" "grep -q -i 'api.*compat' FEATURES.md"
        run_test "Performance metrics" "grep -q -i 'memory.*storage' FEATURES.md"
    fi
}

# Test 9: Translation completeness
test_translations() {
    log_info "Testing translation completeness..."
    
    if [ -f ../po/templates/zerotier.pot ]; then
        run_test "Translation template syntax" "grep -q 'msgid.*msgstr' ../po/templates/zerotier.pot"
        run_test "ZTNCUI strings included" "grep -q -i 'ztncui' ../po/templates/zerotier.pot"
        run_test "Network management strings" "grep -q -i 'network.*creat' ../po/templates/zerotier.pot"
    fi
    
    if [ -f ../po/zh_Hans/zerotier.po ]; then
        run_test "Chinese translation coverage" "grep -c 'msgstr \"[^\"]*[^\"]\"' ../po/zh_Hans/zerotier.po | grep -q '^[1-9]'"
        run_test "ZTNCUI Chinese terms" "grep -q '网络控制器' ../po/zh_Hans/zerotier.po"
    fi
}

# Test 10: Security validation
test_security() {
    log_info "Testing security implementation..."
    
    if [ -f src/auth.c ]; then
        run_test "Password hashing" "grep -q 'hash_password' src/auth.c"
        run_test "Session timeout" "grep -q 'SESSION_TIMEOUT' src/auth.c"
        run_test "Secure file permissions" "grep -q 'chmod.*0600' src/auth.c"
        run_test "Input validation" "grep -q 'MIN_PASSWORD_LENGTH' src/auth.c"
    fi
    
    if [ -f src/web-server.c ]; then
        run_test "Authentication required" "grep -q 'auth_check_request' src/web-server.c"
        run_test "Session cookies" "grep -q 'HttpOnly' src/web-server.c"
        run_test "Login redirection" "grep -q 'redirect.*login' src/web-server.c"
    fi
}

# Main test execution
main() {
    echo "Starting comprehensive test suite..."
    echo "Based on ztncui source code analysis and OpenWrt optimization"
    echo
    
    test_source_structure
    echo
    
    test_package_structure
    echo
    
    test_luci_integration
    echo
    
    test_code_quality
    echo
    
    test_build_system
    echo
    
    test_configuration
    echo
    
    test_luci_controller
    echo
    
    test_documentation
    echo
    
    test_translations
    echo
    
    test_security
    echo
    
    # Summary
    echo "=== Test Results Summary ==="
    echo "Total tests: $TESTS_TOTAL"
    echo -e "Passed: ${GREEN}$TESTS_PASSED${NC}"
    echo -e "Failed: ${RED}$TESTS_FAILED${NC}"
    
    if [ $TESTS_FAILED -eq 0 ]; then
        echo -e "${GREEN}✅ All tests passed! Package is ready for deployment.${NC}"
        exit 0
    else
        echo -e "${RED}❌ Some tests failed. Please review and fix issues.${NC}"
        exit 1
    fi
}

# Run tests
if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
    echo "ZTNCUI OpenWrt Package Test Script"
    echo "Usage: $0 [options]"
    echo
    echo "Options:"
    echo "  --help, -h    Show this help message"
    echo "  --verbose, -v Enable verbose output"
    echo
    echo "This script validates the OpenWrt ZTNCUI package based on"
    echo "comprehensive analysis of the original ztncui source code."
    exit 0
fi

if [ "$1" = "--verbose" ] || [ "$1" = "-v" ]; then
    set -x
fi

main