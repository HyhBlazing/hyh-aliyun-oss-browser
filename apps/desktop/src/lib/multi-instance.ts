import { isTauri } from "./local-fs";

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err.trim()) return err;
  if (err && typeof err === "object") {
    const o = err as { message?: unknown; error?: unknown };
    if (typeof o.message === "string" && o.message.trim()) return o.message;
    if (typeof o.error === "string" && o.error.trim()) return o.error;
  }
  return fallback;
}

/** 是否允许同时运行多个应用实例（默认否，下次启动生效） */
export async function getAllowMultipleInstances(): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return !!(await invoke<boolean>("get_allow_multiple_instances"));
  } catch (e) {
    console.warn("getAllowMultipleInstances failed", e);
    return false;
  }
}

/** 写入多实例偏好；需重新启动应用后生效 */
export async function setAllowMultipleInstances(allow: boolean): Promise<void> {
  if (!isTauri()) {
    throw new Error("当前环境不支持多实例设置，请在桌面客户端中使用");
  }
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("set_allow_multiple_instances", { allow: !!allow });
  } catch (e) {
    throw new Error(errorMessage(e, "设置多实例失败"));
  }
}
