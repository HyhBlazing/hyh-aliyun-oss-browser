/** 是否运行在 Tauri WebView */
export function isTauri() {
  return typeof window !== "undefined" && !!(window as any).__TAURI_INTERNALS__;
}

const LS_DOWNLOAD_DIR = "hyh-oss-last-download-dir";
const LS_DOWNLOAD_MODE = "hyh-oss-download-mode";
const LS_LAST_PICKED_DIR = "hyh-oss-last-picked-download-dir";

export type DownloadDirMode = "ask" | "fixed";

export function getDefaultDownloadDirectory(): string {
  try {
    return localStorage.getItem(LS_DOWNLOAD_DIR) || "";
  } catch {
    return "";
  }
}

export function setDefaultDownloadDirectory(dir: string | null) {
  try {
    if (!dir) {
      localStorage.removeItem(LS_DOWNLOAD_DIR);
      return;
    }
    localStorage.setItem(LS_DOWNLOAD_DIR, dir);
  } catch {
    /* ignore */
  }
}

export function getDownloadDirMode(): DownloadDirMode {
  try {
    const mode = localStorage.getItem(LS_DOWNLOAD_MODE);
    if (mode === "ask" || mode === "fixed") return mode;
  } catch {
    /* ignore */
  }
  // 兼容旧版：已配置目录则视为固定目录
  return getDefaultDownloadDirectory() ? "fixed" : "ask";
}

export function setDownloadDirMode(mode: DownloadDirMode) {
  try {
    localStorage.setItem(LS_DOWNLOAD_MODE, mode === "fixed" ? "fixed" : "ask");
  } catch {
    /* ignore */
  }
}

function getLastPickedDirectory(): string {
  try {
    return (
      localStorage.getItem(LS_LAST_PICKED_DIR) ||
      getDefaultDownloadDirectory() ||
      ""
    );
  } catch {
    return getDefaultDownloadDirectory();
  }
}

function setLastPickedDirectory(dir: string | null) {
  try {
    if (!dir) {
      localStorage.removeItem(LS_LAST_PICKED_DIR);
      return;
    }
    localStorage.setItem(LS_LAST_PICKED_DIR, dir);
  } catch {
    /* ignore */
  }
}

/**
 * 选择本地下载目录。
 * Tauri：系统目录对话框；浏览器：手动输入绝对路径。
 */
export async function pickLocalDirectory(
  promptPath: (defaultPath: string) => Promise<string | null>
): Promise<string | null> {
  const last = getLastPickedDirectory();
  if (isTauri()) {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const dir = await open({
        directory: true,
        multiple: false,
        defaultPath: last || undefined,
      });
      if (!dir) return null;
      if (Array.isArray(dir)) return dir[0] || null;
      if (typeof dir === "string") return dir;
      return (dir as { path?: string }).path || String(dir);
    } catch (e) {
      console.warn("tauri dialog failed", e);
    }
  }
  const path = await promptPath(last);
  return path || null;
}

/**
 * 解析下载目录：
 * - ask：每次弹窗选择
 * - fixed：使用固定目录；未配置时再弹窗
 * - preferPrompt：强制弹窗（如「另存为」），不改写固定目录设置
 */
export async function resolveDownloadDirectory(
  promptPath: (defaultPath: string) => Promise<string | null>,
  opts?: { preferPrompt?: boolean }
): Promise<string | null> {
  const mode = getDownloadDirMode();
  if (!opts?.preferPrompt && mode === "fixed") {
    const fixed = getDefaultDownloadDirectory();
    if (fixed) return fixed;
  }

  const picked = await pickLocalDirectory(promptPath);
  if (!picked) return null;

  setLastPickedDirectory(picked);
  // 仅在「固定目录」模式下，把本次选择写回默认目录
  if (mode === "fixed" && !opts?.preferPrompt) {
    setDefaultDownloadDirectory(picked);
  }
  return picked;
}

export function rememberDownloadDirectory(dir: string) {
  if (!dir) return;
  setLastPickedDirectory(dir);
  if (getDownloadDirMode() === "fixed") {
    setDefaultDownloadDirectory(dir);
  }
}
