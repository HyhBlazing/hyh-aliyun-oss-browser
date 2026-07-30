import fs from "fs";
import path from "path";
import { partsDirForJob } from "./job-store.js";

/**
 * 分片 Range 下载并支持断点续传。
 * 分片落盘到 ~/.hyh-oss-browser/transfer/parts/<jobId>/part-NNNN
 * 完成后组装到 localPath。
 */
export async function resumableDownload(client, job, options = {}) {
  const {
    concurrency = 5,
    partSize: rawPartSize = 5 * 1024 * 1024,
    progress,
    shouldAbort,
  } = options;

  if (!job.localPath) throw new Error("缺少本地路径");
  if (!job.key) throw new Error("缺少对象 Key");

  // 获取对象大小
  if (!job.size) {
    const head = await client.head(job.key);
    job.size = Number(head.res?.headers?.["content-length"] || head.size || 0);
  }
  const fileSize = Number(job.size) || 0;
  if (fileSize <= 0) {
    // 空对象
    fs.mkdirSync(path.dirname(job.localPath), { recursive: true });
    fs.writeFileSync(job.localPath, Buffer.alloc(0));
    if (progress) await progress(1, job.downloadParts);
    return;
  }

  // 小文件直接整文件下载
  const minMultipart = 2 * 1024 * 1024;
  if (fileSize < minMultipart) {
    if (shouldAbort?.()) throw new Error("已暂停");
    fs.mkdirSync(path.dirname(job.localPath), { recursive: true });
    await client.get(job.key, job.localPath);
    fsyncPath(job.localPath);
    if (progress) await progress(1, null);
    return;
  }

  let partSize = Number(rawPartSize) || 5 * 1024 * 1024;
  if (partSize < 256 * 1024) partSize = 256 * 1024;
  const maxParts = 10000;
  const safeSize = Math.ceil(fileSize / maxParts);
  if (partSize < safeSize) partSize = safeSize;

  const partsDir = partsDirForJob(job.id);
  fs.mkdirSync(partsDir, { recursive: true });
  fs.mkdirSync(path.dirname(job.localPath), { recursive: true });

  const numParts = Math.ceil(fileSize / partSize) || 1;
  const parts = [];
  for (let i = 0; i < numParts; i++) {
    const start = partSize * i;
    const end = Math.min(start + partSize, fileSize) - 1; // inclusive
    const number = i + 1;
    const partPath = path.join(partsDir, `part-${String(number).padStart(4, "0")}`);
    parts.push({ number, start, end, expected: end - start + 1, partPath });
  }

  // 恢复已完成分片
  const doneMap = new Map();
  if (job.downloadParts?.parts) {
    for (const p of job.downloadParts.parts) {
      if (p?.done && p.number) doneMap.set(p.number, p);
    }
  }

  // 校验本地分片文件完整性
  for (const part of parts) {
    const prev = doneMap.get(part.number);
    if (prev?.done && fs.existsSync(part.partPath)) {
      try {
        const st = fs.statSync(part.partPath);
        if (st.size === part.expected) continue;
      } catch {
        /* fallthrough */
      }
    }
    doneMap.delete(part.number);
    try {
      if (fs.existsSync(part.partPath)) fs.unlinkSync(part.partPath);
    } catch {
      /* ignore */
    }
  }

  const snapshotParts = () => ({
    fileSize,
    partSize,
    etag: job.downloadParts?.etag || "",
    parts: parts.map((p) => ({
      number: p.number,
      start: p.start,
      end: p.end,
      done: doneMap.has(p.number),
      path: p.partPath,
    })),
  });

  job.downloadParts = snapshotParts();
  const doneBytes = () =>
    [...doneMap.keys()].reduce((sum, n) => {
      const p = parts.find((x) => x.number === n);
      return sum + (p ? p.expected : 0);
    }, 0);

  if (progress) {
    await progress(doneBytes() / fileSize, job.downloadParts);
  }

  const todo = parts.filter((p) => !doneMap.has(p.number));
  let cursor = 0;
  const parallel = Math.max(1, Math.min(Number(concurrency) || 5, todo.length || 1));

  const workers = Array.from({ length: Math.min(parallel, todo.length) || 0 }, async () => {
    while (cursor < todo.length) {
      if (shouldAbort?.()) throw new Error("已暂停");
      const idx = cursor;
      cursor += 1;
      const part = todo[idx];
      if (!part) return;

      const result = await client.get(job.key, undefined, {
        headers: {
          Range: `bytes=${part.start}-${part.end}`,
        },
      });

      const buf = Buffer.isBuffer(result.content)
        ? result.content
        : Buffer.from(result.content || []);
      if (buf.length !== part.expected) {
        throw new Error(
          `分片大小不匹配: part ${part.number} expect ${part.expected} got ${buf.length}`,
        );
      }

      const tmp = `${part.partPath}.tmp`;
      fs.writeFileSync(tmp, buf);
      fs.renameSync(tmp, part.partPath);
      doneMap.set(part.number, { number: part.number, done: true });
      job.downloadParts = snapshotParts();

      if (progress) {
        await progress(doneBytes() / fileSize, job.downloadParts);
      }
    }
  });

  await Promise.all(workers);
  if (shouldAbort?.()) throw new Error("已暂停");

  // 组装
  const outTmp = `${job.localPath}.hyhdownloading`;
  const fd = fs.openSync(outTmp, "w");
  try {
    for (const part of parts) {
      if (shouldAbort?.()) throw new Error("已暂停");
      const data = fs.readFileSync(part.partPath);
      fs.writeSync(fd, data);
    }
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }

  try {
    if (fs.existsSync(job.localPath)) fs.unlinkSync(job.localPath);
  } catch {
    /* ignore */
  }
  fs.renameSync(outTmp, job.localPath);
  fsyncPath(job.localPath);

  // 清理分片
  try {
    fs.rmSync(partsDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  job.downloadParts = null;
  if (progress) await progress(1, null);
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
