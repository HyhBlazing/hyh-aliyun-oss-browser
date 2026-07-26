/**
 * Cross-platform package script for Windows host.
 * Usage: node scripts/package-release.js
 */
const path = require("path");
const fs = require("fs");
const { spawnSync } = require("child_process");
const archiver = require("archiver");

const ROOT = path.join(__dirname, "..");
const VERSION = "2.0.0";
const NAME = "oss-browser";
const CUSTOM = path.join(ROOT, "custom");
const DIST = path.join(ROOT, "dist");
const BUILD = path.join(ROOT, "build");
const RELEASES = path.join(ROOT, "releases", VERSION);
const ELECTRON_VERSION = "1.8.4";
const PKGER = path.join(ROOT, "node_modules", "electron-packager", "cli.js");

process.env.ELECTRON_MIRROR =
  process.env.ELECTRON_MIRROR ||
  "https://npmmirror.com/mirrors/electron/";

function run(cmd, args, opts) {
  console.log("\n>", cmd, args.join(" "));
  const r = spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: "inherit",
    shell: false,
    windowsVerbatimArguments: false,
    env: process.env,
    ...opts,
  });
  if (r.status !== 0) {
    throw new Error(`Command failed: ${cmd} ${args.join(" ")}`);
  }
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function copyDir(src, dest) {
  ensureDir(dest);
  for (const name of fs.readdirSync(src)) {
    const s = path.join(src, name);
    const d = path.join(dest, name);
    const st = fs.statSync(s);
    if (st.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function zipDir(srcDir, destZip) {
  return new Promise((resolve, reject) => {
    ensureDir(path.dirname(destZip));
    if (fs.existsSync(destZip)) fs.unlinkSync(destZip);
    const output = fs.createWriteStream(destZip);
    const archive = archiver("zip", { zlib: { level: 9 } });
    output.on("close", () => {
      console.log("zipped", destZip, archive.pointer(), "bytes");
      resolve();
    });
    archive.on("error", reject);
    archive.pipe(output);
    archive.directory(srcDir, false);
    archive.finalize();
  });
}

async function packageOne(platform, arch, icon, retries) {
  const folderName = `${NAME}-${platform}-${arch}`;
  const zipPath = path.join(RELEASES, `${folderName}.zip`);
  if (fs.existsSync(zipPath) && fs.statSync(zipPath).size > 1000000) {
    console.log("skip existing", zipPath);
    return zipPath;
  }

  const args = [
    PKGER,
    DIST,
    NAME,
    "--platform=" + platform,
    "--arch=" + arch,
    "--asar",
    "--asar-unpack=*.node",
    "--overwrite",
    "--out=" + BUILD,
    "--version=" + ELECTRON_VERSION,
    "--app-version=" + VERSION,
  ];
  if (icon) args.push("--icon=" + icon);

  let lastErr;
  const max = retries || 3;
  for (let i = 1; i <= max; i++) {
    try {
      run("node", args);
      lastErr = null;
      break;
    } catch (err) {
      lastErr = err;
      console.warn(`attempt ${i}/${max} failed, retrying...`);
      if (i < max) {
        // switch mirror once
        if (i === 1) {
          process.env.ELECTRON_MIRROR =
            "https://cdn.npmmirror.com/binaries/electron/";
        } else if (i === 2) {
          delete process.env.ELECTRON_MIRROR;
          process.env.ELECTRON_GET_USE_PROXY = "false";
        }
      }
    }
  }
  if (lastErr) throw lastErr;

  const outDir = path.join(BUILD, folderName);

  if (platform === "darwin") {
    const resources = path.join(
      outDir,
      `${NAME}.app`,
      "Contents",
      "Resources"
    );
    copyDir(CUSTOM, path.join(resources, "custom"));
  } else {
    copyDir(CUSTOM, path.join(outDir, "resources", "custom"));
  }

  await zipDir(outDir, zipPath);
  return zipPath;
}

async function main() {
  if (!fs.existsSync(DIST)) {
    throw new Error("dist/ missing, run gulp build first");
  }
  ensureDir(RELEASES);

  const targets = [
    { platform: "win32", arch: "x64", icon: path.join(CUSTOM, "icon.ico") },
    { platform: "win32", arch: "ia32", icon: path.join(CUSTOM, "icon.ico") },
    { platform: "linux", arch: "x64", icon: path.join(CUSTOM, "icon.png") },
    { platform: "darwin", arch: "x64", icon: path.join(CUSTOM, "icon.icns") },
  ];

  const zips = [];
  for (const t of targets) {
    console.log(`\n===== packaging ${t.platform}-${t.arch} =====`);
    zips.push(await packageOne(t.platform, t.arch, t.icon));
  }

  console.log("\nDone. Release files:");
  zips.forEach((z) => console.log(" -", z));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
