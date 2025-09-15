/*
 * ZTNCUI Configuration Header
 * Copyright (C) 2024 AltarsCN
 */

#ifndef CONFIG_H
#define CONFIG_H

#define ZTNCUI_VERSION "1.0.0-openwrt"
#define MAX_PATH 256
#define MAX_STRING 128
#define MAX_NETWORKS 100
#define MAX_MEMBERS 1000

// Configuration structure
struct ztncui_config {
    // Server settings
    int port;
    char bind_address[MAX_STRING];
    
    // ZeroTier settings
    char zt_home[MAX_PATH];
    char zt_address[MAX_STRING];
    
    // HTTPS settings
    int enable_https;
    int https_port;
    char cert_file[MAX_PATH];
    char key_file[MAX_PATH];
    
    // Application settings
    char log_level[16];
    int max_networks;
    int session_timeout;
    
    // Authentication
    char admin_user[64];
    char admin_pass_hash[128];
};

// Default configuration loader
int load_default_config(struct ztncui_config *config);

// Configuration validation
int validate_config_values(struct ztncui_config *config);

#endif // CONFIG_H