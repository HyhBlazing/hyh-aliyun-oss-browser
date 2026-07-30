import crypto from "crypto";
import fs from "fs";

/**
 * CRC-64/ECMA-182（与阿里云 OSS x-oss-hash-crc64ecma / crc64-ecma182 一致）
 * 实现参考 zlib-style：init ~0，表驱动，结束再取反。
 * 校验向量："123456789" → 11051210869376104954
 */

const POLY = 0xc96c5795d7870f42n;
const MASK = 0xffffffffffffffffn;

/** @type {BigInt[]|null} */
let TABLE = null;

function buildTable() {
  const table = new Array(256);
  for (let i = 0; i < 256; i++) {
    let crc = BigInt(i);
    for (let j = 0; j < 8; j++) {
      crc = crc & 1n ? POLY ^ (crc >> 1n) : crc >> 1n;
    }
    table[i] = crc & MASK;
  }
  return table;
}

function getTable() {
  if (!TABLE) TABLE = buildTable();
  return TABLE;
}

/**
 * @param {bigint|null} prevFinal 上一次对外返回值（已取反）；首次 null
 * @param {Buffer|Uint8Array|string} buf
 * @returns {bigint} 最终 CRC（已取反）
 */
export function crc64Update(prevFinal, buf) {
  const table = getTable();
  let crc = prevFinal == null ? 0n : BigInt(prevFinal);
  crc = (~crc) & MASK;
  const data = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  for (let i = 0; i < data.length; i++) {
    const idx = Number((crc ^ BigInt(data[i])) & 0xffn);
    crc = (table[idx] ^ (crc >> 8n)) & MASK;
  }
  return (~crc) & MASK;
}

export function crc64Buffer(buf) {
  return crc64Update(null, buf).toString();
}

/** 计算本地文件 CRC64（十进制字符串，与 OSS header 一致） */
export function crc64File(filePath) {
  return new Promise((resolve, reject) => {
    let state = null;
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => {
      state = crc64Update(state, chunk);
    });
    stream.on("end", () => {
      resolve((state == null ? 0n : state).toString());
    });
    stream.on("error", reject);
  });
}

/** MD5 Base64（与 Content-MD5 一致） */
export function md5FileBase64(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("md5");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (c) => hash.update(c));
    stream.on("end", () => resolve(hash.digest("base64")));
    stream.on("error", reject);
  });
}

/** MD5 Hex（小写）；分片 ETag 不可当作整文件 MD5 */
export function md5FileHex(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("md5");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (c) => hash.update(c));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

export function normalizeEtag(etag) {
  return String(etag || "")
    .trim()
    .replace(/^"|"$/g, "")
    .toLowerCase();
}

export function normalizeMd5(md5) {
  const s = String(md5 || "").trim();
  if (!s) return "";
  if (/^[0-9a-fA-F]{32}$/.test(s)) return s.toLowerCase();
  try {
    return Buffer.from(s, "base64").toString("hex");
  } catch {
    return s;
  }
}

export function normalizeCrc64(v) {
  return String(v || "").trim();
}
