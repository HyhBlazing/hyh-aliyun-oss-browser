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

function isWindowsTauri(): boolean {
  return isTauri() && navigator.platform.toLowerCase().includes("win");
}

/** 读取系统是否已注册开机自启 */
export async function getAutoStartEnabled(): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    if (isWindowsTauri()) {
      const { invoke } = await import("@tauri-apps/api/core");
      return !!(await invoke<boolean>("get_app_autostart"));
    }
    const { isEnabled } = await import("@tauri-apps/plugin-autostart");
    return !!(await isEnabled());
  } catch (e) {
    console.warn("autostart isEnabled failed", e);
    return false;
  }
}

/** 开启或关闭开机自启（仅在状态变化时写入；关闭时允许项不存在） */
export async function setAutoStartEnabled(enabled: boolean): Promise<void> {
  if (!isTauri()) {
    throw new Error("当前环境不支持开机自启，请在桌面客户端中使用");
  }

  const current = await getAutoStartEnabled();
  if (current === !!enabled) return;

  try {
    if (isWindowsTauri()) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("set_app_autostart", { enabled: !!enabled });
      return;
    }
    const { enable, disable } = await import("@tauri-apps/plugin-autostart");
    if (enabled) {
      await enable();
    } else {
      try {
        await disable();
      } catch (e) {
        // 插件在未注册时 delete 可能报错，确认已关闭则忽略
        const stillOn = await getAutoStartEnabled();
        if (stillOn) throw e;
      }
    }
  } catch (e) {
    throw new Error(errorMessage(e, "设置开机自启失败"));
  }
}
