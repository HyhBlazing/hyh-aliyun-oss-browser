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

export class TransferManager extends EventEmitter {
  constructor(getState) {
    super();
    this.getState = getState;
    this.jobs = new Map();
    this.runningUpload = 0;
    this.runningDownload = 0;
    this.runningMove = 0;
  }

  list() {
    return [...this.jobs.values()];
  }

  pause(id) {
    const job = this.jobs.get(id);
    if (!job || job.status === "finished") return;
    job.status = "stopped";
    job.aborted = true;
    this.emitProgress(job);
  }

  resume(id) {
    const job = this.jobs.get(id);
    if (!job || job.status === "finished") return;
    job.aborted = false;
    job.status = "waiting";
    this.emitProgress(job);
    this.pump();
  }

  remove(id) {
    const job = this.jobs.get(id);
    if (!job) return false;
    job.aborted = true;
    job.removed = true;
    this.jobs.delete(id);
    this.emit("removed", { id });
    return true;
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
    return ids;
  }

  async enqueueUpload({
    bucket,
    prefix,
    localPaths,
    region,
    overwriteSameName,
  }) {
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

    const jobs = [];
    let skipped = 0;
    for (const localPath of localPaths) {
      const files = walkFiles(localPath);
      const base = fs.statSync(localPath).isDirectory()
        ? localPath
        : path.dirname(localPath);
      for (const file of files) {
        const rel = path.relative(base, file).split(path.sep).join("/");
        const key = `${prefix || ""}${rel}`.replace(/^\//, "");
        const size = fs.statSync(file).size;

        if (!overwrite && client) {
          try {
            const head = await client.head(key);
            const remoteSize = Number(
              head.res?.headers?.["content-length"] ?? head.size ?? NaN,
            );
            // 同名且大小相同：视为未变化，跳过
            if (Number.isFinite(remoteSize) && remoteSize === size) {
              skipped += 1;
              continue;
            }
            // 同名但大小不同：仍上传（内容已变化）
          } catch (err) {
            if (!isNotFoundErr(err)) throw err;
          }
        }

        const job = this.createJob({
          type: "upload",
          bucket,
          region: r,
          key,
          localPath: file,
          size,
        });
        jobs.push(job);
      }
    }
    if (!jobs.length && !skipped) {
      throw new Error("没有可上传的文件");
    }
    this.pump();
    return { jobs, skipped };
  }

  /**
   * 后台移动/复制（立即返回任务，不阻塞前端）
   */
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
    if (!bucket || !keys.length) throw new Error("参数不完整");
    const destBucket = toBucket || bucket;
    const type = isCopy ? "copy" : "move";
    const action = isCopy ? "复制" : "移动";
    const label = keys.length === 1 ? String(keys[0]) : `${keys.length} 项`;
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
        keys: [...keys],
        toBucket: destBucket,
        toPrefix: toPrefix || "",
        fromPrefix: fromPrefix || "",
        region: region || "",
        toRegion: toRegion || region || "",
        isCopy: !!isCopy,
      },
    });
    this.pump();
    return { jobs: [job] };
  }

  async enqueueDownload({ bucket, keys, localDir, region, stripPrefix = "" }) {
    const jobs = [];
    const r = region || getCachedBucketRegion(bucket);
    const { auth, client: serviceClient } = this.getState();
    if (!auth) throw new Error("请先登录");
    const client = await createBucketClient(auth, bucket, r, serviceClient);
    const base = String(stripPrefix || "");

    const toLocal = (objectKey) => {
      let rel = String(objectKey);
      if (base && rel.startsWith(base)) rel = rel.slice(base.length);
      rel = rel.replace(/^\/+/, "");
      if (!rel) rel = objectKey.split("/").pop() || "download.bin";
      return path.join(localDir, ...rel.split("/").filter(Boolean));
    };

    for (const key of keys) {
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
            found += 1;
            jobs.push(
              this.createJob({
                type: "download",
                bucket,
                region: r,
                key: o.name,
                localPath: toLocal(o.name),
                size: o.size || 0,
              }),
            );
          }
          token = res.isTruncated ? res.nextContinuationToken : "";
        } while (token);
        if (!found) {
          // 空目录占位：创建本地空文件夹
          const dirPath = toLocal(key);
          fs.mkdirSync(dirPath, { recursive: true });
        }
      } else {
        jobs.push(
          this.createJob({
            type: "download",
            bucket,
            region: r,
            key,
            localPath: toLocal(key),
            size: 0,
          }),
        );
      }
    }
    if (!jobs.length) {
      throw new Error("没有可下载的对象");
    }
    this.pump();
    return jobs;
  }

  /**
   * 同步下载到本地目录（用于拖拽出窗口），返回可拖拽的本地路径列表。
   * 单文件返回文件路径；目录返回目录路径。
   */
  async downloadNow({ bucket, keys, localDir, region, stripPrefix = "" }) {
    const r = region || getCachedBucketRegion(bucket);
    const { auth, client: serviceClient } = this.getState();
    if (!auth) throw new Error("请先登录");
    const client = await createBucketClient(auth, bucket, r, serviceClient);
    const base = String(stripPrefix || "");
    fs.mkdirSync(localDir, { recursive: true });

    const toLocal = (objectKey) => {
      let rel = String(objectKey);
      if (base && rel.startsWith(base)) rel = rel.slice(base.length);
      rel = rel.replace(/^\/+/, "");
      if (!rel) rel = objectKey.split("/").pop() || "download.bin";
      return path.join(localDir, ...rel.split("/").filter(Boolean));
    };

    const filePaths = [];
    const rootItems = [];

    for (const key of keys) {
      if (String(key).endsWith("/")) {
        const folderLocal = toLocal(key);
        fs.mkdirSync(folderLocal, { recursive: true });
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
            found += 1;
            const lp = toLocal(o.name);
            fs.mkdirSync(path.dirname(lp), { recursive: true });
            await client.get(o.name, lp);
            fsyncPath(lp);
            filePaths.push(lp);
          }
          token = res.isTruncated ? res.nextContinuationToken : "";
        } while (token);
        rootItems.push(folderLocal);
      } else {
        const lp = toLocal(key);
        fs.mkdirSync(path.dirname(lp), { recursive: true });
        await client.get(key, lp);
        fsyncPath(lp);
        filePaths.push(lp);
        rootItems.push(lp);
      }
    }

    if (!rootItems.length && !filePaths.length) {
      throw new Error("没有可下载的对象");
    }

    // 拖拽时优先拖「根项」（文件夹整夹 / 单文件），便于落到目标目录
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
      createdAt: Date.now(),
      ...partial,
    };
    this.jobs.set(job.id, job);
    this.emitProgress(job);
    return job;
  }

  emitProgress(job) {
    if (!job || job.removed || !this.jobs.has(job.id)) return;
    this.emit("progress", { ...job });
  }

  pump() {
    const settings = loadSettings();
    for (const job of this.jobs.values()) {
      if (job.status !== "waiting") continue;
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
    job.status = "running";
    job.aborted = false;
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
          await this.executeTransfer(job, client, settings);
          break;
        } catch (err) {
          if (job.aborted || /已暂停/.test(err?.message || "")) throw err;
          if (attempt >= retries) throw err;
          attempt += 1;
          job.error = `重试中 (${attempt}/${retries})`;
          this.emitProgress(job);
          await new Promise((r) => setTimeout(r, 800 * attempt));
          job.error = "";
        }
      }
      if (job.aborted) {
        job.status = "stopped";
      } else {
        job.status = "finished";
        job.progress = 100;
        job.error = "";
      }
    } catch (err) {
      if (job.aborted || /已暂停/.test(err.message || "")) {
        job.status = "stopped";
      } else {
        job.status = "failed";
        job.error = chineseErr(err);
      }
    } finally {
      if (job.type === "upload")
        this.runningUpload = Math.max(0, this.runningUpload - 1);
      else if (job.type === "download") {
        this.runningDownload = Math.max(0, this.runningDownload - 1);
      } else if (job.type === "move" || job.type === "copy") {
        this.runningMove = Math.max(0, this.runningMove - 1);
      }
      // 已被 remove 的任务不要再推 progress，否则前端会重新加回列表
      if (!job.removed && this.jobs.has(job.id)) {
        this.emitProgress(job);
      }
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
          job.checkpoint = checkpoint;
          updateSpeed(job.loaded);
          this.emitProgress(job);
        },
      });
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
      if (!job.size) {
        try {
          const head = await client.head(job.key);
          job.size = Number(head.res?.headers?.["content-length"] || 0);
        } catch {
          /* ignore */
        }
      }
      fs.mkdirSync(path.dirname(job.localPath), { recursive: true });
      const result = await client.get(job.key, job.localPath);
      job.size = Number(
        result.res?.headers?.["content-length"] || job.size || 0,
      );
      job.progress = 100;
      job.loaded = job.size;
      job.speed = 0;
    }
  }
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

/** 确保内容落盘，避免拖拽时资源管理器读到未刷盘/锁定文件 */
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
