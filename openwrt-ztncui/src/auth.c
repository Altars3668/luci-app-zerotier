/*
 * Authentication Module for ZTNCUI OpenWrt
 * Based on ztncui authentication system
 * Copyright (C) 2024 AltarsCN
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <unistd.h>
#include <fcntl.h>
#include <sys/stat.h>
#include <microhttpd.h>
#include <json-c/json.h>

#include "auth.h"
#include "config.h"

#define MIN_PASSWORD_LENGTH 10
#define MAX_PASSWORD_LENGTH 160
#define SESSION_TIMEOUT 3600
#define USERS_FILE "/etc/ztncui/passwd.json"

// Simple session store (in production, use more secure storage)
static struct auth_session sessions[MAX_SESSIONS];
static int session_count = 0;

// Load users from JSON file (similar to ztncui's usersController)
static json_object* load_users() {
    FILE *fp = fopen(USERS_FILE, "r");
    if (!fp) {
        return NULL;
    }
    
    fseek(fp, 0, SEEK_END);
    long length = ftell(fp);
    fseek(fp, 0, SEEK_SET);
    
    char *buffer = malloc(length + 1);
    if (!buffer) {
        fclose(fp);
        return NULL;
    }
    
    fread(buffer, 1, length, fp);
    buffer[length] = '\0';
    fclose(fp);
    
    json_object *users = json_tokener_parse(buffer);
    free(buffer);
    
    return users;
}

// Save users to JSON file
static int save_users(json_object *users) {
    FILE *fp = fopen(USERS_FILE, "w");
    if (!fp) {
        return -1;
    }
    
    const char *json_string = json_object_to_json_string_ext(users, JSON_C_TO_STRING_PRETTY);
    fwrite(json_string, 1, strlen(json_string), fp);
    fclose(fp);
    
    // Set secure permissions
    chmod(USERS_FILE, 0600);
    
    return 0;
}

// Simple password hashing (in production, use proper bcrypt/argon2)
static void hash_password(const char *password, char *hash_out, size_t hash_size) {
    // For simplicity, using a basic hash (replace with proper implementation)
    snprintf(hash_out, hash_size, "simple_hash_%s", password);
}

// Verify password hash
static int verify_password(const char *password, const char *hash) {
    char computed_hash[256];
    hash_password(password, computed_hash, sizeof(computed_hash));
    return strcmp(computed_hash, hash) == 0;
}

// Initialize authentication system
int auth_init() {
    // Create users directory if it doesn't exist
    char dir[] = "/etc/ztncui";
    struct stat st = {0};
    if (stat(dir, &st) == -1) {
        mkdir(dir, 0700);
    }
    
    // Check if users file exists, create default user if not
    struct stat file_st;
    if (stat(USERS_FILE, &file_st) == -1) {
        // Create default admin user
        json_object *users = json_object_new_object();
        json_object *admin_user = json_object_new_object();
        
        char hash[256];
        hash_password("password", hash, sizeof(hash));
        
        json_object_object_add(admin_user, "name", json_object_new_string("admin"));
        json_object_object_add(admin_user, "hash", json_object_new_string(hash));
        json_object_object_add(admin_user, "pass_set", json_object_new_boolean(1));
        
        json_object_object_add(users, "admin", admin_user);
        
        if (save_users(users) != 0) {
            json_object_put(users);
            return -1;
        }
        
        json_object_put(users);
        printf("Created default admin user (password: password)\n");
    }
    
    // Initialize sessions
    memset(sessions, 0, sizeof(sessions));
    session_count = 0;
    
    return 0;
}

// Authenticate user
int auth_authenticate(const char *username, const char *password, struct auth_session *session) {
    json_object *users = load_users();
    if (!users) {
        return AUTH_ERROR_LOAD_USERS;
    }
    
    json_object *user_obj;
    if (!json_object_object_get_ex(users, username, &user_obj)) {
        json_object_put(users);
        return AUTH_ERROR_USER_NOT_FOUND;
    }
    
    json_object *hash_obj;
    if (!json_object_object_get_ex(user_obj, "hash", &hash_obj)) {
        json_object_put(users);
        return AUTH_ERROR_NO_HASH;
    }
    
    const char *stored_hash = json_object_get_string(hash_obj);
    if (!verify_password(password, stored_hash)) {
        json_object_put(users);
        return AUTH_ERROR_INVALID_PASSWORD;
    }
    
    // Create session
    if (session_count >= MAX_SESSIONS) {
        json_object_put(users);
        return AUTH_ERROR_SESSION_LIMIT;
    }
    
    struct auth_session *new_session = &sessions[session_count++];
    snprintf(new_session->session_id, sizeof(new_session->session_id), 
             "sess_%ld_%d", time(NULL), rand());
    strncpy(new_session->username, username, sizeof(new_session->username) - 1);
    new_session->created_at = time(NULL);
    new_session->last_access = time(NULL);
    new_session->valid = 1;
    
    // Copy session data
    *session = *new_session;
    
    json_object_put(users);
    return AUTH_SUCCESS;
}

// Validate session
int auth_validate_session(const char *session_id, struct auth_session *session) {
    for (int i = 0; i < session_count; i++) {
        if (sessions[i].valid && strcmp(sessions[i].session_id, session_id) == 0) {
            time_t now = time(NULL);
            
            // Check if session expired
            if (now - sessions[i].last_access > SESSION_TIMEOUT) {
                sessions[i].valid = 0;
                return AUTH_ERROR_SESSION_EXPIRED;
            }
            
            // Update last access time
            sessions[i].last_access = now;
            
            // Copy session data
            *session = sessions[i];
            return AUTH_SUCCESS;
        }
    }
    
    return AUTH_ERROR_SESSION_NOT_FOUND;
}

// Logout (invalidate session)
int auth_logout(const char *session_id) {
    for (int i = 0; i < session_count; i++) {
        if (sessions[i].valid && strcmp(sessions[i].session_id, session_id) == 0) {
            sessions[i].valid = 0;
            return AUTH_SUCCESS;
        }
    }
    
    return AUTH_ERROR_SESSION_NOT_FOUND;
}

// Change password
int auth_change_password(const char *username, const char *old_password, 
                        const char *new_password) {
    if (strlen(new_password) < MIN_PASSWORD_LENGTH || 
        strlen(new_password) > MAX_PASSWORD_LENGTH) {
        return AUTH_ERROR_PASSWORD_LENGTH;
    }
    
    json_object *users = load_users();
    if (!users) {
        return AUTH_ERROR_LOAD_USERS;
    }
    
    json_object *user_obj;
    if (!json_object_object_get_ex(users, username, &user_obj)) {
        json_object_put(users);
        return AUTH_ERROR_USER_NOT_FOUND;
    }
    
    // Verify old password
    json_object *hash_obj;
    if (json_object_object_get_ex(user_obj, "hash", &hash_obj)) {
        const char *stored_hash = json_object_get_string(hash_obj);
        if (!verify_password(old_password, stored_hash)) {
            json_object_put(users);
            return AUTH_ERROR_INVALID_PASSWORD;
        }
    }
    
    // Set new password
    char new_hash[256];
    hash_password(new_password, new_hash, sizeof(new_hash));
    
    json_object_object_del(user_obj, "hash");
    json_object_object_add(user_obj, "hash", json_object_new_string(new_hash));
    json_object_object_add(user_obj, "pass_set", json_object_new_boolean(1));
    
    int result = save_users(users);
    json_object_put(users);
    
    return (result == 0) ? AUTH_SUCCESS : AUTH_ERROR_SAVE_USERS;
}

// Create new user
int auth_create_user(const char *username, const char *password) {
    if (strlen(password) < MIN_PASSWORD_LENGTH || 
        strlen(password) > MAX_PASSWORD_LENGTH) {
        return AUTH_ERROR_PASSWORD_LENGTH;
    }
    
    json_object *users = load_users();
    if (!users) {
        return AUTH_ERROR_LOAD_USERS;
    }
    
    // Check if user already exists
    json_object *existing_user;
    if (json_object_object_get_ex(users, username, &existing_user)) {
        json_object_put(users);
        return AUTH_ERROR_USER_EXISTS;
    }
    
    // Create new user
    json_object *new_user = json_object_new_object();
    
    char hash[256];
    hash_password(password, hash, sizeof(hash));
    
    json_object_object_add(new_user, "name", json_object_new_string(username));
    json_object_object_add(new_user, "hash", json_object_new_string(hash));
    json_object_object_add(new_user, "pass_set", json_object_new_boolean(1));
    
    json_object_object_add(users, username, new_user);
    
    int result = save_users(users);
    json_object_put(users);
    
    return (result == 0) ? AUTH_SUCCESS : AUTH_ERROR_SAVE_USERS;
}

// Delete user
int auth_delete_user(const char *username) {
    json_object *users = load_users();
    if (!users) {
        return AUTH_ERROR_LOAD_USERS;
    }
    
    if (!json_object_object_del(users, username)) {
        json_object_put(users);
        return AUTH_ERROR_USER_NOT_FOUND;
    }
    
    int result = save_users(users);
    json_object_put(users);
    
    return (result == 0) ? AUTH_SUCCESS : AUTH_ERROR_SAVE_USERS;
}

// Get session cookie from HTTP request
const char* auth_get_session_cookie(struct MHD_Connection *connection) {
    const char *cookie_header = MHD_lookup_connection_value(connection, 
                                                          MHD_HEADER_KIND, 
                                                          "Cookie");
    if (!cookie_header) {
        return NULL;
    }
    
    // Parse session cookie (simplified)
    const char *session_start = strstr(cookie_header, "session=");
    if (!session_start) {
        return NULL;
    }
    
    session_start += 8; // Skip "session="
    
    static char session_id[128];
    const char *session_end = strchr(session_start, ';');
    if (session_end) {
        size_t len = session_end - session_start;
        strncpy(session_id, session_start, len);
        session_id[len] = '\0';
    } else {
        strncpy(session_id, session_start, sizeof(session_id) - 1);
        session_id[sizeof(session_id) - 1] = '\0';
    }
    
    return session_id;
}

// Check if request is authenticated
int auth_check_request(struct MHD_Connection *connection, struct auth_session *session) {
    const char *session_id = auth_get_session_cookie(connection);
    if (!session_id) {
        return AUTH_ERROR_NO_SESSION;
    }
    
    return auth_validate_session(session_id, session);
}

// Cleanup authentication system
void auth_cleanup() {
    // Clear sessions
    memset(sessions, 0, sizeof(sessions));
    session_count = 0;
}