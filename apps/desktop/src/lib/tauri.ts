import { invoke } from "@tauri-apps/api/core";
import { homeDir, join } from "@tauri-apps/api/path";
import { readTextFile } from "@tauri-apps/plugin-fs";

export type SidecarMeta = {
  host: string;
  port: number;
  token: string;
  pid?: number;
};

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
    localStorage.setItem("hyh-oss-session", JSON.stringify(session));
  }
}

export async function loadSecureSession(): Promise<Record<string, unknown> | null> {
  try {
    return await invoke<Record<string, unknown> | null>("load_session");
  } catch {
    const raw = localStorage.getItem("hyh-oss-session");
    return raw ? JSON.parse(raw) : null;
  }
}

export async function clearSecureSession() {
  try {
    await invoke("clear_session");
  } catch {
    localStorage.removeItem("hyh-oss-session");
  }
}

export async function ensureSidecarStarted() {
  try {
    return await invoke<SidecarMeta>("ensure_sidecar");
  } catch {
    return null;
  }
}
