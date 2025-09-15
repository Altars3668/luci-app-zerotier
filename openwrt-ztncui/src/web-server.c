/*
 * Web Server Module for ZTNCUI
 * Copyright (C) 2024 AltarsCN
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <microhttpd.h>
#include <json-c/json.h>

#include "config.h"
#include "web-server.h"
#include "zt-api.h"
#include "auth.h"

// Static web content
static const char *html_index = 
"<!DOCTYPE html>\n"
"<html>\n"
"<head>\n"
"    <title>ZTNCUI - ZeroTier Network Controller</title>\n"
"    <meta charset=\"utf-8\">\n"
"    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n"
"    <style>\n"
"        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }\n"
"        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }\n"
"        h1 { color: #333; border-bottom: 2px solid #007bff; padding-bottom: 10px; }\n"
"        .status { padding: 10px; margin: 10px 0; border-radius: 4px; }\n"
"        .status.online { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }\n"
"        .status.offline { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }\n"
"        .network-list { margin-top: 20px; }\n"
"        .network-item { background: #f8f9fa; margin: 10px 0; padding: 15px; border-radius: 4px; border-left: 4px solid #007bff; }\n"
"        .btn { padding: 8px 16px; margin: 5px; border: none; border-radius: 4px; cursor: pointer; text-decoration: none; display: inline-block; }\n"
"        .btn-primary { background: #007bff; color: white; }\n"
"        .btn-success { background: #28a745; color: white; }\n"
"        .btn-danger { background: #dc3545; color: white; }\n"
"        .info-table { width: 100%; border-collapse: collapse; margin: 20px 0; }\n"
"        .info-table th, .info-table td { padding: 8px; text-align: left; border-bottom: 1px solid #ddd; }\n"
"        .info-table th { background: #f8f9fa; font-weight: bold; }\n"
"    </style>\n"
"</head>\n"
"<body>\n"
"    <div class=\"container\">\n"
"        <h1>ZTNCUI - ZeroTier Network Controller</h1>\n"
"        <div id=\"status\">Loading...</div>\n"
"        <div id=\"content\">Loading...</div>\n"
"    </div>\n"
"    <script>\n"
"        function loadStatus() {\n"
"            fetch('/api/status')\n"
"                .then(response => response.json())\n"
"                .then(data => {\n"
"                    const statusDiv = document.getElementById('status');\n"
"                    if (data.online) {\n"
"                        statusDiv.className = 'status online';\n"
"                        statusDiv.innerHTML = 'ZeroTier Status: Online (Node ID: ' + data.address + ')';\n"
"                    } else {\n"
"                        statusDiv.className = 'status offline';\n"
"                        statusDiv.innerHTML = 'ZeroTier Status: Offline';\n"
"                    }\n"
"                })\n"
"                .catch(err => {\n"
"                    document.getElementById('status').innerHTML = 'Error loading status';\n"
"                });\n"
"        }\n"
"        function loadNetworks() {\n"
"            fetch('/api/networks')\n"
"                .then(response => response.json())\n"
"                .then(data => {\n"
"                    let html = '<h2>Networks</h2>';\n"
"                    if (data.length === 0) {\n"
"                        html += '<p>No networks found. Create your first network to get started.</p>';\n"
"                        html += '<button class=\"btn btn-primary\" onclick=\"createNetwork()\">Create Network</button>';\n"
"                    } else {\n"
"                        html += '<div class=\"network-list\">';\n"
"                        data.forEach(network => {\n"
"                            html += '<div class=\"network-item\">';\n"
"                            html += '<h3>' + (network.name || 'Unnamed Network') + '</h3>';\n"
"                            html += '<p>Network ID: ' + network.id + '</p>';\n"
"                            html += '<p>Members: ' + (network.memberCount || 0) + '</p>';\n"
"                            html += '<button class=\"btn btn-primary\" onclick=\"viewNetwork(\\'' + network.id + '\\')>View Details</button>';\n"
"                            html += '<button class=\"btn btn-danger\" onclick=\"deleteNetwork(\\'' + network.id + '\\')>Delete</button>';\n"
"                            html += '</div>';\n"
"                        });\n"
"                        html += '</div>';\n"
"                        html += '<button class=\"btn btn-success\" onclick=\"createNetwork()\">Create New Network</button>';\n"
"                    }\n"
"                    document.getElementById('content').innerHTML = html;\n"
"                })\n"
"                .catch(err => {\n"
"                    document.getElementById('content').innerHTML = 'Error loading networks';\n"
"                });\n"
"        }\n"
"        function createNetwork() {\n"
"            const name = prompt('Enter network name:');\n"
"            if (name) {\n"
"                fetch('/api/networks', {\n"
"                    method: 'POST',\n"
"                    headers: { 'Content-Type': 'application/json' },\n"
"                    body: JSON.stringify({ name: name })\n"
"                })\n"
"                .then(response => response.json())\n"
"                .then(data => {\n"
"                    alert('Network created successfully!');\n"
"                    loadNetworks();\n"
"                })\n"
"                .catch(err => alert('Failed to create network'));\n"
"            }\n"
"        }\n"
"        function deleteNetwork(id) {\n"
"            if (confirm('Are you sure you want to delete this network?')) {\n"
"                fetch('/api/networks/' + id, { method: 'DELETE' })\n"
"                .then(() => {\n"
"                    alert('Network deleted successfully!');\n"
"                    loadNetworks();\n"
"                })\n"
"                .catch(err => alert('Failed to delete network'));\n"
"            }\n"
"        }\n"
"        // Load initial data\n"
"        loadStatus();\n"
"        loadNetworks();\n"
"        // Refresh every 30 seconds\n"
"        setInterval(() => { loadStatus(); loadNetworks(); }, 30000);\n"
"    </script>\n"
"</body>\n"
"</html>\n";

// Handle login page
static int handle_login_page(struct MHD_Connection *connection) {
    const char *login_html = 
    "<!DOCTYPE html>\n"
    "<html>\n"
    "<head>\n"
    "    <title>ZTNCUI Login</title>\n"
    "    <meta charset=\"utf-8\">\n"
    "    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n"
    "    <style>\n"
    "        body { font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 0; }\n"
    "        .login-container { max-width: 400px; margin: 100px auto; background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }\n"
    "        h1 { text-align: center; color: #333; margin-bottom: 30px; }\n"
    "        .form-group { margin-bottom: 20px; }\n"
    "        label { display: block; margin-bottom: 5px; color: #555; }\n"
    "        input[type='text'], input[type='password'] { width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; }\n"
    "        .btn { width: 100%; padding: 12px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; }\n"
    "        .btn:hover { background: #0056b3; }\n"
    "        .error { color: #dc3545; margin-top: 10px; text-align: center; }\n"
    "        .info { color: #666; text-align: center; margin-top: 20px; font-size: 14px; }\n"
    "    </style>\n"
    "</head>\n"
    "<body>\n"
    "    <div class=\"login-container\">\n"
    "        <h1>ZTNCUI Login</h1>\n"
    "        <form method=\"post\" action=\"/login\">\n"
    "            <div class=\"form-group\">\n"
    "                <label for=\"username\">Username:</label>\n"
    "                <input type=\"text\" id=\"username\" name=\"username\" required>\n"
    "            </div>\n"
    "            <div class=\"form-group\">\n"
    "                <label for=\"password\">Password:</label>\n"
    "                <input type=\"password\" id=\"password\" name=\"password\" required>\n"
    "            </div>\n"
    "            <button type=\"submit\" class=\"btn\">Login</button>\n"
    "        </form>\n"
    "        <div class=\"info\">\n"
    "            Default credentials: admin / password<br>\n"
    "            Please change the password after first login.\n"
    "        </div>\n"
    "    </div>\n"
    "</body>\n"
    "</html>\n";\n"
    
    return send_html_response(connection, MHD_HTTP_OK, login_html);
}

// Handle login POST request
static int handle_login_post(struct MHD_Connection *connection, 
                           const char *upload_data, 
                           size_t upload_data_size) {
    // Parse form data (simplified implementation)
    // In a real implementation, properly parse URL-encoded form data
    
    char username[64] = {0};
    char password[128] = {0};
    
    // Extract username and password from form data
    // This is a simplified parser - use proper form parsing in production
    if (upload_data && upload_data_size > 0) {
        const char *user_start = strstr(upload_data, "username=");
        const char *pass_start = strstr(upload_data, "password=");
        
        if (user_start && pass_start) {
            user_start += 9; // Skip "username="
            const char *user_end = strchr(user_start, '&');
            if (user_end) {
                size_t user_len = user_end - user_start;
                if (user_len < sizeof(username) - 1) {
                    strncpy(username, user_start, user_len);
                }
            }
            
            pass_start += 9; // Skip "password="
            const char *pass_end = strchr(pass_start, '&');
            if (!pass_end) pass_end = pass_start + strlen(pass_start);
            
            size_t pass_len = pass_end - pass_start;
            if (pass_len < sizeof(password) - 1) {
                strncpy(password, pass_start, pass_len);
            }
        }
    }
    
    // Authenticate user
    struct auth_session session;
    int auth_result = auth_authenticate(username, password, &session);
    
    if (auth_result == AUTH_SUCCESS) {
        // Create response with session cookie
        struct MHD_Response *response = MHD_create_response_from_buffer(
            0, "", MHD_RESPMEM_PERSISTENT);
        
        // Set session cookie
        char cookie[256];
        snprintf(cookie, sizeof(cookie), "session=%s; Path=/; HttpOnly", session.session_id);
        MHD_add_response_header(response, "Set-Cookie", cookie);
        MHD_add_response_header(response, "Location", "/");
        
        int ret = MHD_queue_response(connection, MHD_HTTP_FOUND, response);
        MHD_destroy_response(response);
        return ret;
    } else {
        // Login failed - show error
        const char *error_html = 
        "<!DOCTYPE html>\n"
        "<html><head><title>Login Failed</title></head>\n"
        "<body><h1>Login Failed</h1><p>Invalid username or password.</p>\n"
        "<a href=\"/login\">Try again</a></body></html>\n";
        
        return send_html_response(connection, MHD_HTTP_UNAUTHORIZED, error_html);
    }
}

// Handle logout
static int handle_logout(struct MHD_Connection *connection) {
    const char *session_id = auth_get_session_cookie(connection);
    if (session_id) {
        auth_logout(session_id);
    }
    
    // Clear session cookie and redirect to login
    struct MHD_Response *response = MHD_create_response_from_buffer(
        0, "", MHD_RESPMEM_PERSISTENT);
    
    MHD_add_response_header(response, "Set-Cookie", "session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT");
    MHD_add_response_header(response, "Location", "/login");
    
    int ret = MHD_queue_response(connection, MHD_HTTP_FOUND, response);
    MHD_destroy_response(response);
    return ret;
}

// Initialize web server
int web_server_init(struct ztncui_config *config) {
    // Initialize authentication system
    if (auth_init() != 0) {
        fprintf(stderr, "Failed to initialize authentication system\n");
        return -1;
    }
    
    printf("Web server initialized with authentication\n");
    return 0;
}

// Cleanup web server
void web_server_cleanup() {
    auth_cleanup();
    printf("Web server cleaned up\n");
}

// Send JSON response
static int send_json_response(struct MHD_Connection *connection, 
                            int status_code, 
                            json_object *json_obj) {
    const char *json_string = json_object_to_json_string(json_obj);
    struct MHD_Response *response = MHD_create_response_from_buffer(
        strlen(json_string),
        (void*)json_string,
        MHD_RESPMEM_MUST_COPY
    );
    
    MHD_add_response_header(response, "Content-Type", "application/json");
    MHD_add_response_header(response, "Access-Control-Allow-Origin", "*");
    
    int ret = MHD_queue_response(connection, status_code, response);
    MHD_destroy_response(response);
    
    return ret;
}

// Send HTML response
static int send_html_response(struct MHD_Connection *connection, 
                            int status_code, 
                            const char *html) {
    struct MHD_Response *response = MHD_create_response_from_buffer(
        strlen(html),
        (void*)html,
        MHD_RESPMEM_MUST_COPY
    );
    
    MHD_add_response_header(response, "Content-Type", "text/html");
    
    int ret = MHD_queue_response(connection, status_code, response);
    MHD_destroy_response(response);
    
    return ret;
}

// Handle API network creation
static int handle_api_network_create(struct MHD_Connection *connection, 
                                   const char *upload_data, 
                                   size_t upload_data_size) {
    if (!upload_data || upload_data_size == 0) {
        json_object *error = json_object_new_object();
        json_object *msg = json_object_new_string("Request body required");
        json_object_object_add(error, "error", msg);
        int ret = send_json_response(connection, MHD_HTTP_BAD_REQUEST, error);
        json_object_put(error);
        return ret;
    }
    
    // Parse JSON request
    json_object *request = json_tokener_parse(upload_data);
    if (!request) {
        json_object *error = json_object_new_object();
        json_object *msg = json_object_new_string("Invalid JSON");
        json_object_object_add(error, "error", msg);
        int ret = send_json_response(connection, MHD_HTTP_BAD_REQUEST, error);
        json_object_put(error);
        return ret;
    }
    
    // Extract name and description
    json_object *name_obj, *desc_obj;
    const char *name = "";
    const char *description = "";
    
    if (json_object_object_get_ex(request, "name", &name_obj)) {
        name = json_object_get_string(name_obj);
    }
    if (json_object_object_get_ex(request, "description", &desc_obj)) {
        description = json_object_get_string(desc_obj);
    }
    
    // Create network
    json_object *result = zt_api_create_network(name, description);
    json_object_put(request);
    
    if (!result) {
        json_object *error = json_object_new_object();
        json_object *msg = json_object_new_string("Failed to create network");
        json_object_object_add(error, "error", msg);
        int ret = send_json_response(connection, MHD_HTTP_INTERNAL_SERVER_ERROR, error);
        json_object_put(error);
        return ret;
    }
    
    int ret = send_json_response(connection, MHD_HTTP_CREATED, result);
    json_object_put(result);
    return ret;
}

// Handle API network detail
static int handle_api_network_detail(struct MHD_Connection *connection, const char *network_id) {
    json_object *network = zt_api_get_network(network_id);
    if (!network) {
        json_object *error = json_object_new_object();
        json_object *msg = json_object_new_string("Network not found");
        json_object_object_add(error, "error", msg);
        int ret = send_json_response(connection, MHD_HTTP_NOT_FOUND, error);
        json_object_put(error);
        return ret;
    }
    
    int ret = send_json_response(connection, MHD_HTTP_OK, network);
    json_object_put(network);
    return ret;
}

// Handle API network delete
static int handle_api_network_delete(struct MHD_Connection *connection, const char *network_id) {
    if (zt_api_delete_network(network_id) == 0) {
        json_object *result = json_object_new_object();
        json_object *msg = json_object_new_string("Network deleted successfully");
        json_object_object_add(result, "message", msg);
        json_object_object_add(result, "deleted", json_object_new_boolean(1));
        int ret = send_json_response(connection, MHD_HTTP_OK, result);
        json_object_put(result);
        return ret;
    } else {
        json_object *error = json_object_new_object();
        json_object *msg = json_object_new_string("Failed to delete network");
        json_object_object_add(error, "error", msg);
        int ret = send_json_response(connection, MHD_HTTP_INTERNAL_SERVER_ERROR, error);
        json_object_put(error);
        return ret;
    }
}

// Handle API network update
static int handle_api_network_update(struct MHD_Connection *connection, 
                                   const char *network_id,
                                   const char *upload_data, 
                                   size_t upload_data_size) {
    if (!upload_data || upload_data_size == 0) {
        json_object *error = json_object_new_object();
        json_object *msg = json_object_new_string("Request body required");
        json_object_object_add(error, "error", msg);
        int ret = send_json_response(connection, MHD_HTTP_BAD_REQUEST, error);
        json_object_put(error);
        return ret;
    }
    
    json_object *config = json_tokener_parse(upload_data);
    if (!config) {
        json_object *error = json_object_new_object();
        json_object *msg = json_object_new_string("Invalid JSON");
        json_object_object_add(error, "error", msg);
        int ret = send_json_response(connection, MHD_HTTP_BAD_REQUEST, error);
        json_object_put(error);
        return ret;
    }
    
    json_object *result = zt_api_update_network(network_id, config);
    json_object_put(config);
    
    if (!result) {
        json_object *error = json_object_new_object();
        json_object *msg = json_object_new_string("Failed to update network");
        json_object_object_add(error, "error", msg);
        int ret = send_json_response(connection, MHD_HTTP_INTERNAL_SERVER_ERROR, error);
        json_object_put(error);
        return ret;
    }
    
    int ret = send_json_response(connection, MHD_HTTP_OK, result);
    json_object_put(result);
    return ret;
}

// Handle API network members
static int handle_api_network_members(struct MHD_Connection *connection, const char *network_id) {
    json_object *members = zt_api_get_members(network_id);
    if (!members) {
        json_object *error = json_object_new_object();
        json_object *msg = json_object_new_string("Failed to get members");
        json_object_object_add(error, "error", msg);
        int ret = send_json_response(connection, MHD_HTTP_INTERNAL_SERVER_ERROR, error);
        json_object_put(error);
        return ret;
    }
    
    int ret = send_json_response(connection, MHD_HTTP_OK, members);
    json_object_put(members);
    return ret;
}

// Handle API member detail
static int handle_api_member_detail(struct MHD_Connection *connection, 
                                  const char *network_id, 
                                  const char *member_id) {
    json_object *member = zt_api_get_member(network_id, member_id);
    if (!member) {
        json_object *error = json_object_new_object();
        json_object *msg = json_object_new_string("Member not found");
        json_object_object_add(error, "error", msg);
        int ret = send_json_response(connection, MHD_HTTP_NOT_FOUND, error);
        json_object_put(error);
        return ret;
    }
    
    int ret = send_json_response(connection, MHD_HTTP_OK, member);
    json_object_put(member);
    return ret;
}

// Handle API member update
static int handle_api_member_update(struct MHD_Connection *connection, 
                                  const char *network_id,
                                  const char *member_id,
                                  const char *upload_data, 
                                  size_t upload_data_size) {
    if (!upload_data || upload_data_size == 0) {
        json_object *error = json_object_new_object();
        json_object *msg = json_object_new_string("Request body required");
        json_object_object_add(error, "error", msg);
        int ret = send_json_response(connection, MHD_HTTP_BAD_REQUEST, error);
        json_object_put(error);
        return ret;
    }
    
    json_object *config = json_tokener_parse(upload_data);
    if (!config) {
        json_object *error = json_object_new_object();
        json_object *msg = json_object_new_string("Invalid JSON");
        json_object_object_add(error, "error", msg);
        int ret = send_json_response(connection, MHD_HTTP_BAD_REQUEST, error);
        json_object_put(error);
        return ret;
    }
    
    json_object *result = zt_api_update_member(network_id, member_id, config);
    json_object_put(config);
    
    if (!result) {
        json_object *error = json_object_new_object();
        json_object *msg = json_object_new_string("Failed to update member");
        json_object_object_add(error, "error", msg);
        int ret = send_json_response(connection, MHD_HTTP_INTERNAL_SERVER_ERROR, error);
        json_object_put(error);
        return ret;
    }
    
    int ret = send_json_response(connection, MHD_HTTP_OK, result);
    json_object_put(result);
    return ret;
}

// Handle API member delete
static int handle_api_member_delete(struct MHD_Connection *connection, 
                                  const char *network_id, 
                                  const char *member_id) {
    if (zt_api_delete_member(network_id, member_id) == 0) {
        json_object *result = json_object_new_object();
        json_object *msg = json_object_new_string("Member deleted successfully");
        json_object_object_add(result, "message", msg);
        json_object_object_add(result, "deleted", json_object_new_boolean(1));
        int ret = send_json_response(connection, MHD_HTTP_OK, result);
        json_object_put(result);
        return ret;
    } else {
        json_object *error = json_object_new_object();
        json_object *msg = json_object_new_string("Failed to delete member");
        json_object_object_add(error, "error", msg);
        int ret = send_json_response(connection, MHD_HTTP_INTERNAL_SERVER_ERROR, error);
        json_object_put(error);
        return ret;
    }
}
    json_object *status = zt_api_get_status();
    if (!status) {
        json_object *error = json_object_new_object();
        json_object *msg = json_object_new_string("Failed to get ZeroTier status");
        json_object_object_add(error, "error", msg);
        int ret = send_json_response(connection, MHD_HTTP_INTERNAL_SERVER_ERROR, error);
        json_object_put(error);
        return ret;
    }
    
    int ret = send_json_response(connection, MHD_HTTP_OK, status);
    json_object_put(status);
    return ret;
}

// Handle API networks request
static int handle_api_networks(struct MHD_Connection *connection) {
    json_object *networks = zt_api_get_networks();
    if (!networks) {
        json_object *error = json_object_new_object();
        json_object *msg = json_object_new_string("Failed to get networks");
        json_object_object_add(error, "error", msg);
        int ret = send_json_response(connection, MHD_HTTP_INTERNAL_SERVER_ERROR, error);
        json_object_put(error);
        return ret;
    }
    
    int ret = send_json_response(connection, MHD_HTTP_OK, networks);
    json_object_put(networks);
    return ret;
}

// Main request handler
int handle_request(void *cls,
                  struct MHD_Connection *connection,
                  const char *url,
                  const char *method,
                  const char *version,
                  const char *upload_data,
                  size_t *upload_data_size,
                  void **con_cls) {
    
    // Handle login/logout routes (no authentication required)
    if (strcmp(url, "/login") == 0) {
        if (strcmp(method, "GET") == 0) {
            return handle_login_page(connection);
        } else if (strcmp(method, "POST") == 0) {
            return handle_login_post(connection, upload_data, *upload_data_size);
        }
    }
    
    if (strcmp(url, "/logout") == 0) {
        return handle_logout(connection);
    }
    
    // Check authentication for all other routes
    struct auth_session session;
    int auth_result = auth_check_request(connection, &session);
    
    if (auth_result != AUTH_SUCCESS) {
        // Redirect to login page
        struct MHD_Response *response = MHD_create_response_from_buffer(
            0, "", MHD_RESPMEM_PERSISTENT);
        
        char redirect_url[512];
        snprintf(redirect_url, sizeof(redirect_url), "/login?redirect=%s", url);
        MHD_add_response_header(response, "Location", redirect_url);
        
        int ret = MHD_queue_response(connection, MHD_HTTP_FOUND, response);
        MHD_destroy_response(response);
        return ret;
    }
    
    // Handle authenticated routes
    if (strcmp(url, "/") == 0 || strcmp(url, "/index.html") == 0) {
        return send_html_response(connection, MHD_HTTP_OK, html_index);
    }
    
    // Handle API requests (similar to ztncui's zt_controller routes)
    if (strncmp(url, "/api/", 5) == 0) {
        const char *api_path = url + 5;  // Skip "/api/"
        
        if (strcmp(api_path, "status") == 0) {
            return handle_api_status(connection);
        }
        else if (strcmp(api_path, "networks") == 0) {
            if (strcmp(method, "GET") == 0) {
                return handle_api_networks(connection);
            }
            else if (strcmp(method, "POST") == 0) {
                return handle_api_network_create(connection, upload_data, *upload_data_size);
            }
        }
        else if (strncmp(api_path, "networks/", 9) == 0) {
            const char *network_path = api_path + 9;
            char network_id[17];
            
            // Extract network ID (16 hex chars)
            if (strlen(network_path) >= 16) {
                strncpy(network_id, network_path, 16);
                network_id[16] = '\\0';
                
                const char *remaining_path = network_path + 16;
                
                if (*remaining_path == '\\0') {
                    // /api/networks/{id}
                    if (strcmp(method, "GET") == 0) {
                        return handle_api_network_detail(connection, network_id);
                    } else if (strcmp(method, "DELETE") == 0) {
                        return handle_api_network_delete(connection, network_id);
                    } else if (strcmp(method, "POST") == 0) {
                        return handle_api_network_update(connection, network_id, upload_data, *upload_data_size);
                    }
                }
                else if (strncmp(remaining_path, "/member", 7) == 0) {
                    // /api/networks/{id}/member[/{member_id}]
                    if (strcmp(remaining_path, "/member") == 0) {
                        if (strcmp(method, "GET") == 0) {
                            return handle_api_network_members(connection, network_id);
                        }
                    } else if (strlen(remaining_path) > 8) {
                        // Extract member ID
                        const char *member_id = remaining_path + 8; // Skip "/member/"
                        
                        if (strcmp(method, "GET") == 0) {
                            return handle_api_member_detail(connection, network_id, member_id);
                        } else if (strcmp(method, "POST") == 0) {
                            return handle_api_member_update(connection, network_id, member_id, upload_data, *upload_data_size);
                        } else if (strcmp(method, "DELETE") == 0) {
                            return handle_api_member_delete(connection, network_id, member_id);
                        }
                    }
                }
            }
        }
        
        // API endpoint not found
        json_object *error = json_object_new_object();
        json_object *msg = json_object_new_string("API endpoint not found");
        json_object_object_add(error, "error", msg);
        int ret = send_json_response(connection, MHD_HTTP_NOT_FOUND, error);
        json_object_put(error);
        return ret;
    }
    
    // 404 for everything else
    const char *not_found = "<html><body><h1>404 Not Found</h1></body></html>";
    return send_html_response(connection, MHD_HTTP_NOT_FOUND, not_found);
}