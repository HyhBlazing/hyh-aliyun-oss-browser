import { isTauri } from "./local-fs";

const LS_UI_ZOOM = "hyh-oss-ui-zoom";

export const UI_ZOOM_MIN = 90;
export const UI_ZOOM_MAX = 125;
export const UI_ZOOM_DEFAULT = 110;
export const UI_ZOOM_STEP = 5;

/** 将缩放百分比限制在 90～125 */
export function clampUiZoomPercent(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return UI_ZOOM_DEFAULT;
  return Math.min(UI_ZOOM_MAX, Math.max(UI_ZOOM_MIN, Math.round(n)));
}

/** 读取本机保存的界面缩放百分比 */
export function getUiZoomPercent(): number {
  try {
    const raw = localStorage.getItem(LS_UI_ZOOM);
    if (raw == null || raw === "") return UI_ZOOM_DEFAULT;
    return clampUiZoomPercent(raw);
  } catch {
    return UI_ZOOM_DEFAULT;
  }
}

/** 保存界面缩放百分比（不自动应用） */
export function setUiZoomPercent(percent: number): number {
  const p = clampUiZoomPercent(percent);
  try {
    localStorage.setItem(LS_UI_ZOOM, String(p));
  } catch {
    /* ignore */
  }
  return p;
}

/**
 * 应用界面缩放。
 * 桌面端优先使用 WebView setZoom；其它环境回退到 CSS zoom。
 */
export async function applyUiZoom(percent?: number): Promise<number> {
  const p = clampUiZoomPercent(percent ?? getUiZoomPercent());
  const factor = p / 100;

  if (isTauri()) {
    try {
      const { getCurrentWebviewWindow } = await import(
        "@tauri-apps/api/webviewWindow"
      );
      await getCurrentWebviewWindow().setZoom(factor);
      document.documentElement.style.removeProperty("zoom");
      return p;
    } catch (e) {
      console.warn("webview setZoom failed, fallback to CSS zoom", e);
    }
  }

  document.documentElement.style.zoom = `${p}%`;
  return p;
}
