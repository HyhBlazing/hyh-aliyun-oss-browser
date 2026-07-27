import crypto from "crypto";
import fs from "fs";

/** 计算整个文件的 Content-MD5（Base64） */
export function md5FileBase64(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("md5");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("base64")));
    stream.on("error", reject);
  });
}

/** 计算文件字节区间的 Content-MD5（Base64），end 为开区间 */
export function md5FileRangeBase64(filePath, start, end) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("md5");
    const stream = fs.createReadStream(filePath, {
      start,
      end: Math.max(start, end - 1),
    });
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("base64")));
    stream.on("error", reject);
  });
}

/**
 * 上传本地文件并自动附加 Content-MD5：
 * - 小文件：PutObject + 整文件 MD5
 * - 大文件：分片上传，每个 Part 带 Content-MD5（与网页端 ali-oss disabledMD5:false 行为一致）
 */
export async function multipartUploadWithContentMd5(client, key, localPath, options = {}) {
  const {
    partSize: rawPartSize = 10 * 1024 * 1024,
    timeout,
    checkpoint,
    progress,
    headers = {},
    meta,
    mime,
  } = options;

  if (checkpoint?.uploadId) {
    return resumeMultipartWithContentMd5(client, checkpoint, {
      timeout,
      progress,
      headers,
      meta,
      mime,
    });
  }

  const stat = fs.statSync(localPath);
  const fileSize = stat.size;
  const minPartSize = 100 * 1024;

  // 小文件走 PutObject，整文件 Content-MD5
  if (fileSize < minPartSize) {
    const contentMd5 = await md5FileBase64(localPath);
    const result = await client.put(key, localPath, {
      timeout,
      mime,
      meta,
      contentLength: fileSize,
      headers: {
        ...headers,
        "Content-MD5": contentMd5,
      },
    });
    if (progress) await progress(1);
    return {
      res: result.res,
      bucket: client.options.bucket,
      name: key,
      etag: result.res?.headers?.etag,
    };
  }

  let partSize = Number(rawPartSize) || 10 * 1024 * 1024;
  if (partSize < minPartSize) partSize = minPartSize;
  const maxNumParts = 10000;
  const safeSize = Math.ceil(fileSize / maxNumParts);
  if (partSize < safeSize) partSize = safeSize;

  const initHeaders = { ...headers };
  // InitMultipartUpload 无 body，不能带整文件 Content-MD5
  delete initHeaders["Content-MD5"];
  delete initHeaders["content-md5"];

  const initResult = await client.initMultipartUpload(key, {
    timeout,
    mime,
    meta,
    headers: initHeaders,
  });

  const uploadId = initResult.uploadId;
  const doneParts = [];
  const nextCheckpoint = {
    file: localPath,
    name: key,
    fileSize,
    partSize,
    uploadId,
    doneParts,
  };

  if (progress) await progress(0, nextCheckpoint, initResult.res);

  return resumeMultipartWithContentMd5(client, nextCheckpoint, {
    timeout,
    progress,
    headers: initHeaders,
    meta,
    mime,
  });
}

async function resumeMultipartWithContentMd5(client, checkpoint, options = {}) {
  const { timeout, progress, headers = {}, meta, mime } = options;
  const { file, fileSize, partSize, uploadId, name } = checkpoint;
  const doneParts = Array.isArray(checkpoint.doneParts) ? [...checkpoint.doneParts] : [];
  const doneSet = new Set(doneParts.map((p) => p.number));

  const partOffs = [];
  const numParts = Math.ceil(fileSize / partSize) || 1;
  for (let i = 0; i < numParts; i++) {
    const start = partSize * i;
    const end = Math.min(start + partSize, fileSize);
    partOffs.push({ start, end, partNo: i + 1 });
  }

  const parallel = 5;
  const todo = partOffs.filter((p) => !doneSet.has(p.partNo));

  let cursor = 0;
  const workers = Array.from({ length: Math.min(parallel, todo.length) || 0 }, async () => {
    while (cursor < todo.length) {
      const idx = cursor;
      cursor += 1;
      const part = todo[idx];
      if (!part) return;

      const contentMd5 = await md5FileRangeBase64(file, part.start, part.end);
      const stream = fs.createReadStream(file, {
        start: part.start,
        end: part.end - 1,
      });
      const result = await client._uploadPart(
        name,
        uploadId,
        part.partNo,
        { stream, size: part.end - part.start },
        {
          timeout,
          mime,
          meta,
          headers: {
            ...headers,
            "Content-Length": part.end - part.start,
            "Content-MD5": contentMd5,
          },
          disabledMD5: true,
        }
      );

      doneParts.push({
        number: part.partNo,
        etag: result.res.headers.etag,
      });
      checkpoint.doneParts = doneParts;
      if (progress) {
        await progress(doneParts.length / (numParts + 1), checkpoint, result.res);
      }
    }
  });

  await Promise.all(workers);

  const completeHeaders = { ...headers };
  delete completeHeaders["Content-MD5"];
  delete completeHeaders["content-md5"];

  return client.completeMultipartUpload(name, uploadId, doneParts, {
    timeout,
    progress,
    headers: completeHeaders,
  });
}
