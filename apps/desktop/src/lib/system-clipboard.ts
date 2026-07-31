import { isTauri } from "./local-fs";

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err.trim()) return err;
  return fallback;
}

/** 读取系统剪贴板中的本地文件/文件夹路径（资源管理器复制后） */
export async function readSystemClipboardFiles(): Promise<string[]> {
  if (!isTauri()) return [];
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const paths = await invoke<string[]>("clipboard_read_files");
    return Array.isArray(paths) ? paths.filter((p) => !!String(p || "").trim()) : [];
  } catch (e) {
    console.warn("clipboard_read_files failed", e);
    return [];
  }
}

/** 系统剪贴板是否包含文件路径 */
export async function hasSystemClipboardFiles(): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return !!(await invoke<boolean>("clipboard_has_files"));
  } catch {
    return false;
  }
}

/** 将本地路径写入系统剪贴板，供资源管理器粘贴 */
export async function writeSystemClipboardFiles(paths: string[]): Promise<void> {
  if (!isTauri()) {
    throw new Error("当前环境不支持系统文件剪贴板，请在桌面客户端中使用");
  }
  const list = [...new Set(paths.map((p) => String(p || "").trim()).filter(Boolean))];
  if (!list.length) throw new Error("没有可写入剪贴板的文件");
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("clipboard_write_files", { paths: list });
  } catch (e) {
    throw new Error(errorMessage(e, "写入系统剪贴板失败"));
  }
}
