export type ApiResult<T = unknown> = {
  code: number;
  message?: string;
  data?: T;
};

let baseUrl = import.meta.env.VITE_SIDECAR_URL || "http://127.0.0.1:17823";
let token = import.meta.env.VITE_SIDECAR_TOKEN || "dev-token";

export function configureApi(url: string, sidecarToken: string) {
  baseUrl = url.replace(/\/$/, "");
  token = sidecarToken;
}

export function getApiBase() {
  return baseUrl;
}

export function getApiToken() {
  return token;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<ApiResult<T>> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-sidecar-token": token,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json()) as ApiResult<T>;
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
  deleteBucket: (name: string) =>
    request("DELETE", `/buckets/${encodeURIComponent(name)}`),
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
  copyObject: (payload: Record<string, unknown>) =>
    request("POST", "/objects/copy", payload),
  upload: (payload: Record<string, unknown>) =>
    request("POST", "/transfer/upload", payload),
  download: (payload: Record<string, unknown>) =>
    request("POST", "/transfer/download", payload),
  listJobs: () => request("GET", "/transfer/jobs"),
  pauseJob: (id: string) => request("POST", `/transfer/jobs/${id}/pause`),
  resumeJob: (id: string) => request("POST", `/transfer/jobs/${id}/resume`),
  removeJob: (id: string) => request("POST", `/transfer/jobs/${id}/remove`),
};

export function openTransferEvents(onMessage: (data: unknown) => void) {
  // EventSource cannot set custom headers; use fetch stream
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
        const line = part
          .split("\n")
          .find((l) => l.startsWith("data: "));
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
