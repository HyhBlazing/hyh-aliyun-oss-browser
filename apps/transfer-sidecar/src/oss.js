import OSS from "ali-oss";
import { loadSettings } from "./settings.js";

/** @typedef {{ region: string, extranetEndpoint?: string, intranetEndpoint?: string }} BucketMeta */

/** @type {Map<string, BucketMeta>} */
const bucketMetaCache = new Map();

export function normalizeRegion(region) {
  if (!region) return "";
  let r = String(region).trim();
  if (r && !r.startsWith("oss-") && /^[a-z0-9]+-/.test(r) && !r.includes(".")) {
    r = `oss-${r}`;
  }
  return r;
}

export function rememberBucketMeta(bucket, meta = {}) {
  if (!bucket) return;
  const prev = bucketMetaCache.get(bucket) || {};
  const next = {
    region: normalizeRegion(meta.region || prev.region || ""),
    extranetEndpoint: meta.extranetEndpoint || prev.extranetEndpoint || "",
    intranetEndpoint: meta.intranetEndpoint || prev.intranetEndpoint || "",
  };
  if (next.region || next.extranetEndpoint) {
    bucketMetaCache.set(bucket, next);
  }
  return next;
}

export function rememberBucketRegion(bucket, region) {
  return rememberBucketMeta(bucket, { region })?.region || "";
}

export function getCachedBucketRegion(bucket) {
  return bucketMetaCache.get(bucket)?.region || "";
}

export function getCachedBucketMeta(bucket) {
  return bucketMetaCache.get(bucket) || null;
}

export function clearBucketRegionCache() {
  bucketMetaCache.clear();
}

function preferInternal(auth) {
  return String(auth.eptpl || "").includes("-internal");
}

function ensureScheme(hostOrUrl, preferHttps = true) {
  if (!hostOrUrl) return "";
  if (/^https?:\/\//i.test(hostOrUrl)) return hostOrUrl;
  return `${preferHttps ? "https" : "http"}://${hostOrUrl}`;
}

/**
 * 解析 Endpoint：优先 CNAME / 桶级外网域名，再回退 region 模板
 * 参考：https://help.aliyun.com/zh/oss/user-guide/regions-and-endpoints
 */
export function resolveEndpoint(auth, bucketMeta) {
  const preferHttps = String(auth.eptpl || "https://").startsWith("https");

  if (auth.cname) {
    const cnameEp = auth.eptplcname || auth.eptpl || "";
    if (!cnameEp) {
      throw new Error("已启用 CNAME，请填写自定义域名");
    }
    return ensureScheme(
      cnameEp.replace("{region}", auth.region || ""),
      preferHttps,
    );
  }

  if (bucketMeta) {
    const host = preferInternal(auth)
      ? bucketMeta.intranetEndpoint || bucketMeta.extranetEndpoint
      : bucketMeta.extranetEndpoint || bucketMeta.intranetEndpoint;
    if (host) return ensureScheme(host, preferHttps);
  }

  let tpl = auth.eptpl || "https://{region}.aliyuncs.com";
  if (
    tpl.includes("oss-{region}") &&
    String(auth.region || "").startsWith("oss-")
  ) {
    tpl = tpl.replace("oss-{region}", "{region}");
  }
  return tpl.replace(
    "{region}",
    normalizeRegion(auth.region) || "oss-cn-hangzhou",
  );
}

export function createOssClient(auth, bucketMeta) {
  const settings = loadSettings();
  if (settings.allowInsecureTls) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  }

  const region = normalizeRegion(auth.region) || "oss-cn-hangzhou";
  const endpoint = resolveEndpoint({ ...auth, region }, bucketMeta);
  const opts = {
    accessKeyId: auth.id,
    accessKeySecret: auth.secret,
    region,
    endpoint,
    cname: !!auth.cname,
    timeout: Number(auth.timeout || settings.connectTimeout || 60000),
    secure: /^https:/i.test(endpoint),
  };
  if (auth.stoken) opts.stsToken = auth.stoken;
  if (auth.bucket) opts.bucket = auth.bucket;
  if (auth.authorizationV4) opts.authorizationV4 = true;
  if (auth.isRequestPay || auth.requestpaystatus === "YES") {
    opts.isRequestPay = true;
  }
  applyProxyOptions(opts, settings);
  return new OSS(opts);
}

/**
 * 为 ali-oss 注入 HTTP / SOCKS5 代理（不走 Windows 系统代理，需在设置中显式配置）
 */
export function applyProxyOptions(opts, settings = loadSettings()) {
  const enabled = !!settings.proxyEnabled;
  const raw = String(settings.proxyUrl || "").trim();
  if (!enabled || !raw) {
    opts.enableProxy = false;
    delete opts.proxy;
    return opts;
  }
  let url = raw;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) {
    url = `http://${url}`;
  }
  const scheme = url.split(":")[0].toLowerCase();
  if (!["http", "https", "socks", "socks4", "socks5", "socks5h"].includes(scheme)) {
    throw new Error("代理协议仅支持 HTTP / HTTPS / SOCKS5");
  }
  opts.enableProxy = true;
  opts.proxy = url;
  return opts;
}

function parseRegionFromError(err) {
  if (!err) return "";
  if (err.region) return normalizeRegion(err.region);
  const msg = String(err.message || err);
  const m1 = msg.match(/oss-[a-z0-9-]+(?=\.aliyuncs\.com)/i);
  if (m1) return normalizeRegion(m1[0]);
  const m2 = msg.match(/\b(oss-[a-z0-9-]+)\b/i);
  if (m2) return normalizeRegion(m2[1]);
  return "";
}

function isAccessDenied(err) {
  const code = String(err?.code || "");
  return (
    code === "AccessDeniedError" ||
    code === "AccessDenied" ||
    /AccessDenied/i.test(code) ||
    /AccessDenied/i.test(String(err?.message || ""))
  );
}

function isEndpointMismatch(err) {
  const msg = String(err?.message || "");
  return (
    /must be addressed using the specified endpoint/i.test(msg) ||
    err?.code === "PermanentRedirect" ||
    err?.code === "SecondLevelDomainForbidden" ||
    err?.code === "NoSuchBucket"
  );
}

export async function createBucketClient(
  auth,
  bucket,
  regionHint,
  serviceClient,
) {
  const cached = getCachedBucketMeta(bucket);
  let region = normalizeRegion(regionHint) || cached?.region || "";

  if (!region && !auth.cname && serviceClient) {
    try {
      const loc = await serviceClient.getBucketLocation(bucket);
      region = normalizeRegion(loc.location || loc.Location || "");
    } catch (err) {
      region = parseRegionFromError(err);
    }
  }

  if (!region) {
    region = normalizeRegion(auth.region) || "oss-cn-hangzhou";
  }

  rememberBucketMeta(bucket, { region, ...(cached || {}) });
  const meta = getCachedBucketMeta(bucket);
  return createOssClient({ ...auth, bucket, region }, meta);
}

export async function withBucketClient(
  auth,
  bucket,
  regionHint,
  serviceClient,
  fn,
) {
  let region =
    normalizeRegion(regionHint) || getCachedBucketRegion(bucket) || "";
  let client = await createBucketClient(auth, bucket, region, serviceClient);
  try {
    return await fn(client, region);
  } catch (err) {
    if (!isEndpointMismatch(err) || auth.cname) throw err;

    let nextRegion =
      parseRegionFromError(err) ||
      (await resolveRegionViaLocation(auth, bucket, serviceClient));

    // 官方推荐：getBucketInfo / getBucketLocation 获取真实 Location
    if (!nextRegion) {
      try {
        const probe = createOssClient(auth);
        const info = await probe.getBucketInfo(bucket);
        nextRegion = normalizeRegion(
          info?.bucket?.Location || info?.bucket?.region || "",
        );
        const ep =
          info?.bucket?.ExtranetEndpoint || info?.bucket?.IntranetEndpoint;
        if (ep) {
          rememberBucketMeta(bucket, {
            region: nextRegion,
            extranetEndpoint: info.bucket.ExtranetEndpoint,
            intranetEndpoint: info.bucket.IntranetEndpoint,
          });
        }
      } catch {
        /* ignore */
      }
    }

    if (!nextRegion || nextRegion === region) throw err;
    rememberBucketMeta(bucket, { region: nextRegion });
    client = await createBucketClient(auth, bucket, nextRegion, serviceClient);
    return fn(client, nextRegion);
  }
}

async function resolveRegionViaLocation(auth, bucket, serviceClient) {
  try {
    const client = serviceClient || createOssClient(auth);
    const loc = await client.getBucketLocation(bucket);
    return normalizeRegion(loc.location || loc.Location || "");
  } catch (err) {
    return parseRegionFromError(err);
  }
}

/** 分批删除，OSS DeleteMultipleObjects 单次最多 1000 */
export async function deleteMultiChunked(client, keys) {
  const uniq = [...new Set(keys.filter(Boolean))];
  for (let i = 0; i < uniq.length; i += 1000) {
    const chunk = uniq.slice(i, i + 1000);
    await client.deleteMulti(chunk, { quiet: true });
  }
}

/** 递归删除目录前缀（原版 deleteFolder） */
export async function deleteKeysIncludingFolders(client, keys) {
  const toDelete = [];
  for (const key of keys) {
    if (String(key).endsWith("/")) {
      let token;
      do {
        const res = await client.listV2({
          prefix: key,
          "max-keys": 1000,
          "continuation-token": token || undefined,
        });
        for (const o of res.objects || []) {
          if (o.name) toDelete.push(o.name);
        }
        token = res.isTruncated ? res.nextContinuationToken : "";
      } while (token);
      toDelete.push(key);
    } else {
      toDelete.push(key);
    }
  }
  await deleteMultiChunked(client, toDelete);
}

/** 列举全部 Bucket（分页） */
export async function listAllBuckets(client) {
  const list = [];
  let marker = "";
  do {
    const res = await client.listBuckets({
      "max-keys": 1000,
      marker: marker || undefined,
    });
    const raw = res.buckets || res.Buckets || [];
    for (const b of raw) {
      const name = b.name || b.Name;
      const region = normalizeRegion(
        b.region || b.Location || b.location || "",
      );
      const extranetEndpoint = b.extranetEndpoint || b.ExtranetEndpoint || "";
      const intranetEndpoint = b.intranetEndpoint || b.IntranetEndpoint || "";
      rememberBucketMeta(name, { region, extranetEndpoint, intranetEndpoint });
      list.push({
        name,
        region,
        extranetEndpoint,
        intranetEndpoint,
        creationDate: b.creationDate || b.CreationDate || "",
        storageClass: b.storageClass || b.StorageClass || "",
      });
    }
    marker = res.nextMarker || res.NextMarker || "";
    if (!res.isTruncated && !marker) break;
  } while (marker);
  return list;
}

/** 聚合列举对象，避免前端漏页 */
export async function listObjectsAggregated(
  client,
  { prefix = "", marker = "", maxKeys = 500 },
) {
  const folders = [];
  const files = [];
  let token = marker || undefined;
  let isTruncated = false;
  let guard = 0;
  const limit = Math.max(1, Number(maxKeys) || 500);

  do {
    const remain = limit - files.length - folders.length;
    if (remain <= 0) {
      isTruncated = true;
      break;
    }
    const res = await client.listV2({
      prefix,
      "continuation-token": token,
      "max-keys": Math.min(1000, remain),
      delimiter: "/",
    });
    for (const p of res.prefixes || []) {
      folders.push({ name: p, isFolder: true, path: p, lastModified: "" });
    }
    for (const o of res.objects || []) {
      if (o.name === prefix) continue;
      const storageClass = o.storageClass || o.StorageClass || "";
      files.push({
        name: o.name,
        isFolder: false,
        size: o.size,
        lastModified: o.lastModified,
        storageClass,
        storage_class: storageClass,
        etag: o.etag,
      });
    }
    isTruncated = !!res.isTruncated;
    token = res.nextContinuationToken || "";
    guard += 1;
  } while (
    isTruncated &&
    token &&
    files.length + folders.length < limit &&
    guard < 50
  );

  // 目录本身没有修改时间：取目录下对象的最近修改时间（并发探测）
  if (folders.length) {
    await mapPool(folders, 6, async (folder) => {
      folder.lastModified = await resolveFolderLastModified(
        client,
        folder.name,
      );
    });
  }

  return {
    list: [...folders, ...files],
    nextMarker: isTruncated ? token || "" : "",
    isTruncated,
    prefix,
  };
}

/** 解析目录最近修改时间：目录占位对象 + 目录下对象的最大值 */
async function resolveFolderLastModified(client, folderPrefix) {
  let latestMs = 0;
  let latestRaw = "";

  const consider = (raw) => {
    if (!raw) return;
    const ms = Date.parse(String(raw));
    if (!Number.isFinite(ms)) return;
    if (ms >= latestMs) {
      latestMs = ms;
      latestRaw = String(raw);
    }
  };

  try {
    const head = await client.head(folderPrefix);
    const headers = head.res?.headers || {};
    consider(
      headers["last-modified"] ||
        headers["Last-Modified"] ||
        head.meta?.lastModified ||
        head.lastModified,
    );
  } catch {
    /* 无目录占位对象 */
  }

  try {
    // 不带 delimiter，取前若干对象中的最近时间（大目录为近似值）
    let token;
    let pages = 0;
    do {
      const res = await client.listV2({
        prefix: folderPrefix,
        "max-keys": 1000,
        "continuation-token": token || undefined,
      });
      for (const o of res.objects || []) {
        consider(o.lastModified);
      }
      token = res.isTruncated ? res.nextContinuationToken : "";
      pages += 1;
      // 最多翻 3 页，避免超大目录拖慢列表
    } while (token && pages < 3);
  } catch {
    /* ignore */
  }

  return latestRaw;
}

async function mapPool(items, concurrency, fn) {
  if (!items.length) return;
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (cursor < items.length) {
        const idx = cursor;
        cursor += 1;
        await fn(items[idx], idx);
      }
    },
  );
  await Promise.all(workers);
}

export async function testLogin(body) {
  const auth = {
    id: String(body.id || "").trim(),
    secret: String(body.secret || "").trim(),
    stoken: body.stoken ? String(body.stoken).trim() : "",
    region: normalizeRegion(body.region) || "oss-cn-hangzhou",
    eptpl: body.eptpl || "https://{region}.aliyuncs.com",
    eptplcname: body.eptplcname || "",
    cname: !!body.cname,
    osspath: body.osspath || "",
    privilege: body.privilege || "all",
    timeout: body.timeout || 60000,
    isRequestPay: !!(body.isRequestPay || body.requestpaystatus === "YES"),
    requestpaystatus: body.requestpaystatus || "NO",
    authorizationV4: !!body.authorizationV4,
  };
  if (!auth.id || !auth.secret) {
    throw new Error("AccessKeyId / AccessKeySecret 不能为空");
  }
  if (auth.cname && !auth.eptplcname && !auth.eptpl) {
    throw new Error("已启用 CNAME，请填写自定义域名");
  }

  clearBucketRegionCache();
  const client = createOssClient(auth);

  if (auth.osspath && auth.osspath.startsWith("oss://")) {
    const rest = auth.osspath.replace(/^oss:\/\//, "");
    const bucket = rest.split("/")[0];
    const prefix = rest.slice(bucket.length + 1);
    if (!bucket)
      throw new Error("OSS 路径格式不正确，应为 oss://bucket/prefix/");
    const scoped = await createBucketClient(auth, bucket, "", client);
    const result = await scoped.listV2({
      prefix,
      "max-keys": 1,
      delimiter: "/",
    });
    // 与原版一致：完全空结果时提示 Endpoint 可能有误
    const keyCount = String(result.keyCount ?? result.objects?.length ?? 0);
    const hasPrefix = (result.prefixes || []).length > 0;
    if (keyCount === "0" && !hasPrefix && prefix) {
      throw new Error("请确定 Endpoint 是否正确");
    }
    // 与原版一致：预设路径登录不降权为只读
    auth.privilege = body.privilege || "all";
    rememberBucketMeta(bucket, { region: auth.region });
    return { auth, client: scoped };
  }

  try {
    await client.listBuckets({ "max-keys": 1 });
  } catch (err) {
    // 原版：子账号无 ListBuckets 权限仍允许登录
    if (isAccessDenied(err)) {
      auth.privilege = "all";
      return { auth, client };
    }
    throw err;
  }
  return { auth, client };
}

export { isAccessDenied, isEndpointMismatch };

/** 列举 Bucket 绑定的自定义域名（CNAME）详细信息（含证书状态） */
export async function listBucketCnameRecords(client, bucket) {
  try {
    let arr = [];
    let fromSdk = false;
    if (typeof client.listCname === "function") {
      try {
        const res = await client.listCname(bucket);
        const raw = res?.cnames || res?.Cname || res?.cname || res || [];
        arr = Array.isArray(raw) ? raw : [raw];
        fromSdk = arr.length > 0;
      } catch {
        fromSdk = false;
      }
    }

    if (!fromSdk) {
      const result = await client.request({
        method: "GET",
        bucket,
        subres: "cname",
        successStatuses: [200],
      });
      return parseCnameXml(String(result.data || ""));
    }

    const mapped = arr
      .map((c) => {
        if (!c) return null;
        if (typeof c === "string") {
          return { domain: c, status: "Enabled", certEnabled: false };
        }
        const domain = String(c.Domain || c.domain || "").trim();
        if (!domain) return null;
        const status = String(c.Status || c.status || "Enabled");
        const cert = c.Certificate || c.certificate || null;
        const certStatus = String(cert?.Status || cert?.status || "").toLowerCase();
        const certEnabled =
          !!cert && (certStatus === "enabled" || certStatus === "enable");
        return { domain, status, certEnabled };
      })
      .filter(Boolean);

    // SDK 结果若缺少证书字段，再用 XML 补全
    if (mapped.some((r) => !r.certEnabled)) {
      try {
        const result = await client.request({
          method: "GET",
          bucket,
          subres: "cname",
          successStatuses: [200],
        });
        const fromXml = parseCnameXml(String(result.data || ""));
        if (fromXml.length) {
          const byDomain = new Map(fromXml.map((r) => [r.domain, r]));
          return mapped.map((r) => {
            const x = byDomain.get(r.domain);
            return x ? { ...r, certEnabled: r.certEnabled || x.certEnabled } : r;
          });
        }
      } catch {
        /* keep mapped */
      }
    }
    return mapped;
  } catch {
    return [];
  }
}

function parseCnameXml(xml) {
  const records = [];
  const re = /<Cname>([\s\S]*?)<\/Cname>/gi;
  let m;
  while ((m = re.exec(String(xml || "")))) {
    const block = m[1] || "";
    const domain = (block.match(/<Domain>([^<]+)<\/Domain>/i) || [])[1]?.trim();
    if (!domain) continue;
    const statusMatch = block.match(/<Status>([^<]+)<\/Status>/i);
    const status = statusMatch?.[1]?.trim() || "Enabled";
    const certBlock = (block.match(/<Certificate>([\s\S]*?)<\/Certificate>/i) || [])[1];
    let certEnabled = false;
    if (certBlock) {
      const certStatus = (
        (certBlock.match(/<Status>([^<]+)<\/Status>/i) || [])[1] || ""
      ).toLowerCase();
      certEnabled = certStatus === "enabled" || certStatus === "enable";
    }
    records.push({ domain, status, certEnabled });
  }
  return records;
}

/** 列举 Bucket 绑定的自定义域名（仅域名字符串，兼容旧调用） */
export async function listBucketCnameDomains(client, bucket) {
  const records = await listBucketCnameRecords(client, bucket);
  return records.map((r) => r.domain);
}

function isAliyunOssHost(hostOrUrl) {
  const host = String(hostOrUrl || "")
    .replace(/^https?:\/\//i, "")
    .split("/")[0]
    .toLowerCase();
  return (
    host.endsWith(".aliyuncs.com") ||
    host.endsWith(".aliyun-inc.com") ||
    host.includes("oss-accelerate")
  );
}

/**
 * 根据域名与证书配置决定 http / https：
 * - 阿里云默认 / 加速域名 → https
 * - 自定义域名已启用证书 → https
 * - 自定义域名未配置或未启用证书 → http
 */
export function resolveAddressScheme(domain, cnameRecords = []) {
  const host = String(domain || "")
    .replace(/^https?:\/\//i, "")
    .replace(/\/$/, "")
    .split("/")[0];
  if (!host) return "https";
  if (isAliyunOssHost(host)) return "https";
  const hit = cnameRecords.find(
    (c) => c.domain === host || c.domain === domain
  );
  if (hit?.certEnabled) return "https";
  if (hit) return "http";
  // 未知自定义域名：无证书信息时默认 http，避免浏览器证书错误
  return "http";
}

function isPublicAcl(acl) {
  const a = String(acl || "").toLowerCase();
  return a === "public-read" || a === "public-read-write";
}

function applyAddressDomain(url, domain, scheme = "https") {
  if (!url || !domain) return url;
  const host = String(domain)
    .replace(/^https?:\/\//i, "")
    .replace(/\/$/, "");
  if (!host) return url;
  const proto = scheme === "http" ? "http" : "https";
  return String(url).replace(/^https?:\/\/[^/]+\//i, `${proto}://${host}/`);
}

/**
 * 获取对象访问地址：
 * - 公开读（对象 ACL 或 Bucket ACL）→ 无签名直链
 * - 私有 → 签名 URL（带有效期）
 * 额外：对无签名 URL 做 Range 探测，兼容策略授权等场景（与原版一致）
 */
export async function buildObjectAddress({
  auth,
  serviceClient,
  bucket,
  key,
  expires = 3600,
  region,
  domain = "",
}) {
  const client = await createBucketClient(auth, bucket, region, serviceClient);
  let acl = "";
  try {
    const objAcl = await client.getACL(key);
    acl = objAcl?.acl || "";
    if (!acl || String(acl).toLowerCase() === "default") {
      const bucketAcl = await client.getBucketACL(bucket);
      acl = bucketAcl?.acl || acl || "default";
    }
  } catch {
    /* ACL 读取失败时走探测 / 签名 */
  }

  let publicUrl = "";
  try {
    publicUrl = client.generateObjectUrl(key);
  } catch {
    const meta = getCachedBucketMeta(bucket) || {};
    const host =
      (domain && String(domain)) ||
      (meta.extranetEndpoint
        ? meta.extranetEndpoint.startsWith(`${bucket}.`)
          ? meta.extranetEndpoint
          : `${bucket}.${String(meta.extranetEndpoint).replace(/^https?:\/\//i, "")}`
        : `${bucket}.${normalizeRegion(region) || getCachedBucketRegion(bucket) || "oss-cn-hangzhou"}.aliyuncs.com`);
    const encoded = String(key)
      .split("/")
      .map((p) => encodeURIComponent(p))
      .join("/");
    publicUrl = `https://${String(host).replace(/^https?:\/\//i, "")}/${encoded}`;
  }

  const cnameRecords =
    domain && !isAliyunOssHost(domain)
      ? await listBucketCnameRecords(client, bucket)
      : [];
  const scheme = resolveAddressScheme(domain, cnameRecords);
  publicUrl = applyAddressDomain(publicUrl, domain, scheme);

  let isPublic = isPublicAcl(acl);
  if (!isPublic && publicUrl) {
    if (await probePublicUrl(publicUrl)) isPublic = true;
  }

  if (isPublic) {
    return {
      url: publicUrl,
      public: true,
      signed: false,
      acl: acl || "public-read",
      expires: 0,
      domain: domain || "",
      scheme,
    };
  }

  const sec = Number(expires) || 3600;
  let url = client.signatureUrl(key, { expires: sec });
  url = applyAddressDomain(url, domain, scheme);
  return {
    url,
    public: false,
    signed: true,
    acl: acl || "private",
    expires: sec,
    domain: domain || "",
    scheme,
  };
}

async function probePublicUrl(publicUrl) {
  if (!publicUrl) return false;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(publicUrl, {
      method: "GET",
      headers: {
        Range: "bytes=0-0",
        "Cache-Control": "no-cache",
      },
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    return res.status >= 200 && res.status < 300;
  } catch {
    return false;
  }
}

/**
 * 批量获取地址：展开目录下全部文件，按统一域名/有效期生成链接
 * - Bucket 公开读：抽样探测首个对象，避免「Bucket 公开但对象私有」误出直链
 * - 其余情况统一签名
 */
export async function buildBatchObjectAddresses({
  auth,
  serviceClient,
  bucket,
  keys = [],
  expires = 3600,
  region,
  domain = "",
  maxFiles = 5000,
}) {
  const client = await createBucketClient(auth, bucket, region, serviceClient);
  const files = [];

  async function listAllUnder(prefix) {
    let token;
    do {
      if (files.length >= maxFiles) return;
      const res = await client.listV2({
        prefix,
        "max-keys": 1000,
        "continuation-token": token || undefined,
      });
      for (const o of res.objects || []) {
        if (!o.name || o.name.endsWith("/")) continue;
        files.push(o.name);
        if (files.length >= maxFiles) return;
      }
      token = res.isTruncated ? res.nextContinuationToken : "";
    } while (token);
  }

  for (const key of keys) {
    if (files.length >= maxFiles) break;
    const k = String(key || "");
    if (!k) continue;
    if (k.endsWith("/")) {
      await listAllUnder(k);
    } else {
      files.push(k);
    }
  }

  const uniq = [...new Set(files)];
  const truncated = uniq.length >= maxFiles;

  let usePublic = false;
  try {
    const bucketAcl = await client.getBucketACL(bucket);
    usePublic = isPublicAcl(bucketAcl?.acl);
  } catch {
    /* 按私有签名 */
  }

  const sec = Number(expires) || 3600;
  const cnameRecords =
    domain && !isAliyunOssHost(domain)
      ? await listBucketCnameRecords(client, bucket)
      : [];
  const scheme = resolveAddressScheme(domain, cnameRecords);

  if (usePublic && uniq.length) {
    try {
      let sampleUrl = client.generateObjectUrl(uniq[0]);
      sampleUrl = applyAddressDomain(sampleUrl, domain, scheme);
      if (!(await probePublicUrl(sampleUrl))) {
        usePublic = false;
      }
    } catch {
      usePublic = false;
    }
  }

  const list = [];
  for (const key of uniq) {
    let url = "";
    try {
      if (usePublic) {
        url = client.generateObjectUrl(key);
      } else {
        url = client.signatureUrl(key, { expires: sec });
      }
      url = applyAddressDomain(url, domain, scheme);
    } catch (err) {
      list.push({
        key,
        url: "",
        error: err?.message || String(err),
      });
      continue;
    }
    list.push({ key, url });
  }

  return {
    list,
    total: list.length,
    truncated,
    maxFiles,
    public: usePublic,
    signed: !usePublic,
    expires: usePublic ? 0 : sec,
    domain: domain || "",
    scheme,
  };
}

/**
 * 组装可切换域名列表：
 * - 已绑定自定义域名优先
 * - 系统默认（bucket.region.aliyuncs.com / extranetEndpoint）
 * - 可用传输加速域名（探测后加入）
 */
export async function buildAddressDomains(
  auth,
  bucket,
  regionHint,
  serviceClient,
) {
  const region =
    normalizeRegion(regionHint) ||
    getCachedBucketRegion(bucket) ||
    normalizeRegion(auth.region) ||
    "oss-cn-hangzhou";
  const meta = getCachedBucketMeta(bucket) || {};
  const client = await createBucketClient(auth, bucket, region, serviceClient);

  const cnameRecords = auth.cname
    ? []
    : await listBucketCnameRecords(client, bucket);

  let defaultHost = "";
  if (meta.extranetEndpoint) {
    defaultHost = String(meta.extranetEndpoint).replace(/^https?:\/\//i, "");
    // extranet 有时是 oss-cn-xxx.aliyuncs.com，需拼 bucket
    if (!defaultHost.startsWith(`${bucket}.`)) {
      defaultHost = `${bucket}.${defaultHost}`;
    }
  } else {
    defaultHost = `${bucket}.${region}.aliyuncs.com`;
  }

  const list = [];
  for (const c of cnameRecords) {
    if (String(c.status || "").toLowerCase() === "disabled") continue;
    const scheme = c.certEnabled ? "https" : "http";
    list.push({
      label: `自定义域名 · ${c.domain} · ${scheme.toUpperCase()}${
        c.certEnabled ? "（已配置证书）" : "（未配置证书）"
      }`,
      value: c.domain,
      type: "cname",
      scheme,
      certEnabled: !!c.certEnabled,
    });
  }

  list.push({
    label: `系统默认 · ${defaultHost} · HTTPS`,
    value: defaultHost,
    type: "default",
    scheme: "https",
    certEnabled: true,
  });

  // 传输加速：国内 / 海外（需 Bucket 已开通传输加速）
  const accelerateHosts = await listUsableAccelerateDomains(
    auth,
    bucket,
    region,
  );
  for (const host of accelerateHosts) {
    const full = `${bucket}.${host}`;
    const overseas = host.includes("overseas");
    list.push({
      label: overseas
        ? `传输加速（海外）· ${full} · HTTPS`
        : `传输加速 · ${full} · HTTPS`,
      value: full,
      type: overseas ? "accelerate-overseas" : "accelerate",
      scheme: "https",
      certEnabled: true,
    });
  }

  const preferred =
    cnameRecords.find((c) => String(c.status || "").toLowerCase() !== "disabled")
      ?.domain ||
    (accelerateHosts[0] ? `${bucket}.${accelerateHosts[0]}` : "") ||
    defaultHost;

  return { list, preferred, defaultHost, region };
}

/**
 * 探测可用的 OSS 传输加速 Endpoint（与原版一致）
 * @returns {Promise<string[]>} 如 ['oss-accelerate.aliyuncs.com', ...]
 */
export async function listUsableAccelerateDomains(auth, bucket, regionHint) {
  const endpoints = [
    "oss-accelerate.aliyuncs.com",
    "oss-accelerate-overseas.aliyuncs.com",
  ];
  try {
    const region =
      normalizeRegion(regionHint) ||
      getCachedBucketRegion(bucket) ||
      normalizeRegion(auth?.region) ||
      "oss-cn-hangzhou";
    // 用国内加速 Endpoint 做一次轻量 list；成功则国内/海外加速均可选
    const client = createOssClient({
      ...auth,
      bucket,
      region,
      cname: false,
      eptpl: `https://${endpoints[0]}`,
      eptplcname: "",
    });
    await client.listV2({ "max-keys": 1 });
    return endpoints;
  } catch {
    return [];
  }
}

/**
 * 移动 / 复制对象（支持目录递归）
 */
export async function moveOrCopyObjects({
  auth,
  serviceClient,
  bucket,
  keys,
  toBucket,
  toPrefix = "",
  fromPrefix = "",
  region,
  toRegion,
  isCopy = false,
  onProgress,
}) {
  const srcClient = await createBucketClient(
    auth,
    bucket,
    region,
    serviceClient,
  );
  const destBucket = toBucket || bucket;
  const destRegion = toRegion || region;
  const destClient =
    destBucket === bucket && (!destRegion || destRegion === region)
      ? srcClient
      : await createBucketClient(auth, destBucket, destRegion, serviceClient);

  const destPrefix = toPrefix
    ? toPrefix.endsWith("/")
      ? toPrefix
      : `${toPrefix}/`
    : "";
  const srcPrefix = fromPrefix || "";

  async function listAllUnder(prefix) {
    const out = [];
    let token;
    do {
      const res = await srcClient.listV2({
        prefix,
        "max-keys": 1000,
        "continuation-token": token || undefined,
      });
      for (const o of res.objects || []) {
        if (o.name && !o.name.endsWith("/")) out.push(o.name);
      }
      token = res.isTruncated ? res.nextContinuationToken : "";
    } while (token);
    return out;
  }

  function mapDest(key) {
    let rel = key;
    if (srcPrefix && key.startsWith(srcPrefix))
      rel = key.slice(srcPrefix.length);
    else {
      const parts = key.split("/");
      rel = parts[parts.length - 1] || key;
    }
    return `${destPrefix}${rel}`;
  }

  const files = [];
  for (const key of keys) {
    if (String(key).endsWith("/")) {
      files.push(...(await listAllUnder(key)));
    } else {
      files.push(key);
    }
  }
  const uniq = [...new Set(files)];
  let done = 0;
  const errors = [];

  for (const key of uniq) {
    if (typeof onProgress === "function") {
      const ok = await onProgress({ done, total: uniq.length, key });
      if (ok === false) {
        throw new Error("已暂停");
      }
    }
    const destKey = mapDest(key);
    if (destBucket === bucket && destKey === key) {
      done += 1;
      continue;
    }
    try {
      if (destBucket === bucket) {
        await destClient.copy(destKey, key);
      } else {
        await destClient.copy(destKey, key, bucket);
      }
      if (!isCopy) {
        await srcClient.delete(key);
      }
      done += 1;
    } catch (err) {
      errors.push({ key, message: err?.message || String(err) });
    }
  }

  if (typeof onProgress === "function") {
    await onProgress({ done, total: uniq.length, key: "" });
  }

  if (errors.length && !done) {
    throw new Error(errors[0].message || "移动失败");
  }
  return { total: uniq.length, done, failed: errors.length, errors };
}

const VALID_ACLS = new Set([
  "private",
  "public-read",
  "public-read-write",
  "default",
]);

export function validateAcl(acl) {
  const a = String(acl || "").trim();
  if (!VALID_ACLS.has(a)) {
    throw new Error(
      "ACL 取值无效，应为 private、public-read、public-read-write 或 default",
    );
  }
  return a;
}

function normalizeFolderKey(prefix) {
  const p = String(prefix || "").trim();
  if (!p) throw new Error("目录前缀不能为空");
  return p.endsWith("/") ? p : `${p}/`;
}

/** 创建空目录（零字节对象，key 以 / 结尾） */
export async function createFolder(client, prefix) {
  const key = normalizeFolderKey(prefix);
  await client.put(key, Buffer.alloc(0));
  return { key };
}

function headerVal(headers, name) {
  if (!headers) return "";
  const lower = String(name).toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (String(k).toLowerCase() === lower) return v ?? "";
  }
  return "";
}

/** Head 对象并映射常用元数据 */
export async function getObjectMeta(client, key) {
  const head = await client.head(String(key));
  const headers = head.res?.headers || {};
  const meta = {};
  for (const [k, v] of Object.entries(headers)) {
    const lk = String(k).toLowerCase();
    if (lk.startsWith("x-oss-meta-")) {
      meta[lk.slice("x-oss-meta-".length)] = v;
    }
  }
  return {
    content_type: headerVal(headers, "content-type") || "",
    content_disposition: headerVal(headers, "content-disposition") || "",
    content_encoding: headerVal(headers, "content-encoding") || "",
    cache_control: headerVal(headers, "cache-control") || "",
    expires: headerVal(headers, "expires") || "",
    content_length: Number(headerVal(headers, "content-length") || 0),
    last_modified:
      headerVal(headers, "last-modified") || head.meta?.lastModified || "",
    etag: headerVal(headers, "etag") || head.meta?.etag || "",
    storage_class:
      headerVal(headers, "x-oss-storage-class") ||
      head.meta?.storageClass ||
      "",
    restore: headerVal(headers, "x-oss-restore") || "",
    meta,
  };
}

const META_HEADER_MAP = {
  content_type: "Content-Type",
  content_disposition: "Content-Disposition",
  content_encoding: "Content-Encoding",
  cache_control: "Cache-Control",
  expires: "Expires",
};

/** 通过 copy-to-self 更新对象 headers / 自定义 meta */
export async function putObjectMeta(
  client,
  bucket,
  key,
  headers = {},
  meta = {},
) {
  const copyHeaders = {};
  for (const [k, v] of Object.entries(headers || {})) {
    const mapped = META_HEADER_MAP[k] || k;
    if (v !== undefined && v !== null && v !== "") {
      copyHeaders[mapped] = String(v);
    }
  }
  const copyMeta = {};
  for (const [k, v] of Object.entries(meta || {})) {
    if (v !== undefined && v !== null) {
      copyMeta[k] = String(v);
    }
  }
  const opts = {};
  if (Object.keys(copyHeaders).length) opts.headers = copyHeaders;
  if (Object.keys(copyMeta).length) opts.meta = copyMeta;
  await client.copy(String(key), String(key), bucket, opts);
}

/** 解冻归档对象 */
export async function restoreObject(client, key, days = 1) {
  const name = String(key);
  const restoreDays = Math.max(1, Number(days) || 1);
  await client.restore(name, { type: "Archive", Days: restoreDays });
}

/** 批量解冻 */
export async function restoreObjects(client, keys, days = 1) {
  const list = [...new Set((keys || []).filter(Boolean))];
  const errors = [];
  let done = 0;
  for (const key of list) {
    try {
      await restoreObject(client, key, days);
      done += 1;
    } catch (err) {
      errors.push({ key, message: err?.message || String(err) });
    }
  }
  if (errors.length && !done) {
    throw new Error(errors[0].message || "解冻失败");
  }
  return { total: list.length, done, failed: errors.length, errors };
}

/** 列举未完成的分片上传 */
export async function listIncompleteUploads(
  client,
  { prefix = "", marker = "" } = {},
) {
  const res = await client.listUploads({
    prefix: prefix || undefined,
    "max-uploads": 1000,
    "key-marker": marker || undefined,
  });
  const uploads = (res.uploads || []).map((u) => ({
    key: u.name,
    upload_id: u.uploadId,
    initiated: u.initiated,
  }));
  return {
    uploads,
    next_marker: res.nextKeyMarker || "",
    next_upload_id_marker: res.nextUploadIdMarker || "",
    is_truncated: !!res.isTruncated,
  };
}

/** 批量取消分片上传 */
export async function abortMultipartUploads(client, uploads = []) {
  const errors = [];
  let done = 0;
  for (const item of uploads) {
    const key = item?.key || item?.name;
    const uploadId = item?.uploadId || item?.upload_id;
    if (!key || !uploadId) {
      errors.push({ key: key || "", message: "缺少 key 或 uploadId" });
      continue;
    }
    try {
      await client.abortMultipartUpload(String(key), String(uploadId));
      done += 1;
    } catch (err) {
      errors.push({ key, message: err?.message || String(err) });
    }
  }
  if (errors.length && !done) {
    throw new Error(errors[0].message || "取消分片上传失败");
  }
  return { total: uploads.length, done, failed: errors.length, errors };
}
