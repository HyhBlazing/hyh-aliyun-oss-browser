import { invoke } from "@tauri-apps/api/core";
import { homeDir, join } from "@tauri-apps/api/path";
import { readTextFile } from "@tauri-apps/plugin-fs";

export type SidecarMeta = {
  host: string;
  port: number;
  token: string;
  pid?: number;
};

const LS_SESSION = "hyh-oss-session";
const LS_REMEMBER = "hyh-oss-remember";
const LS_HISTORIES = "hyh-oss-histories";

export type AuthHistoryItem = {
  id: string;
  secret: string;
  stoken?: string;
  region?: string;
  eptpl?: string;
  eptplcname?: string;
  osspath?: string;
  cname?: boolean;
  isRequestPay?: boolean;
  desc?: string;
  updatedAt?: number;
};

function lsGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function lsSet(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

function lsDel(key: string) {
  localStorage.removeItem(key);
}

export async function loadSidecarMeta(): Promise<SidecarMeta | null> {
  try {
    return await invoke<SidecarMeta>("get_sidecar_meta");
  } catch {
    try {
      const home = await homeDir();
      const file = await join(home, ".hyh-oss-browser", "sidecar.json");
      const text = await readTextFile(file);
      return JSON.parse(text) as SidecarMeta;
    } catch {
      return { host: "127.0.0.1", port: 17823, token: "dev-token" };
    }
  }
}

export async function saveSecureSession(session: Record<string, unknown>) {
  try {
    await invoke("save_session", { session });
  } catch {
    lsSet(LS_SESSION, session);
  }
}

export async function loadSecureSession(): Promise<Record<string, unknown> | null> {
  try {
    return await invoke<Record<string, unknown> | null>("load_session");
  } catch {
    return lsGet<Record<string, unknown> | null>(LS_SESSION, null);
  }
}

export async function clearSecureSession() {
  try {
    await invoke("clear_session");
  } catch {
    lsDel(LS_SESSION);
  }
}

export async function ensureSidecarStarted(): Promise<SidecarMeta> {
  try {
    const meta = await invoke<SidecarMeta>("ensure_sidecar");
    if (meta?.port) {
      const { configureApi } = await import("../api/client");
      configureApi(`http://${meta.host || "127.0.0.1"}:${meta.port}`, meta.token);
    }
    return meta;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("ensure_sidecar failed", e);
    throw new Error(msg || "启动传输服务失败");
  }
}

/** 记住登录表单（下次打开自动回填） */
export function saveRememberForm(form: Record<string, unknown> | null) {
  if (!form) {
    lsDel(LS_REMEMBER);
    return;
  }
  lsSet(LS_REMEMBER, form);
}

export function loadRememberForm(): Record<string, unknown> | null {
  return lsGet<Record<string, unknown> | null>(LS_REMEMBER, null);
}

/** 多 AccessKey 历史 */
export function listHistories(): AuthHistoryItem[] {
  const arr = lsGet<AuthHistoryItem[]>(LS_HISTORIES, []);
  return Array.isArray(arr) ? arr : [];
}

export function addToHistories(item: AuthHistoryItem) {
  const arr = listHistories().filter((h) => h.id !== item.id);
  arr.unshift({
    ...item,
    updatedAt: Date.now(),
  });
  lsSet(LS_HISTORIES, arr);
}

export function removeFromHistories(id: string) {
  lsSet(
    LS_HISTORIES,
    listHistories().filter((h) => h.id !== id)
  );
}

export function cleanHistories() {
  lsDel(LS_HISTORIES);
}

export function updateHistory(id: string, patch: Partial<AuthHistoryItem>) {
  const arr = listHistories();
  const idx = arr.findIndex((h) => h.id === id);
  if (idx < 0) return false;
  arr[idx] = { ...arr[idx], ...patch, updatedAt: Date.now() };
  lsSet(LS_HISTORIES, arr);
  return true;
}
