/**
 * Download latest successful Build 3.x Desktop workflow artifacts
 * and upload installers to an existing GitHub Release.
 *
 * Env:
 *   RELEASE_TAG=v3.0.3
 *   WORKFLOW_RUN_ID=optional explicit run id
 *
 * Uses git credential token; never prints secrets.
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const https = require("https");
const { execSync } = require("child_process");

const OWNER = "HyhBlazing";
const REPO = "hyh-aliyun-oss-browser";
const TAG = process.env.RELEASE_TAG || "v3.0.3";
const WORKFLOW_NAME = "Build 3.x Desktop";
const ROOT = path.join(__dirname, "..");
const TMP = path.join(ROOT, ".release-ci-tmp");

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

function request(method, urlPath, token, body, accept) {
  return new Promise((resolve, reject) => {
    const data = body == null ? null : Buffer.from(JSON.stringify(body));
    const req = https.request(
      {
        hostname: "api.github.com",
        path: urlPath,
        method,
        headers: {
          Accept: accept || "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "User-Agent": "oss-browser-ci-upload",
          "X-GitHub-Api-Version": "2022-11-28",
          ...(data
            ? {
                "Content-Type": "application/json",
                "Content-Length": data.length,
              }
            : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ status: res.statusCode, buf, headers: res.headers });
          } else {
            reject(
              new Error(
                `${method} ${urlPath} -> ${res.statusCode}: ${buf.toString("utf8").slice(0, 400)}`,
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

function requestJson(method, urlPath, token, body) {
  return request(method, urlPath, token, body).then((r) =>
    r.buf.length ? JSON.parse(r.buf.toString("utf8")) : {},
  );
}

function downloadToFile(urlPath, token, dest) {
  return new Promise((resolve, reject) => {
    const go = (hostname, pathName, redirects) => {
      const req = https.request(
        {
          hostname,
          path: pathName,
          method: "GET",
          headers: {
            // artifact zip download needs github+json, then follow redirect to S3
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${token}`,
            "User-Agent": "oss-browser-ci-upload",
            "X-GitHub-Api-Version": "2022-11-28",
          },
        },
        (res) => {
          if (
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            res.headers.location &&
            redirects < 5
          ) {
            const u = new URL(res.headers.location);
            // redirect to storage usually needs no auth / octet-stream
            const req2 = https.request(
              {
                hostname: u.hostname,
                path: u.pathname + u.search,
                method: "GET",
                headers: { "User-Agent": "oss-browser-ci-upload" },
              },
              (res2) => {
                if (
                  res2.statusCode >= 300 &&
                  res2.statusCode < 400 &&
                  res2.headers.location &&
                  redirects < 5
                ) {
                  const u2 = new URL(res2.headers.location);
                  return go(u2.hostname, u2.pathname + u2.search, redirects + 1);
                }
                if (res2.statusCode < 200 || res2.statusCode >= 300) {
                  reject(new Error(`download redirect -> ${res2.statusCode}`));
                  return;
                }
                const out = fs.createWriteStream(dest);
                res2.pipe(out);
                out.on("finish", () => resolve(dest));
                out.on("error", reject);
              },
            );
            req2.on("error", reject);
            req2.end();
            return;
          }
          if (res.statusCode < 200 || res.statusCode >= 300) {
            const chunks = [];
            res.on("data", (c) => chunks.push(c));
            res.on("end", () =>
              reject(
                new Error(
                  `download ${urlPath} -> ${res.statusCode}: ${Buffer.concat(chunks).toString("utf8").slice(0, 300)}`,
                ),
              ),
            );
            return;
          }
          const out = fs.createWriteStream(dest);
          res.pipe(out);
          out.on("finish", () => resolve(dest));
          out.on("error", reject);
        },
      );
      req.on("error", reject);
      req.end();
    };
    go("api.github.com", urlPath, 0);
  });
}

function contentTypeFor(filePath) {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".msi")) return "application/x-msi";
  if (lower.endsWith(".exe"))
    return "application/vnd.microsoft.portable-executable";
  if (lower.endsWith(".dmg")) return "application/x-apple-diskimage";
  if (lower.endsWith(".deb")) return "application/vnd.debian.binary-package";
  if (lower.endsWith(".rpm")) return "application/x-rpm";
  if (lower.endsWith(".appimage")) return "application/octet-stream";
  return "application/octet-stream";
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
          "User-Agent": "oss-browser-ci-upload",
          "Content-Type": contentTypeFor(filePath),
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
              new Error(`upload ${name} -> ${res.statusCode}: ${text.slice(0, 400)}`),
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

function walkFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walkFiles(full, out);
    else out.push(full);
  }
  return out;
}

function isInstaller(filePath) {
  return /\.(msi|exe|dmg|deb|rpm|AppImage)$/i.test(filePath);
}

function rmrf(p) {
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
}

async function main() {
  const token = getToken();
  const version = TAG.replace(/^v/, "");

  const release = await requestJson(
    "GET",
    `/repos/${OWNER}/${REPO}/releases/tags/${TAG}`,
    token,
  );
  console.log("release:", release.html_url);

  let runId = process.env.WORKFLOW_RUN_ID;
  if (!runId) {
    const runs = await requestJson(
      "GET",
      `/repos/${OWNER}/${REPO}/actions/workflows/build-desktop-v3.yml/runs?event=push&per_page=10`,
      token,
    );
    const match = (runs.workflow_runs || []).find(
      (r) =>
        (r.head_branch === TAG || (r.head_sha && release.target_commitish)) &&
        (r.status === "completed" ? r.conclusion === "success" : true),
    );
    // Prefer successful completed run for this tag
    const byTag = (runs.workflow_runs || []).filter(
      (r) => r.head_branch === TAG || r.display_title?.includes(TAG),
    );
    const success = byTag.find(
      (r) => r.status === "completed" && r.conclusion === "success",
    );
    const pending = byTag.find((r) => r.status !== "completed");
    if (success) runId = String(success.id);
    else if (pending) {
      throw new Error(
        `CI still running for ${TAG}: run ${pending.id} status=${pending.status}. Wait and retry.`,
      );
    } else if (match && match.conclusion === "success") {
      runId = String(match.id);
    } else {
      throw new Error(
        `No successful CI run found for ${TAG}. Push the tag and wait for workflow.`,
      );
    }
  }
  console.log("workflow run:", runId);

  const arts = await requestJson(
    "GET",
    `/repos/${OWNER}/${REPO}/actions/runs/${runId}/artifacts?per_page=50`,
    token,
  );
  const artifacts = arts.artifacts || [];
  if (!artifacts.length) throw new Error("no artifacts on workflow run");

  rmrf(TMP);
  fs.mkdirSync(TMP, { recursive: true });

  const installers = [];
  for (const art of artifacts) {
    if (art.expired) continue;
    const zipPath = path.join(TMP, `${art.name}.zip`);
    console.log("download artifact", art.name);
    await downloadToFile(
      `/repos/${OWNER}/${REPO}/actions/artifacts/${art.id}/zip`,
      token,
      zipPath,
    );
    const extractDir = path.join(TMP, art.name);
    fs.mkdirSync(extractDir, { recursive: true });
    // PowerShell Expand-Archive on Windows; unzip elsewhere
    if (process.platform === "win32") {
      execSync(
        `powershell -NoProfile -Command "Expand-Archive -Force -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${extractDir.replace(/'/g, "''")}'"`,
        { stdio: "inherit" },
      );
    } else {
      execSync(`unzip -o "${zipPath}" -d "${extractDir}"`, { stdio: "inherit" });
    }
    for (const f of walkFiles(extractDir)) {
      if (isInstaller(f) && (f.includes(version) || f.includes(`_${version}_`) || true)) {
        // Prefer files that mention version; still accept platform installers
        if (/\.(msi|exe|dmg|deb|rpm|AppImage)$/i.test(f)) installers.push(f);
      }
    }
  }

  const unique = [];
  const seen = new Set();
  for (const f of installers) {
    const base = path.basename(f);
    if (seen.has(base)) continue;
    seen.add(base);
    unique.push(f);
  }
  if (!unique.length) throw new Error("no installer files found in artifacts");
  console.log(
    "installers:",
    unique.map((f) => path.basename(f)).join(", "),
  );

  const existingNames = new Set((release.assets || []).map((a) => a.name));
  for (const file of unique) {
    const base = path.basename(file);
    if (existingNames.has(base)) {
      console.log("skip existing", base);
      continue;
    }
    await uploadAsset(release.upload_url, token, file);
  }

  rmrf(TMP);
  console.log("done:", release.html_url);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
