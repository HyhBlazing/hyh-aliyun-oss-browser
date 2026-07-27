/**
 * Copy transfer-sidecar into Tauri resources for release packaging.
 * Includes node_modules so installed apps can run without npm install.
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "apps", "transfer-sidecar");
const DEST = path.join(
  ROOT,
  "apps",
  "desktop",
  "src-tauri",
  "resources",
  "transfer-sidecar",
);

function main() {
  if (!fs.existsSync(path.join(SRC, "package.json"))) {
    throw new Error("missing transfer-sidecar package.json");
  }

  console.log("installing transfer-sidecar production deps...");
  const install = spawnSync(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["install", "--omit=dev"],
    { cwd: SRC, stdio: "inherit", shell: true },
  );
  if (install.status !== 0) {
    throw new Error("npm install --omit=dev failed for transfer-sidecar");
  }

  console.log("copying sidecar resources...");
  fs.rmSync(DEST, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(DEST), { recursive: true });
  fs.cpSync(SRC, DEST, {
    recursive: true,
    filter: (srcPath) => {
      const base = path.basename(srcPath);
      if (base === ".git" || base === "coverage" || base === ".nyc_output") {
        return false;
      }
      return true;
    },
  });

  console.log("prepared sidecar resources at", DEST);
}

main();
