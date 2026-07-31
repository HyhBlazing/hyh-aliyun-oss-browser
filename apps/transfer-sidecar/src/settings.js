import fs from "fs";
import os from "os";
import path from "path";

const DIR = path.join(os.homedir(), ".hyh-oss-browser");
const FILE = path.join(DIR, "settings.json");

const DEFAULTS = {
  maxUploadJobCount: 50,
  maxDownloadJobCount: 50,
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
  /**
   * 传输历史保留：7d | 30d | permanent
   */
  transferHistoryRetention: "30d",
  /**
   * 上传/下载完成后自动做完整性校验（优先 CRC64，其次 Content-MD5）
   * 不将分片 ETag 当作文件 MD5
   */
  autoVerifyIntegrity: true,
  /** 校验失败时额外重试次数（不含首次） */
  verifyRetryTimes: 2,
  /** 全局搜索默认返回条数上限 */
  searchDefaultLimit: 500,
  /** 每天定时自动增量索引 */
  searchAutoIndexDailyEnabled: false,
  /** 每天执行时间，本地时区 HH:mm */
  searchAutoIndexTime: "03:00",
  /** 登录后若索引过期则自动增量更新 */
  searchAutoIndexOnLogin: false,
  /** 登录自动更新的过期阈值（小时） */
  searchAutoIndexStaleHours: 24,
  /** 上次自动索引日期 YYYY-MM-DD（内部去重，勿在 UI 展示为可编辑项） */
  searchAutoIndexLastRunDate: "",
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
