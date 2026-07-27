import fs from "fs";
import os from "os";
import path from "path";

const DIR = path.join(os.homedir(), ".hyh-oss-browser");
const FILE = path.join(DIR, "settings.json");

const DEFAULTS = {
  maxUploadJobCount: 50,
  maxDownloadJobCount: 100,
  overwriteSameName: true,
  connectTimeout: 60000,
  uploadPartSize: 10,
  downloadConcurrecyPartSize: 5,
  uploadAndDownloadRetryTimes: 5,
  listObjectNum: 500,
  allowInsecureTls: false,
  /** 是否启用网络代理（不影响本机与 sidecar 通信） */
  proxyEnabled: false,
  /**
   * 代理地址，支持：
   * - http://127.0.0.1:7890
   * - https://user:pass@host:8080
   * - socks5://127.0.0.1:1080
   * - socks5h://127.0.0.1:1080
   */
  proxyUrl: "",
  // showImageThumbnail: client-only (localStorage hyh-oss-show-thumb), not persisted here
};

export function loadSettings() {
  try {
    if (!fs.existsSync(FILE)) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(FILE, "utf8")) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(partial) {
  fs.mkdirSync(DIR, { recursive: true });
  const next = { ...loadSettings(), ...partial };
  fs.writeFileSync(FILE, JSON.stringify(next, null, 2));
  return next;
}
