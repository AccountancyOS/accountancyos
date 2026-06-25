import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { installGlobalErrorOverlay } from "./lib/global-error-overlay";

// Surfaces uncaught/async/module errors on screen even when React renders blank
// (error boundaries can't catch those). Diagnostic for the portal banking crash.
installGlobalErrorOverlay();

createRoot(document.getElementById("root")!).render(<App />);
