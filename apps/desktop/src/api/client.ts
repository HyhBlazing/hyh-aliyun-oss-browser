export type ApiResult<T = unknown> = {
  code: number;
  message?: string;
  data?: T;
};

let baseUrl = import.meta.env.VITE_SIDECAR_URL || "http://127.0.0.1:17823";
let token = import.meta.env.VITE_SIDECAR_TOKEN || "dev-token";

/** 401 未登录时自动恢复会话（由 auth store 注入） */
let restoreAuthHandler: null | (() => Promise<boolean>) = null;

export function configureApi(url: string, sidecarToken: string) {
  baseUrl = url.replace(/\/$/, "");
  token = sidecarToken;
}

export function setRestoreAuthHandler(fn: (() => Promise<boolean>) | null) {
  restoreAuthHandler = fn;
}

export function getApiBase() {
  return baseUrl;
}

export function getApiToken() {
  return token;
}

function isNeedLogin(status: number, message?: string) {
  return (
    status === 401 ||
    message === "请先登录" ||
    /请先登录/.test(String(message || ""))
  );
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  retried = false
): Promise<ApiResult<T>> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-sidecar-token": token,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json: ApiResult<T>;
  try {
    json = (await res.json()) as ApiResult<T>;
  } catch {
    throw new Error(`请求失败 (${res.status})`);
  }

  if ((!res.ok || json.code !== 0) && isNeedLogin(res.status, json.message)) {
    if (
      !retried &&
      path !== "/auth/login" &&
      path !== "/auth/logout" &&
      restoreAuthHandler
    ) {
      const ok = await restoreAuthHandler();
      if (ok) {
        return request<T>(method, path, body, true);
      }
    }
  }

  if (!res.ok || json.code !== 0) {
    throw new Error(json.message || `请求失败 (${res.status})`);
  }
  return json;
}

export const api = {
  health: () => request("GET", "/health"),
  login: (payload: Record<string, unknown>) =>
    request("POST", "/auth/login", payload),
  logout: () => request("POST", "/auth/logout"),
  session: () => request("GET", "/auth/session"),
  getSettings: () => request("GET", "/settings"),
  saveSettings: (payload: Record<string, unknown>) =>
    request("PUT", "/settings", payload),
  listBuckets: () => request("GET", "/buckets"),
  createBucket: (payload: Record<string, unknown>) =>
    request("POST", "/buckets", payload),
  deleteBucket: (name: string, region?: string) => {
    const qs = region ? `?region=${encodeURIComponent(region)}` : "";
    return request("DELETE", `/buckets/${encodeURIComponent(name)}${qs}`);
  },
  listObjects: (query: Record<string, string | number>) => {
    const qs = new URLSearchParams(
      Object.entries(query).map(([k, v]) => [k, String(v)])
    ).toString();
    return request("GET", `/objects?${qs}`);
  },
  deleteObjects: (payload: Record<string, unknown>) =>
    request("POST", "/objects/delete", payload),
  renameObject: (payload: Record<string, unknown>) =>
    request("POST", "/objects/rename", payload),
  createFolder: (payload: Record<string, unknown>) =>
    request("POST", "/objects/folder", payload),
  getObjectAcl: (query: Record<string, string>) => {
    const qs = new URLSearchParams(query).toString();
    return request<{ acl: string }>("GET", `/objects/acl?${qs}`);
  },
  putObjectAcl: (payload: Record<string, unknown>) =>
    request("PUT", "/objects/acl", payload),
  getObjectMeta: (query: Record<string, string>) => {
    const qs = new URLSearchParams(query).toString();
    return request<Record<string, unknown>>("GET", `/objects/meta?${qs}`);
  },
  putObjectMeta: (payload: Record<string, unknown>) =>
    request("PUT", "/objects/meta", payload),
  restoreObjects: (payload: Record<string, unknown>) =>
    request("POST", "/objects/restore", payload),
  putSymlink: (payload: Record<string, unknown>) =>
    request("POST", "/objects/symlink", payload),
  getSymlink: (query: Record<string, string>) => {
    const qs = new URLSearchParams(query).toString();
    return request<{ target: string }>("GET", `/objects/symlink?${qs}`);
  },
  getBucketAcl: (name: string, region?: string) => {
    const qs = region ? `?region=${encodeURIComponent(region)}` : "";
    return request<{ acl: string }>(
      "GET",
      `/buckets/${encodeURIComponent(name)}/acl${qs}`
    );
  },
  putBucketAcl: (name: string, payload: Record<string, unknown>) =>
    request("PUT", `/buckets/${encodeURIComponent(name)}/acl`, payload),
  listMultipart: (name: string, query: Record<string, string | number> = {}) => {
    const qs = new URLSearchParams(
      Object.entries(query).map(([k, v]) => [k, String(v)])
    ).toString();
    const suffix = qs ? `?${qs}` : "";
    return request<{ list: Record<string, unknown>[] }>(
      "GET",
      `/buckets/${encodeURIComponent(name)}/multipart${suffix}`
    );
  },
  abortMultipart: (name: string, payload: Record<string, unknown>) =>
    request("POST", `/buckets/${encodeURIComponent(name)}/multipart/abort`, payload),
  copyObject: (payload: Record<string, unknown>) =>
    request("POST", "/objects/copy", payload),
  moveObjects: (payload: Record<string, unknown>) =>
    request("POST", "/objects/move", payload),
  /** 后台移动/复制，立即入队不阻塞 */
  enqueueMove: (payload: Record<string, unknown>) =>
    request("POST", "/transfer/move", payload),
  signObject: (payload: Record<string, unknown>) =>
    request<{ url: string; expires: number; domain?: string }>(
      "POST",
      "/objects/sign",
      payload
    ),
  getObjectAddress: (payload: Record<string, unknown>) =>
    request<{
      url: string;
      public: boolean;
      signed: boolean;
      acl?: string;
      expires: number;
      domain?: string;
    }>("POST", "/objects/address", payload),
  batchObjectAddresses: (payload: Record<string, unknown>) =>
    request<{
      list: { key: string; url: string; error?: string }[];
      total: number;
      truncated?: boolean;
      public?: boolean;
      signed?: boolean;
      expires?: number;
      domain?: string;
    }>("POST", "/objects/addresses", payload),
  listBucketDomains: (name: string, region?: string) => {
    const qs = region ? `?region=${encodeURIComponent(region)}` : "";
    return request<{
      list: { label: string; value: string; type: string }[];
      preferred: string;
      defaultHost: string;
    }>("GET", `/buckets/${encodeURIComponent(name)}/domains${qs}`);
  },
  getObjectContent: (query: Record<string, string>) => {
    const qs = new URLSearchParams(query).toString();
    return request<{ content: string; contentType: string; size: number }>(
      "GET",
      `/objects/content?${qs}`
    );
  },
  upload: (payload: Record<string, unknown>) =>
    request("POST", "/transfer/upload", payload),
  download: (payload: Record<string, unknown>) =>
    request("POST", "/transfer/download", payload),
  downloadNow: (payload: Record<string, unknown>) =>
    request<{ paths: string[]; files: string[] }>(
      "POST",
      "/transfer/download-now",
      payload
    ),
  listJobs: () => request("GET", "/transfer/jobs"),
  pauseJob: (id: string) => request("POST", "/transfer/jobs/pause", { id }),
  resumeJob: (id: string) => request("POST", "/transfer/jobs/resume", { id }),
  removeJob: (id: string) => request("POST", "/transfer/jobs/remove", { id }),
  clearJobs: (payload: { type?: string; onlyFinished?: boolean }) =>
    request("POST", "/transfer/jobs/clear", payload),
};

export function openTransferEvents(onMessage: (data: unknown) => void) {
  const ctrl = new AbortController();
  (async () => {
    const res = await fetch(`${baseUrl}/transfer/events`, {
      headers: { "x-sidecar-token": token },
      signal: ctrl.signal,
    });
    if (!res.body) return;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split("\n\n");
      buf = parts.pop() || "";
      for (const part of parts) {
        const line = part.split("\n").find((l) => l.startsWith("data: "));
        if (!line) continue;
        try {
          onMessage(JSON.parse(line.slice(6)));
        } catch {
          /* ignore */
        }
      }
    }
  })().catch(() => {});
  return () => ctrl.abort();
}
