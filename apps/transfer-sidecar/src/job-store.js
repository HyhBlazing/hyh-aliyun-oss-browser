import fs from "fs";
import os from "os";
import path from "path";

const DIR = path.join(os.homedir(), ".hyh-oss-browser", "transfer");
const JOBS_FILE = path.join(DIR, "jobs.json");
const HISTORY_FILE = path.join(DIR, "history.jsonl");
const PARTS_DIR = path.join(DIR, "parts");

const STORE_VERSION = 1;

/** @type {number|null} */
let persistTimer = null;
let dirty = false;

export function transferDataDir() {
  return DIR;
}

export function partsDirForJob(jobId) {
  return path.join(PARTS_DIR, String(jobId));
}

export function ensureTransferDirs() {
  fs.mkdirSync(DIR, { recursive: true });
  fs.mkdirSync(PARTS_DIR, { recursive: true });
}

/**
 * 可序列化字段（去掉运行时标志）
 */
export function serializeJob(job) {
  if (!job) return null;
  return {
    id: job.id,
    type: job.type,
    status: job.status,
    progress: job.progress || 0,
    loaded: job.loaded || 0,
    size: job.size || 0,
    speed: 0,
    error: job.error || "",
    bucket: job.bucket || "",
    region: job.region || "",
    key: job.key || "",
    localPath: job.localPath || "",
    accountId: job.accountId || "",
    createdAt: job.createdAt || Date.now(),
    updatedAt: Date.now(),
    finishedAt: job.finishedAt || null,
    fileFingerprint: job.fileFingerprint || null,
    checkpoint: sanitizeCheckpoint(job.checkpoint),
    downloadParts: job.downloadParts || null,
    moveParams: job.moveParams || null,
    autoResume: job.autoResume !== false,
    retryCount: job.retryCount || 0,
  };
}

function sanitizeCheckpoint(cp) {
  if (!cp || typeof cp !== "object") return null;
  return {
    file: cp.file,
    name: cp.name,
    fileSize: cp.fileSize,
    partSize: cp.partSize,
    uploadId: cp.uploadId,
    doneParts: Array.isArray(cp.doneParts)
      ? cp.doneParts.map((p) => ({ number: p.number, etag: p.etag }))
      : [],
  };
}

export function fileFingerprint(localPath) {
  try {
    const st = fs.statSync(localPath);
    return {
      size: st.size,
      mtimeMs: Math.floor(st.mtimeMs),
    };
  } catch {
    return null;
  }
}

export function fingerprintMatches(fp, localPath) {
  if (!fp || !localPath) return false;
  const cur = fileFingerprint(localPath);
  if (!cur) return false;
  return Number(fp.size) === Number(cur.size) && Number(fp.mtimeMs) === Number(cur.mtimeMs);
}

export function loadJobsFromDisk() {
  ensureTransferDirs();
  try {
    if (!fs.existsSync(JOBS_FILE)) return [];
    const raw = JSON.parse(fs.readFileSync(JOBS_FILE, "utf8"));
    const list = Array.isArray(raw?.jobs) ? raw.jobs : Array.isArray(raw) ? raw : [];
    return list.filter((j) => j && j.id && j.type);
  } catch {
    return [];
  }
}

/**
 * 同步写入活动任务（finished 不进 jobs.json，进 history）
 */
export function saveJobsToDisk(jobs) {
  ensureTransferDirs();
  const active = [];
  for (const job of jobs) {
    if (!job || job.removed) continue;
    if (job.status === "finished") continue;
    const row = serializeJob(job);
    // 落盘时 running → stopped，重启后可安全续传
    if (row.status === "running" || row.status === "waiting") {
      row.status = "stopped";
      row.error = row.error || "应用退出后待续传";
    }
    active.push(row);
  }
  const payload = {
    version: STORE_VERSION,
    updatedAt: Date.now(),
    jobs: active,
  };
  const tmp = `${JOBS_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2));
  fs.renameSync(tmp, JOBS_FILE);
  dirty = false;
}

export function schedulePersist(getJobs, delayMs = 800) {
  dirty = true;
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      saveJobsToDisk(typeof getJobs === "function" ? getJobs() : getJobs);
    } catch (e) {
      console.warn("[job-store] persist failed", e?.message || e);
    }
  }, delayMs);
}

export function flushPersist(getJobs) {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  try {
    saveJobsToDisk(typeof getJobs === "function" ? getJobs() : getJobs);
  } catch (e) {
    console.warn("[job-store] flush failed", e?.message || e);
  }
}

export function appendHistory(job) {
  if (!job) return;
  ensureTransferDirs();
  const row = {
    ...serializeJob(job),
    status: job.status || "finished",
    finishedAt: job.finishedAt || Date.now(),
  };
  // 历史不保留大体积 checkpoint / 分片细节
  delete row.checkpoint;
  delete row.downloadParts;
  delete row.moveParams;
  fs.appendFileSync(HISTORY_FILE, `${JSON.stringify(row)}\n`);
}

export function loadHistory({ limit = 500, accountId = "" } = {}) {
  ensureTransferDirs();
  if (!fs.existsSync(HISTORY_FILE)) return [];
  try {
    const text = fs.readFileSync(HISTORY_FILE, "utf8");
    const lines = text.split("\n").filter(Boolean);
    const out = [];
    for (let i = lines.length - 1; i >= 0 && out.length < limit; i--) {
      try {
        const row = JSON.parse(lines[i]);
        if (accountId && row.accountId && row.accountId !== accountId) continue;
        out.push(row);
      } catch {
        /* skip bad line */
      }
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * @param {"7d"|"30d"|"permanent"} retention
 */
export function pruneHistory(retention = "30d") {
  if (retention === "permanent") return { removed: 0 };
  const days = retention === "7d" ? 7 : 30;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  if (!fs.existsSync(HISTORY_FILE)) return { removed: 0 };

  const text = fs.readFileSync(HISTORY_FILE, "utf8");
  const lines = text.split("\n").filter(Boolean);
  const kept = [];
  let removed = 0;
  for (const line of lines) {
    try {
      const row = JSON.parse(line);
      const ts = Number(row.finishedAt || row.updatedAt || row.createdAt || 0);
      if (ts && ts < cutoff) {
        removed += 1;
        continue;
      }
      kept.push(line);
    } catch {
      removed += 1;
    }
  }
  if (removed > 0) {
    const tmp = `${HISTORY_FILE}.tmp`;
    fs.writeFileSync(tmp, kept.length ? `${kept.join("\n")}\n` : "");
    fs.renameSync(tmp, HISTORY_FILE);
  }
  return { removed };
}

export function removePartsDir(jobId) {
  const dir = partsDirForJob(jobId);
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

export function exportJobsPayload(jobs) {
  return {
    version: STORE_VERSION,
    exportedAt: Date.now(),
    jobs: jobs.map(serializeJob).filter(Boolean),
  };
}

export function isDirty() {
  return dirty;
}
