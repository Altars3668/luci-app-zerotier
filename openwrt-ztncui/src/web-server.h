/*
 * Web Server Header for ZTNCUI
 * Copyright (C) 2024 AltarsCN
 */

#ifndef WEB_SERVER_H
#define WEB_SERVER_H

#include <microhttpd.h>
#include "config.h"

// Initialize web server
int web_server_init(struct ztncui_config *config);

// Cleanup web server
void web_server_cleanup(void);

// Main request handler
int handle_request(void *cls,
                  struct MHD_Connection *connection,
                  const char *url,
                  const char *method,
                  const char *version,
                  const char *upload_data,
                  size_t *upload_data_size,
                  void **con_cls);

#endif // WEB_SERVER_H