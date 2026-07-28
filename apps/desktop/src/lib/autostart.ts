import { isTauri } from "./local-fs";

/** 读取系统是否已注册开机自启 */
export async function getAutoStartEnabled(): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    const { isEnabled } = await import("@tauri-apps/plugin-autostart");
    return !!(await isEnabled());
  } catch (e) {
    console.warn("autostart isEnabled failed", e);
    return false;
  }
}

/** 开启或关闭开机自启 */
export async function setAutoStartEnabled(enabled: boolean): Promise<void> {
  if (!isTauri()) {
    throw new Error("当前环境不支持开机自启，请在桌面客户端中使用");
  }
  const { enable, disable } = await import("@tauri-apps/plugin-autostart");
  if (enabled) {
    await enable();
  } else {
    await disable();
  }
}
