import https from 'https';
import { HttpsProxyAgent } from 'https-proxy-agent';

// ponytail: modern TLS ciphers to prevent OpenSSL/JA3 fingerprint detection in Node.js
const MODERN_TLS_CIPHERS = [
  'TLS_AES_128_GCM_SHA256',
  'TLS_AES_256_GCM_SHA384',
  'TLS_CHACHA20_POLY1305_SHA256',
  'ECDHE-ECDSA-AES128-GCM-SHA256',
  'ECDHE-RSA-AES128-GCM-SHA256',
  'ECDHE-ECDSA-AES256-GCM-SHA384',
  'ECDHE-RSA-AES256-GCM-SHA384',
].join(':');

export const chromeHttpsAgent = new https.Agent({
  ciphers: MODERN_TLS_CIPHERS,
  honorCipherOrder: true,
  minVersion: 'TLSv1.2',
});

export interface ProxyConfig {
  server?: string;
  auth?: { username: string; password: string };
}

/**
 * Parses a proxy URL for Puppeteer / Chromium scrapers (Naukri, Indeed).
 * Returns the proxy server string and optional proxy authentication credentials.
 */
export function parseProxy(proxyUrl?: string): ProxyConfig {
  if (!proxyUrl) return {};
  try {
    const url = new URL(proxyUrl);
    if (!['http:', 'https:', 'socks4:', 'socks5:'].includes(url.protocol)) {
      return {};
    }
    const server = `${url.protocol}//${url.hostname}${url.port ? ':' + url.port : ''}`;
    const auth =
      url.username || url.password
        ? { username: decodeURIComponent(url.username), password: decodeURIComponent(url.password) }
        : undefined;
    return { server, auth };
  } catch {
    return {};
  }
}

/**
 * Returns an HttpsProxyAgent for Axios-based scrapers (LinkedIn, SimplyHired)
 * if proxyUrl is a valid http:// or https:// URL, otherwise falls back safely to chromeHttpsAgent.
 */
export function getProxyAgent(proxyUrl?: string): any {
  if (!proxyUrl || typeof proxyUrl !== 'string') return chromeHttpsAgent;
  const trimmed = proxyUrl.trim();
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    return chromeHttpsAgent;
  }
  try {
    new URL(trimmed);
    return new HttpsProxyAgent(trimmed);
  } catch {
    return chromeHttpsAgent;
  }
}
