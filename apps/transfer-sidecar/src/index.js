import Fastify from "fastify";
import cors from "@fastify/cors";
import {
  abortMultipartUploads,
  buildAddressDomains,
  buildObjectAddress,
  buildBatchObjectAddresses,
  clearBucketRegionCache,
  createFolder,
  createOssClient,
  deleteKeysIncludingFolders,
  getObjectMeta,
  listAllBuckets,
  listIncompleteUploads,
  listObjectsAggregated,
  listBucketCnameRecords,
  moveOrCopyObjects,
  normalizeRegion,
  putObjectMeta,
  rememberBucketRegion,
  renameFolder,
  resolveAddressScheme,
  restoreObject,
  restoreObjects,
  testLogin,
  validateAcl,
  withBucketClient,
  applyProxyOptions,
} from "./oss.js";
import { chineseErr } from "./errors.js";
import { TransferManager } from "./transfer.js";
import { loadSettings, saveSettings } from "./settings.js";
import { verifyBatch, verifyLocalAgainstRemote } from "./integrity.js";
import {
  cancelIndexJob,
  clearSearchIndex,
  getIndexJob,
  getLatestAutoIndexJob,
  getSearchIndexStatus,
  liveSearch,
  listIndexJobs,
  searchFromIndex,
  startIndexBuild,
  startSearchAutoIndexScheduler,
  tickSearchAutoIndex,
} from "./search.js";
import fs from "fs";
import os from "os";
import path from "path";

const TOKEN = process.env.SIDECAR_TOKEN || "dev-token";
const HOST = "127.0.0.1";
const PORT = Number(process.env.SIDECAR_PORT || 17823);

function isAliyunHostQuick(domain) {
  const host = String(domain || "")
    .replace(/^https?:\/\//i, "")
    .split("/")[0]
    .toLowerCase();
  return (
    host.endsWith(".aliyuncs.com") ||
    host.endsWith(".aliyun-inc.com") ||
    host.includes("oss-accelerate")
  );
}

const state = {
  auth: null,
  client: null,
};

const transfer = new TransferManager(() => state);

function authGuard(req, reply, done) {
  const h = req.headers["x-sidecar-token"];
  if (h !== TOKEN) {
    reply.code(401).send({ code: 401, message: "未授权访问 sidecar" });
    return;
  }
  done();
}

function requireAuth(req, reply, done) {
  if (!state.auth || !state.client) {
    reply.code(401).send({ code: 401, message: "请先登录" });
    return;
  }
  done();
}

function requireWrite(req, reply, done) {
  if (state.auth?.privilege === "readOnly") {
    reply
      .code(403)
      .send({ code: 403, message: "当前为只读权限，无法执行该操作" });
    return;
  }
  done();
}

const app = Fastify({ logger: false });

async function main() {
await app.register(cors, {
  origin: true,
  methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Accept",
    "Authorization",
    "X-Sidecar-Token",
    "x-sidecar-token",
  ],
});

app.setNotFoundHandler((req, reply) => {
  reply.code(404).send({
    code: 404,
    message: `接口不存在：${req.method} ${req.url}`,
  });
});

app.addHook("onRequest", authGuard);

app.get("/health", async () => ({
  code: 0,
  message: "ok",
  data: { loggedIn: !!state.auth },
}));

app.post("/auth/login", async (req, reply) => {
  const body = req.body || {};
  try {
    const result = await testLogin(body);
    state.auth = result.auth;
    state.client = result.client;
    try {
      transfer.onAuthReady();
    } catch (e) {
      console.warn("[transfer] onAuthReady failed", e?.message || e);
    }
    try {
      tickSearchAutoIndex(() => ({ auth: state.auth, client: state.client }), {
        reason: "login",
      });
    } catch (e) {
      console.warn("[search] login auto index failed", e?.message || e);
    }
    return {
      code: 0,
      message: "登录成功",
      data: { auth: sanitizeAuth(result.auth) },
    };
  } catch (err) {
    reply.code(400);
    return { code: 400, message: chineseErr(err) };
  }
});

app.post("/auth/logout", async () => {
  state.auth = null;
  state.client = null;
  clearBucketRegionCache();
  return { code: 0, message: "已退出" };
});

app.get("/auth/session", async () => {
  // 应用热启动复用 sidecar 会话时不会再走 /auth/login，这里补一次登录自动索引检查
  if (state.auth && state.client) {
    try {
      tickSearchAutoIndex(() => ({ auth: state.auth, client: state.client }), {
        reason: "login",
      });
    } catch (e) {
      console.warn("[search] session auto index failed", e?.message || e);
    }
  }
  return {
    code: 0,
    data: state.auth ? sanitizeAuth(state.auth) : null,
  };
});

app.get("/settings", async () => ({
  code: 0,
  data: loadSettings(),
}));

app.put("/settings", async (req, reply) => {
  try {
    const body = req.body || {};
    const merged = {
      ...loadSettings(),
      ...body,
    };
    if (merged.proxyEnabled && !String(merged.proxyUrl || "").trim()) {
      reply.code(400);
      return { code: 400, message: "启用代理时请填写代理地址" };
    }
    if (
      body.transferHistoryRetention &&
      !["7d", "30d", "permanent"].includes(String(body.transferHistoryRetention))
    ) {
      reply.code(400);
      return { code: 400, message: "传输历史保留策略无效" };
    }
    if (body.searchAutoIndexTime != null) {
      const t = String(body.searchAutoIndexTime || "").trim();
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) {
        reply.code(400);
        return { code: 400, message: "自动索引时间格式无效，请使用 HH:mm" };
      }
      body.searchAutoIndexTime = t;
    }
    if (body.searchAutoIndexStaleHours != null) {
      const h = Number(body.searchAutoIndexStaleHours);
      if (!Number.isFinite(h) || h < 1 || h > 720) {
        reply.code(400);
        return { code: 400, message: "登录自动索引过期时间需在 1～720 小时" };
      }
      body.searchAutoIndexStaleHours = Math.round(h);
    }
    applyProxyOptions({}, merged);
    const next = saveSettings(body);
    if (next.transferHistoryRetention) {
      try {
        const { pruneHistory } = await import("./job-store.js");
        pruneHistory(next.transferHistoryRetention);
      } catch {
        /* ignore */
      }
    }
    // 代理等配置变更后重建客户端；失败不回滚已保存的设置
    if (state.auth) {
      try {
        state.client = createOssClient(state.auth);
      } catch (err) {
        return {
          code: 0,
          message: "设置已保存，但应用代理失败：" + chineseErr(err),
          data: next,
        };
      }
    }
    return { code: 0, message: "已保存", data: next };
  } catch (err) {
    reply.code(400);
    return { code: 400, message: chineseErr(err) };
  }
});

app.get("/buckets", { preHandler: requireAuth }, async (req, reply) => {
  try {
    const list = await listAllBuckets(state.client);
    return { code: 0, data: { list } };
  } catch (err) {
    reply.code(500);
    return { code: 500, message: chineseErr(err) };
  }
});

app.post(
  "/buckets",
  { preHandler: [requireAuth, requireWrite] },
  async (req, reply) => {
    const { name, region, acl, storageClass } = req.body || {};
    if (!name) {
      reply.code(400);
      return { code: 400, message: "Bucket 名称不能为空" };
    }
    try {
      const r = normalizeRegion(region) || state.auth.region;
      const client = createOssClient({ ...state.auth, region: r });
      const opts = {};
      if (storageClass) opts.storageClass = storageClass;
      await client.putBucket(name, opts);
      if (acl) {
        try {
          await client.putBucketACL(name, acl);
        } catch {
          /* 部分账号无 ACL 权限时忽略 */
        }
      }
      rememberBucketRegion(name, r);
      return { code: 0, message: "创建成功" };
    } catch (err) {
      reply.code(500);
      return { code: 500, message: chineseErr(err) };
    }
  },
);

app.delete(
  "/buckets/:name",
  { preHandler: [requireAuth, requireWrite] },
  async (req, reply) => {
    const { region } = req.query || {};
    try {
      await withBucketClient(
        state.auth,
        req.params.name,
        region,
        state.client,
        async (client) => {
          await client.deleteBucket(req.params.name);
        },
      );
      return { code: 0, message: "删除成功" };
    } catch (err) {
      reply.code(500);
      return { code: 500, message: chineseErr(err) };
    }
  },
);

app.get("/objects", { preHandler: requireAuth }, async (req, reply) => {
  const { bucket, prefix = "", marker = "", maxKeys, region } = req.query || {};
  if (!bucket) {
    reply.code(400);
    return { code: 400, message: "缺少 bucket" };
  }
  try {
    const settings = loadSettings();
    const data = await withBucketClient(
      state.auth,
      bucket,
      region,
      state.client,
      async (client) =>
        listObjectsAggregated(client, {
          prefix,
          marker,
          maxKeys: Number(maxKeys) || settings.listObjectNum || 500,
        }),
    );
    return { code: 0, data };
  } catch (err) {
    reply.code(500);
    return { code: 500, message: chineseErr(err) };
  }
});

app.post(
  "/objects/delete",
  { preHandler: [requireAuth, requireWrite] },
  async (req, reply) => {
    const { bucket, keys = [], region } = req.body || {};
    if (!bucket || !keys.length) {
      reply.code(400);
      return { code: 400, message: "参数不完整" };
    }
    try {
      await withBucketClient(
        state.auth,
        bucket,
        region,
        state.client,
        async (client) => {
          await deleteKeysIncludingFolders(client, keys);
        },
      );
      return { code: 0, message: "删除成功" };
    } catch (err) {
      reply.code(500);
      return { code: 500, message: chineseErr(err) };
    }
  },
);

app.post(
  "/objects/copy",
  { preHandler: [requireAuth, requireWrite] },
  async (req, reply) => {
    const { bucket, fromKey, toKey, toBucket, region } = req.body || {};
    try {
      await withBucketClient(
        state.auth,
        toBucket || bucket,
        region,
        state.client,
        async (client) => {
          // ali-oss: copy(name, sourceName[, sourceBucket])
          await client.copy(toKey, fromKey, bucket);
        },
      );
      return { code: 0, message: "复制成功" };
    } catch (err) {
      reply.code(500);
      return { code: 500, message: chineseErr(err) };
    }
  },
);

app.post(
  "/objects/rename",
  { preHandler: [requireAuth, requireWrite] },
  async (req, reply) => {
    const { bucket, fromKey, toKey, region } = req.body || {};
    if (!bucket || !fromKey || !toKey) {
      reply.code(400);
      return { code: 400, message: "参数不完整" };
    }
    try {
      await withBucketClient(
        state.auth,
        bucket,
        region,
        state.client,
        async (client) => {
          const from = String(fromKey);
          const to = String(toKey);
          if (from.endsWith("/") || to.endsWith("/")) {
            await renameFolder(client, from, to);
          } else {
            if (from === to) return;
            await client.copy(to, from);
            await client.delete(from);
          }
        },
      );
      return { code: 0, message: "重命名成功" };
    } catch (err) {
      reply.code(500);
      return { code: 500, message: chineseErr(err) };
    }
  },
);

app.post(
  "/objects/folder",
  { preHandler: [requireAuth, requireWrite] },
  async (req, reply) => {
    const { bucket, prefix, region } = req.body || {};
    if (!bucket || !prefix) {
      reply.code(400);
      return { code: 400, message: "参数不完整" };
    }
    try {
      const data = await withBucketClient(
        state.auth,
        bucket,
        region,
        state.client,
        async (client) => createFolder(client, prefix),
      );
      return { code: 0, message: "创建成功", data };
    } catch (err) {
      reply.code(500);
      return { code: 500, message: chineseErr(err) };
    }
  },
);

app.get("/objects/acl", { preHandler: requireAuth }, async (req, reply) => {
  const { bucket, key, region } = req.query || {};
  if (!bucket || !key) {
    reply.code(400);
    return { code: 400, message: "参数不完整" };
  }
  try {
    const data = await withBucketClient(
      state.auth,
      bucket,
      region,
      state.client,
      async (client) => {
        const res = await client.getACL(String(key));
        return { acl: res?.acl || "default" };
      },
    );
    return { code: 0, data };
  } catch (err) {
    reply.code(500);
    return { code: 500, message: chineseErr(err) };
  }
});

app.put(
  "/objects/acl",
  { preHandler: [requireAuth, requireWrite] },
  async (req, reply) => {
    const { bucket, key, acl, region } = req.body || {};
    if (!bucket || !key || !acl) {
      reply.code(400);
      return { code: 400, message: "参数不完整" };
    }
    try {
      const nextAcl = validateAcl(acl);
      await withBucketClient(
        state.auth,
        bucket,
        region,
        state.client,
        async (client) => {
          await client.putACL(String(key), nextAcl);
        },
      );
      return { code: 0, message: "ACL 已更新" };
    } catch (err) {
      reply.code(500);
      return { code: 500, message: chineseErr(err) };
    }
  },
);

app.get("/objects/meta", { preHandler: requireAuth }, async (req, reply) => {
  const { bucket, key, region } = req.query || {};
  if (!bucket || !key) {
    reply.code(400);
    return { code: 400, message: "参数不完整" };
  }
  try {
    const data = await withBucketClient(
      state.auth,
      bucket,
      region,
      state.client,
      async (client) => getObjectMeta(client, key),
    );
    return { code: 0, data };
  } catch (err) {
    reply.code(500);
    return { code: 500, message: chineseErr(err) };
  }
});

/** 本地文件与云端对象完整性对比（优先 CRC64，不用分片 ETag 当 MD5） */
app.post("/objects/verify", { preHandler: requireAuth }, async (req, reply) => {
  const {
    bucket,
    key,
    localPath,
    local_path,
    region,
    mode = "auto",
  } = req.body || {};
  const lp = localPath || local_path;
  if (!bucket || !key || !lp) {
    reply.code(400);
    return { code: 400, message: "参数不完整" };
  }
  try {
    if (region) rememberBucketRegion(bucket, region);
    const data = await withBucketClient(
      state.auth,
      bucket,
      region,
      state.client,
      async (client) =>
        verifyLocalAgainstRemote(client, key, String(lp), { mode }),
    );
    return { code: 0, data };
  } catch (err) {
    reply.code(500);
    return { code: 500, message: chineseErr(err) };
  }
});

/**
 * 批量校验目录/选中对象
 * body: { bucket, keys?, prefix?, localDir, stripPrefix?, region?, mode? }
 * 若传 prefix 且未传 keys，则列举该前缀下全部对象
 */
app.post(
  "/objects/verify/batch",
  { preHandler: requireAuth },
  async (req, reply) => {
    const {
      bucket,
      keys = [],
      prefix = "",
      localDir,
      local_dir,
      stripPrefix = "",
      region,
      mode = "auto",
    } = req.body || {};
    const dir = localDir || local_dir;
    if (!bucket || !dir) {
      reply.code(400);
      return { code: 400, message: "参数不完整" };
    }
    try {
      if (region) rememberBucketRegion(bucket, region);
      const data = await withBucketClient(
        state.auth,
        bucket,
        region,
        state.client,
        async (client) => {
          let list = Array.isArray(keys) ? [...keys] : [];
          if (!list.length && prefix) {
            let token;
            do {
              const res = await client.listV2({
                prefix,
                "max-keys": 1000,
                "continuation-token": token || undefined,
              });
              for (const o of res.objects || []) {
                if (o.name && !o.name.endsWith("/")) list.push(o.name);
              }
              token = res.isTruncated ? res.nextContinuationToken : "";
            } while (token);
          }
          if (!list.length) throw new Error("没有可校验的对象");
          return verifyBatch(client, {
            keys: list,
            localDir: String(dir),
            stripPrefix: stripPrefix || prefix || "",
            mode,
          });
        },
      );
      return {
        code: 0,
        message: `校验完成：通过 ${data.summary.passed}，失败 ${data.summary.failed}，跳过 ${data.summary.skipped}`,
        data,
      };
    } catch (err) {
      reply.code(500);
      return { code: 500, message: chineseErr(err) };
    }
  },
);

/** 全局搜索：mode=live 即时列举；mode=index 本地索引 */
app.post("/objects/search", { preHandler: requireAuth }, async (req, reply) => {
  const body = req.body || {};
  const mode = body.mode === "index" ? "index" : "live";
  const query = {
    buckets: Array.isArray(body.buckets) ? body.buckets : [],
    prefix: body.prefix || "",
    name: body.name || body.keyword || "",
    ext: body.ext || body.extension || "",
    size_min: body.size_min ?? body.sizeMin,
    size_max: body.size_max ?? body.sizeMax,
    mtime_from: body.mtime_from ?? body.mtimeFrom,
    mtime_to: body.mtime_to ?? body.mtimeTo,
    storage_class: body.storage_class || body.storageClass || "",
    limit: body.limit,
    region: body.region || "",
  };
  let aborted = false;
  const onClose = () => {
    aborted = true;
  };
  req.raw.on("close", onClose);
  try {
    const data =
      mode === "index"
        ? searchFromIndex(state.auth, query)
        : await liveSearch(state.auth, state.client, query, {
            shouldAbort: () => aborted || req.raw.aborted || req.raw.destroyed,
          });
    if (aborted || req.raw.aborted) {
      reply.code(499);
      return { code: 499, message: "已取消" };
    }
    return {
      code: 0,
      message: data.truncated
        ? `已返回 ${data.items.length} 条（结果已截断）`
        : `找到 ${data.items.length} 条`,
      data,
    };
  } catch (err) {
    if (String(err?.message || "") === "已取消" || aborted || req.raw.aborted) {
      reply.code(499);
      return { code: 499, message: "已取消" };
    }
    reply.code(500);
    return { code: 500, message: chineseErr(err) };
  } finally {
    req.raw.off("close", onClose);
  }
});

app.get("/search/index/status", { preHandler: requireAuth }, async () => ({
  code: 0,
  data: getSearchIndexStatus(state.auth),
}));

app.get("/search/index/jobs", { preHandler: requireAuth }, async () => ({
  code: 0,
  data: {
    list: listIndexJobs(),
    latest_auto: getLatestAutoIndexJob(),
  },
}));

app.post(
  "/search/index/build",
  { preHandler: requireAuth },
  async (req, reply) => {
    const { buckets = [], region = "", prefix = "" } = req.body || {};
    try {
      const data = startIndexBuild(state.auth, state.client, {
        buckets: Array.isArray(buckets) ? buckets : [],
        region,
        prefix,
      });
      return { code: 0, message: "索引任务已启动", data };
    } catch (err) {
      reply.code(500);
      return { code: 500, message: chineseErr(err) };
    }
  },
);

app.post(
  "/search/index/refresh",
  { preHandler: requireAuth },
  async (req, reply) => {
    const { buckets = [], region = "" } = req.body || {};
    try {
      const data = startIndexBuild(state.auth, state.client, {
        buckets: Array.isArray(buckets) ? buckets : [],
        region,
      });
      return { code: 0, message: "增量更新已启动", data };
    } catch (err) {
      reply.code(500);
      return { code: 500, message: chineseErr(err) };
    }
  },
);

app.delete("/search/index", { preHandler: requireAuth }, async (req, reply) => {
  const body = req.body || {};
  const buckets = Array.isArray(body.buckets) ? body.buckets : null;
  try {
    const data = clearSearchIndex(state.auth, buckets);
    return { code: 0, message: "本地索引已清除", data };
  } catch (err) {
    reply.code(500);
    return { code: 500, message: chineseErr(err) };
  }
});

app.get(
  "/search/index/jobs/:id",
  { preHandler: requireAuth },
  async (req, reply) => {
    const job = getIndexJob(req.params.id);
    if (!job) {
      reply.code(404);
      return { code: 404, message: "任务不存在" };
    }
    return { code: 0, data: job };
  },
);

app.post(
  "/search/index/jobs/:id/cancel",
  { preHandler: requireAuth },
  async (req, reply) => {
    const ok = cancelIndexJob(req.params.id);
    if (!ok) {
      reply.code(404);
      return { code: 404, message: "任务不存在" };
    }
    return { code: 0, message: "已请求取消" };
  },
);

app.put(
  "/objects/meta",
  { preHandler: [requireAuth, requireWrite] },
  async (req, reply) => {
    const { bucket, key, region, headers = {}, meta = {} } = req.body || {};
    if (!bucket || !key) {
      reply.code(400);
      return { code: 400, message: "参数不完整" };
    }
    try {
      await withBucketClient(
        state.auth,
        bucket,
        region,
        state.client,
        async (client) => {
          await putObjectMeta(client, bucket, key, headers, meta);
        },
      );
      return { code: 0, message: "元数据已更新" };
    } catch (err) {
      reply.code(500);
      return { code: 500, message: chineseErr(err) };
    }
  },
);

app.post(
  "/objects/restore",
  { preHandler: [requireAuth, requireWrite] },
  async (req, reply) => {
    const { bucket, key, keys = [], days = 1, region } = req.body || {};
    const list = keys?.length ? keys : key ? [key] : [];
    if (!bucket || !list.length) {
      reply.code(400);
      return { code: 400, message: "参数不完整" };
    }
    try {
      const data = await withBucketClient(
        state.auth,
        bucket,
        region,
        state.client,
        async (client) => {
          if (list.length === 1) {
            await restoreObject(client, list[0], days);
            return { total: 1, done: 1, failed: 0 };
          }
          return restoreObjects(client, list, days);
        },
      );
      return { code: 0, message: "解冻任务已提交", data };
    } catch (err) {
      reply.code(500);
      return { code: 500, message: chineseErr(err) };
    }
  },
);

app.post(
  "/objects/symlink",
  { preHandler: [requireAuth, requireWrite] },
  async (req, reply) => {
    const { bucket, target, linkName, region } = req.body || {};
    if (!bucket || !target || !linkName) {
      reply.code(400);
      return { code: 400, message: "参数不完整" };
    }
    try {
      await withBucketClient(
        state.auth,
        bucket,
        region,
        state.client,
        async (client) => {
          await client.putSymlink(String(linkName), String(target));
        },
      );
      return { code: 0, message: "软链接已创建" };
    } catch (err) {
      reply.code(500);
      return { code: 500, message: chineseErr(err) };
    }
  },
);

app.get("/objects/symlink", { preHandler: requireAuth }, async (req, reply) => {
  const { bucket, key, region } = req.query || {};
  if (!bucket || !key) {
    reply.code(400);
    return { code: 400, message: "参数不完整" };
  }
  try {
    const data = await withBucketClient(
      state.auth,
      bucket,
      region,
      state.client,
      async (client) => {
        const res = await client.getSymlink(String(key));
        return { target: res?.targetName || res?.target || "" };
      },
    );
    return { code: 0, data };
  } catch (err) {
    reply.code(500);
    return { code: 500, message: chineseErr(err) };
  }
});

app.get(
  "/buckets/:name/acl",
  { preHandler: requireAuth },
  async (req, reply) => {
    const { region } = req.query || {};
    try {
      const data = await withBucketClient(
        state.auth,
        req.params.name,
        region,
        state.client,
        async (client) => {
          const res = await client.getBucketACL(req.params.name);
          return { acl: res?.acl || "default" };
        },
      );
      return { code: 0, data };
    } catch (err) {
      reply.code(500);
      return { code: 500, message: chineseErr(err) };
    }
  },
);

app.put(
  "/buckets/:name/acl",
  { preHandler: [requireAuth, requireWrite] },
  async (req, reply) => {
    const { acl, region } = req.body || {};
    if (!acl) {
      reply.code(400);
      return { code: 400, message: "缺少 acl" };
    }
    try {
      const nextAcl = validateAcl(acl);
      await withBucketClient(
        state.auth,
        req.params.name,
        region,
        state.client,
        async (client) => {
          await client.putBucketACL(req.params.name, nextAcl);
        },
      );
      return { code: 0, message: "Bucket ACL 已更新" };
    } catch (err) {
      reply.code(500);
      return { code: 500, message: chineseErr(err) };
    }
  },
);

app.get(
  "/buckets/:name/multipart",
  { preHandler: requireAuth },
  async (req, reply) => {
    const { region, prefix = "", marker = "" } = req.query || {};
    try {
      const data = await withBucketClient(
        state.auth,
        req.params.name,
        region,
        state.client,
        async (client) => listIncompleteUploads(client, { prefix, marker }),
      );
      return { code: 0, data };
    } catch (err) {
      reply.code(500);
      return { code: 500, message: chineseErr(err) };
    }
  },
);

app.post(
  "/buckets/:name/multipart/abort",
  { preHandler: [requireAuth, requireWrite] },
  async (req, reply) => {
    const { uploads = [], region } = req.body || {};
    if (!uploads.length) {
      reply.code(400);
      return { code: 400, message: "参数不完整" };
    }
    try {
      const data = await withBucketClient(
        state.auth,
        req.params.name,
        region,
        state.client,
        async (client) => abortMultipartUploads(client, uploads),
      );
      return { code: 0, message: "已取消分片上传", data };
    } catch (err) {
      reply.code(500);
      return { code: 500, message: chineseErr(err) };
    }
  },
);

app.post("/objects/sign", { preHandler: requireAuth }, async (req, reply) => {
  const { bucket, key, expires = 3600, region, domain } = req.body || {};
  if (!bucket || !key) {
    reply.code(400);
    return { code: 400, message: "参数不完整" };
  }
  try {
    const data = await withBucketClient(
      state.auth,
      bucket,
      region,
      state.client,
      async (client) => {
        let url = client.signatureUrl(key, {
          expires: Number(expires) || 3600,
        });
        let scheme = "https";
        if (domain) {
          const cnameRecords = isAliyunHostQuick(domain)
            ? []
            : await listBucketCnameRecords(client, bucket);
          scheme = resolveAddressScheme(domain, cnameRecords);
          const host = String(domain)
            .replace(/^https?:\/\//i, "")
            .replace(/\/$/, "");
          url = String(url).replace(
            /^https?:\/\/[^/]+\//i,
            `${scheme}://${host}/`,
          );
        }
        return {
          url,
          expires: Number(expires) || 3600,
          domain: domain || "",
          scheme,
        };
      },
    );
    return { code: 0, data };
  } catch (err) {
    reply.code(500);
    return { code: 500, message: chineseErr(err) };
  }
});

/** 获取地址：公开读返回直链，私有返回签名链接 */
app.post(
  "/objects/address",
  { preHandler: requireAuth },
  async (req, reply) => {
    const { bucket, key, expires = 3600, region, domain } = req.body || {};
    if (!bucket || !key) {
      reply.code(400);
      return { code: 400, message: "参数不完整" };
    }
    try {
      if (region) rememberBucketRegion(bucket, region);
      const data = await buildObjectAddress({
        auth: state.auth,
        serviceClient: state.client,
        bucket,
        key,
        expires,
        region,
        domain: domain || "",
      });
      return { code: 0, data };
    } catch (err) {
      reply.code(500);
      return { code: 500, message: chineseErr(err) };
    }
  },
);

/** 批量获取地址：支持目录展开 */
app.post(
  "/objects/addresses",
  { preHandler: requireAuth },
  async (req, reply) => {
    const {
      bucket,
      keys = [],
      expires = 3600,
      region,
      domain,
      maxFiles = 5000,
    } = req.body || {};
    if (!bucket || !keys.length) {
      reply.code(400);
      return { code: 400, message: "参数不完整" };
    }
    try {
      if (region) rememberBucketRegion(bucket, region);
      const data = await buildBatchObjectAddresses({
        auth: state.auth,
        serviceClient: state.client,
        bucket,
        keys,
        expires,
        region,
        domain: domain || "",
        maxFiles: Math.min(20000, Math.max(1, Number(maxFiles) || 5000)),
      });
      return { code: 0, data };
    } catch (err) {
      reply.code(500);
      return { code: 500, message: chineseErr(err) };
    }
  },
);

app.get(
  "/buckets/:name/domains",
  { preHandler: requireAuth },
  async (req, reply) => {
    const { region } = req.query || {};
    try {
      const data = await buildAddressDomains(
        state.auth,
        req.params.name,
        region,
        state.client,
      );
      return { code: 0, data };
    } catch (err) {
      reply.code(500);
      return { code: 500, message: chineseErr(err) };
    }
  },
);

app.get("/objects/content", { preHandler: requireAuth }, async (req, reply) => {
  const { bucket, key, region } = req.query || {};
  if (!bucket || !key) {
    reply.code(400);
    return { code: 400, message: "参数不完整" };
  }
  try {
    const data = await withBucketClient(
      state.auth,
      String(bucket),
      region,
      state.client,
      async (client) => {
        const head = await client.head(String(key));
        const size = Number(head.res?.headers?.["content-length"] || 0);
        if (size > 2 * 1024 * 1024) {
          throw new Error("文件过大，请下载后查看");
        }
        const result = await client.get(String(key));
        const buf = Buffer.isBuffer(result.content)
          ? result.content
          : Buffer.from(result.content || "");
        const contentType =
          head.res?.headers?.["content-type"] || "application/octet-stream";
        return {
          content: buf.toString("utf8"),
          contentType,
          size,
        };
      },
    );
    return { code: 0, data };
  } catch (err) {
    reply.code(500);
    return { code: 500, message: chineseErr(err) };
  }
});

/** 媒体预览：直出二进制，避免浏览器跨域导致音频无法分析频谱 */
app.get("/objects/media", { preHandler: requireAuth }, async (req, reply) => {
  const { bucket, key, region } = req.query || {};
  if (!bucket || !key) {
    reply.code(400);
    return { code: 400, message: "参数不完整" };
  }
  try {
    const result = await withBucketClient(
      state.auth,
      String(bucket),
      region,
      state.client,
      async (client) => {
        const head = await client.head(String(key));
        const size = Number(head.res?.headers?.["content-length"] || 0);
        if (size > 80 * 1024 * 1024) {
          throw new Error("音频文件过大，请下载后播放");
        }
        const obj = await client.get(String(key));
        const buf = Buffer.isBuffer(obj.content)
          ? obj.content
          : Buffer.from(obj.content || "");
        const contentType =
          head.res?.headers?.["content-type"] || "application/octet-stream";
        return { buf, contentType, size };
      },
    );
    reply.header("Content-Type", result.contentType);
    reply.header("Content-Length", String(result.buf.length));
    reply.header("Cache-Control", "no-store");
    return reply.send(result.buf);
  } catch (err) {
    reply.code(500);
    return { code: 500, message: chineseErr(err) };
  }
});

app.get("/transfer/jobs", { preHandler: requireAuth }, async () => {
  transfer.dedupeAllTransferJobs();
  return {
    code: 0,
    data: { list: transfer.list() },
  };
});

app.post(
  "/transfer/upload",
  { preHandler: [requireAuth, requireWrite] },
  async (req, reply) => {
    const { bucket, prefix = "", localPaths = [], region } = req.body || {};
    if (!bucket || !localPaths.length) {
      reply.code(400);
      return { code: 400, message: "参数不完整" };
    }
    try {
      if (region) rememberBucketRegion(bucket, region);
      const { overwriteSameName } = req.body || {};
      const data = await transfer.enqueueUpload({
        bucket,
        prefix,
        localPaths,
        region,
        ...(typeof overwriteSameName === "boolean"
          ? { overwriteSameName }
          : {}),
      });
      return { code: 0, data };
    } catch (err) {
      reply.code(500);
      return { code: 500, message: chineseErr(err) };
    }
  },
);

app.post(
  "/transfer/download",
  { preHandler: requireAuth },
  async (req, reply) => {
    const {
      bucket,
      keys = [],
      localDir,
      region,
      stripPrefix = "",
    } = req.body || {};
    if (!bucket || !keys.length || !localDir) {
      reply.code(400);
      return { code: 400, message: "参数不完整" };
    }
    try {
      if (region) rememberBucketRegion(bucket, region);
      const jobs = await transfer.enqueueDownload({
        bucket,
        keys,
        localDir,
        region,
        stripPrefix,
      });
      return { code: 0, data: { jobs } };
    } catch (err) {
      reply.code(500);
      return { code: 500, message: chineseErr(err) };
    }
  },
);

/** 同步下载（拖拽出窗口用），返回本地路径 */
app.post(
  "/transfer/download-now",
  { preHandler: requireAuth },
  async (req, reply) => {
    const {
      bucket,
      keys = [],
      localDir,
      region,
      stripPrefix = "",
    } = req.body || {};
    if (!bucket || !keys.length || !localDir) {
      reply.code(400);
      return { code: 400, message: "参数不完整" };
    }
    try {
      if (region) rememberBucketRegion(bucket, region);
      const data = await transfer.downloadNow({
        bucket,
        keys,
        localDir,
        region,
        stripPrefix,
      });
      return { code: 0, data };
    } catch (err) {
      reply.code(500);
      return { code: 500, message: chineseErr(err) };
    }
  },
);

app.post(
  "/transfer/move",
  { preHandler: [requireAuth, requireWrite] },
  async (req, reply) => {
    const {
      bucket,
      keys = [],
      toBucket,
      toPrefix = "",
      fromPrefix = "",
      region,
      toRegion,
      isCopy = false,
    } = req.body || {};
    if (!bucket || !keys.length || !(toBucket || bucket)) {
      reply.code(400);
      return { code: 400, message: "参数不完整" };
    }
    try {
      if (region) rememberBucketRegion(bucket, region);
      if (toBucket && toRegion) rememberBucketRegion(toBucket, toRegion);
      const data = await transfer.enqueueMoveCopy({
        bucket,
        keys,
        toBucket: toBucket || bucket,
        toPrefix,
        fromPrefix,
        region,
        toRegion: toRegion || region,
        isCopy: !!isCopy,
      });
      return {
        code: 0,
        message: isCopy ? "已加入复制队列" : "已加入移动队列",
        data,
      };
    } catch (err) {
      reply.code(500);
      return { code: 500, message: chineseErr(err) };
    }
  },
);

app.post(
  "/objects/move",
  { preHandler: [requireAuth, requireWrite] },
  async (req, reply) => {
    const {
      bucket,
      keys = [],
      toBucket,
      toPrefix = "",
      fromPrefix = "",
      region,
      toRegion,
      isCopy = false,
    } = req.body || {};
    if (!bucket || !keys.length || !(toBucket || bucket)) {
      reply.code(400);
      return { code: 400, message: "参数不完整" };
    }
    try {
      const result = await moveOrCopyObjects({
        auth: state.auth,
        serviceClient: state.client,
        bucket,
        keys,
        toBucket: toBucket || bucket,
        toPrefix,
        fromPrefix,
        region,
        toRegion: toRegion || region,
        isCopy: !!isCopy,
      });
      return {
        code: 0,
        message: isCopy ? "复制完成" : "移动完成",
        data: result,
      };
    } catch (err) {
      reply.code(500);
      return { code: 500, message: chineseErr(err) };
    }
  },
);

app.post("/transfer/jobs/clear", { preHandler: requireAuth }, async (req) => {
  const { type = "all", onlyFinished = false } = req.body || {};
  const ids = transfer.clear({ type, onlyFinished: !!onlyFinished });
  return { code: 0, message: "已清空", data: { ids, count: ids.length } };
});

app.post("/transfer/jobs/pause", { preHandler: requireAuth }, async (req) => {
  const { id } = req.body || {};
  if (!id) return { code: 400, message: "缺少任务 id" };
  transfer.pause(String(id));
  return { code: 0, message: "已暂停" };
});

app.post("/transfer/jobs/resume", { preHandler: requireAuth }, async (req) => {
  const { id } = req.body || {};
  if (!id) return { code: 400, message: "缺少任务 id" };
  transfer.resume(String(id));
  return { code: 0, message: "已继续" };
});

app.post("/transfer/jobs/remove", { preHandler: requireAuth }, async (req) => {
  const { id, ids } = req.body || {};
  const list = Array.isArray(ids) ? ids : id ? [id] : [];
  if (!list.length) return { code: 400, message: "缺少任务 id" };
  const removed = [];
  for (const item of list) {
    if (transfer.remove(String(item))) removed.push(String(item));
  }
  return {
    code: 0,
    message: "已移除",
    data: { ids: removed, count: removed.length },
  };
});

/** 立即刷盘（应用退出前调用，无需登录态也可） */
app.post("/transfer/persist", async () => {
  transfer.flushToDisk();
  return { code: 0, message: "已保存传输任务" };
});

app.get("/transfer/export", { preHandler: requireAuth }, async () => ({
  code: 0,
  data: transfer.exportActiveJobs(),
}));

app.post("/transfer/import", { preHandler: requireAuth }, async (req, reply) => {
  try {
    const data = transfer.importJobs(req.body || {});
    return { code: 0, message: `已导入 ${data.imported} 个任务`, data };
  } catch (err) {
    reply.code(400);
    return { code: 400, message: chineseErr(err) };
  }
});

app.get("/transfer/history", { preHandler: requireAuth }, async (req) => {
  const limit = Math.min(1000, Math.max(1, Number(req.query?.limit) || 200));
  return { code: 0, data: { list: transfer.getHistory(limit) } };
});

app.get("/transfer/events", { preHandler: requireAuth }, async (req, reply) => {
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });
  const send = (payload) => {
    reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
  };
  send({ type: "snapshot", list: transfer.list() });
  const onProgress = (job) => send({ type: "progress", job });
  const onRemoved = (payload) => send({ type: "removed", ...payload });
  const onSnapshot = (payload) =>
    send({ type: "snapshot", list: payload.list || [] });
  transfer.on("progress", onProgress);
  transfer.on("removed", onRemoved);
  transfer.on("snapshot", onSnapshot);
  req.raw.on("close", () => {
    transfer.off("progress", onProgress);
    transfer.off("removed", onRemoved);
    transfer.off("snapshot", onSnapshot);
  });
  await new Promise(() => {});
});

function sanitizeAuth(auth) {
  return {
    id: auth.id,
    region: auth.region,
    eptpl: auth.eptpl,
    eptplcname: auth.eptplcname || "",
    cname: !!auth.cname,
    osspath: auth.osspath || "",
    privilege: auth.privilege || "all",
    hasSecret: !!auth.secret,
    hasStoken: !!auth.stoken,
    isRequestPay: !!auth.isRequestPay,
  };
}

const address = await app.listen({ host: HOST, port: PORT || 0 });
const info = app.server.address();
const port = typeof info === "object" && info ? info.port : PORT;
const metaDir = path.join(os.homedir(), ".hyh-oss-browser");
fs.mkdirSync(metaDir, { recursive: true });
fs.writeFileSync(
  path.join(metaDir, "sidecar.json"),
  JSON.stringify({ host: HOST, port, token: TOKEN, pid: process.pid }, null, 2),
);
console.log(`[sidecar] listening on http://${HOST}:${port}`);

startSearchAutoIndexScheduler(() =>
  state.auth && state.client
    ? { auth: state.auth, client: state.client }
    : null,
);

const gracefulPersist = () => {
  try {
    transfer.flushToDisk();
  } catch (e) {
    console.warn("[sidecar] persist on exit failed", e?.message || e);
  }
};
process.on("SIGINT", () => {
  gracefulPersist();
  process.exit(0);
});
process.on("SIGTERM", () => {
  gracefulPersist();
  process.exit(0);
});
process.on("beforeExit", gracefulPersist);
}

main().catch((err) => {
  console.error("[sidecar] fatal:", err);
  process.exit(1);
});
