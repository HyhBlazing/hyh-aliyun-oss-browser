/**
 * Create GitHub release v2.0.0 and upload assets.
 * Uses git credential manager token; never prints secrets.
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const https = require("https");

const OWNER = "HyhBlazing";
const REPO = "hyh-aliyun-oss-browser";
const TAG = "v2.0.0";
const NAME = "v2.0.0";
const ROOT = path.join(__dirname, "..");
const ASSETS = [
  "oss-browser-win32-x64.zip",
  "oss-browser-win32-ia32.zip",
  "oss-browser-linux-x64.zip",
  "oss-browser-darwin-x64.zip",
].map((f) => path.join(ROOT, "releases", "2.0.0", f));

function getToken() {
  const r = spawnSync("git", ["credential", "fill"], {
    input: "protocol=https\nhost=github.com\n\n",
    encoding: "utf8",
  });
  if (r.status !== 0) throw new Error("git credential fill failed");
  const m = (r.stdout || "").match(/^password=(.+)$/m);
  if (!m) throw new Error("no github password/token found");
  return m[1].trim();
}

function request(method, urlPath, token, body, headers) {
  return new Promise((resolve, reject) => {
    const data =
      body == null
        ? null
        : Buffer.isBuffer(body)
          ? body
          : Buffer.from(JSON.stringify(body));
    const req = https.request(
      {
        hostname: "api.github.com",
        path: urlPath,
        method,
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "User-Agent": "oss-browser-release-script",
          "X-GitHub-Api-Version": "2022-11-28",
          ...(data
            ? {
                "Content-Type":
                  headers && headers["Content-Type"]
                    ? headers["Content-Type"]
                    : "application/json",
                "Content-Length": data.length,
              }
            : {}),
          ...(headers || {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try {
            json = text ? JSON.parse(text) : null;
          } catch (e) {
            json = { raw: text };
          }
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ status: res.statusCode, json });
          } else {
            reject(
              new Error(
                `${method} ${urlPath} -> ${res.statusCode}: ${text.slice(0, 500)}`,
              ),
            );
          }
        });
      },
    );
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

function uploadAsset(uploadUrlTemplate, token, filePath) {
  const name = path.basename(filePath);
  const buf = fs.readFileSync(filePath);
  const url = new URL(
    uploadUrlTemplate.replace("{?name,label}", "") +
      `?name=${encodeURIComponent(name)}`,
  );
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "User-Agent": "oss-browser-release-script",
          "Content-Type": "application/zip",
          "Content-Length": buf.length,
          "X-GitHub-Api-Version": "2022-11-28",
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          if (res.statusCode >= 200 && res.statusCode < 300) {
            console.log("uploaded", name, buf.length, "bytes");
            resolve(JSON.parse(text));
          } else {
            reject(
              new Error(
                `upload ${name} -> ${res.statusCode}: ${text.slice(0, 500)}`,
              ),
            );
          }
        });
      },
    );
    req.on("error", reject);
    req.write(buf);
    req.end();
  });
}

async function main() {
  for (const f of ASSETS) {
    if (!fs.existsSync(f)) throw new Error("missing asset: " + f);
  }

  const token = getToken();
  const notes = fs.readFileSync(
    path.join(ROOT, "release-notes", "2.0.0.zh-CN.md"),
    "utf8",
  );

  let release;
  try {
    const existing = await request(
      "GET",
      `/repos/${OWNER}/${REPO}/releases/tags/${TAG}`,
      token,
    );
    release = existing.json;
    console.log("release already exists:", release.html_url);
  } catch (e) {
    const created = await request(
      "POST",
      `/repos/${OWNER}/${REPO}/releases`,
      token,
      {
        tag_name: TAG,
        name: NAME,
        body: notes,
        draft: false,
        prerelease: false,
      },
    );
    release = created.json;
    console.log("created release:", release.html_url);
  }

  const existingNames = new Set((release.assets || []).map((a) => a.name));

  for (const file of ASSETS) {
    const base = path.basename(file);
    if (existingNames.has(base)) {
      console.log("skip existing asset", base);
      continue;
    }
    await uploadAsset(release.upload_url, token, file);
  }

  console.log("done");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
