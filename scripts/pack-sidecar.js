/**
 * Placeholder packager for Node sidecar.
 * Dev/prod currently spawn node apps/transfer-sidecar/src/index.js.
 * For SEA/pkg binary packaging, extend this script and re-enable
 * tauri.conf.json bundle.externalBin.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const outDir = path.join(root, "apps/desktop/src-tauri/binaries");
fs.mkdirSync(outDir, { recursive: true });
const readme = [
  "# Sidecar binaries",
  "",
  "Place platform-specific transfer-sidecar-$TARGET_TRIPLE executables here",
  "when enabling Tauri externalBin packaging.",
  "",
  "Until then, the desktop app starts the sidecar via local Node:",
  "apps/transfer-sidecar/src/index.js",
  "",
].join("\n");
fs.writeFileSync(path.join(outDir, "README.md"), readme);
console.log("sidecar pack placeholder ready:", outDir);
