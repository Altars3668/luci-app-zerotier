/*
 * ZeroTier API Client Header
 * Copyright (C) 2024 AltarsCN
 */

#ifndef ZT_API_H
#define ZT_API_H

#include <json-c/json.h>
#include "config.h"

// Initialize ZeroTier API client
int zt_api_init(struct ztncui_config *config);

// Cleanup ZeroTier API client
void zt_api_cleanup(void);

// Check connection to ZeroTier daemon
int zt_api_check_connection(const char *zt_address, const char *zt_home);

// API functions
json_object* zt_api_get_status(void);
json_object* zt_api_get_networks(void);
json_object* zt_api_get_network(const char *network_id);
json_object* zt_api_get_members(const char *network_id);
json_object* zt_api_get_member(const char *network_id, const char *member_id);

// Network management
json_object* zt_api_create_network(const char *name, const char *description);
json_object* zt_api_update_network(const char *network_id, json_object *config);
int zt_api_delete_network(const char *network_id);

// Member management
json_object* zt_api_update_member(const char *network_id, const char *member_id, json_object *config);
int zt_api_authorize_member(const char *network_id, const char *member_id);
int zt_api_deauthorize_member(const char *network_id, const char *member_id);
int zt_api_delete_member(const char *network_id, const char *member_id);

#endif // ZT_API_H