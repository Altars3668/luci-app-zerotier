/*
 * ZeroTier API Client for ZTNCUI
 * Copyright (C) 2024 AltarsCN
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <json-c/json.h>
#include <curl/curl.h>

#include "config.h"
#include "zt-api.h"

static char auth_token[128] = {0};
static char zt_api_base[256] = {0};

// HTTP response structure
struct http_response {
    char *data;
    size_t size;
};

// Callback for HTTP response data
static size_t write_callback(void *contents, size_t size, size_t nmemb, struct http_response *response) {
    size_t total_size = size * nmemb;
    char *ptr = realloc(response->data, response->size + total_size + 1);
    
    if (!ptr) {
        printf("Not enough memory (realloc returned NULL)\n");
        return 0;
    }
    
    response->data = ptr;
    memcpy(&(response->data[response->size]), contents, total_size);
    response->size += total_size;
    response->data[response->size] = 0;
    
    return total_size;
}

// Load ZeroTier authentication token
static int load_auth_token(const char *zt_home) {
    char token_path[MAX_PATH];
    snprintf(token_path, sizeof(token_path), "%s/authtoken.secret", zt_home);
    
    FILE *fp = fopen(token_path, "r");
    if (!fp) {
        fprintf(stderr, "Cannot open auth token file: %s\n", token_path);
        return -1;
    }
    
    if (!fgets(auth_token, sizeof(auth_token), fp)) {
        fprintf(stderr, "Cannot read auth token from file\n");
        fclose(fp);
        return -1;
    }
    
    fclose(fp);
    
    // Remove newline
    auth_token[strcspn(auth_token, "\n")] = 0;
    
    return 0;
}

// Initialize ZeroTier API client
int zt_api_init(struct ztncui_config *config) {
    // Load authentication token
    if (load_auth_token(config->zt_home) != 0) {
        return -1;
    }
    
    // Setup API base URL
    snprintf(zt_api_base, sizeof(zt_api_base), "http://%s", config->zt_address);
    
    // Initialize libcurl
    curl_global_init(CURL_GLOBAL_DEFAULT);
    
    printf("ZeroTier API client initialized (base: %s)\n", zt_api_base);
    return 0;
}

// Cleanup ZeroTier API client
void zt_api_cleanup() {
    curl_global_cleanup();
}

// Check connection to ZeroTier daemon
int zt_api_check_connection(const char *zt_address, const char *zt_home) {
    // Try to read the auth token
    char token_path[MAX_PATH];
    snprintf(token_path, sizeof(token_path), "%s/authtoken.secret", zt_home);
    
    FILE *fp = fopen(token_path, "r");
    if (!fp) {
        return 0;  // Auth token not accessible
    }
    fclose(fp);
    
    // Try to connect to the API
    CURL *curl = curl_easy_init();
    if (!curl) return 0;
    
    char url[256];
    snprintf(url, sizeof(url), "http://%s/status", zt_address);
    
    struct http_response response = {0};
    
    curl_easy_setopt(curl, CURLOPT_URL, url);
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, write_callback);
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, &response);
    curl_easy_setopt(curl, CURLOPT_TIMEOUT, 5L);
    
    // Add auth header
    struct curl_slist *headers = NULL;
    char auth_header[256];
    snprintf(auth_header, sizeof(auth_header), "X-ZT1-Auth: %s", auth_token);
    headers = curl_slist_append(headers, auth_header);
    curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
    
    CURLcode res = curl_easy_perform(curl);
    
    curl_slist_free_all(headers);
    curl_easy_cleanup(curl);
    
    if (response.data) {
        free(response.data);
    }
    
    return (res == CURLE_OK);
}

// Get ZeroTier status
json_object* zt_api_get_status() {
    CURL *curl = curl_easy_init();
    if (!curl) return NULL;
    
    char url[256];
    snprintf(url, sizeof(url), "%s/status", zt_api_base);
    
    struct http_response response = {0};
    
    curl_easy_setopt(curl, CURLOPT_URL, url);
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, write_callback);
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, &response);
    curl_easy_setopt(curl, CURLOPT_TIMEOUT, 10L);
    
    // Add auth header
    struct curl_slist *headers = NULL;
    char auth_header[256];
    snprintf(auth_header, sizeof(auth_header), "X-ZT1-Auth: %s", auth_token);
    headers = curl_slist_append(headers, auth_header);
    curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
    
    CURLcode res = curl_easy_perform(curl);
    
    curl_slist_free_all(headers);
    curl_easy_cleanup(curl);
    
    if (res != CURLE_OK) {
        if (response.data) free(response.data);
        return NULL;
    }
    
    json_object *json = json_tokener_parse(response.data);
    if (response.data) free(response.data);
    
    return json;
}

// Get network list
json_object* zt_api_get_networks() {
    CURL *curl = curl_easy_init();
    if (!curl) return NULL;
    
    char url[256];
    snprintf(url, sizeof(url), "%s/controller/network", zt_api_base);
    
    struct http_response response = {0};
    
    curl_easy_setopt(curl, CURLOPT_URL, url);
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, write_callback);
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, &response);
    curl_easy_setopt(curl, CURLOPT_TIMEOUT, 10L);
    
    // Add auth header
    struct curl_slist *headers = NULL;
    char auth_header[256];
    snprintf(auth_header, sizeof(auth_header), "X-ZT1-Auth: %s", auth_token);
    headers = curl_slist_append(headers, auth_header);
    curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
    
    CURLcode res = curl_easy_perform(curl);
    
    curl_slist_free_all(headers);
    curl_easy_cleanup(curl);
    
    if (res != CURLE_OK) {
        if (response.data) free(response.data);
        return NULL;
    }
    
    json_object *json = json_tokener_parse(response.data);
    if (response.data) free(response.data);
    
    return json;
}

// Create new network
json_object* zt_api_create_network(const char *name, const char *description) {
    CURL *curl = curl_easy_init();
    if (!curl) return NULL;
    
    char url[256];
    snprintf(url, sizeof(url), "%s/controller/network", zt_api_base);
    
    // Create request body
    json_object *request = json_object_new_object();
    json_object *config = json_object_new_object();
    
    json_object_object_add(config, "name", json_object_new_string(name ? name : ""));
    json_object_object_add(config, "description", json_object_new_string(description ? description : ""));
    json_object_object_add(config, "private", json_object_new_boolean(1));
    json_object_object_add(config, "enableBroadcast", json_object_new_boolean(1));
    
    // IPv4 auto assignment
    json_object *v4_assign = json_object_new_object();
    json_object_object_add(v4_assign, "zt", json_object_new_boolean(1));
    json_object_object_add(config, "v4AssignMode", v4_assign);
    
    json_object_object_add(request, "config", config);
    
    const char *json_string = json_object_to_json_string(request);
    
    struct http_response response = {0};
    
    curl_easy_setopt(curl, CURLOPT_URL, url);
    curl_easy_setopt(curl, CURLOPT_POSTFIELDS, json_string);
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, write_callback);
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, &response);
    curl_easy_setopt(curl, CURLOPT_TIMEOUT, 10L);
    
    // Add headers
    struct curl_slist *headers = NULL;
    char auth_header[256];
    snprintf(auth_header, sizeof(auth_header), "X-ZT1-Auth: %s", auth_token);
    headers = curl_slist_append(headers, auth_header);
    headers = curl_slist_append(headers, "Content-Type: application/json");
    curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
    
    CURLcode res = curl_easy_perform(curl);
    
    curl_slist_free_all(headers);
    curl_easy_cleanup(curl);
    json_object_put(request);
    
    if (res != CURLE_OK) {
        if (response.data) free(response.data);
        return NULL;
    }
    
    json_object *json = json_tokener_parse(response.data);
    if (response.data) free(response.data);
    
    return json;
}

// Get specific network details
json_object* zt_api_get_network(const char *network_id) {
    CURL *curl = curl_easy_init();
    if (!curl) return NULL;
    
    char url[256];
    snprintf(url, sizeof(url), "%s/controller/network/%s", zt_api_base, network_id);
    
    struct http_response response = {0};
    
    curl_easy_setopt(curl, CURLOPT_URL, url);
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, write_callback);
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, &response);
    curl_easy_setopt(curl, CURLOPT_TIMEOUT, 10L);
    
    // Add auth header
    struct curl_slist *headers = NULL;
    char auth_header[256];
    snprintf(auth_header, sizeof(auth_header), "X-ZT1-Auth: %s", auth_token);
    headers = curl_slist_append(headers, auth_header);
    curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
    
    CURLcode res = curl_easy_perform(curl);
    
    curl_slist_free_all(headers);
    curl_easy_cleanup(curl);
    
    if (res != CURLE_OK) {
        if (response.data) free(response.data);
        return NULL;
    }
    
    json_object *json = json_tokener_parse(response.data);
    if (response.data) free(response.data);
    
    return json;
}

// Delete network
int zt_api_delete_network(const char *network_id) {
    CURL *curl = curl_easy_init();
    if (!curl) return -1;
    
    char url[256];
    snprintf(url, sizeof(url), "%s/controller/network/%s", zt_api_base, network_id);
    
    struct http_response response = {0};
    
    curl_easy_setopt(curl, CURLOPT_URL, url);
    curl_easy_setopt(curl, CURLOPT_CUSTOMREQUEST, "DELETE");
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, write_callback);
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, &response);
    curl_easy_setopt(curl, CURLOPT_TIMEOUT, 10L);
    
    // Add auth header
    struct curl_slist *headers = NULL;
    char auth_header[256];
    snprintf(auth_header, sizeof(auth_header), "X-ZT1-Auth: %s", auth_token);
    headers = curl_slist_append(headers, auth_header);
    curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
    
    CURLcode res = curl_easy_perform(curl);
    
    curl_slist_free_all(headers);
    curl_easy_cleanup(curl);
    
    if (response.data) {
        free(response.data);
    }
    
    return (res == CURLE_OK) ? 0 : -1;
}

// Get network members
json_object* zt_api_get_members(const char *network_id) {
    CURL *curl = curl_easy_init();
    if (!curl) return NULL;
    
    char url[256];
    snprintf(url, sizeof(url), "%s/controller/network/%s/member", zt_api_base, network_id);
    
    struct http_response response = {0};
    
    curl_easy_setopt(curl, CURLOPT_URL, url);
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, write_callback);
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, &response);
    curl_easy_setopt(curl, CURLOPT_TIMEOUT, 10L);
    
    // Add auth header
    struct curl_slist *headers = NULL;
    char auth_header[256];
    snprintf(auth_header, sizeof(auth_header), "X-ZT1-Auth: %s", auth_token);
    headers = curl_slist_append(headers, auth_header);
    curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
    
    CURLcode res = curl_easy_perform(curl);
    
    curl_slist_free_all(headers);
    curl_easy_cleanup(curl);
    
    if (res != CURLE_OK) {
        if (response.data) free(response.data);
        return NULL;
    }
    
    json_object *json = json_tokener_parse(response.data);
    if (response.data) free(response.data);
    
    return json;
}

// Update member configuration
json_object* zt_api_update_member(const char *network_id, const char *member_id, 
                                 json_object *config) {
    CURL *curl = curl_easy_init();
    if (!curl) return NULL;
    
    char url[256];
    snprintf(url, sizeof(url), "%s/controller/network/%s/member/%s", 
             zt_api_base, network_id, member_id);
    
    const char *json_string = json_object_to_json_string(config);
    
    struct http_response response = {0};
    
    curl_easy_setopt(curl, CURLOPT_URL, url);
    curl_easy_setopt(curl, CURLOPT_POSTFIELDS, json_string);
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, write_callback);
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, &response);
    curl_easy_setopt(curl, CURLOPT_TIMEOUT, 10L);
    
    // Add headers
    struct curl_slist *headers = NULL;
    char auth_header[256];
    snprintf(auth_header, sizeof(auth_header), "X-ZT1-Auth: %s", auth_token);
    headers = curl_slist_append(headers, auth_header);
    headers = curl_slist_append(headers, "Content-Type: application/json");
    curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
    
    CURLcode res = curl_easy_perform(curl);
    
    curl_slist_free_all(headers);
    curl_easy_cleanup(curl);
    
    if (res != CURLE_OK) {
        if (response.data) free(response.data);
        return NULL;
    }
    
    json_object *json = json_tokener_parse(response.data);
    if (response.data) free(response.data);
    
    return json;
}
    
    char url[256];
    snprintf(url, sizeof(url), "%s/controller/network", zt_api_base);
    
    struct http_response response = {0};
    
    curl_easy_setopt(curl, CURLOPT_URL, url);
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, write_callback);
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, &response);
    curl_easy_setopt(curl, CURLOPT_TIMEOUT, 10L);
    
    // Add auth header
    struct curl_slist *headers = NULL;
    char auth_header[256];
    snprintf(auth_header, sizeof(auth_header), "X-ZT1-Auth: %s", auth_token);
    headers = curl_slist_append(headers, auth_header);
    curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
    
    CURLcode res = curl_easy_perform(curl);
    
    curl_slist_free_all(headers);
    curl_easy_cleanup(curl);
    
    if (res != CURLE_OK) {
        if (response.data) free(response.data);
        return NULL;
    }
    
    json_object *json = json_tokener_parse(response.data);
    if (response.data) free(response.data);
    
    return json;
}

// Get network details
json_object* zt_api_get_network(const char *network_id) {
    CURL *curl = curl_easy_init();
    if (!curl) return NULL;
    
    char url[256];
    snprintf(url, sizeof(url), "%s/controller/network/%s", zt_api_base, network_id);
    
    struct http_response response = {0};
    
    curl_easy_setopt(curl, CURLOPT_URL, url);
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, write_callback);
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, &response);
    curl_easy_setopt(curl, CURLOPT_TIMEOUT, 10L);
    
    // Add auth header
    struct curl_slist *headers = NULL;
    char auth_header[256];
    snprintf(auth_header, sizeof(auth_header), "X-ZT1-Auth: %s", auth_token);
    headers = curl_slist_append(headers, auth_header);
    curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
    
    CURLcode res = curl_easy_perform(curl);
    
    curl_slist_free_all(headers);
    curl_easy_cleanup(curl);
    
    if (res != CURLE_OK) {
        if (response.data) free(response.data);
        return NULL;
    }
    
    json_object *json = json_tokener_parse(response.data);
    if (response.data) free(response.data);
    
    return json;
}

// Get network members
json_object* zt_api_get_members(const char *network_id) {
    CURL *curl = curl_easy_init();
    if (!curl) return NULL;
    
    char url[256];
    snprintf(url, sizeof(url), "%s/controller/network/%s/member", zt_api_base, network_id);
    
    struct http_response response = {0};
    
    curl_easy_setopt(curl, CURLOPT_URL, url);
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, write_callback);
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, &response);
    curl_easy_setopt(curl, CURLOPT_TIMEOUT, 10L);
    
    // Add auth header
    struct curl_slist *headers = NULL;
    char auth_header[256];
    snprintf(auth_header, sizeof(auth_header), "X-ZT1-Auth: %s", auth_token);
    headers = curl_slist_append(headers, auth_header);
    curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
    
    CURLcode res = curl_easy_perform(curl);
    
    curl_slist_free_all(headers);
    curl_easy_cleanup(curl);
    
    if (res != CURLE_OK) {
        if (response.data) free(response.data);
        return NULL;
    }
    
    json_object *json = json_tokener_parse(response.data);
    if (response.data) free(response.data);
    
    return json;
}

// Create new network
json_object* zt_api_create_network(const char *name) {
    // Implementation for creating networks
    // This would involve POST request to /controller/network/{nodeId}______
    // For brevity, returning NULL here
    return NULL;
}

// Update network configuration
int zt_api_update_network(const char *network_id, json_object *config) {
    // Implementation for updating network configuration
    // This would involve POST request with JSON data
    return -1;
}

// Delete network
int zt_api_delete_network(const char *network_id) {
    // Implementation for deleting networks
    // This would involve DELETE request
    return -1;
}