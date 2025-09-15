/*
 * Authentication Header for ZTNCUI OpenWrt
 * Based on ztncui authentication system
 * Copyright (C) 2024 AltarsCN
 */

#ifndef AUTH_H
#define AUTH_H

#include <microhttpd.h>

#define MAX_SESSIONS 100
#define AUTH_SUCCESS 0
#define AUTH_ERROR_LOAD_USERS -1
#define AUTH_ERROR_USER_NOT_FOUND -2
#define AUTH_ERROR_NO_HASH -3
#define AUTH_ERROR_INVALID_PASSWORD -4
#define AUTH_ERROR_SESSION_LIMIT -5
#define AUTH_ERROR_SESSION_EXPIRED -6
#define AUTH_ERROR_SESSION_NOT_FOUND -7
#define AUTH_ERROR_PASSWORD_LENGTH -8
#define AUTH_ERROR_SAVE_USERS -9
#define AUTH_ERROR_USER_EXISTS -10
#define AUTH_ERROR_NO_SESSION -11

struct auth_session {
    char session_id[128];
    char username[64];
    time_t created_at;
    time_t last_access;
    int valid;
};

// Initialize authentication system
int auth_init(void);

// Authenticate user
int auth_authenticate(const char *username, const char *password, struct auth_session *session);

// Validate session
int auth_validate_session(const char *session_id, struct auth_session *session);

// Logout (invalidate session)
int auth_logout(const char *session_id);

// Change password
int auth_change_password(const char *username, const char *old_password, const char *new_password);

// Create new user
int auth_create_user(const char *username, const char *password);

// Delete user
int auth_delete_user(const char *username);

// Get session cookie from HTTP request
const char* auth_get_session_cookie(struct MHD_Connection *connection);

// Check if request is authenticated
int auth_check_request(struct MHD_Connection *connection, struct auth_session *session);

// Cleanup authentication system
void auth_cleanup(void);

#endif // AUTH_H