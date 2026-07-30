import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { DatabaseSync } from "node:sqlite";

const INDEX_DIR = path.join(os.homedir(), ".hyh-oss-browser", "search-index");

/** @type {Map<string, DatabaseSync>} */
const dbCache = new Map();

export function accountIndexKey(auth) {
  const id = String(auth?.id || "").trim();
  if (id) return safeFilePart(id);
  const ak = String(auth?.accessKeyId || auth?.id || "anonymous");
  return crypto.createHash("sha256").update(ak).digest("hex").slice(0, 16);
}

function safeFilePart(s) {
  return String(s).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64) || "default";
}

function dbPathFor(auth) {
  fs.mkdirSync(INDEX_DIR, { recursive: true });
  return path.join(INDEX_DIR, `${accountIndexKey(auth)}.db`);
}

/** 本地索引库占用字节（含 WAL / SHM） */
export function getIndexDbBytes(auth) {
  const base = dbPathFor(auth);
  let total = 0;
  for (const p of [base, `${base}-wal`, `${base}-shm`]) {
    try {
      if (fs.existsSync(p)) total += Number(fs.statSync(p).size) || 0;
    } catch {
      /* ignore */
    }
  }
  return total;
}

/**
 * @param {object} auth
 * @returns {DatabaseSync}
 */
export function openIndexDb(auth) {
  const key = accountIndexKey(auth);
  let db = dbCache.get(key);
  if (db) return db;
  const file = dbPathFor(auth);
  db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS objects (
      bucket TEXT NOT NULL,
      key TEXT NOT NULL,
      name TEXT NOT NULL,
      ext TEXT NOT NULL DEFAULT '',
      size INTEGER NOT NULL DEFAULT 0,
      last_modified INTEGER NOT NULL DEFAULT 0,
      storage_class TEXT NOT NULL DEFAULT '',
      etag TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (bucket, key)
    );
    CREATE INDEX IF NOT EXISTS idx_objects_name ON objects(name);
    CREATE INDEX IF NOT EXISTS idx_objects_ext ON objects(ext);
    CREATE INDEX IF NOT EXISTS idx_objects_size ON objects(size);
    CREATE INDEX IF NOT EXISTS idx_objects_mtime ON objects(last_modified);
    CREATE INDEX IF NOT EXISTS idx_objects_storage ON objects(storage_class);
    CREATE TABLE IF NOT EXISTS index_meta (
      bucket TEXT PRIMARY KEY,
      object_count INTEGER NOT NULL DEFAULT 0,
      last_indexed_at INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'idle'
    );
  `);
  dbCache.set(key, db);
  return db;
}

export function closeIndexDb(auth) {
  const key = accountIndexKey(auth);
  const db = dbCache.get(key);
  if (!db) return;
  try {
    db.close();
  } catch {
    /* ignore */
  }
  dbCache.delete(key);
}

export function objectNameAndExt(objectKey) {
  const key = String(objectKey || "");
  const base = key.includes("/") ? key.slice(key.lastIndexOf("/") + 1) : key;
  const dot = base.lastIndexOf(".");
  const ext =
    dot > 0 && dot < base.length - 1
      ? base.slice(dot + 1).toLowerCase()
      : "";
  return { name: base, ext };
}

export function parseLastModifiedMs(value) {
  if (value == null || value === "") return 0;
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 1e12 ? Math.floor(value * 1000) : Math.floor(value);
  }
  const t = Date.parse(String(value));
  return Number.isFinite(t) ? t : 0;
}

/**
 * Upsert 一批对象；seenKeys 用于扫描结束后清理删除项
 * @param {DatabaseSync} db
 * @param {string} bucket
 * @param {Array<{key:string,size?:number,lastModified?:any,storageClass?:string,etag?:string}>} rows
 * @param {Set<string>} [seenKeys]
 */
export function upsertObjects(db, bucket, rows, seenKeys) {
  const stmt = db.prepare(`
    INSERT INTO objects (bucket, key, name, ext, size, last_modified, storage_class, etag)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(bucket, key) DO UPDATE SET
      name = excluded.name,
      ext = excluded.ext,
      size = excluded.size,
      last_modified = excluded.last_modified,
      storage_class = excluded.storage_class,
      etag = excluded.etag
  `);
  const insertMany = db.prepare("BEGIN");
  const commit = db.prepare("COMMIT");
  insertMany.run();
  try {
    for (const row of rows) {
      const key = String(row.key || "");
      if (!key || key.endsWith("/")) continue;
      const { name, ext } = objectNameAndExt(key);
      const size = Number(row.size) || 0;
      const mtime = parseLastModifiedMs(row.lastModified ?? row.last_modified);
      const sc = String(row.storageClass || row.storage_class || "");
      const etag = String(row.etag || "").replace(/"/g, "");
      stmt.run(bucket, key, name, ext, size, mtime, sc, etag);
      if (seenKeys) seenKeys.add(key);
    }
    commit.run();
  } catch (err) {
    try {
      db.prepare("ROLLBACK").run();
    } catch {
      /* ignore */
    }
    throw err;
  }
}

/**
 * 删除扫描中未再出现的对象
 * @param {DatabaseSync} db
 * @param {string} bucket
 * @param {Set<string>} seenKeys
 */
export function pruneMissingObjects(db, bucket, seenKeys) {
  const existing = db
    .prepare("SELECT key FROM objects WHERE bucket = ?")
    .all(bucket);
  const del = db.prepare("DELETE FROM objects WHERE bucket = ? AND key = ?");
  db.prepare("BEGIN").run();
  try {
    for (const row of existing) {
      if (!seenKeys.has(row.key)) del.run(bucket, row.key);
    }
    db.prepare("COMMIT").run();
  } catch (err) {
    try {
      db.prepare("ROLLBACK").run();
    } catch {
      /* ignore */
    }
    throw err;
  }
}

export function setIndexMeta(db, bucket, { objectCount, lastIndexedAt, status }) {
  db.prepare(
    `
    INSERT INTO index_meta (bucket, object_count, last_indexed_at, status)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(bucket) DO UPDATE SET
      object_count = excluded.object_count,
      last_indexed_at = excluded.last_indexed_at,
      status = excluded.status
  `,
  ).run(
    bucket,
    Number(objectCount) || 0,
    Number(lastIndexedAt) || Date.now(),
    status || "ready",
  );
}

export function getIndexStatus(db, auth = null) {
  const buckets = db
    .prepare(
      `SELECT bucket, object_count, last_indexed_at, status FROM index_meta ORDER BY bucket`,
    )
    .all();
  const totalRow = db.prepare(`SELECT COUNT(*) AS c FROM objects`).get();
  const sizeRow = db
    .prepare(`SELECT COALESCE(SUM(size), 0) AS s FROM objects`)
    .get();
  const total = Number(totalRow?.c) || 0;
  const objectsBytes = Number(sizeRow?.s) || 0;
  let lastIndexedAt = 0;
  for (const b of buckets) {
    if (b.last_indexed_at > lastIndexedAt) lastIndexedAt = b.last_indexed_at;
  }
  // 校正 meta 与真实行数不一致（例如中断后 meta 被置 0）
  try {
    const realCounts = db
      .prepare(
        `SELECT bucket, COUNT(*) AS c FROM objects GROUP BY bucket`,
      )
      .all();
    const map = new Map(realCounts.map((r) => [r.bucket, Number(r.c) || 0]));
    for (const b of buckets) {
      if (map.has(b.bucket)) b.object_count = map.get(b.bucket);
    }
  } catch {
    /* ignore */
  }
  return {
    total_objects: total,
    objects_bytes: objectsBytes,
    index_bytes: auth ? getIndexDbBytes(auth) : 0,
    last_indexed_at: lastIndexedAt || null,
    buckets: buckets.map((b) => ({
      bucket: b.bucket,
      object_count: b.object_count,
      last_indexed_at: b.last_indexed_at || null,
      status: b.status,
    })),
  };
}

/**
 * @param {DatabaseSync} db
 * @param {string[]|null} buckets null = 全部
 */
export function clearIndex(db, buckets = null) {
  if (buckets && buckets.length) {
    const delObj = db.prepare("DELETE FROM objects WHERE bucket = ?");
    const delMeta = db.prepare("DELETE FROM index_meta WHERE bucket = ?");
    db.prepare("BEGIN").run();
    try {
      for (const b of buckets) {
        delObj.run(b);
        delMeta.run(b);
      }
      db.prepare("COMMIT").run();
    } catch (err) {
      try {
        db.prepare("ROLLBACK").run();
      } catch {
        /* ignore */
      }
      throw err;
    }
    return;
  }
  db.exec(`DELETE FROM objects; DELETE FROM index_meta;`);
}

/**
 * 索引搜索
 * @param {DatabaseSync} db
 * @param {object} query
 */
export function indexSearch(db, query = {}) {
  const {
    buckets = [],
    prefix = "",
    name = "",
    ext = "",
    size_min,
    size_max,
    mtime_from,
    mtime_to,
    storage_class = "",
    limit = 500,
  } = query;

  const where = [];
  const params = [];

  if (Array.isArray(buckets) && buckets.length) {
    where.push(`bucket IN (${buckets.map(() => "?").join(",")})`);
    params.push(...buckets.map(String));
  }
  if (prefix) {
    where.push(`substr(key, 1, ?) = ?`);
    const p = String(prefix);
    params.push(p.length, p);
  }
  if (name) {
    where.push(`instr(LOWER(name), ?) > 0`);
    params.push(String(name).toLowerCase());
  }
  if (ext) {
    const e = String(ext).replace(/^\./, "").toLowerCase();
    where.push(`ext = ?`);
    params.push(e);
  }
  if (size_min != null && size_min !== "") {
    where.push(`size >= ?`);
    params.push(Number(size_min) || 0);
  }
  if (size_max != null && size_max !== "") {
    where.push(`size <= ?`);
    params.push(Number(size_max) || 0);
  }
  if (mtime_from != null && mtime_from !== "") {
    where.push(`last_modified >= ?`);
    params.push(Number(mtime_from) || 0);
  }
  if (mtime_to != null && mtime_to !== "") {
    where.push(`last_modified <= ?`);
    params.push(Number(mtime_to) || 0);
  }
  if (storage_class) {
    where.push(`storage_class = ?`);
    params.push(String(storage_class));
  }

  const lim = Math.min(5000, Math.max(1, Number(limit) || 500));
  const sql = `
    SELECT bucket, key, name, size, last_modified, storage_class, etag, ext
    FROM objects
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY bucket, key
    LIMIT ?
  `;
  params.push(lim + 1);
  const rows = db.prepare(sql).all(...params);
  const truncated = rows.length > lim;
  const items = (truncated ? rows.slice(0, lim) : rows).map((r) => ({
    bucket: r.bucket,
    key: r.key,
    name: r.name,
    size: r.size,
    last_modified: r.last_modified,
    storage_class: r.storage_class,
    etag: r.etag,
    ext: r.ext,
  }));
  return { items, truncated, total_matched: items.length, mode: "index" };
}
