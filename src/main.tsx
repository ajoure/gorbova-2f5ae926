// Diagnostic logs for iOS debugging (runs BEFORE React)
console.info('[Main] Starting React app');
console.info('[Main] pathname:', window.location.pathname);
console.info('[Main] search:', window.location.search);
console.info('[Main] userAgent:', navigator.userAgent);
console.info('[Main] inIframe:', (() => { try { return window.self !== window.top; } catch { return true; } })());

// Set global build marker for diagnostics
(window as any).__BUILD_MARKER__ = "ios-ultra-early-guard-v8";
console.info('[Main] build marker:', (window as any).__BUILD_MARKER__);

import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Force Vite cache invalidation
createRoot(document.getElementById("root")!).render(<App />);
