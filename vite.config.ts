import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// The app talks to exactly one Supabase project, chosen by environment — never by a value baked
// into this file. A build without all three variables is a misconfigured build, so it fails here,
// loudly, instead of silently shipping a bundle that points somewhere else.
const REQUIRED_ENV = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PROJECT_ID",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
] as const;

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // .env / .env.local / .env.[mode] files, overridden by real environment variables (e.g. Vercel).
  const env = { ...loadEnv(mode, process.cwd(), "VITE_"), ...process.env };
  const missing = REQUIRED_ENV.filter((k) => !env[k] || String(env[k]).trim() === "");
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(", ")}. ` +
        "Set them in .env.local (see .env.example) or in the hosting environment.",
    );
  }

  return {
    server: {
      host: "::",
      port: 8080,
    },
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
