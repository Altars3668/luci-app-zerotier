/*
 * ZTNCUI Server - Lightweight ZeroTier Network Controller UI for OpenWrt
 * Copyright (C) 2024 AltarsCN
 * Licensed under GPL-3.0
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <signal.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <pthread.h>
#include <errno.h>
#include <time.h>
#include <json-c/json.h>
#include <microhttpd.h>

#include "config.h"
#include "zt-api.h"
#include "web-server.h"
#include "auth.h"
#include "web-server.h"

// Global configuration
static struct ztncui_config config;
static struct MHD_Daemon *daemon = NULL;
static volatile int running = 1;

// Signal handler
static void signal_handler(int sig) {
    printf("Received signal %d, shutting down...\n", sig);
    running = 0;
    if (daemon) {
        MHD_stop_daemon(daemon);
        daemon = NULL;
    }
}

// Load configuration from file
static int load_config(const char *config_file) {
    FILE *fp = fopen(config_file, "r");
    if (!fp) {
        fprintf(stderr, "Warning: Cannot open config file %s, using defaults\n", config_file);
        return load_default_config(&config);
    }
    
    char line[256];
    while (fgets(line, sizeof(line), fp)) {
        // Remove newline
        line[strcspn(line, "\n")] = 0;
        
        // Skip comments and empty lines
        if (line[0] == '#' || line[0] == '\0') continue;
        
        char *key = strtok(line, "=");
        char *value = strtok(NULL, "=");
        
        if (!key || !value) continue;
        
        if (strcmp(key, "port") == 0) {
            config.port = atoi(value);
        } else if (strcmp(key, "bind_address") == 0) {
            strncpy(config.bind_address, value, sizeof(config.bind_address) - 1);
        } else if (strcmp(key, "zt_home") == 0) {
            strncpy(config.zt_home, value, sizeof(config.zt_home) - 1);
        } else if (strcmp(key, "zt_address") == 0) {
            strncpy(config.zt_address, value, sizeof(config.zt_address) - 1);
        } else if (strcmp(key, "enable_https") == 0) {
            config.enable_https = atoi(value);
        } else if (strcmp(key, "https_port") == 0) {
            config.https_port = atoi(value);
        } else if (strcmp(key, "log_level") == 0) {
            strncpy(config.log_level, value, sizeof(config.log_level) - 1);
        } else if (strcmp(key, "max_networks") == 0) {
            config.max_networks = atoi(value);
        } else if (strcmp(key, "session_timeout") == 0) {
            config.session_timeout = atoi(value);
        }
    }
    
    fclose(fp);
    return 0;
}

// Validate configuration
static int validate_config() {
    if (config.port < 1024 || config.port > 65535) {
        fprintf(stderr, "Error: Invalid port %d\n", config.port);
        return -1;
    }
    
    if (config.enable_https && (config.https_port < 1024 || config.https_port > 65535)) {
        fprintf(stderr, "Error: Invalid HTTPS port %d\n", config.https_port);
        return -1;
    }
    
    // Check if ZeroTier is accessible
    if (!zt_api_check_connection(config.zt_address, config.zt_home)) {
        fprintf(stderr, "Error: Cannot connect to ZeroTier daemon at %s\n", config.zt_address);
        return -1;
    }
    
    return 0;
}

// Print configuration
static void print_config() {
    printf("ZTNCUI Server Configuration:\n");
    printf("  Port: %d\n", config.port);
    printf("  Bind Address: %s\n", config.bind_address);
    printf("  ZeroTier Home: %s\n", config.zt_home);
    printf("  ZeroTier Address: %s\n", config.zt_address);
    printf("  HTTPS Enabled: %s\n", config.enable_https ? "yes" : "no");
    if (config.enable_https) {
        printf("  HTTPS Port: %d\n", config.https_port);
    }
    printf("  Log Level: %s\n", config.log_level);
    printf("  Max Networks: %d\n", config.max_networks);
    printf("  Session Timeout: %d seconds\n", config.session_timeout);
}

// Main function
int main(int argc, char *argv[]) {
    const char *config_file = getenv("ZTNCUI_CONFIG");
    if (!config_file) {
        config_file = "/etc/ztncui/runtime.conf";
    }
    
    printf("Starting ZTNCUI Server for OpenWrt v%s\n", ZTNCUI_VERSION);
    
    // Load configuration
    if (load_config(config_file) != 0) {
        fprintf(stderr, "Failed to load configuration\n");
        return 1;
    }
    
    // Validate configuration
    if (validate_config() != 0) {
        fprintf(stderr, "Configuration validation failed\n");
        return 1;
    }
    
    print_config();
    
    // Initialize ZeroTier API client
    if (zt_api_init(&config) != 0) {
        fprintf(stderr, "Failed to initialize ZeroTier API client\n");
        return 1;
    }
    
    // Setup signal handlers
    signal(SIGINT, signal_handler);
    signal(SIGTERM, signal_handler);
    signal(SIGPIPE, SIG_IGN);
    
    // Initialize web server
    if (web_server_init(&config) != 0) {
        fprintf(stderr, "Failed to initialize web server\n");
        return 1;
    }
    
    // Start HTTP daemon
    daemon = MHD_start_daemon(
        MHD_USE_THREAD_PER_CONNECTION | MHD_USE_INTERNAL_POLLING_THREAD,
        config.port,
        NULL, NULL,
        &handle_request, &config,
        MHD_OPTION_END
    );
    
    if (!daemon) {
        fprintf(stderr, "Failed to start HTTP daemon on port %d\n", config.port);
        return 1;
    }
    
    printf("ZTNCUI Server started successfully\n");
    printf("HTTP interface: http://%s:%d\n", 
           strcmp(config.bind_address, "0.0.0.0") == 0 ? "router-ip" : config.bind_address,
           config.port);
    
    if (config.enable_https) {
        printf("HTTPS interface: https://%s:%d\n",
               strcmp(config.bind_address, "0.0.0.0") == 0 ? "router-ip" : config.bind_address,
               config.https_port);
    }
    
    printf("Default credentials: admin/password (please change after first login)\n");
    
    // Main loop
    while (running) {
        sleep(1);
        
        // Periodic health checks
        if (time(NULL) % 60 == 0) {  // Every minute
            if (!zt_api_check_connection(config.zt_address, config.zt_home)) {
                fprintf(stderr, "Warning: Lost connection to ZeroTier daemon\n");
            }
        }
    }
    
    // Cleanup
    if (daemon) {
        MHD_stop_daemon(daemon);
    }
    
    web_server_cleanup();
    zt_api_cleanup();
    
    printf("ZTNCUI Server stopped\n");
    return 0;
}