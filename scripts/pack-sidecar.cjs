/**
 * Bundle transfer-sidecar into a standalone binary for Tauri externalBin.
 * Output: apps/desktop/src-tauri/binaries/transfer-sidecar-<triple>[.exe]
 * Packaged apps then run without a system Node.js install.
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const SIDECAR = path.join(ROOT, "apps", "transfer-sidecar");
const OUT_DIR = path.join(ROOT, "apps", "desktop", "src-tauri", "binaries");
const BUNDLE_JS = path.join(SIDECAR, "dist", "sidecar.cjs");

function runNpm(args, cwd) {
  const cmd = process.platform === "win32" ? "npm.cmd" : "npm";
  const r = spawnSync(cmd, args, { cwd, stdio: "inherit", shell: true });
  if (r.status !== 0) throw new Error(`npm ${args.join(" ")} failed`);
}

function rustTargetTriple() {
  const fromEnv =
    process.env.TAURI_ENV_TARGET_TRIPLE ||
    process.env.CARGO_CFG_TARGET_TRIPLE ||
    process.env.TARGET;
  if (fromEnv) return fromEnv.trim();

  const r = spawnSync("rustc", ["-vV"], { encoding: "utf8", shell: true });
  if (r.status === 0) {
    const m = String(r.stdout || "").match(/host:\s*(\S+)/);
    if (m) return m[1];
  }

  if (process.platform === "win32") {
    return process.arch === "arm64"
      ? "aarch64-pc-windows-msvc"
      : "x86_64-pc-windows-msvc";
  }
  if (process.platform === "darwin") {
    return process.arch === "arm64"
      ? "aarch64-apple-darwin"
      : "x86_64-apple-darwin";
  }
  return process.arch === "arm64"
    ? "aarch64-unknown-linux-gnu"
    : "x86_64-unknown-linux-gnu";
}

function pkgTarget(triple) {
  if (triple.includes("windows")) {
    if (triple.startsWith("aarch64")) return "node22-win-arm64";
    return "node22-win-x64";
  }
  if (triple.includes("apple-darwin") || triple.includes("macos")) {
    if (triple.startsWith("aarch64")) return "node22-macos-arm64";
    return "node22-macos-x64";
  }
  if (triple.startsWith("aarch64")) return "node22-linux-arm64";
  return "node22-linux-x64";
}

async function bundleWithEsbuild() {
  runNpm(["install", "--no-save", "esbuild@0.25.5"], SIDECAR);
  const esbuild = require(path.join(SIDECAR, "node_modules", "esbuild"));
  await esbuild.build({
    entryPoints: [path.join(SIDECAR, "src", "index.js")],
    bundle: true,
    platform: "node",
    target: "node22",
    format: "cjs",
    outfile: BUNDLE_JS,
    packages: "bundle",
    logLevel: "warning",
  });
}

function packWithPkg(triple, outPath) {
  runNpm(["install", "--no-save", "@yao-pkg/pkg@6.6.0"], SIDECAR);
  const pkgBin = path.join(
    SIDECAR,
    "node_modules",
    "@yao-pkg",
    "pkg",
    "lib-es5",
    "bin.js",
  );
  const pkgCli = fs.existsSync(pkgBin)
    ? pkgBin
    : path.join(SIDECAR, "node_modules", "@yao-pkg", "pkg", "bin", "pkg.js");

  const pkgOutBase = path.join(OUT_DIR, `transfer-sidecar-${triple}`);
  fs.rmSync(outPath, { force: true });
  fs.rmSync(pkgOutBase, { force: true });
  fs.rmSync(`${pkgOutBase}.exe`, { force: true });

  const r = spawnSync(
    process.execPath,
    [
      pkgCli,
      BUNDLE_JS,
      "--targets",
      pkgTarget(triple),
      "--output",
      pkgOutBase,
      "--compress",
      "GZip",
    ],
    { cwd: SIDECAR, stdio: "inherit" },
  );
  if (r.status !== 0) throw new Error("pkg failed");

  const candidates = [pkgOutBase, `${pkgOutBase}.exe`];
  const produced = candidates.find((p) => fs.existsSync(p));
  if (!produced) {
    throw new Error(
      "pkg output missing. binaries: " + fs.readdirSync(OUT_DIR).join(", "),
    );
  }
  if (path.resolve(produced) !== path.resolve(outPath)) {
    fs.renameSync(produced, outPath);
  }
}

function triplesToPack() {
  if (process.env.PACK_SIDECAR_TRIPLES) {
    return process.env.PACK_SIDECAR_TRIPLES.split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  // Tauri universal macOS needs both arm64 and x64 sidecar binaries.
  if (
    process.env.PACK_UNIVERSAL === "1" ||
    process.argv.includes("--universal")
  ) {
    return ["aarch64-apple-darwin", "x86_64-apple-darwin"];
  }
  return [rustTargetTriple()];
}

function packOne(triple) {
  const isWin = triple.includes("windows");
  const outName = `transfer-sidecar-${triple}${isWin ? ".exe" : ""}`;
  const outPath = path.join(OUT_DIR, outName);
  console.log("pkg binary for", triple, "->", outName);
  packWithPkg(triple, outPath);
  const st = fs.statSync(outPath);
  console.log(
    "sidecar binary ready:",
    outPath,
    `(${Math.round(st.size / 1024 / 1024)} MB)`,
  );
}

async function main() {
  const triples = triplesToPack();
  console.log("packing sidecar for", triples.join(", "));

  runNpm(["install", "--omit=dev"], SIDECAR);
  fs.mkdirSync(path.join(SIDECAR, "dist"), { recursive: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log("esbuild bundle...");
  await bundleWithEsbuild();
  if (!fs.existsSync(BUNDLE_JS)) {
    throw new Error("esbuild did not produce " + BUNDLE_JS);
  }

  for (const triple of triples) {
    packOne(triple);
  }

  fs.writeFileSync(
    path.join(OUT_DIR, "README.md"),
    [
      "# Sidecar binaries",
      "",
      "Generated by `node scripts/pack-sidecar.cjs` before `tauri build`.",
      "Tauri `bundle.externalBin` expects:",
      "",
      "  transfer-sidecar-<rust-target-triple>[.exe]",
      "",
      "For macOS universal builds, pack both:",
      "  aarch64-apple-darwin and x86_64-apple-darwin",
      "  (set PACK_UNIVERSAL=1).",
      "",
      "Do not commit these binaries.",
      "",
    ].join("\n"),
  );
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
