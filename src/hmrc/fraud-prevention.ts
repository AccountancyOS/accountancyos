/**
 * HMRC Fraud Prevention — browser collection layer.
 *
 * For the WEB_APP_VIA_SERVER connection method, the browser must collect a set
 * of client-side signals which the server then merges with its own (public IP,
 * vendor identity) before calling HMRC. This module gathers those signals and
 * returns them in the shape the hmrc-call-proxy expects under `fraudPrevention`.
 *
 * The actual header construction happens server-side in
 * supabase/functions/_shared/hmrc-fraud-prevention.ts. This file only collects.
 *
 * Spec: https://developer.service.hmrc.gov.uk/guides/fraud-prevention/
 */

const DEVICE_ID_KEY = 'aos.hmrc.deviceId';

/** Mirrors the server-side ClientFraudData interface (kept in sync by tests). */
export interface ClientFraudData {
  deviceId: string;
  timezone: string;
  screens: string;
  windowSize: string;
  browserJsUserAgent: string;
  doNotTrack: string;
  browserPlugins: string;
}

/** Stable per-device id, persisted in localStorage. */
function getOrCreateDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
    return id;
  } catch {
    // localStorage unavailable (SSR / privacy mode) — fall back to ephemeral id.
    return crypto.randomUUID();
  }
}

/** HMRC expects timezone as "UTC±hh:mm". */
function getTimezoneOffset(): string {
  const offsetMinutes = -new Date().getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `UTC${sign}${hh}:${mm}`;
}

function getScreens(): string {
  const s = window.screen;
  const dpr = window.devicePixelRatio || 1;
  return `width=${s.width}&height=${s.height}&scaling-factor=${dpr}&colour-depth=${s.colorDepth}`;
}

function getWindowSize(): string {
  return `width=${window.innerWidth}&height=${window.innerHeight}`;
}

function getDoNotTrack(): string {
  const dnt = navigator.doNotTrack ?? (window as unknown as { doNotTrack?: string }).doNotTrack;
  if (dnt === '1' || dnt === 'yes') return 'true';
  if (dnt === '0' || dnt === 'no') return 'false';
  return 'unknown';
}

function getBrowserPlugins(): string {
  try {
    const names = Array.from(navigator.plugins ?? []).map((p) => p.name);
    return names.join(',');
  } catch {
    return '';
  }
}

/**
 * Collect all available browser fraud-prevention signals. Send the result to
 * the hmrc-call-proxy as `fraudPrevention`.
 */
export function collectClientFraudData(): ClientFraudData {
  return {
    deviceId: getOrCreateDeviceId(),
    timezone: getTimezoneOffset(),
    screens: getScreens(),
    windowSize: getWindowSize(),
    browserJsUserAgent: navigator.userAgent,
    doNotTrack: getDoNotTrack(),
    browserPlugins: getBrowserPlugins(),
  };
}
