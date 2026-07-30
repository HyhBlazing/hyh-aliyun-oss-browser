import fs from "fs";
import os from "os";
import path from "path";
import { getObjectMeta } from "./oss.js";
import {
  crc64File,
  md5FileBase64,
  md5FileHex,
  normalizeCrc64,
  normalizeEtag,
  normalizeMd5,
} from "./crc64.js";

const REPORT_DIR = path.join(os.homedir(), ".hyh-oss-browser", "verify");

/**
 * 从 Head 结果提取可校验字段。
 * 注意：分片上传的 ETag 不是整文件 MD5，不可单独作为内容完整性依据。
 */
export function pickRemoteIntegrity(meta = {}) {
  const crc64 = normalizeCrc64(meta.hash_crc64ecma || meta.crc64 || "");
  const contentMd5 = String(meta.content_md5 || "").trim();
  const etag = normalizeEtag(meta.etag || "");
  const size = Number(meta.content_length || meta.size || 0) || 0;
  // multipart etag 常含 '-'
  const etagLooksLikeMd5 = !!etag && !etag.includes("-") && /^[0-9a-f]{32}$/i.test(etag);
  return {
    crc64,
    content_md5: contentMd5,
    content_md5_hex: contentMd5 ? normalizeMd5(contentMd5) : "",
    etag,
    etag_is_md5: etagLooksLikeMd5,
    size,
  };
}

/**
 * 自动选择算法：优先 CRC64，其次 Content-MD5，最后仅在简单对象时用 ETag≈MD5
 * @param {"auto"|"crc64"|"md5"|"etag"} mode
 */
export async function verifyLocalAgainstRemote(client, key, localPath, options = {}) {
  const mode = options.mode || "auto";
  if (!localPath || !fs.existsSync(localPath)) {
    throw new Error("本地文件不存在");
  }
  const st = fs.statSync(localPath);
  if (!st.isFile()) throw new Error("本地路径不是文件");

  const meta = await getObjectMeta(client, key);
  const remote = pickRemoteIntegrity(meta);
  const localSize = st.size;

  const result = {
    key: String(key),
    local_path: localPath,
    matched: false,
    algorithm: "",
    local: "",
    remote: "",
    size_matched: remote.size ? localSize === remote.size : true,
    local_size: localSize,
    remote_size: remote.size,
    skipped: false,
    message: "",
    etag: remote.etag,
    warning: "",
  };

  if (remote.size && localSize !== remote.size) {
    result.algorithm = "size";
    result.local = String(localSize);
    result.remote = String(remote.size);
    result.message = "文件大小不一致";
    return result;
  }

  const wantCrc = mode === "crc64" || mode === "auto";
  const wantMd5 = mode === "md5" || mode === "auto";
  const wantEtag = mode === "etag" || mode === "auto";

  if (wantCrc && remote.crc64) {
    const localCrc = await crc64File(localPath);
    result.algorithm = "crc64";
    result.local = localCrc;
    result.remote = remote.crc64;
    result.matched = localCrc === remote.crc64;
    result.message = result.matched ? "CRC64 校验通过" : "CRC64 校验失败";
    return result;
  }

  if (wantMd5 && remote.content_md5) {
    const localMd5B64 = await md5FileBase64(localPath);
    const localHex = normalizeMd5(localMd5B64);
    const remoteHex = remote.content_md5_hex || normalizeMd5(remote.content_md5);
    result.algorithm = "md5";
    result.local = localHex;
    result.remote = remoteHex;
    result.matched = localHex === remoteHex;
    result.message = result.matched ? "MD5 校验通过" : "MD5 校验失败";
    return result;
  }

  if (wantEtag && remote.etag_is_md5) {
    const localHex = await md5FileHex(localPath);
    result.algorithm = "etag-md5";
    result.local = localHex;
    result.remote = remote.etag;
    result.matched = localHex === remote.etag;
    result.message = result.matched
      ? "ETag(MD5) 校验通过"
      : "ETag(MD5) 校验失败";
    result.warning = "仅适用于简单上传对象；分片上传请勿依赖 ETag";
    return result;
  }

  if (mode === "crc64" && !remote.crc64) {
    result.skipped = true;
    result.algorithm = "crc64";
    result.message = "云端未返回 CRC64（对象可能创建于 CRC 功能上线前，或来自 Copy）";
    return result;
  }
  if (mode === "md5" && !remote.content_md5) {
    result.skipped = true;
    result.algorithm = "md5";
    result.message = "云端未返回 Content-MD5（分片上传通常无整文件 MD5）";
    return result;
  }

  // auto 且无可比哈希：仅大小一致时标记为弱通过
  result.algorithm = "size";
  result.local = String(localSize);
  result.remote = String(remote.size || localSize);
  result.matched = result.size_matched;
  result.skipped = !remote.crc64 && !remote.content_md5;
  result.message = result.skipped
    ? "云端无可比哈希，仅校验大小一致（建议优先使用 CRC64）"
    : result.matched
      ? "大小一致"
      : "大小不一致";
  result.warning =
    "未使用 CRC64/MD5。分片上传的 ETag 不能当作文件 MD5。";
  return result;
}

/**
 * 批量校验：keys 为对象列表；localDir + stripPrefix 映射本地路径
 */
export async function verifyBatch(client, {
  keys = [],
  localDir = "",
  stripPrefix = "",
  mode = "auto",
  onProgress,
} = {}) {
  if (!localDir) throw new Error("请指定本地目录");
  if (!keys.length) throw new Error("没有可校验的对象");

  const base = String(stripPrefix || "");
  const toLocal = (objectKey) => {
    let rel = String(objectKey);
    if (base && rel.startsWith(base)) rel = rel.slice(base.length);
    rel = rel.replace(/^\/+/, "");
    if (!rel) rel = objectKey.split("/").pop() || "file.bin";
    return path.join(localDir, ...rel.split("/").filter(Boolean));
  };

  const items = [];
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  let index = 0;
  for (const key of keys) {
    if (String(key).endsWith("/")) continue;
    index += 1;
    const localPath = toLocal(key);
    let row;
    try {
      row = await verifyLocalAgainstRemote(client, key, localPath, { mode });
    } catch (err) {
      row = {
        key,
        local_path: localPath,
        matched: false,
        skipped: false,
        algorithm: "",
        local: "",
        remote: "",
        message: err?.message || String(err),
      };
    }
    items.push(row);
    if (row.skipped) skipped += 1;
    else if (row.matched) passed += 1;
    else failed += 1;
    if (onProgress) {
      await onProgress({
        done: index,
        total: keys.filter((k) => !String(k).endsWith("/")).length,
        current: row,
      });
    }
  }

  const summary = {
    total: items.length,
    passed,
    failed,
    skipped,
    generated_at: Date.now(),
    mode,
    local_dir: localDir,
  };
  const reportPath = writeVerifyReport({ summary, items });
  return { summary, items, report_path: reportPath };
}

export function writeVerifyReport(payload) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(REPORT_DIR, `verify-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify(payload, null, 2));
  return file;
}

/**
 * 传输完成后自动校验；失败抛错（供重试）
 */
export async function assertIntegrity(client, key, localPath, options = {}) {
  const result = await verifyLocalAgainstRemote(client, key, localPath, options);
  if (result.skipped) {
    return { ...result, ok: true };
  }
  if (!result.matched) {
    const err = new Error(result.message || "完整性校验失败");
    err.code = "INTEGRITY_MISMATCH";
    err.verify = result;
    throw err;
  }
  return { ...result, ok: true };
}
