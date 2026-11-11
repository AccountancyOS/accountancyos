import "@testing-library/jest-dom";

// Browser shims apply only under jsdom; a few tests (e.g. build-config) run in the node environment.
if (typeof window !== "undefined") Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// Silence noisy router future-flag warnings during tests
const origWarn = console.warn;
console.warn = (...args: unknown[]) => {
  const msg = String(args[0] ?? "");
  if (msg.includes("React Router Future Flag")) return;
  origWarn(...(args as []));
};