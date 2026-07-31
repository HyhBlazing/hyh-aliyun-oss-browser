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
  opts?: { signal?: AbortSignal; retried?: boolean },
): Promise<ApiResult<T>> {
  const retried = !!opts?.retried;
  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "x-sidecar-token": token,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: opts?.signal,
    });
  } catch (e) {
    if (
      opts?.signal?.aborted ||
      (e instanceof DOMException && e.name === "AbortError") ||
      (e instanceof Error && e.name === "AbortError")
    ) {
      throw new DOMException("已取消", "AbortError");
    }
    throw e;
  }
  let json: ApiResult<T>;
  try {
    json = (await res.json()) as ApiResult<T>;
  } catch {
    if (opts?.signal?.aborted) {
      throw new DOMException("已取消", "AbortError");
    }
    if (res.status === 404) {
      throw new Error("接口不存在或服务未就绪，请重启应用后再试");
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error("未登录或没有权限");
    }
    throw new Error(`请求失败（${res.status}）`);
  }

  if ((!res.ok || json.code !== 0) && isNeedLogin(res.status, json.message)) {
    // 仅对只读请求自动重登重试；写操作重试会导致重复入队/重复变更
    const safeRetry = method === "GET" || method === "HEAD";
    if (
      !retried &&
      safeRetry &&
      path !== "/auth/login" &&
      path !== "/auth/logout" &&
      restoreAuthHandler
    ) {
      const ok = await restoreAuthHandler();
      if (ok) {
        return request<T>(method, path, body, { ...opts, retried: true });
      }
    }
  }

  if (!res.ok || json.code !== 0) {
    const raw = String(json.message || "");
    if (
      /Route\s+\w+:\/.+not found/i.test(raw) ||
      /接口不存在/.test(raw) ||
      res.status === 404
    ) {
      throw new Error(
        raw && !/not found/i.test(raw)
          ? raw
          : "接口不存在或服务未就绪，请完全退出应用后重新打开再试",
      );
    }
    throw new Error(raw || `请求失败（${res.status}）`);
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
      Object.entries(query).map(([k, v]) => [k, String(v)]),
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
  verifyObject: (payload: Record<string, unknown>) =>
    request("POST", "/objects/verify", payload),
  verifyBatch: (payload: Record<string, unknown>) =>
    request("POST", "/objects/verify/batch", payload),
  searchObjects: (
    payload: Record<string, unknown>,
    opts?: { signal?: AbortSignal },
  ) =>
    request<{
      items: Record<string, unknown>[];
      truncated?: boolean;
      scanned?: number;
      total_matched?: number;
      mode?: string;
    }>("POST", "/objects/search", payload, opts),
  getSearchIndexStatus: () =>
    request<{
      total_objects: number;
      objects_bytes?: number;
      index_bytes?: number;
      last_indexed_at: number | null;
      buckets: Array<{
        bucket: string;
        object_count: number;
        last_indexed_at: number | null;
        status: string;
      }>;
    }>("GET", "/search/index/status"),
  listSearchIndexJobs: () =>
    request<{
      list: Record<string, unknown>[];
      latest_auto: Record<string, unknown> | null;
    }>("GET", "/search/index/jobs"),
  buildSearchIndex: (payload: Record<string, unknown> = {}) =>
    request<{ job_id: string }>("POST", "/search/index/build", payload),
  refreshSearchIndex: (payload: Record<string, unknown> = {}) =>
    request<{ job_id: string }>("POST", "/search/index/refresh", payload),
  clearSearchIndex: (payload: Record<string, unknown> = {}) =>
    request("DELETE", "/search/index", payload),
  getSearchIndexJob: (id: string) =>
    request<Record<string, unknown>>(
      "GET",
      `/search/index/jobs/${encodeURIComponent(id)}`,
    ),
  cancelSearchIndexJob: (id: string) =>
    request("POST", `/search/index/jobs/${encodeURIComponent(id)}/cancel`),
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
      `/buckets/${encodeURIComponent(name)}/acl${qs}`,
    );
  },
  putBucketAcl: (name: string, payload: Record<string, unknown>) =>
    request("PUT", `/buckets/${encodeURIComponent(name)}/acl`, payload),
  listMultipart: (
    name: string,
    query: Record<string, string | number> = {},
  ) => {
    const qs = new URLSearchParams(
      Object.entries(query).map(([k, v]) => [k, String(v)]),
    ).toString();
    const suffix = qs ? `?${qs}` : "";
    return request<{ list: Record<string, unknown>[] }>(
      "GET",
      `/buckets/${encodeURIComponent(name)}/multipart${suffix}`,
    );
  },
  abortMultipart: (name: string, payload: Record<string, unknown>) =>
    request(
      "POST",
      `/buckets/${encodeURIComponent(name)}/multipart/abort`,
      payload,
    ),
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
      payload,
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
      `/objects/content?${qs}`,
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
      payload,
    ),
  listJobs: () => request("GET", "/transfer/jobs"),
  pauseJob: (id: string) => request("POST", "/transfer/jobs/pause", { id }),
  resumeJob: (id: string) => request("POST", "/transfer/jobs/resume", { id }),
  removeJob: (id: string) => request("POST", "/transfer/jobs/remove", { id }),
  clearJobs: (payload: { type?: string; onlyFinished?: boolean }) =>
    request("POST", "/transfer/jobs/clear", payload),
  persistJobs: () => request("POST", "/transfer/persist"),
  exportJobs: () => request("GET", "/transfer/export"),
  importJobs: (payload: Record<string, unknown>) =>
    request("POST", "/transfer/import", payload),
  listTransferHistory: (limit = 200) =>
    request("GET", `/transfer/history?limit=${limit}`),
};

export function openTransferEvents(onMessage: (data: unknown) => void) {
  const ctrl = new AbortController();
  let stopped = false;

  const connect = async () => {
    while (!stopped) {
      try {
        const res = await fetch(`${baseUrl}/transfer/events`, {
          headers: { "x-sidecar-token": token },
          signal: ctrl.signal,
        });
        if (!res.body) throw new Error("no body");
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        while (!stopped) {
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
      } catch {
        if (stopped || ctrl.signal.aborted) return;
      }
      // sidecar 崩溃或断线后自动重连
      await new Promise((r) => setTimeout(r, 2000));
    }
  };

  connect().catch(() => {});
  return () => {
    stopped = true;
    ctrl.abort();
  };
}
