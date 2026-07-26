import EventEmitter from "events";
import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";
import { createOssClient } from "./oss.js";
import { loadSettings } from "./settings.js";

export class TransferManager extends EventEmitter {
  constructor(getState) {
    super();
    this.getState = getState;
    this.jobs = new Map();
    this.runningUpload = 0;
    this.runningDownload = 0;
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
    if (job) {
      job.aborted = true;
      this.jobs.delete(id);
    }
  }

  async enqueueUpload({ bucket, prefix, localPaths }) {
    const jobs = [];
    for (const localPath of localPaths) {
      const files = walkFiles(localPath);
      const base = fs.statSync(localPath).isDirectory()
        ? localPath
        : path.dirname(localPath);
      for (const file of files) {
        const rel = path.relative(base, file).split(path.sep).join("/");
        const key = `${prefix || ""}${rel}`.replace(/^\//, "");
        const job = this.createJob({
          type: "upload",
          bucket,
          key,
          localPath: file,
          size: fs.statSync(file).size,
        });
        jobs.push(job);
      }
    }
    this.pump();
    return jobs;
  }

  async enqueueDownload({ bucket, keys, localDir }) {
    const jobs = [];
    for (const key of keys) {
      const localPath = path.join(localDir, key.split("/").pop() || key);
      const job = this.createJob({
        type: "download",
        bucket,
        key,
        localPath,
        size: 0,
      });
      jobs.push(job);
    }
    this.pump();
    return jobs;
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
    this.emit("progress", { ...job });
  }

  pump() {
    const settings = loadSettings();
    for (const job of this.jobs.values()) {
      if (job.status !== "waiting") continue;
      if (job.type === "upload" && this.runningUpload >= settings.maxUploadJobCount) {
        continue;
      }
      if (
        job.type === "download" &&
        this.runningDownload >= settings.maxDownloadJobCount
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
    else this.runningDownload += 1;
    this.emitProgress(job);

    const settings = loadSettings();
    const client = createOssClient({
      ...auth,
      bucket: job.bucket,
      timeout: settings.connectTimeout,
    });

    try {
      if (job.type === "upload") {
        await client.multipartUpload(job.key, job.localPath, {
          partSize: (settings.uploadPartSize || 10) * 1024 * 1024,
          timeout: settings.connectTimeout,
          checkpoint: job.checkpoint,
          progress: async (p, checkpoint) => {
            if (job.aborted) throw new Error("已暂停");
            job.progress = Math.floor(p * 100);
            job.loaded = Math.floor((job.size || 0) * p);
            job.checkpoint = checkpoint;
            this.emitProgress(job);
          },
        });
      } else {
        fs.mkdirSync(path.dirname(job.localPath), { recursive: true });
        const result = await client.get(job.key, job.localPath);
        job.size = Number(result.res?.headers?.["content-length"] || 0);
        job.progress = 100;
        job.loaded = job.size;
      }
      if (job.aborted) {
        job.status = "stopped";
      } else {
        job.status = "finished";
        job.progress = 100;
      }
    } catch (err) {
      if (job.aborted || /已暂停/.test(err.message || "")) {
        job.status = "stopped";
      } else {
        job.status = "failed";
        job.error = err.message || "传输失败";
      }
    } finally {
      if (job.type === "upload") this.runningUpload = Math.max(0, this.runningUpload - 1);
      else this.runningDownload = Math.max(0, this.runningDownload - 1);
      this.emitProgress(job);
      this.pump();
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
