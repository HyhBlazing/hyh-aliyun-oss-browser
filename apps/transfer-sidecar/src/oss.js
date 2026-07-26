import OSS from "ali-oss";
import { loadSettings } from "./settings.js";

export function resolveEndpoint(auth) {
  if (auth.cname && auth.eptpl) {
    return auth.eptpl.replace("{region}", auth.region || "");
  }
  const tpl = auth.eptpl || "https://oss-{region}.aliyuncs.com";
  return tpl.replace("{region}", auth.region || "oss-cn-hangzhou");
}

export function createOssClient(auth) {
  const settings = loadSettings();
  if (settings.allowInsecureTls) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  }

  const endpoint = resolveEndpoint(auth);
  const opts = {
    accessKeyId: auth.id,
    accessKeySecret: auth.secret,
    region: auth.region || "oss-cn-hangzhou",
    endpoint,
    cname: !!auth.cname,
    timeout: Number(auth.timeout || settings.connectTimeout || 60000),
    secure: endpoint.startsWith("https"),
  };
  if (auth.stoken) opts.stsToken = auth.stoken;
  if (auth.bucket) opts.bucket = auth.bucket;
  if (auth.authorizationV4) opts.authorizationV4 = true;
  return new OSS(opts);
}

export async function testLogin(body) {
  const auth = {
    id: String(body.id || "").trim(),
    secret: String(body.secret || "").trim(),
    stoken: body.stoken ? String(body.stoken).trim() : "",
    region: body.region || "oss-cn-hangzhou",
    eptpl: body.eptpl || "https://oss-{region}.aliyuncs.com",
    cname: !!body.cname,
    osspath: body.osspath || "",
    privilege: body.privilege || "all",
    timeout: body.timeout || 60000,
  };
  if (!auth.id || !auth.secret) {
    throw new Error("AccessKeyId / AccessKeySecret 不能为空");
  }

  const client = createOssClient(auth);
  if (auth.osspath && auth.osspath.startsWith("oss://")) {
    const rest = auth.osspath.replace(/^oss:\/\//, "");
    const bucket = rest.split("/")[0];
    const prefix = rest.slice(bucket.length + 1);
    const scoped = createOssClient({ ...auth, bucket });
    await scoped.listV2({ prefix, "max-keys": 1, delimiter: "/" });
    auth.privilege = "readOnly";
    return { auth, client: scoped };
  }
  await client.listBuckets({ "max-keys": 1 });
  return { auth, client };
}
