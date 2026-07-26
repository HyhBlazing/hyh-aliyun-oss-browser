import Fastify from "fastify";
import cors from "@fastify/cors";
import { createOssClient, testLogin } from "./oss.js";
import { TransferManager } from "./transfer.js";
import { loadSettings, saveSettings } from "./settings.js";
import fs from "fs";
import os from "os";
import path from "path";

const TOKEN = process.env.SIDECAR_TOKEN || "dev-token";
const HOST = "127.0.0.1";
const PORT = Number(process.env.SIDECAR_PORT || 0);

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

const app = Fastify({ logger: false });
await app.register(cors, { origin: true });

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
    return { code: 0, message: "登录成功", data: { auth: sanitizeAuth(result.auth) } };
  } catch (err) {
    reply.code(400);
    return { code: 400, message: err.message || "登录失败" };
  }
});

app.post("/auth/logout", async () => {
  state.auth = null;
  state.client = null;
  return { code: 0, message: "已退出" };
});

app.get("/auth/session", async () => ({
  code: 0,
  data: state.auth ? sanitizeAuth(state.auth) : null,
}));

app.get("/settings", async () => ({
  code: 0,
  data: loadSettings(),
}));

app.put("/settings", async (req) => {
  const next = saveSettings(req.body || {});
  return { code: 0, message: "已保存", data: next };
});

app.get("/buckets", { preHandler: requireAuth }, async (req, reply) => {
  try {
    const res = await state.client.listBuckets();
    const list = (res.buckets || []).map((b) => ({
      name: b.name,
      region: b.region,
      creationDate: b.creationDate,
      storageClass: b.storageClass,
    }));
    return { code: 0, data: { list } };
  } catch (err) {
    reply.code(500);
    return { code: 500, message: chineseErr(err) };
  }
});

app.post("/buckets", { preHandler: requireAuth }, async (req, reply) => {
  const { name, region, acl } = req.body || {};
  if (!name) {
    reply.code(400);
    return { code: 400, message: "Bucket 名称不能为空" };
  }
  try {
    const client = createOssClient({ ...state.auth, region: region || state.auth.region });
    await client.putBucket(name, {
      storageClass: "Standard",
      acl: acl || "private",
      dataRedundancyType: "LRS",
    });
    return { code: 0, message: "创建成功" };
  } catch (err) {
    reply.code(500);
    return { code: 500, message: chineseErr(err) };
  }
});

app.delete("/buckets/:name", { preHandler: requireAuth }, async (req, reply) => {
  try {
    await state.client.deleteBucket(req.params.name);
    return { code: 0, message: "删除成功" };
  } catch (err) {
    reply.code(500);
    return { code: 500, message: chineseErr(err) };
  }
});

app.get("/objects", { preHandler: requireAuth }, async (req, reply) => {
  const { bucket, prefix = "", marker = "", maxKeys } = req.query || {};
  if (!bucket) {
    reply.code(400);
    return { code: 400, message: "缺少 bucket" };
  }
  try {
    const settings = loadSettings();
    const client = createOssClient({ ...state.auth, bucket });
    const res = await client.listV2({
      prefix,
      "continuation-token": marker || undefined,
      "max-keys": Number(maxKeys) || settings.listObjectNum || 500,
      delimiter: "/",
    });
    const folders = (res.prefixes || []).map((p) => ({
      name: p,
      isFolder: true,
      path: p,
    }));
    const files = (res.objects || [])
      .filter((o) => o.name !== prefix)
      .map((o) => ({
        name: o.name,
        isFolder: false,
        size: o.size,
        lastModified: o.lastModified,
        storageClass: o.storageClass,
        etag: o.etag,
      }));
    return {
      code: 0,
      data: {
        list: [...folders, ...files],
        nextMarker: res.nextContinuationToken || "",
        isTruncated: !!res.isTruncated,
        prefix,
      },
    };
  } catch (err) {
    reply.code(500);
    return { code: 500, message: chineseErr(err) };
  }
});

app.post("/objects/delete", { preHandler: requireAuth }, async (req, reply) => {
  const { bucket, keys = [] } = req.body || {};
  if (!bucket || !keys.length) {
    reply.code(400);
    return { code: 400, message: "参数不完整" };
  }
  try {
    const client = createOssClient({ ...state.auth, bucket });
    await client.deleteMulti(keys, { quiet: true });
    return { code: 0, message: "删除成功" };
  } catch (err) {
    reply.code(500);
    return { code: 500, message: chineseErr(err) };
  }
});

app.post("/objects/copy", { preHandler: requireAuth }, async (req, reply) => {
  const { bucket, fromKey, toKey, toBucket } = req.body || {};
  try {
    const client = createOssClient({ ...state.auth, bucket: toBucket || bucket });
    await client.copy(toKey, `/${bucket}/${fromKey}`);
    return { code: 0, message: "复制成功" };
  } catch (err) {
    reply.code(500);
    return { code: 500, message: chineseErr(err) };
  }
});

app.post("/objects/rename", { preHandler: requireAuth }, async (req, reply) => {
  const { bucket, fromKey, toKey } = req.body || {};
  try {
    const client = createOssClient({ ...state.auth, bucket });
    await client.copy(toKey, `/${bucket}/${fromKey}`);
    await client.delete(fromKey);
    return { code: 0, message: "重命名成功" };
  } catch (err) {
    reply.code(500);
    return { code: 500, message: chineseErr(err) };
  }
});

app.get("/transfer/jobs", { preHandler: requireAuth }, async () => ({
  code: 0,
  data: { list: transfer.list() },
}));

app.post("/transfer/upload", { preHandler: requireAuth }, async (req, reply) => {
  const { bucket, prefix = "", localPaths = [] } = req.body || {};
  if (!bucket || !localPaths.length) {
    reply.code(400);
    return { code: 400, message: "参数不完整" };
  }
  try {
    const jobs = await transfer.enqueueUpload({ bucket, prefix, localPaths });
    return { code: 0, data: { jobs } };
  } catch (err) {
    reply.code(500);
    return { code: 500, message: chineseErr(err) };
  }
});

app.post("/transfer/download", { preHandler: requireAuth }, async (req, reply) => {
  const { bucket, keys = [], localDir } = req.body || {};
  if (!bucket || !keys.length || !localDir) {
    reply.code(400);
    return { code: 400, message: "参数不完整" };
  }
  try {
    const jobs = await transfer.enqueueDownload({ bucket, keys, localDir });
    return { code: 0, data: { jobs } };
  } catch (err) {
    reply.code(500);
    return { code: 500, message: chineseErr(err) };
  }
});

app.post("/transfer/jobs/:id/pause", { preHandler: requireAuth }, async (req) => {
  transfer.pause(req.params.id);
  return { code: 0, message: "已暂停" };
});

app.post("/transfer/jobs/:id/resume", { preHandler: requireAuth }, async (req) => {
  transfer.resume(req.params.id);
  return { code: 0, message: "已继续" };
});

app.post("/transfer/jobs/:id/remove", { preHandler: requireAuth }, async (req) => {
  transfer.remove(req.params.id);
  return { code: 0, message: "已移除" };
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
  transfer.on("progress", onProgress);
  req.raw.on("close", () => {
    transfer.off("progress", onProgress);
  });
  // keep open
  await new Promise(() => {});
});

function sanitizeAuth(auth) {
  return {
    id: auth.id,
    region: auth.region,
    eptpl: auth.eptpl,
    cname: !!auth.cname,
    osspath: auth.osspath || "",
    privilege: auth.privilege || "all",
    hasSecret: !!auth.secret,
    hasStoken: !!auth.stoken,
  };
}

function chineseErr(err) {
  return err?.message || err?.code || "操作失败";
}

const address = await app.listen({ host: HOST, port: PORT || 0 });
const info = app.server.address();
const port = typeof info === "object" && info ? info.port : PORT;
const metaDir = path.join(os.homedir(), ".hyh-oss-browser");
fs.mkdirSync(metaDir, { recursive: true });
fs.writeFileSync(
  path.join(metaDir, "sidecar.json"),
  JSON.stringify({ host: HOST, port, token: TOKEN, pid: process.pid }, null, 2)
);
console.log(`[sidecar] listening on http://${HOST}:${port}`);
