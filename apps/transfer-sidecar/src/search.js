import { randomUUID } from "crypto";
import {
  clearIndex,
  getIndexStatus,
  indexSearch,
  objectNameAndExt,
  openIndexDb,
  parseLastModifiedMs,
  pruneMissingObjects,
  setIndexMeta,
  upsertObjects,
} from "./search-index.js";
import {
  getCachedBucketRegion,
  listAllBuckets,
  withBucketClient,
} from "./oss.js";
import { loadSettings, saveSettings } from "./settings.js";

/** @type {Map<string, object>} */
const indexJobs = new Map();

export function getIndexJob(jobId) {
  return indexJobs.get(String(jobId)) || null;
}

export function listIndexJobs() {
  return [...indexJobs.values()];
}

/**
 * 无 delimiter 遍历对象
 * @param {*} client
 * @param {{ prefix?: string, onPage?: Function, shouldAbort?: Function }} options
 */
export async function iterateObjects(client, options = {}) {
  const prefix = options.prefix || "";
  let token;
  let scanned = 0;
  do {
    if (options.shouldAbort?.()) throw new Error("已取消");
    const res = await client.listV2({
      prefix: prefix || undefined,
      "max-keys": 1000,
      "continuation-token": token || undefined,
    });
    const objects = [];
    for (const o of res.objects || []) {
      if (!o.name || o.name.endsWith("/")) continue;
      objects.push({
        key: o.name,
        size: Number(o.size) || 0,
        lastModified: o.lastModified,
        storageClass: o.storageClass || o.StorageClass || "",
        etag: o.etag || "",
      });
    }
    scanned += objects.length;
    if (options.onPage) {
      const cont = await options.onPage(objects, {
        scanned,
        isTruncated: !!res.isTruncated,
      });
      if (cont === false) {
        return { scanned, aborted: true };
      }
    }
    token = res.isTruncated ? res.nextContinuationToken : "";
  } while (token);
  return { scanned, aborted: false };
}

function normalizeExt(ext) {
  return String(ext || "")
    .replace(/^\./, "")
    .toLowerCase()
    .trim();
}

function matchFilters(obj, query) {
  const key = String(obj.key || "");
  const { name, ext } = objectNameAndExt(key);
  const size = Number(obj.size) || 0;
  const mtime = parseLastModifiedMs(obj.lastModified ?? obj.last_modified);
  const sc = String(obj.storageClass || obj.storage_class || "");

  if (query.prefix) {
    if (!key.startsWith(String(query.prefix))) return false;
  }
  if (query.name) {
    if (!name.toLowerCase().includes(String(query.name).toLowerCase())) {
      return false;
    }
  }
  if (query.ext) {
    if (ext !== normalizeExt(query.ext)) return false;
  }
  if (query.size_min != null && query.size_min !== "") {
    if (size < Number(query.size_min)) return false;
  }
  if (query.size_max != null && query.size_max !== "") {
    if (size > Number(query.size_max)) return false;
  }
  if (query.mtime_from != null && query.mtime_from !== "") {
    if (mtime < Number(query.mtime_from)) return false;
  }
  if (query.mtime_to != null && query.mtime_to !== "") {
    if (mtime > Number(query.mtime_to)) return false;
  }
  if (query.storage_class) {
    if (sc !== String(query.storage_class)) return false;
  }
  return true;
}

function toResultItem(bucket, obj, region = "") {
  const key = String(obj.key || "");
  const { name, ext } = objectNameAndExt(key);
  return {
    bucket,
    key,
    name,
    size: Number(obj.size) || 0,
    last_modified: parseLastModifiedMs(
      obj.lastModified ?? obj.last_modified,
    ),
    storage_class: String(obj.storageClass || obj.storage_class || ""),
    etag: String(obj.etag || "").replace(/"/g, ""),
    ext,
    region: region || getCachedBucketRegion(bucket) || "",
  };
}

async function resolveBucketList(auth, client, buckets) {
  if (Array.isArray(buckets) && buckets.length) {
    return buckets.map(String).filter(Boolean);
  }
  const list = await listAllBuckets(client);
  return list.map((b) => b.name).filter(Boolean);
}

/**
 * 即时搜索：ListObjects 流式过滤，不写索引
 */
export async function liveSearch(auth, serviceClient, query = {}, options = {}) {
  const settings = loadSettings();
  const defaultLimit = Number(settings.searchDefaultLimit) || 500;
  const limit = Math.min(
    5000,
    Math.max(1, Number(query.limit) || defaultLimit),
  );
  const shouldAbort =
    typeof options.shouldAbort === "function"
      ? options.shouldAbort
      : () => false;
  const bucketNames = await resolveBucketList(
    auth,
    serviceClient,
    query.buckets,
  );
  const items = [];
  let truncated = false;
  let scanned = 0;

  for (const bucket of bucketNames) {
    if (shouldAbort()) throw new Error("已取消");
    if (items.length >= limit) {
      truncated = true;
      break;
    }
    await withBucketClient(
      auth,
      bucket,
      query.region || "",
      serviceClient,
      async (client, region) => {
        await iterateObjects(client, {
          prefix: query.prefix || "",
          shouldAbort,
          onPage: async (objects) => {
            if (shouldAbort()) throw new Error("已取消");
            scanned += objects.length;
            for (const o of objects) {
              if (!matchFilters(o, query)) continue;
              items.push(toResultItem(bucket, o, region));
              if (items.length >= limit) {
                truncated = true;
                return false;
              }
            }
            return true;
          },
        });
      },
    );
  }

  return {
    items,
    truncated,
    scanned,
    total_matched: items.length,
    mode: "live",
  };
}

/**
 * 索引模式搜索
 */
export function searchFromIndex(auth, query = {}) {
  const settings = loadSettings();
  const defaultLimit = Number(settings.searchDefaultLimit) || 500;
  const db = openIndexDb(auth);
  return indexSearch(db, {
    ...query,
    limit: Math.min(5000, Math.max(1, Number(query.limit) || defaultLimit)),
  });
}

export function getSearchIndexStatus(auth) {
  const db = openIndexDb(auth);
  return getIndexStatus(db, auth);
}

export function clearSearchIndex(auth, buckets = null) {
  const db = openIndexDb(auth);
  clearIndex(db, buckets);
  return getIndexStatus(db, auth);
}

/**
 * 启动建索引 / 增量更新任务（逻辑相同：全量对齐 upsert + prune）
 * @returns {{ job_id: string }}
 */
export function startIndexBuild(auth, serviceClient, options = {}) {
  const jobId = randomUUID();
  const job = {
    id: jobId,
    status: "running",
    scanned: 0,
    upserted: 0,
    current_bucket: "",
    current_bucket_scanned: 0,
    current_bucket_estimate: 0,
    buckets_done: 0,
    buckets_total: 0,
    progress: 0,
    error: "",
    auto: !!options.auto,
    auto_reason: options.auto ? String(options.autoReason || "auto") : "",
    started_at: Date.now(),
    finished_at: null,
  };
  indexJobs.set(jobId, job);

  const refreshProgress = () => {
    if (job.status === "done") {
      job.progress = 100;
      return;
    }
    const total = Number(job.buckets_total) || 0;
    if (!total) {
      job.progress = job.status === "running" ? 1 : 0;
      return;
    }
    const done = Number(job.buckets_done) || 0;
    const estimate = Number(job.current_bucket_estimate) || 0;
    const scannedInBucket = Number(job.current_bucket_scanned) || 0;
    let frac = 0;
    if (estimate > 0) {
      frac = Math.min(0.99, scannedInBucket / estimate);
    } else if (scannedInBucket > 0) {
      // 未知总量时用渐近估计，避免卡在 0%
      frac = Math.min(0.9, 1 - 1 / (1 + scannedInBucket / 1500));
    }
    job.progress = Math.min(99, Math.round(((done + frac) / total) * 100));
  };

  (async () => {
    try {
      const db = openIndexDb(auth);
      const bucketNames = await resolveBucketList(
        auth,
        serviceClient,
        options.buckets,
      );
      job.buckets_total = bucketNames.length;
      refreshProgress();

      for (const bucket of bucketNames) {
        if (job.status === "cancelled") break;
        job.current_bucket = bucket;
        job.current_bucket_scanned = 0;
        const prevMeta = db
          .prepare(
            "SELECT object_count FROM index_meta WHERE bucket = ? LIMIT 1",
          )
          .get(bucket);
        job.current_bucket_estimate = Number(prevMeta?.object_count) || 0;
        refreshProgress();

        setIndexMeta(db, bucket, {
          objectCount:
            Number(
              db
                .prepare(
                  "SELECT COUNT(*) AS c FROM objects WHERE bucket = ?",
                )
                .get(bucket)?.c,
            ) || 0,
          lastIndexedAt: Date.now(),
          status: "indexing",
        });

        const seen = new Set();
        let upserted = 0;
        await withBucketClient(
          auth,
          bucket,
          options.region || "",
          serviceClient,
          async (client) => {
            await iterateObjects(client, {
              prefix: options.prefix || "",
              shouldAbort: () => job.status === "cancelled",
              onPage: async (objects) => {
                job.scanned = (job.scanned || 0) + objects.length;
                job.current_bucket_scanned =
                  (job.current_bucket_scanned || 0) + objects.length;
                refreshProgress();
                if (!objects.length) return true;
                upsertObjects(db, bucket, objects, seen);
                upserted += objects.length;
                job.upserted = (job.upserted || 0) + objects.length;
                return true;
              },
            });
          },
        );

        if (job.status === "cancelled") break;

        // 仅无 prefix 全桶扫描时 prune；带 prefix 的局部建索引不删其它 key
        if (!options.prefix) {
          pruneMissingObjects(db, bucket, seen);
        }
        const countRow = db
          .prepare("SELECT COUNT(*) AS c FROM objects WHERE bucket = ?")
          .get(bucket);
        setIndexMeta(db, bucket, {
          objectCount: Number(countRow?.c) || upserted,
          lastIndexedAt: Date.now(),
          status: "ready",
        });
        job.buckets_done += 1;
        job.current_bucket_scanned = 0;
        job.current_bucket_estimate = 0;
        refreshProgress();
      }

      if (job.status === "cancelled") {
        job.error = "已取消";
      } else {
        job.status = "done";
        job.progress = 100;
      }
    } catch (err) {
      job.status = "failed";
      job.error = err?.message || String(err);
    } finally {
      job.finished_at = Date.now();
      job.current_bucket = "";
      if (job.status === "done") job.progress = 100;
      if (
        job.auto &&
        (job.status === "failed" || job.status === "cancelled")
      ) {
        try {
          const s = loadSettings();
          if (s.searchAutoIndexLastRunDate === localDateKey()) {
            saveSettings({ searchAutoIndexLastRunDate: "" });
          }
        } catch {
          /* ignore */
        }
      }
    }
  })();

  return { job_id: jobId };
}

export function cancelIndexJob(jobId) {
  const job = indexJobs.get(String(jobId));
  if (!job) return false;
  if (job.status === "running") job.status = "cancelled";
  return true;
}

/** 最近一次自动索引任务（用于前端提示） */
export function getLatestAutoIndexJob() {
  let latest = null;
  for (const job of indexJobs.values()) {
    if (!job?.auto) continue;
    if (
      !latest ||
      Number(job.started_at || 0) > Number(latest.started_at || 0)
    ) {
      latest = job;
    }
  }
  return latest;
}

function hasRunningIndexJob() {
  for (const job of indexJobs.values()) {
    if (job.status === "running") return true;
  }
  return false;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function localDateKey(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseHhMm(raw) {
  const m = String(raw || "")
    .trim()
    .match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return { hour: 3, minute: 0 };
  const hour = Math.min(23, Math.max(0, Number(m[1]) || 0));
  const minute = Math.min(59, Math.max(0, Number(m[2]) || 0));
  return { hour, minute };
}

function markAutoIndexRanToday() {
  saveSettings({ searchAutoIndexLastRunDate: localDateKey() });
}

/**
 * 触发自动增量索引（全部 Bucket）
 * @param {{ auth: object, client: object } | null} ctx
 * @param {{ reason?: string }} meta
 */
export function tryStartAutoIndex(ctx, meta = {}) {
  if (!ctx?.auth || !ctx?.client) return null;
  if (hasRunningIndexJob()) return null;
  try {
    // 先占坑，避免 30s 调度在任务启动瞬间重复拉起
    markAutoIndexRanToday();
    const data = startIndexBuild(ctx.auth, ctx.client, {
      buckets: [],
      region: "",
      prefix: "",
      auto: true,
      autoReason: meta.reason || "auto",
    });
    console.log(
      `[search] auto index started (${meta.reason || "schedule"}) job=${data.job_id}`,
    );
    return data;
  } catch (err) {
    // 启动失败则允许同日重试
    try {
      saveSettings({ searchAutoIndexLastRunDate: "" });
    } catch {
      /* ignore */
    }
    console.warn("[search] auto index failed", err?.message || err);
    return null;
  }
}

/**
 * 定时 / 登录后自动索引检查
 * @param {() => ({ auth: object, client: object } | null)} getContext
 * @param {{ reason?: "tick" | "login" }} options
 */
export function tickSearchAutoIndex(getContext, options = {}) {
  const settings = loadSettings();
  const ctx = typeof getContext === "function" ? getContext() : null;
  if (!ctx?.auth || !ctx?.client) return;

  const reason = options.reason || "tick";
  const today = localDateKey();
  const alreadyToday = settings.searchAutoIndexLastRunDate === today;

  if (settings.searchAutoIndexDailyEnabled) {
    const { hour, minute } = parseHhMm(settings.searchAutoIndexTime);
    const now = new Date();
    const due = new Date(now);
    due.setHours(hour, minute, 0, 0);
    if (now >= due && !alreadyToday) {
      tryStartAutoIndex(ctx, { reason: "daily" });
      return;
    }
  }

  if (reason === "login" && settings.searchAutoIndexOnLogin) {
    if (alreadyToday && settings.searchAutoIndexDailyEnabled) {
      // 当天已跑过定时任务则不再因登录重复
      return;
    }
    const status = getSearchIndexStatus(ctx.auth);
    const last = Number(status?.last_indexed_at) || 0;
    const staleHours = Math.max(
      1,
      Number(settings.searchAutoIndexStaleHours) || 24,
    );
    const staleMs = staleHours * 60 * 60 * 1000;
    if (!last || Date.now() - last >= staleMs) {
      tryStartAutoIndex(ctx, { reason: "login" });
    }
  }
}

let autoIndexTimer = null;

/** 启动自动索引调度（进程内每 30 秒检查一次） */
export function startSearchAutoIndexScheduler(getContext) {
  if (autoIndexTimer) return;
  autoIndexTimer = setInterval(() => {
    try {
      tickSearchAutoIndex(getContext, { reason: "tick" });
    } catch (err) {
      console.warn("[search] auto index tick error", err?.message || err);
    }
  }, 30_000);
  setTimeout(() => {
    try {
      tickSearchAutoIndex(getContext, { reason: "tick" });
    } catch {
      /* ignore */
    }
  }, 8_000);
}
