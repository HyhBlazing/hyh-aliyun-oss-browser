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

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

function copyDir(from, to, filter) {
  fs.mkdirSync(to, { recursive: true });
  for (const name of fs.readdirSync(from)) {
    if (filter && !filter(name, from)) continue;
    const src = path.join(from, name);
    const dst = path.join(to, name);
    const st = fs.statSync(src);
    if (st.isDirectory()) copyDir(src, dst, filter);
    else fs.copyFileSync(src, dst);
  }
}

function main() {
  if (!fs.existsSync(path.join(SRC, "package.json"))) {
    throw new Error("missing transfer-sidecar package.json");
  }

  const install = spawnSync(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["install", "--omit=dev"],
    { cwd: SRC, stdio: "inherit", shell: true },
  );
  if (install.status !== 0) {
    throw new Error("npm install --omit=dev failed for transfer-sidecar");
  }

  rmrf(DEST);
  fs.mkdirSync(DEST, { recursive: true });

  for (const file of ["package.json", "package-lock.json"]) {
    const p = path.join(SRC, file);
    if (fs.existsSync(p)) fs.copyFileSync(p, path.join(DEST, file));
  }

  copyDir(path.join(SRC, "src"), path.join(DEST, "src"));
  copyDir(path.join(SRC, "node_modules"), path.join(DEST, "node_modules"));

  console.log("prepared sidecar resources at", DEST);
}

main();
