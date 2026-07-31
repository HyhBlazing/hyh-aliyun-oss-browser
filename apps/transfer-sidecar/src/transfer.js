import EventEmitter from "events";
import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";
import {
  createBucketClient,
  getCachedBucketRegion,
  moveOrCopyObjects,
} from "./oss.js";
import { chineseErr } from "./errors.js";
import { loadSettings } from "./settings.js";
import { multipartUploadWithContentMd5 } from "./upload-md5.js";
import { resumableDownload } from "./download-resume.js";
import { assertIntegrity } from "./integrity.js";
import {
  appendHistory,
  exportJobsPayload,
  fileFingerprint,
  fingerprintMatches,
  flushPersist,
  loadHistory,
  loadJobsFromDisk,
  pruneHistory,
  removePartsDir,
  schedulePersist,
  serializeJob,
} from "./job-store.js";

function isAuthError(err) {
  const msg = String(err?.message || err?.code || "");
  const status = Number(err?.status || err?.statusCode || 0);
  return (
    status === 403 ||
    /InvalidAccessKeyId|SignatureDoesNotMatch|SecurityTokenExpired|AccessDenied|RequestTimeTooSkewed|InvalidSecurityToken/i.test(
      msg,
    )
  );
}

function isTransientError(err) {
  if (isAuthError(err)) return false;
  const msg = String(err?.message || err?.code || "");
  const status = Number(err?.status || err?.statusCode || 0);
  return (
    status === 408 ||
    status === 429 ||
    status >= 500 ||
    /ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up|network|timeout|TLS|ECONNREFUSED/i.test(
      msg,
    )
  );
}

export class TransferManager extends EventEmitter {
  constructor(getState) {
    super();
    this.getState = getState;
    this.jobs = new Map();
    this.runningUpload = 0;
    this.runningDownload = 0;
    this.runningMove = 0;
    this._networkTimer = null;
    this._restored = false;
    /** 按类型串行化入队，避免并发请求把同一批对象建两份任务 */
    this._enqueueChains = {
      upload: Promise.resolve(),
      download: Promise.resolve(),
      move: Promise.resolve(),
    };
    this.restoreFromDisk();
    this.startNetworkWatcher();
  }

  accountId() {
    return String(this.getState()?.auth?.id || "");
  }

  /** 串行执行入队，同类型互斥 */
  _withEnqueueLock(kind, fn) {
    const chain = this._enqueueChains[kind] || Promise.resolve();
    const next = chain.then(fn, fn);
    this._enqueueChains[kind] = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  list() {
    return [...this.jobs.values()].map((j) => ({ ...j }));
  }

  persistSoon() {
    schedulePersist(() => this.jobs.values());
  }

  flushToDisk() {
    // 暂停所有运行中的任务标志，便于落盘为 stopped
    for (const job of this.jobs.values()) {
      if (job.status === "running") {
        job.aborted = true;
      }
    }
    flushPersist(() => this.jobs.values());
  }

  restoreFromDisk() {
    if (this._restored) return;
    this._restored = true;
    const settings = loadSettings();
    pruneHistory(settings.transferHistoryRetention || "30d");

    const rows = loadJobsFromDisk();
    for (const row of rows) {
      if (!row?.id || this.jobs.has(row.id)) continue;
      const job = {
        ...row,
        status:
          row.status === "finished"
            ? "finished"
            : row.status === "failed"
              ? "failed"
              : "stopped",
        progress: Number(row.progress) || 0,
        loaded: Number(row.loaded) || 0,
        size: Number(row.size) || 0,
        speed: 0,
        aborted: false,
        removed: false,
        error: row.error || "待续传",
        autoResume: row.autoResume !== false,
      };
      this.jobs.set(job.id, job);
    }
    this.dedupeAllTransferJobs();
    if (rows.length) {
      this.emit("snapshot", { list: this.list() });
    }
  }

  /** 登录后：匹配当前账号的任务自动进入 waiting 并泵送 */
  onAuthReady() {
    const aid = this.accountId();
    let changed = false;
    for (const job of this.jobs.values()) {
      if (
        job.status === "finished" ||
        job.status === "running" ||
        job.status === "verifying"
      ) {
        continue;
      }
      if (job.accountId && aid && job.accountId !== aid) continue;
      if (!job.accountId && aid) job.accountId = aid;
      if (
        job.autoResume !== false &&
        (job.status === "stopped" || job.status === "failed") &&
        (!job.error ||
          /待续传|网络|超时|重试|凭证|AccessKey|token/i.test(job.error))
      ) {
        // 失败且为瞬时/凭证类，或明确待续传 → 自动继续
        if (job.status === "stopped" || isLikelyAutoResumeError(job.error)) {
          job.aborted = false;
          job.status = "waiting";
          job.error = "";
          changed = true;
        }
      }
    }
    if (changed) {
      this.emit("snapshot", { list: this.list() });
      this.persistSoon();
      this.pump();
    }
  }

  startNetworkWatcher() {
    if (this._networkTimer) return;
    this._networkTimer = setInterval(() => {
      try {
        this.tryNetworkResume();
      } catch {
        /* ignore */
      }
    }, 15000);
    if (typeof this._networkTimer.unref === "function") {
      this._networkTimer.unref();
    }
  }

  tryNetworkResume() {
    const { auth } = this.getState();
    if (!auth) return;
    let changed = false;
    for (const job of this.jobs.values()) {
      if (job.status !== "failed") continue;
      if (!isLikelyAutoResumeError(job.error)) continue;
      if (job.accountId && job.accountId !== this.accountId()) continue;
      job.aborted = false;
      job.status = "waiting";
      job.error = "";
      changed = true;
    }
    if (changed) {
      this.emit("snapshot", { list: this.list() });
      this.persistSoon();
      this.pump();
    }
  }

  pause(id) {
    const job = this.jobs.get(id);
    if (!job || job.status === "finished") return;
    job.status = "stopped";
    job.aborted = true;
    job.autoResume = false;
    this.emitProgress(job);
    this.persistSoon();
  }

  resume(id) {
    const job = this.jobs.get(id);
    if (!job || job.status === "finished" || job.status === "verifying") return;
    job.aborted = false;
    job.autoResume = true;
    job.status = "waiting";
    job.error = "";
    this.emitProgress(job);
    this.persistSoon();
    this.pump();
  }

  remove(id) {
    const job = this.jobs.get(id);
    if (!job) return false;
    job.aborted = true;
    job.removed = true;
    this.jobs.delete(id);
    removePartsDir(id);
    this.emit("removed", { id });
    this.persistSoon();
    return true;
  }

  /** 移除同 type+bucket+key 的旧任务 */
  removeJobsForObjectKey(type, bucket, key) {
    const ids = [];
    for (const job of [...this.jobs.values()]) {
      if (job.type !== type) continue;
      if (job.bucket !== bucket || job.key !== key) continue;
      if (this.remove(job.id)) ids.push(job.id);
    }
    return ids;
  }

  removeUploadJobsForKey(bucket, key) {
    return this.removeJobsForObjectKey("upload", bucket, key);
  }

  removeDownloadJobsForKey(bucket, key) {
    return this.removeJobsForObjectKey("download", bucket, key);
  }

  /** 同 type+bucket 下同 key 只保留最新一条 */
  dedupeJobsByObjectKey(type, bucket) {
    const best = new Map();
    for (const job of [...this.jobs.values()]) {
      if (job.type !== type || job.bucket !== bucket) continue;
      const key = String(job.key || "");
      const prev = best.get(key);
      if (!prev) {
        best.set(key, job);
        continue;
      }
      const newer =
        Number(job.createdAt || 0) >= Number(prev.createdAt || 0) ? job : prev;
      const older = newer === job ? prev : job;
      this.remove(older.id);
      best.set(key, newer);
    }
  }

  dedupeUploadJobsByKey(bucket) {
    this.dedupeJobsByObjectKey("upload", bucket);
  }

  dedupeDownloadJobsByKey(bucket) {
    this.dedupeJobsByObjectKey("download", bucket);
  }

  /** 清理重复的上传/下载任务 */
  dedupeAllTransferJobs() {
    const uploadBuckets = new Set();
    const downloadBuckets = new Set();
    for (const job of this.jobs.values()) {
      if (!job.bucket) continue;
      if (job.type === "upload") uploadBuckets.add(job.bucket);
      if (job.type === "download") downloadBuckets.add(job.bucket);
    }
    for (const bucket of uploadBuckets) this.dedupeUploadJobsByKey(bucket);
    for (const bucket of downloadBuckets) this.dedupeDownloadJobsByKey(bucket);
  }

  /** @deprecated 兼容旧调用 */
  dedupeAllUploadJobs() {
    this.dedupeAllTransferJobs();
  }

  /** type: upload|download|move|all；onlyFinished 仅清已完成；move 含 copy */
  clear({ type = "all", onlyFinished = false } = {}) {
    const ids = [];
    for (const job of [...this.jobs.values()]) {
      if (type === "move") {
        if (job.type !== "move" && job.type !== "copy") continue;
      } else if (type !== "all" && job.type !== type) {
        continue;
      }
      if (onlyFinished && job.status !== "finished") continue;
      if (this.remove(job.id)) ids.push(job.id);
    }
    this.emit("snapshot", { list: this.list() });
    flushPersist(() => this.jobs.values());
    return ids;
  }

  async enqueueUpload({
    bucket,
    prefix,
    localPaths,
    region,
    overwriteSameName,
  }) {
    const run = async () => {
      const settings = loadSettings();
      const overwrite =
        typeof overwriteSameName === "boolean"
          ? overwriteSameName
          : settings.overwriteSameName !== false;
      const r = region || getCachedBucketRegion(bucket);
      const { auth, client: serviceClient } = this.getState();
      if (!auth) throw new Error("请先登录");
      const client = overwrite
        ? null
        : await createBucketClient(auth, bucket, r, serviceClient);

      // 归一化并去重路径，避免选择器/拖放传入重复项
      const uniquePaths = [];
      const seenRoots = new Set();
      for (const localPath of localPaths || []) {
        if (!localPath) continue;
        const absRoot = path.resolve(String(localPath));
        const rootKey =
          process.platform === "win32" ? absRoot.toLowerCase() : absRoot;
        if (seenRoots.has(rootKey)) continue;
        if (!fs.existsSync(absRoot)) continue;
        seenRoots.add(rootKey);
        uniquePaths.push(absRoot);
      }
      const seenLocal = new Set();
      const seenKeys = new Set();
      const jobs = [];
      let skipped = 0;

      for (const localPath of uniquePaths) {
        const files = walkFiles(localPath);
        // 目录：相对父路径，保留顶层文件夹名；文件：相对所在目录，仅保留文件名
        const base = path.dirname(localPath);
        for (const file of files) {
          const abs = path.resolve(file);
          const absKey = process.platform === "win32" ? abs.toLowerCase() : abs;
          if (seenLocal.has(absKey)) continue;
          const rel = path.relative(base, file).split(path.sep).join("/");
          if (!rel || rel.startsWith("..")) continue;
          const key = `${prefix || ""}${rel}`.replace(/^\//, "");
          if (seenKeys.has(key)) continue;
          const size = fs.statSync(file).size;

          if (!overwrite && client) {
            try {
              const head = await client.head(key);
              const remoteSize = Number(
                head.res?.headers?.["content-length"] ?? head.size ?? NaN,
              );
              if (Number.isFinite(remoteSize) && remoteSize === size) {
                skipped += 1;
                seenLocal.add(absKey);
                seenKeys.add(key);
                continue;
              }
            } catch (err) {
              if (!isNotFoundErr(err)) throw err;
            }
          }

          seenLocal.add(absKey);
          seenKeys.add(key);
          this.removeUploadJobsForKey(bucket, key);
          const job = this.createJob({
            type: "upload",
            bucket,
            region: r,
            key,
            localPath: file,
            size,
            fileFingerprint: fileFingerprint(file),
          });
          jobs.push(job);
        }
      }
      // 并发兜底：同 key 只留一条
      this.dedupeUploadJobsByKey(bucket);
      const uniqueJobs = jobs.filter((j) => this.jobs.has(j.id));
      if (!uniqueJobs.length && !skipped) {
        throw new Error("没有可上传的文件");
      }
      this.persistSoon();
      this.pump();
      return { jobs: uniqueJobs, skipped };
    };

    return this._withEnqueueLock("upload", run);
  }

  async enqueueMoveCopy({
    bucket,
    keys = [],
    toBucket,
    toPrefix = "",
    fromPrefix = "",
    region,
    toRegion,
    isCopy = false,
  }) {
    return this._withEnqueueLock("move", async () => {
      const uniqKeys = [
        ...new Set(
          (keys || []).map((k) => String(k || "").trim()).filter(Boolean),
        ),
      ];
      if (!bucket || !uniqKeys.length) throw new Error("参数不完整");
      const destBucket = toBucket || bucket;
      const type = isCopy ? "copy" : "move";
      const action = isCopy ? "复制" : "移动";
      const label =
        uniqKeys.length === 1 ? String(uniqKeys[0]) : `${uniqKeys.length} 项`;
      const destLabel = `oss://${destBucket}/${toPrefix || ""}`;
      const job = this.createJob({
        type,
        bucket,
        region: region || getCachedBucketRegion(bucket),
        key: `${action} ${label} → ${destLabel}`,
        localPath: "",
        size: 0,
        moveParams: {
          bucket,
          keys: uniqKeys,
          toBucket: destBucket,
          toPrefix: toPrefix || "",
          fromPrefix: fromPrefix || "",
          region: region || "",
          toRegion: toRegion || region || "",
          isCopy: !!isCopy,
        },
      });
      this.persistSoon();
      this.pump();
      return { jobs: [job] };
    });
  }

  async enqueueDownload({ bucket, keys, localDir, region, stripPrefix = "" }) {
    return this._withEnqueueLock("download", async () => {
      const jobs = [];
      const r = region || getCachedBucketRegion(bucket);
      const { auth, client: serviceClient } = this.getState();
      if (!auth) throw new Error("请先登录");
      const client = await createBucketClient(auth, bucket, r, serviceClient);
      const base = String(stripPrefix || "");
      const seenKeys = new Set();
      const inputKeys = [
        ...new Set(
          (keys || []).map((k) => String(k || "").trim()).filter(Boolean),
        ),
      ];

      const toLocal = (objectKey) => {
        let rel = String(objectKey);
        if (base && rel.startsWith(base)) rel = rel.slice(base.length);
        rel = rel.replace(/^\/+/, "");
        if (!rel) rel = objectKey.split("/").pop() || "download.bin";
        return path.join(localDir, ...rel.split("/").filter(Boolean));
      };

      const addDownloadJob = (objectKey, size = 0) => {
        const key = String(objectKey || "");
        if (!key || key.endsWith("/") || seenKeys.has(key)) return false;
        seenKeys.add(key);
        this.removeDownloadJobsForKey(bucket, key);
        jobs.push(
          this.createJob({
            type: "download",
            bucket,
            region: r,
            key,
            localPath: toLocal(key),
            size: size || 0,
          }),
        );
        return true;
      };

      for (const key of inputKeys) {
        if (String(key).endsWith("/")) {
          let token;
          let found = 0;
          do {
            const res = await client.listV2({
              prefix: key,
              "max-keys": 1000,
              "continuation-token": token || undefined,
            });
            for (const o of res.objects || []) {
              if (!o.name || o.name.endsWith("/")) continue;
              if (addDownloadJob(o.name, o.size || 0)) found += 1;
            }
            token = res.isTruncated ? res.nextContinuationToken : "";
          } while (token);
          if (!found) {
            const dirPath = toLocal(key);
            fs.mkdirSync(dirPath, { recursive: true });
          }
        } else {
          addDownloadJob(key, 0);
        }
      }
      this.dedupeDownloadJobsByKey(bucket);
      const uniqueJobs = jobs.filter((j) => this.jobs.has(j.id));
      if (!uniqueJobs.length) {
        throw new Error("没有可下载的对象");
      }
      this.persistSoon();
      this.pump();
      return uniqueJobs;
    });
  }

  async downloadNow({ bucket, keys, localDir, region, stripPrefix = "" }) {
    // 走任务队列，前端传输面板可看到每个文件进度；完成后返回本地路径供拖出/剪贴板
    const jobs = await this.enqueueDownload({
      bucket,
      keys,
      localDir,
      region,
      stripPrefix,
    });
    const ids = jobs.map((j) => j.id);
    const base = String(stripPrefix || "");
    const toLocal = (objectKey) => {
      let rel = String(objectKey);
      if (base && rel.startsWith(base)) rel = rel.slice(base.length);
      rel = rel.replace(/^\/+/, "");
      if (!rel) rel = objectKey.split("/").pop() || "download.bin";
      return path.join(localDir, ...rel.split("/").filter(Boolean));
    };

    const waitMs = 30 * 60 * 1000;
    const started = Date.now();
    await new Promise((resolve, reject) => {
      const tick = () => {
        if (Date.now() - started > waitMs) {
          clearInterval(timer);
          reject(new Error("下载超时，请改用下载按钮"));
          return;
        }
        let pending = 0;
        let errMsg = "";
        for (const id of ids) {
          const job = this.jobs.get(id);
          if (!job) {
            pending += 1;
            continue;
          }
          if (job.status === "failed") {
            errMsg = job.error || "下载失败";
            break;
          }
          if (job.status === "stopped") {
            errMsg = job.error || "下载已取消";
            break;
          }
          // 落盘后进入校验/完成即可用于拖出
          if (job.status === "finished" || job.status === "verifying") continue;
          if (
            Number(job.progress) >= 100 &&
            job.localPath &&
            fs.existsSync(job.localPath)
          ) {
            continue;
          }
          pending += 1;
        }
        if (errMsg) {
          clearInterval(timer);
          reject(new Error(errMsg));
          return;
        }
        if (pending === 0) {
          clearInterval(timer);
          resolve();
        }
      };
      const timer = setInterval(tick, 150);
      tick();
    });

    const rootItems = [];
    for (const key of keys || []) {
      const k = String(key || "").trim();
      if (!k) continue;
      rootItems.push(toLocal(k));
    }
    const filePaths = [];
    for (const job of jobs) {
      const lp = job.localPath;
      if (lp && fs.existsSync(lp)) {
        try {
          fsyncPath(lp);
        } catch {
          /* ignore */
        }
        filePaths.push(lp);
      }
    }
    if (!rootItems.length && !filePaths.length) {
      throw new Error("没有可下载的对象");
    }
    return {
      paths: rootItems.length ? rootItems : filePaths,
      files: filePaths,
    };
  }

  createJob(partial) {
    const job = {
      id: uuid(),
      status: "waiting",
      progress: 0,
      loaded: 0,
      speed: 0,
      error: "",
      aborted: false,
      autoResume: true,
      accountId: this.accountId(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...partial,
    };
    this.jobs.set(job.id, job);
    this.emitProgress(job);
    return job;
  }

  emitProgress(job) {
    if (!job || job.removed || !this.jobs.has(job.id)) return;
    job.updatedAt = Date.now();
    // 高频进度节流，状态变化与 100% 必发，避免大批量时 SSE 积压导致完成数落后
    if (!this._emitThrottle) this._emitThrottle = new Map();
    const prev = this._emitThrottle.get(job.id) || {};
    const now = Date.now();
    const statusChanged = prev.status !== job.status;
    const reachedDone =
      Number(job.progress) >= 100 && Number(prev.progress || 0) < 100;
    if (!statusChanged && !reachedDone && now - (prev.at || 0) < 250) {
      return;
    }
    this._emitThrottle.set(job.id, {
      status: job.status,
      progress: job.progress,
      at: now,
    });
    this.emit("progress", { ...job });
    this.persistSoon();
  }

  pump() {
    const settings = loadSettings();
    const { auth } = this.getState();
    if (!auth) return;

    for (const job of this.jobs.values()) {
      if (job.status !== "waiting") continue;
      if (job.accountId && job.accountId !== this.accountId()) continue;
      if (
        job.type === "upload" &&
        this.runningUpload >= settings.maxUploadJobCount
      ) {
        continue;
      }
      if (
        job.type === "download" &&
        this.runningDownload >= settings.maxDownloadJobCount
      ) {
        continue;
      }
      if (
        (job.type === "move" || job.type === "copy") &&
        this.runningMove >= 2
      ) {
        continue;
      }
      this.runJob(job).catch(() => {});
    }
  }

  async runJob(job) {
    const { auth } = this.getState();
    if (!auth) return;
    if (job.accountId && job.accountId !== this.accountId()) {
      job.status = "stopped";
      job.error = "账号不匹配，已暂停。请使用原账号登录后继续";
      this.emitProgress(job);
      return;
    }
    if (!job.accountId) job.accountId = this.accountId();

    job.status = "running";
    job.aborted = false;
    let slotReleased = false;
    const releaseSlot = () => {
      if (slotReleased) return;
      slotReleased = true;
      if (job.type === "upload")
        this.runningUpload = Math.max(0, this.runningUpload - 1);
      else if (job.type === "download") {
        this.runningDownload = Math.max(0, this.runningDownload - 1);
      } else if (job.type === "move" || job.type === "copy") {
        this.runningMove = Math.max(0, this.runningMove - 1);
      }
    };
    if (job.type === "upload") this.runningUpload += 1;
    else if (job.type === "download") this.runningDownload += 1;
    else if (job.type === "move" || job.type === "copy") this.runningMove += 1;
    this.emitProgress(job);

    const settings = loadSettings();
    const { client: serviceClient } = this.getState();
    let client = null;
    if (job.type === "upload" || job.type === "download") {
      client = await createBucketClient(
        { ...auth, timeout: settings.connectTimeout },
        job.bucket,
        job.region || getCachedBucketRegion(job.bucket),
        serviceClient,
      );
    }

    try {
      const retries = Math.max(
        0,
        Number(settings.uploadAndDownloadRetryTimes) || 0,
      );
      let attempt = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        try {
          // 每次重试刷新 client，便于凭证更新后继续
          if (job.type === "upload" || job.type === "download") {
            const st = this.getState();
            if (!st.auth) throw new Error("请先登录");
            client = await createBucketClient(
              { ...st.auth, timeout: settings.connectTimeout },
              job.bucket,
              job.region || getCachedBucketRegion(job.bucket),
              st.client,
            );
          }
          await this.executeTransfer(job, client, settings);
          break;
        } catch (err) {
          if (job.aborted || /已暂停/.test(err?.message || "")) throw err;
          if (isAuthError(err)) {
            job.status = "failed";
            job.error = "凭证失效，请重新登录或更换 AccessKey 后点击继续";
            job.autoResume = true;
            throw err;
          }
          if (attempt >= retries) throw err;
          attempt += 1;
          job.retryCount = attempt;
          job.error = `重试中 (${attempt}/${retries})：${chineseErr(err)}`;
          this.emitProgress(job);
          await new Promise((r) =>
            setTimeout(r, Math.min(8000, 800 * attempt)),
          );
          job.error = "";
        }
      }
      if (job.aborted) {
        job.status = "stopped";
      } else {
        job.progress = 100;
        job.speed = 0;
        job.error = "";
        // 传输完成后先释放并发槽位，完整性校验不再占用「进行中」名额
        releaseSlot();
        this.pump();

        const needVerify =
          (job.type === "upload" || job.type === "download") &&
          settings.autoVerifyIntegrity !== false &&
          client &&
          job.localPath;
        if (needVerify) {
          job.status = "verifying";
          this.emitProgress(job);
          await this.verifyAfterTransfer(job, client, settings);
        }
        if (job.aborted) {
          job.status = "stopped";
        } else {
          job.status = "finished";
          job.progress = 100;
          job.error = "";
          job.finishedAt = Date.now();
          job.checkpoint = null;
          job.downloadParts = null;
          appendHistory(job);
          removePartsDir(job.id);
        }
      }
    } catch (err) {
      if (job.aborted || /已暂停/.test(err.message || "")) {
        job.status = "stopped";
      } else if (
        !job.error ||
        job.status === "running" ||
        job.status === "verifying"
      ) {
        job.status = "failed";
        job.error = chineseErr(err);
        if (isTransientError(err) || isAuthError(err)) {
          job.autoResume = true;
        }
      }
    } finally {
      releaseSlot();
      if (!job.removed && this.jobs.has(job.id)) {
        this.emitProgress(job);
      }
      if (this._emitThrottle) this._emitThrottle.delete(job.id);
      this.persistSoon();
      this.pump();
    }
  }

  async executeTransfer(job, client, settings) {
    let lastLoaded = job.loaded || 0;
    let lastAt = Date.now();

    const updateSpeed = (loaded) => {
      const now = Date.now();
      const dt = Math.max(1, now - lastAt) / 1000;
      const dl = Math.max(0, loaded - lastLoaded);
      job.speed = Math.round(dl / dt);
      lastLoaded = loaded;
      lastAt = now;
    };

    if (job.type === "upload") {
      if (!fs.existsSync(job.localPath)) {
        throw new Error("本地文件不存在，无法续传");
      }
      // 文件变化则作废 UploadId
      if (job.checkpoint?.uploadId) {
        if (
          job.fileFingerprint &&
          !fingerprintMatches(job.fileFingerprint, job.localPath)
        ) {
          job.checkpoint = null;
          job.progress = 0;
          job.loaded = 0;
          job.error = "本地文件已变化，已重新上传";
        } else {
          const st = fs.statSync(job.localPath);
          if (
            job.checkpoint.fileSize &&
            Number(job.checkpoint.fileSize) !== st.size
          ) {
            job.checkpoint = null;
            job.progress = 0;
            job.loaded = 0;
          } else {
            job.checkpoint.file = job.localPath;
          }
        }
      }
      job.fileFingerprint = fileFingerprint(job.localPath);
      job.size = job.fileFingerprint?.size || job.size;

      try {
        await multipartUploadWithContentMd5(client, job.key, job.localPath, {
          partSize: (settings.uploadPartSize || 10) * 1024 * 1024,
          timeout: settings.connectTimeout,
          checkpoint: job.checkpoint,
          progress: async (p, checkpoint) => {
            if (job.aborted || job.removed || !this.jobs.has(job.id)) {
              throw new Error("已暂停");
            }
            job.progress = Math.floor(p * 100);
            job.loaded = Math.floor((job.size || 0) * p);
            if (checkpoint) job.checkpoint = checkpoint;
            updateSpeed(job.loaded);
            this.emitProgress(job);
          },
        });
      } catch (err) {
        // UploadId 在服务端已失效：清空后整文件重传
        if (
          job.checkpoint?.uploadId &&
          /NoSuchUpload|InvalidUploadId|upload id/i.test(
            String(err?.message || err?.code || ""),
          )
        ) {
          job.checkpoint = null;
          job.progress = 0;
          job.loaded = 0;
          await multipartUploadWithContentMd5(client, job.key, job.localPath, {
            partSize: (settings.uploadPartSize || 10) * 1024 * 1024,
            timeout: settings.connectTimeout,
            checkpoint: null,
            progress: async (p, checkpoint) => {
              if (job.aborted || job.removed || !this.jobs.has(job.id)) {
                throw new Error("已暂停");
              }
              job.progress = Math.floor(p * 100);
              job.loaded = Math.floor((job.size || 0) * p);
              if (checkpoint) job.checkpoint = checkpoint;
              updateSpeed(job.loaded);
              this.emitProgress(job);
            },
          });
        } else {
          throw err;
        }
      }
    } else if (job.type === "move" || job.type === "copy") {
      const p = job.moveParams || {};
      const { auth, client: serviceClient } = this.getState();
      if (!auth) throw new Error("请先登录");
      const result = await moveOrCopyObjects({
        auth: { ...auth, timeout: settings.connectTimeout },
        serviceClient,
        bucket: p.bucket,
        keys: p.keys || [],
        toBucket: p.toBucket,
        toPrefix: p.toPrefix || "",
        fromPrefix: p.fromPrefix || "",
        region: p.region || job.region,
        toRegion: p.toRegion || p.region || job.region,
        isCopy: job.type === "copy",
        onProgress: async ({ done, total }) => {
          if (job.aborted || job.removed || !this.jobs.has(job.id)) {
            return false;
          }
          job.size = total;
          job.loaded = done;
          job.progress = total > 0 ? Math.floor((done / total) * 100) : 0;
          this.emitProgress(job);
          return true;
        },
      });
      job.size = result.total || job.size;
      job.loaded = result.done || job.loaded;
      if (result.failed) {
        job.error = `${result.failed} 个对象失败`;
        if (!result.done) {
          throw new Error(result.errors?.[0]?.message || "移动失败");
        }
      }
    } else {
      await resumableDownload(client, job, {
        concurrency: settings.downloadConcurrecyPartSize || 5,
        partSize:
          Math.max(1, Number(settings.uploadPartSize) || 10) * 1024 * 1024,
        shouldAbort: () =>
          !!(job.aborted || job.removed || !this.jobs.has(job.id)),
        progress: async (p, downloadParts) => {
          if (job.aborted || job.removed || !this.jobs.has(job.id)) {
            throw new Error("已暂停");
          }
          job.progress = Math.floor(p * 100);
          job.loaded = Math.floor((job.size || 0) * p);
          if (downloadParts !== undefined) job.downloadParts = downloadParts;
          updateSpeed(job.loaded);
          this.emitProgress(job);
        },
      });
    }

    // 完整性校验移至 runJob：传输完成后先计入完成并释放并发，再异步校验
  }

  async verifyAfterTransfer(job, client, settings) {
    const retries = Math.max(0, Number(settings.verifyRetryTimes) || 0);
    let attempt = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (job.aborted || job.removed) throw new Error("已暂停");
      try {
        job.error = attempt
          ? `完整性校验重试中 (${attempt}/${retries})`
          : "完整性校验中…";
        this.emitProgress(job);
        const result = await assertIntegrity(client, job.key, job.localPath, {
          mode: "auto",
        });
        job.verify = {
          algorithm: result.algorithm,
          local: result.local,
          remote: result.remote,
          matched: !!result.matched,
          skipped: !!result.skipped,
          message: result.message || "",
        };
        job.error = "";
        return;
      } catch (err) {
        if (err?.code !== "INTEGRITY_MISMATCH") throw err;
        job.verify = err.verify || null;
        if (attempt >= retries) {
          throw new Error(
            `完整性校验失败${err.verify?.algorithm ? `（${err.verify.algorithm}）` : ""}：本地与云端不一致`,
          );
        }
        attempt += 1;
        // 下载校验失败：删除本地文件后重下；上传失败：仅复检（云端已写入则再 Head）
        if (job.type === "download") {
          try {
            if (fs.existsSync(job.localPath)) fs.unlinkSync(job.localPath);
          } catch {
            /* ignore */
          }
          job.progress = 0;
          job.loaded = 0;
          job.downloadParts = null;
          removePartsDir(job.id);
          await resumableDownload(client, job, {
            concurrency: settings.downloadConcurrecyPartSize || 5,
            partSize:
              Math.max(1, Number(settings.uploadPartSize) || 10) * 1024 * 1024,
            shouldAbort: () =>
              !!(job.aborted || job.removed || !this.jobs.has(job.id)),
            progress: async (p, downloadParts) => {
              if (job.aborted || job.removed || !this.jobs.has(job.id)) {
                throw new Error("已暂停");
              }
              job.progress = Math.floor(p * 100);
              job.loaded = Math.floor((job.size || 0) * p);
              if (downloadParts !== undefined)
                job.downloadParts = downloadParts;
              this.emitProgress(job);
            },
          });
        } else {
          await new Promise((r) => setTimeout(r, 500 * attempt));
        }
      }
    }
  }

  exportActiveJobs() {
    return exportJobsPayload([...this.jobs.values()]);
  }

  importJobs(payload) {
    const list = Array.isArray(payload?.jobs)
      ? payload.jobs
      : Array.isArray(payload)
        ? payload
        : [];
    let imported = 0;
    const aid = this.accountId();
    for (const row of list) {
      if (!row?.id || !row.type) continue;
      if (this.jobs.has(row.id)) continue;
      if (
        row.type === "upload" &&
        row.localPath &&
        !fs.existsSync(row.localPath)
      ) {
        row.error = "本地文件不存在，导入后需检查路径";
        row.status = "failed";
      }
      const job = {
        ...serializeJob(row),
        status: row.status === "finished" ? "finished" : "stopped",
        aborted: false,
        removed: false,
        autoResume: false,
        accountId: row.accountId || aid,
        error: row.error || "已导入，请手动继续",
      };
      if (job.status === "finished") {
        appendHistory(job);
        continue;
      }
      this.jobs.set(job.id, job);
      imported += 1;
    }
    this.emit("snapshot", { list: this.list() });
    this.persistSoon();
    return { imported };
  }

  getHistory(limit = 200) {
    return loadHistory({ limit, accountId: this.accountId() });
  }
}

function isLikelyAutoResumeError(error) {
  const msg = String(error || "");
  return /待续传|网络|超时|重试|ECONN|ETIMEDOUT|socket|凭证|AccessKey|token|SecurityToken|应用退出/i.test(
    msg,
  );
}

function walkFiles(p) {
  const st = fs.statSync(p);
  if (st.isFile()) return [p];
  const out = [];
  for (const name of fs.readdirSync(p)) {
    const child = path.join(p, name);
    out.push(...walkFiles(child));
  }
  return out;
}

function fsyncPath(filePath) {
  try {
    const fd = fs.openSync(filePath, "r+");
    try {
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    /* ignore */
  }
}

function isNotFoundErr(err) {
  const status = Number(err?.status || err?.statusCode || 0);
  const code = String(err?.code || err?.name || "");
  return (
    status === 404 ||
    code === "NoSuchKey" ||
    code === "NotFound" ||
    /no such key|not found/i.test(String(err?.message || ""))
  );
}
