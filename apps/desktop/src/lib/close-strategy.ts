const LS_CLOSE_STRATEGY = "hyh-oss-close-strategy";

/** 主窗口关闭策略 */
export type CloseStrategy = "ask" | "tray" | "exit";

export function getCloseStrategy(): CloseStrategy {
  try {
    const v = localStorage.getItem(LS_CLOSE_STRATEGY);
    if (v === "tray" || v === "exit" || v === "ask") return v;
  } catch {
    /* ignore */
  }
  return "ask";
}

export function setCloseStrategy(strategy: CloseStrategy) {
  try {
    localStorage.setItem(
      LS_CLOSE_STRATEGY,
      strategy === "tray" || strategy === "exit" ? strategy : "ask"
    );
  } catch {
    /* ignore */
  }
}
