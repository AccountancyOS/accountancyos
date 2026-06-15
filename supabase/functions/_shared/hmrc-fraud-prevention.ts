/**
 * HMRC Fraud Prevention header construction (server-side merge layer).
 *
 * HMRC requires "Gov-Client-*" and "Gov-Vendor-*" fraud prevention headers on
 * every API call. For a web app that submits via its own server, the connection
 * method is WEB_APP_VIA_SERVER: the browser collects client-side signals
 * (screens, window size, timezone, user agent, device id) and the server merges
 * in the values it alone can see (public IP, forwarded chain, vendor identity).
 *
 * This module is the server-side merge layer. It is runtime-agnostic (no Deno /
 * Node globals, no external imports) so the merge logic is unit-testable.
 * The browser collection layer lives in src/hmrc/fraud-prevention.ts.
 *
 * Spec: https://developer.service.hmrc.gov.uk/guides/fraud-prevention/
 */

export const CONNECTION_METHOD = 'WEB_APP_VIA_SERVER';

/** Signals collected in the browser and forwarded to the proxy. */
export interface ClientFraudData {
  /** Stable per-device identifier (UUID) persisted in the browser. */
  deviceId?: string;
  /** IANA timezone, e.g. "UTC+01:00" form expected by HMRC. */
  timezone?: string;
  /** Screen descriptors: width=..&height=..&scaling-factor=..&colour-depth=.. */
  screens?: string;
  /** Browser window inner size: width=..&height=.. */
  windowSize?: string;
  /** Full browser User-Agent string. */
  browserJsUserAgent?: string;
  /** "true" | "false" | "unknown" */
  doNotTrack?: string;
  /** Local IP addresses visible to the browser (comma separated). */
  localIps?: string;
  /** ISO timestamp when local IPs were collected. */
  localIpsTimestamp?: string;
  /** Installed browser plugins (comma separated), "" if none. */
  browserPlugins?: string;
}

/** Signals only the server can observe. */
export interface ServerFraudData {
  /** Authenticated user id, mapped to Gov-Client-User-IDs. */
  userId?: string;
  /** Originating public IP (from X-Forwarded-For / connection). */
  publicIp?: string;
  /** ISO timestamp when the public IP was observed. */
  publicIpTimestamp?: string;
  /** Public source port if known. */
  publicPort?: string;
  /** Proxy forwarding chain for Gov-Vendor-Forwarded. */
  forwarded?: string;
}

/** Vendor identity (AccountancyOS), sourced from environment config. */
export interface VendorConfig {
  productName: string;
  version: string;
  /** Vendor licence ids string, e.g. "AccountancyOS=<id>". */
  licenseIds?: string;
}

export interface FraudPreventionInput {
  client?: ClientFraudData;
  server?: ServerFraudData;
  vendor: VendorConfig;
}

export interface FraudPreventionResult {
  headers: Record<string, string>;
  /** Required headers that could not be populated (for warn-level logging). */
  missing: string[];
}

/**
 * The set of headers we require to be present for a WEB_APP_VIA_SERVER call.
 * Tests assert this list is fully populated when client + server data is
 * supplied, so a regression that silently drops a header is caught.
 */
export const REQUIRED_FRAUD_HEADERS: readonly string[] = [
  'Gov-Client-Connection-Method',
  'Gov-Client-Device-ID',
  'Gov-Client-User-IDs',
  'Gov-Client-Timezone',
  'Gov-Client-Screens',
  'Gov-Client-Window-Size',
  'Gov-Client-Browser-JS-User-Agent',
  'Gov-Client-Public-IP',
  'Gov-Client-Public-IP-Timestamp',
  'Gov-Vendor-Version',
  'Gov-Vendor-Product-Name',
  'Gov-Vendor-Forwarded',
];

const PREFIX = 'GOV-';

/** True for any HMRC fraud-prevention header name. */
export function isFraudPreventionHeader(name: string): boolean {
  return name.toUpperCase().startsWith(PREFIX);
}

function put(
  headers: Record<string, string>,
  name: string,
  value: string | undefined,
): void {
  if (value !== undefined && value !== null && value !== '') {
    headers[name] = value;
  }
}

/**
 * Merge browser-collected and server-observed signals into the full set of
 * HMRC fraud prevention headers. Pure function — no IO.
 */
export function mergeFraudPreventionHeaders(input: FraudPreventionInput): FraudPreventionResult {
  const client = input.client ?? {};
  const server = input.server ?? {};
  const vendor = input.vendor;

  const headers: Record<string, string> = {};

  // Connection method is fixed for this architecture.
  headers['Gov-Client-Connection-Method'] = CONNECTION_METHOD;

  // Client-collected signals.
  put(headers, 'Gov-Client-Device-ID', client.deviceId);
  put(headers, 'Gov-Client-Timezone', client.timezone);
  put(headers, 'Gov-Client-Screens', client.screens);
  put(headers, 'Gov-Client-Window-Size', client.windowSize);
  put(headers, 'Gov-Client-Browser-JS-User-Agent', client.browserJsUserAgent);
  put(headers, 'Gov-Client-Browser-Do-Not-Track', client.doNotTrack);
  put(headers, 'Gov-Client-Local-IPs', client.localIps);
  put(headers, 'Gov-Client-Local-IPs-Timestamp', client.localIpsTimestamp);
  // Browser plugins: present-but-empty is a valid value HMRC expects.
  if (client.browserPlugins !== undefined) {
    headers['Gov-Client-Browser-Plugins'] = client.browserPlugins;
  }

  // Server-observed signals.
  if (server.userId) {
    headers['Gov-Client-User-IDs'] = `os=${server.userId}`;
  }
  put(headers, 'Gov-Client-Public-IP', server.publicIp);
  put(headers, 'Gov-Client-Public-IP-Timestamp', server.publicIpTimestamp);
  put(headers, 'Gov-Client-Public-Port', server.publicPort);

  // Vendor identity.
  put(headers, 'Gov-Vendor-Version', vendor.version);
  put(headers, 'Gov-Vendor-Product-Name', vendor.productName);
  put(headers, 'Gov-Vendor-License-IDs', vendor.licenseIds);
  // Forwarded chain — even with no upstream proxies HMRC wants the header.
  headers['Gov-Vendor-Forwarded'] = server.forwarded ?? `by=${server.publicIp ?? 'unknown'}`;

  const missing = REQUIRED_FRAUD_HEADERS.filter((h) => !(h in headers));

  return { headers, missing };
}

/**
 * Read vendor identity from environment with safe defaults. Kept separate from
 * the pure merge so the merge stays testable without env access.
 */
export function vendorConfigFromEnv(env: (key: string) => string | undefined): VendorConfig {
  return {
    productName: env('GOV_VENDOR_PRODUCT_NAME') ?? 'AccountancyOS',
    version: env('GOV_VENDOR_VERSION') ?? '2.0.0',
    licenseIds: env('GOV_VENDOR_LICENSE_IDS'),
  };
}
