/**
 * Update GitHub repo About: description, homepage, topics.
 * Uses git credential token; never prints secrets.
 */
const { spawnSync } = require("child_process");
const https = require("https");

const OWNER = "HyhBlazing";
const REPO = "hyh-aliyun-oss-browser";

function getToken() {
  const r = spawnSync("git", ["credential", "fill"], {
    input: "protocol=https\nhost=github.com\n\n",
    encoding: "utf8",
  });
  if (r.status !== 0) throw new Error("git credential fill failed");
  const m = (r.stdout || "").match(/^password=(.+)$/m);
  if (!m) throw new Error("no github token");
  return m[1].trim();
}

function request(method, urlPath, token, body) {
  return new Promise((resolve, reject) => {
    const data = body == null ? null : Buffer.from(JSON.stringify(body));
    const req = https.request(
      {
        hostname: "api.github.com",
        path: urlPath,
        method,
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "User-Agent": "oss-browser-meta-script",
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
          const text = Buffer.concat(chunks).toString("utf8");
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(text ? JSON.parse(text) : {});
          } else {
            reject(new Error(`${method} ${urlPath} -> ${res.statusCode}: ${text.slice(0, 400)}`));
          }
        });
      }
    );
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

async function main() {
  const token = getToken();

  await request("PATCH", `/repos/${OWNER}/${REPO}`, token, {
    description:
      "非官方阿里云 OSS 桌面客户端｜基于 aliyun/oss-browser 定制｜Apache-2.0｜Windows/macOS/Linux",
    homepage: `https://github.com/${OWNER}/${REPO}/releases`,
    has_issues: true,
    has_projects: false,
    has_wiki: false,
  });

  await request("PUT", `/repos/${OWNER}/${REPO}/topics`, token, {
    names: [
      "aliyun",
      "oss",
      "oss-browser",
      "tauri",
      "vue",
      "object-storage",
      "desktop-app",
      "apache-2",
      "chinese",
      "bucket",
      "s3-compatible",
    ],
  });

  console.log("repo metadata updated");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
