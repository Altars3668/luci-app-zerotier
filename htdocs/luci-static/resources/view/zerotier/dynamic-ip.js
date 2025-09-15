/* SPDX-License-Identifier: GPL-3.0-only
 *
 * Copyright (C) 2022 ImmortalWrt.org
 * Dynamic IP Detection and Management for ZeroTier
 * 
 * Features:
 * - Multiple IP detection methods (APIs, STUN, UPnP)
 * - Automatic IP updates for Moon nodes and ZTNCUI
 * - Fallback mechanisms for reliability
 * - IPv4 and IPv6 support
 */

'use strict';
'require fs';
'require rpc';

// IP Detection Configuration
const IP_DETECTION_CONFIG = {
	// External IP detection services
	IP_APIS: [
		'https://ipv4.icanhazip.com',
		'https://api.ipify.org',
		'https://ipecho.net/plain',
		'https://checkip.amazonaws.com',
		'https://ip.42.pl/raw'
	],
	
	IPv6_APIS: [
		'https://ipv6.icanhazip.com',
		'https://api6.ipify.org',
		'https://v6.ident.me'
	],
	
	// STUN servers for NAT traversal
	STUN_SERVERS: [
		'stun.l.google.com:19302',
		'stun1.l.google.com:19302',
		'stun2.l.google.com:19302',
		'stun.cloudflare.com:3478'
	],
	
	// Timeouts and intervals
	DETECTION_TIMEOUT: 5000,
	UPDATE_INTERVAL: 300000, // 5 minutes
	RETRY_ATTEMPTS: 3,
	RETRY_DELAY: 2000
};

// RPC declarations for network operations
const callExec = rpc.declare({
	object: 'file',
	method: 'exec',
	params: ['command', 'params'],
	expect: { code: 0 }
});

const callRead = rpc.declare({
	object: 'file',
	method: 'read',
	params: ['path'],
	expect: { data: '' }
});

const callWrite = rpc.declare({
	object: 'file',
	method: 'write',
	params: ['path', 'data'],
	expect: { code: 0 }
});

/**
 * Dynamic IP Detection and Management Class
 */
class DynamicIPManager {
	constructor() {
		this.currentIPv4 = null;
		this.currentIPv6 = null;
		this.lastUpdate = null;
		this.updateCallbacks = [];
		this.isMonitoring = false;
	}

	/**
	 * Detect public IPv4 address using multiple methods
	 */
	async detectIPv4() {
		const methods = [
			() => this.detectIPFromAPIs(IP_DETECTION_CONFIG.IP_APIS),
			() => this.detectIPFromSTUN(),
			() => this.detectIPFromUPnP(),
			() => this.detectIPFromInterface()
		];

		for (const method of methods) {
			try {
				const ip = await this.withTimeout(method(), IP_DETECTION_CONFIG.DETECTION_TIMEOUT);
				if (this.isValidIPv4(ip)) {
					console.log(`Detected IPv4: ${ip}`);
					return ip;
				}
			} catch (error) {
				console.warn(`IPv4 detection method failed: ${error.message}`);
			}
		}

		throw new Error('Unable to detect public IPv4 address');
	}

	/**
	 * Detect public IPv6 address
	 */
	async detectIPv6() {
		try {
			const ip = await this.detectIPFromAPIs(IP_DETECTION_CONFIG.IPv6_APIS);
			if (this.isValidIPv6(ip)) {
				console.log(`Detected IPv6: ${ip}`);
				return ip;
			}
		} catch (error) {
			console.warn(`IPv6 detection failed: ${error.message}`);
		}

		// Fallback to interface detection
		try {
			const ip = await this.detectIPv6FromInterface();
			if (this.isValidIPv6(ip)) {
				return ip;
			}
		} catch (error) {
			console.warn(`IPv6 interface detection failed: ${error.message}`);
		}

		throw new Error('Unable to detect public IPv6 address');
	}

	/**
	 * Detect IP from external APIs
	 */
	async detectIPFromAPIs(apis) {
		for (const api of apis) {
			try {
				const response = await fetch(api, {
					method: 'GET',
					headers: {
						'User-Agent': 'ZeroTier-OpenWrt/1.0'
					}
				});

				if (response.ok) {
					const ip = (await response.text()).trim();
					if (ip && (this.isValidIPv4(ip) || this.isValidIPv6(ip))) {
						return ip;
					}
				}
			} catch (error) {
				console.warn(`API ${api} failed: ${error.message}`);
			}
		}
		throw new Error('All IP detection APIs failed');
	}

	/**
	 * Detect IP using STUN servers
	 */
	async detectIPFromSTUN() {
		// Implementation would require WebRTC or custom STUN client
		// For now, we'll use a command-line STUN client if available
		try {
			const result = await callExec('command', ['-v', 'stunclient']);
			if (result.code === 0) {
				for (const server of IP_DETECTION_CONFIG.STUN_SERVERS) {
					try {
						const stunResult = await callExec('stunclient', [server]);
						if (stunResult.stdout) {
							const match = stunResult.stdout.match(/(\d+\.\d+\.\d+\.\d+)/);
							if (match && this.isValidIPv4(match[1])) {
								return match[1];
							}
						}
					} catch (error) {
						console.warn(`STUN server ${server} failed: ${error.message}`);
					}
				}
			}
		} catch (error) {
			console.warn('STUN client not available');
		}
		throw new Error('STUN detection failed');
	}

	/**
	 * Detect IP using UPnP
	 */
	async detectIPFromUPnP() {
		try {
			const result = await callExec('upnpc', ['-l']);
			if (result.stdout) {
				const match = result.stdout.match(/ExternalIPAddress = (\d+\.\d+\.\d+\.\d+)/);
				if (match && this.isValidIPv4(match[1])) {
					return match[1];
				}
			}
		} catch (error) {
			console.warn('UPnP detection failed');
		}
		throw new Error('UPnP detection failed');
	}

	/**
	 * Detect IP from network interfaces
	 */
	async detectIPFromInterface() {
		try {
			// Get default route interface
			const routeResult = await callExec('ip', ['route', 'show', 'default']);
			if (routeResult.stdout) {
				const match = routeResult.stdout.match(/dev (\w+)/);
				if (match) {
					const iface = match[1];
					const ipResult = await callExec('ip', ['addr', 'show', iface]);
					if (ipResult.stdout) {
						const ipMatch = ipResult.stdout.match(/inet (\d+\.\d+\.\d+\.\d+)\/\d+ brd/);
						if (ipMatch && this.isValidIPv4(ipMatch[1]) && !this.isPrivateIP(ipMatch[1])) {
							return ipMatch[1];
						}
					}
				}
			}
		} catch (error) {
			console.warn('Interface IP detection failed');
		}
		throw new Error('Interface IP detection failed');
	}

	/**
	 * Detect IPv6 from interfaces
	 */
	async detectIPv6FromInterface() {
		try {
			const result = await callExec('ip', ['-6', 'addr', 'show', 'scope', 'global']);
			if (result.stdout) {
				const matches = result.stdout.match(/inet6 ([a-f0-9:]+)\/\d+/g);
				if (matches) {
					for (const match of matches) {
						const ipMatch = match.match(/inet6 ([a-f0-9:]+)/);
						if (ipMatch && this.isValidIPv6(ipMatch[1]) && !this.isPrivateIPv6(ipMatch[1])) {
							return ipMatch[1];
						}
					}
				}
			}
		} catch (error) {
			console.warn('IPv6 interface detection failed');
		}
		throw new Error('IPv6 interface detection failed');
	}

	/**
	 * Update current IP addresses
	 */
	async updateCurrentIPs() {
		const promises = [];
		let hasChanges = false;

		// Detect IPv4
		promises.push(
			this.detectIPv4()
				.then(ip => {
					if (ip !== this.currentIPv4) {
						this.currentIPv4 = ip;
						hasChanges = true;
					}
				})
				.catch(error => console.warn(`IPv4 update failed: ${error.message}`))
		);

		// Detect IPv6
		promises.push(
			this.detectIPv6()
				.then(ip => {
					if (ip !== this.currentIPv6) {
						this.currentIPv6 = ip;
						hasChanges = true;
					}
				})
				.catch(error => console.warn(`IPv6 update failed: ${error.message}`))
		);

		await Promise.all(promises);

		if (hasChanges) {
			this.lastUpdate = new Date();
			await this.notifyCallbacks();
		}

		return {
			ipv4: this.currentIPv4,
			ipv6: this.currentIPv6,
			hasChanges
		};
	}

	/**
	 * Start monitoring IP changes
	 */
	startMonitoring() {
		if (this.isMonitoring) return;

		this.isMonitoring = true;
		this.monitoringInterval = setInterval(async () => {
			try {
				await this.updateCurrentIPs();
			} catch (error) {
				console.error('IP monitoring error:', error);
			}
		}, IP_DETECTION_CONFIG.UPDATE_INTERVAL);

		console.log('Dynamic IP monitoring started');
	}

	/**
	 * Stop monitoring IP changes
	 */
	stopMonitoring() {
		if (!this.isMonitoring) return;

		this.isMonitoring = false;
		if (this.monitoringInterval) {
			clearInterval(this.monitoringInterval);
			this.monitoringInterval = null;
		}

		console.log('Dynamic IP monitoring stopped');
	}

	/**
	 * Register callback for IP changes
	 */
	onIPChange(callback) {
		this.updateCallbacks.push(callback);
	}

	/**
	 * Notify all registered callbacks
	 */
	async notifyCallbacks() {
		for (const callback of this.updateCallbacks) {
			try {
				await callback({
					ipv4: this.currentIPv4,
					ipv6: this.currentIPv6,
					timestamp: this.lastUpdate
				});
			} catch (error) {
				console.error('Callback notification failed:', error);
			}
		}
	}

	/**
	 * Utility: Add timeout to promise
	 */
	withTimeout(promise, timeout) {
		return Promise.race([
			promise,
			new Promise((_, reject) => 
				setTimeout(() => reject(new Error('Timeout')), timeout)
			)
		]);
	}

	/**
	 * Validate IPv4 address
	 */
	isValidIPv4(ip) {
		const pattern = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
		const match = ip.match(pattern);
		if (!match) return false;

		return match.slice(1, 5).every(octet => {
			const num = parseInt(octet, 10);
			return num >= 0 && num <= 255;
		});
	}

	/**
	 * Validate IPv6 address
	 */
	isValidIPv6(ip) {
		const pattern = /^([0-9a-f]{1,4}:){7}[0-9a-f]{1,4}$|^::1$|^::$/i;
		return pattern.test(ip) || this.isValidIPv6Compressed(ip);
	}

	/**
	 * Validate compressed IPv6 address
	 */
	isValidIPv6Compressed(ip) {
		const pattern = /^([0-9a-f]{0,4}:){0,7}:([0-9a-f]{0,4}:){0,7}[0-9a-f]{0,4}$/i;
		return pattern.test(ip);
	}

	/**
	 * Check if IPv4 is private
	 */
	isPrivateIP(ip) {
		const parts = ip.split('.').map(Number);
		return (
			parts[0] === 10 ||
			(parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
			(parts[0] === 192 && parts[1] === 168) ||
			parts[0] === 127
		);
	}

	/**
	 * Check if IPv6 is private
	 */
	isPrivateIPv6(ip) {
		return (
			ip.startsWith('::1') ||        // Loopback
			ip.startsWith('fe80:') ||      // Link-local
			ip.startsWith('fc00:') ||      // Unique local
			ip.startsWith('fd00:')         // Unique local
		);
	}

	/**
	 * Get current IP information
	 */
	getCurrentIPs() {
		return {
			ipv4: this.currentIPv4,
			ipv6: this.currentIPv6,
			lastUpdate: this.lastUpdate
		};
	}

	/**
	 * Force IP refresh
	 */
	async refreshIPs() {
		return await this.updateCurrentIPs();
	}
}

// Export singleton instance
const dynamicIPManager = new DynamicIPManager();

return {
	DynamicIPManager,
	dynamicIPManager,
	IP_DETECTION_CONFIG
};