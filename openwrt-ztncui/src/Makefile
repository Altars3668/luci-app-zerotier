# Makefile for ZTNCUI OpenWrt Package
# Copyright (C) 2024 AltarsCN

CC = gcc
CFLAGS = -Wall -Wextra -std=c99 -D_GNU_SOURCE
LDFLAGS = -ljson-c -lmicrohttpd -luci -lcurl -lpthread

SRCDIR = .
SOURCES = ztncui-server.c zt-api.c web-server.c auth.c
OBJECTS = $(SOURCES:.c=.o)
TARGET = ztncui-server

# Build rules
all: $(TARGET)

$(TARGET): $(OBJECTS)
	$(CC) $(OBJECTS) -o $@ $(LDFLAGS)

%.o: %.c
	$(CC) $(CFLAGS) -c $< -o $@

clean:
	rm -f $(OBJECTS) $(TARGET)

install: $(TARGET)
	install -D $(TARGET) $(DESTDIR)/usr/bin/$(TARGET)

.PHONY: all clean install

# Dependencies
ztncui-server.o: ztncui-server.c config.h zt-api.h web-server.h auth.h
zt-api.o: zt-api.c zt-api.h config.h
web-server.o: web-server.c web-server.h config.h zt-api.h auth.h
auth.o: auth.c auth.h config.h