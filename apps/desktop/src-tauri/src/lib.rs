use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::{
  menu::{Menu, MenuItem},
  tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
  Emitter, LogicalSize, Manager, PhysicalPosition, PhysicalSize, Position, Size, WindowEvent,
};
use tauri_plugin_store::StoreExt;

#[cfg(windows)]
mod win_folder_under_cursor;

struct SidecarState {
  child: Mutex<Option<Child>>,
  meta: Mutex<Option<SidecarMeta>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SidecarMeta {
  pub host: String,
  pub port: u16,
  pub token: String,
  pub pid: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct WindowGeometry {
  x: i32,
  y: i32,
  width: u32,
  height: u32,
  maximized: bool,
}

const MIN_WINDOW_WIDTH: f64 = 1024.0;
const MIN_WINDOW_HEIGHT: f64 = 640.0;

fn app_data_dir() -> PathBuf {
  dirs::home_dir()
    .unwrap_or_else(|| PathBuf::from("."))
    .join(".hyh-oss-browser")
}

/// Packaged builds prefer bundled transfer-sidecar binary (no system Node).
/// Debug / `tauri:dev` prefers Node + source tree so local iteration stays simple.
fn resolve_sidecar_launch(app: &tauri::AppHandle) -> Result<(PathBuf, Vec<String>, Option<PathBuf>), String> {
  let sidecar_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../transfer-sidecar");
  let entry = sidecar_dir.join("src").join("index.js");

  // Dev: always prefer source + system Node when available.
  if cfg!(debug_assertions) && entry.exists() {
    return Ok((
      PathBuf::from("node"),
      vec![entry.to_string_lossy().to_string()],
      Some(sidecar_dir.clone()),
    ));
  }

  let candidates: Vec<PathBuf> = {
    let mut list = Vec::new();
    if let Ok(exe) = std::env::current_exe() {
      if let Some(dir) = exe.parent() {
        list.push(dir.join("transfer-sidecar.exe"));
        list.push(dir.join("transfer-sidecar"));
      }
    }
    if let Ok(resource_dir) = app.path().resource_dir() {
      list.push(resource_dir.join("transfer-sidecar.exe"));
      list.push(resource_dir.join("transfer-sidecar"));
      list.push(resource_dir.join("binaries").join("transfer-sidecar.exe"));
      list.push(resource_dir.join("binaries").join("transfer-sidecar"));
    }
    let bin_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("binaries");
    list.push(bin_dir.join("transfer-sidecar.exe"));
    list.push(bin_dir.join("transfer-sidecar"));
    list.push(bin_dir.join("transfer-sidecar-x86_64-pc-windows-msvc.exe"));
    list.push(bin_dir.join("transfer-sidecar-aarch64-pc-windows-msvc.exe"));
    list
  };

  for path in candidates {
    if path.exists() {
      return Ok((path, Vec::new(), None));
    }
  }

  if entry.exists() {
    return Ok((
      PathBuf::from("node"),
      vec![entry.to_string_lossy().to_string()],
      Some(sidecar_dir),
    ));
  }

  Err("找不到内置 sidecar。请重新安装应用，或在开发环境安装 Node.js 后从仓库启动。".into())
}

fn window_geometry_path() -> PathBuf {
  app_data_dir().join("window.json")
}

fn instance_prefs_path() -> PathBuf {
  app_data_dir().join("instance.json")
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct InstancePrefs {
  /// 默认 false：仅允许单个实例；true 时允许同时运行多个进程
  #[serde(default)]
  allow_multiple: bool,
}

fn read_instance_prefs() -> InstancePrefs {
  let text = match fs::read_to_string(instance_prefs_path()) {
    Ok(t) => t,
    Err(_) => return InstancePrefs::default(),
  };
  serde_json::from_str(&text).unwrap_or_default()
}

fn write_instance_prefs(prefs: &InstancePrefs) -> Result<(), String> {
  let dir = app_data_dir();
  fs::create_dir_all(&dir).map_err(|e| format!("创建配置目录失败: {e}"))?;
  let text = serde_json::to_string_pretty(prefs).map_err(|e| e.to_string())?;
  fs::write(instance_prefs_path(), text).map_err(|e| format!("写入实例设置失败: {e}"))
}

fn allow_multiple_instances() -> bool {
  read_instance_prefs().allow_multiple
}

/// 结束本进程持有的 sidecar。多实例模式下不结束，避免打断其它窗口。
fn kill_sidecar_for_exit(state: &SidecarState) {
  if allow_multiple_instances() {
    return;
  }
  kill_sidecar(state);
}

fn load_window_geometry() -> Option<WindowGeometry> {
  let text = fs::read_to_string(window_geometry_path()).ok()?;
  serde_json::from_str(&text).ok()
}

fn save_window_geometry(window: &tauri::Window) {
  if window.is_minimized().unwrap_or(true) {
    return;
  }
  let Ok(pos) = window.outer_position() else {
    return;
  };
  let Ok(size) = window.outer_size() else {
    return;
  };
  if size.width < 200 || size.height < 160 {
    return;
  }
  let geo = WindowGeometry {
    x: pos.x,
    y: pos.y,
    width: size.width,
    height: size.height,
    maximized: window.is_maximized().unwrap_or(false),
  };
  let _ = fs::create_dir_all(app_data_dir());
  if let Ok(text) = serde_json::to_string_pretty(&geo) {
    let _ = fs::write(window_geometry_path(), text);
  }
}

fn position_on_any_monitor(window: &tauri::WebviewWindow, x: i32, y: i32) -> bool {
  let Ok(monitors) = window.available_monitors() else {
    return true;
  };
  if monitors.is_empty() {
    return true;
  }
  monitors.iter().any(|m| {
    let p = m.position();
    let s = m.size();
    let left = p.x;
    let top = p.y;
    let right = p.x.saturating_add(s.width as i32);
    let bottom = p.y.saturating_add(s.height as i32);
    x >= left - 80 && x < right && y >= top - 80 && y < bottom
  })
}

fn apply_window_geometry(win: &tauri::WebviewWindow) {
  let _ = win.set_min_size(Some(Size::Logical(LogicalSize::new(
    MIN_WINDOW_WIDTH,
    MIN_WINDOW_HEIGHT,
  ))));

  if let Some(geo) = load_window_geometry() {
    if position_on_any_monitor(win, geo.x, geo.y) {
      let _ = win.set_size(Size::Physical(PhysicalSize::new(geo.width, geo.height)));
      let _ = win.set_position(Position::Physical(PhysicalPosition::new(geo.x, geo.y)));
      if geo.maximized {
        let _ = win.maximize();
      }
      return;
    }
  }
  let _ = win.center();
}

fn read_meta_file() -> Option<SidecarMeta> {
  let p = app_data_dir().join("sidecar.json");
  let text = fs::read_to_string(p).ok()?;
  serde_json::from_str(&text).ok()
}

fn process_alive(pid: u32) -> bool {
  #[cfg(windows)]
  {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    let output = Command::new("tasklist")
      .args(["/FI", &format!("PID eq {pid}"), "/NH"])
      .creation_flags(CREATE_NO_WINDOW)
      .output();
    match output {
      Ok(o) => {
        let text = String::from_utf8_lossy(&o.stdout);
        text.lines().any(|line| {
          let line = line.trim();
          !line.is_empty()
            && !line.starts_with("INFO:")
            && line.split_whitespace().any(|part| part == pid.to_string())
        })
      }
      Err(_) => false,
    }
  }
  #[cfg(unix)]
  {
    Command::new("kill")
      .args(["-0", &pid.to_string()])
      .status()
      .map(|s| s.success())
      .unwrap_or(false)
  }
}

/// 尽力结束残留 sidecar 进程（健康检查已失败时使用；PID 复用时可能误杀，故仅在确认健康失败后调用）
fn force_kill_pid(pid: u32) {
  #[cfg(windows)]
  {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    let _ = Command::new("taskkill")
      .args(["/PID", &pid.to_string(), "/F", "/T"])
      .creation_flags(CREATE_NO_WINDOW)
      .output();
  }
  #[cfg(unix)]
  {
    let _ = Command::new("kill")
      .args(["-9", &pid.to_string()])
      .status();
  }
}

fn clear_sidecar_meta_file() {
  let _ = fs::remove_file(app_data_dir().join("sidecar.json"));
}

fn write_sidecar_meta_file(meta: &SidecarMeta) {
  let _ = fs::create_dir_all(app_data_dir());
  let _ = fs::write(
    app_data_dir().join("sidecar.json"),
    serde_json::to_string_pretty(meta).unwrap_or_default(),
  );
}

fn sidecar_health_ok(host: &str, port: u16, token: &str) -> bool {
  use std::io::{Read, Write};
  use std::net::TcpStream;
  use std::time::Duration;

  let addr = format!("{host}:{port}");
  let Ok(mut stream) = TcpStream::connect_timeout(
    &match addr.parse() {
      Ok(a) => a,
      Err(_) => return false,
    },
    Duration::from_millis(500),
  ) else {
    return false;
  };
  let _ = stream.set_read_timeout(Some(Duration::from_millis(800)));
  let _ = stream.set_write_timeout(Some(Duration::from_millis(800)));
  let req = format!(
    "GET /health HTTP/1.1\r\nHost: {host}:{port}\r\nx-sidecar-token: {token}\r\nConnection: close\r\n\r\n"
  );
  if stream.write_all(req.as_bytes()).is_err() {
    return false;
  }
  let mut buf = [0u8; 256];
  let Ok(n) = stream.read(&mut buf) else {
    return false;
  };
  let text = String::from_utf8_lossy(&buf[..n]);
  text.contains("HTTP/1.1 200") || text.contains("\"code\":0")
}

#[tauri::command]
fn get_sidecar_meta(state: tauri::State<'_, SidecarState>) -> Result<SidecarMeta, String> {
  if let Some(meta) = state.meta.lock().unwrap().clone() {
    return Ok(meta);
  }
  read_meta_file().ok_or_else(|| "sidecar 尚未启动".into())
}

#[tauri::command]
fn ensure_sidecar(
  app: tauri::AppHandle,
  state: tauri::State<'_, SidecarState>,
) -> Result<SidecarMeta, String> {
  let token = std::env::var("SIDECAR_TOKEN").unwrap_or_else(|_| "dev-token".into());
  let port = std::env::var("SIDECAR_PORT").unwrap_or_else(|_| "17823".into());
  let port_num: u16 = port.parse().unwrap_or(17823);

  // 内存中已有可用实例
  if let Some(meta) = state.meta.lock().unwrap().clone() {
    if meta.port == port_num && sidecar_health_ok(&meta.host, meta.port, &token) {
      return Ok(meta);
    }
  }

  // 磁盘 meta：仅在健康检查通过时复用；失败则清理残留并继续拉起
  if let Some(meta) = read_meta_file() {
    if meta.port == port_num && sidecar_health_ok(&meta.host, meta.port, &token) {
      let ready = SidecarMeta {
        host: meta.host,
        port: meta.port,
        token: token.clone(),
        pid: meta.pid,
      };
      *state.meta.lock().unwrap() = Some(ready.clone());
      return Ok(ready);
    }
    // 健康失败：可能是僵死进程、PID 复用、或端口被占用但无响应
    if let Some(pid) = meta.pid {
      if process_alive(pid) {
        log::warn!("stale sidecar pid {pid} alive but health failed; force kill");
        force_kill_pid(pid);
        std::thread::sleep(std::time::Duration::from_millis(200));
      }
    }
    clear_sidecar_meta_file();
  }

  // 端口上已有可响应的 sidecar（孤儿进程 / meta 丢失）时直接接管
  if sidecar_health_ok("127.0.0.1", port_num, &token) {
    let meta = SidecarMeta {
      host: "127.0.0.1".into(),
      port: port_num,
      token: token.clone(),
      pid: None,
    };
    write_sidecar_meta_file(&meta);
    *state.meta.lock().unwrap() = Some(meta.clone());
    return Ok(meta);
  }

  let (program, args, cwd) = resolve_sidecar_launch(&app)?;
  fs::create_dir_all(app_data_dir()).map_err(|e| e.to_string())?;

  // 启动前再清一次，避免 wait 循环读到旧 meta 误判成功
  clear_sidecar_meta_file();

  let log_path = app_data_dir().join("sidecar.log");
  let stderr_file = fs::File::create(&log_path).ok();

  let mut cmd = Command::new(&program);
  cmd.args(&args)
    .env("SIDECAR_TOKEN", &token)
    .env("SIDECAR_PORT", &port)
    .stdout(Stdio::null());
  if let Some(f) = stderr_file {
    cmd.stderr(Stdio::from(f));
  } else {
    cmd.stderr(Stdio::null());
  }
  if let Some(dir) = cwd {
    cmd.current_dir(dir);
  }
  #[cfg(windows)]
  {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    cmd.creation_flags(CREATE_NO_WINDOW);
  }

  let mut child = cmd
    .spawn()
    .map_err(|e| format!("启动 sidecar 失败（{program:?}）: {e}"))?;

  let child_pid = child.id();

  // 等待健康检查通过（比只等 meta 文件更可靠）
  for _ in 0..120 {
    std::thread::sleep(std::time::Duration::from_millis(100));
    if sidecar_health_ok("127.0.0.1", port_num, &token) {
      let meta = SidecarMeta {
        host: "127.0.0.1".into(),
        port: port_num,
        token: token.clone(),
        pid: Some(child_pid),
      };
      write_sidecar_meta_file(&meta);
      *state.meta.lock().unwrap() = Some(meta.clone());
      *state.child.lock().unwrap() = Some(child);
      let _ = app;
      return Ok(meta);
    }
    if let Ok(Some(status)) = child.try_wait() {
      let log_hint = fs::read_to_string(&log_path).unwrap_or_default();
      let tail: String = log_hint.chars().rev().take(800).collect::<String>().chars().rev().collect();
      return Err(format!(
        "sidecar 进程异常退出（status: {status}）。开发环境请确认已安装 Node.js 且 apps/transfer-sidecar 依赖完整。{}",
        if tail.trim().is_empty() {
          String::new()
        } else {
          format!(" 日志: {tail}")
        }
      ));
    }
  }

  let _ = child.kill();
  Err(format!(
    "sidecar 启动超时（端口 {port_num}）。可查看 {}",
    log_path.display()
  ))
}

#[tauri::command]
fn save_session(app: tauri::AppHandle, session: Value) -> Result<(), String> {
  let store = app.store("session.json").map_err(|e| e.to_string())?;
  store.set("session", session);
  store.save().map_err(|e| e.to_string())?;
  Ok(())
}

#[tauri::command]
fn load_session(app: tauri::AppHandle) -> Result<Option<Value>, String> {
  let store = app.store("session.json").map_err(|e| e.to_string())?;
  Ok(store.get("session"))
}

#[tauri::command]
fn clear_session(app: tauri::AppHandle) -> Result<(), String> {
  let store = app.store("session.json").map_err(|e| e.to_string())?;
  store.delete("session");
  store.save().map_err(|e| e.to_string())?;
  Ok(())
}

#[tauri::command]
fn get_drag_icon_path() -> Result<String, String> {
  let p = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("icons/32x32.png");
  if p.is_file() {
    Ok(p.to_string_lossy().to_string())
  } else {
    Err("找不到拖拽预览图标".into())
  }
}

fn copy_path_recursive(from: &std::path::Path, to: &std::path::Path) -> Result<(), String> {
  if from.is_dir() {
    fs::create_dir_all(to).map_err(|e| format!("创建目录失败: {e}"))?;
    for entry in fs::read_dir(from).map_err(|e| format!("读取目录失败: {e}"))? {
      let entry = entry.map_err(|e| format!("读取目录项失败: {e}"))?;
      copy_path_recursive(&entry.path(), &to.join(entry.file_name()))?;
    }
  } else {
    if let Some(parent) = to.parent() {
      fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {e}"))?;
    }
    fs::copy(from, to).map_err(|e| format!("复制文件失败: {e}"))?;
  }
  Ok(())
}

fn unique_dest_path(dest_root: &std::path::Path, src: &std::path::Path) -> Result<PathBuf, String> {
  let name = src
    .file_name()
    .ok_or_else(|| "无效路径".to_string())?;
  let mut dest = dest_root.join(name);
  if !dest.exists() {
    return Ok(dest);
  }
  let stem = src
    .file_stem()
    .and_then(|s| s.to_str())
    .unwrap_or("file");
  let ext = src
    .extension()
    .and_then(|s| s.to_str())
    .map(|e| format!(".{e}"))
    .unwrap_or_default();
  for i in 1..1000 {
    let candidate = dest_root.join(format!("{stem} ({i}){ext}"));
    if !candidate.exists() {
      dest = candidate;
      break;
    }
  }
  Ok(dest)
}

/// 将本地文件/目录复制到目标目录（拖拽中断时兜底保存到桌面）
#[tauri::command]
fn copy_paths_to_dir(paths: Vec<String>, dest_dir: String) -> Result<Vec<String>, String> {
  let dest_root = PathBuf::from(&dest_dir);
  fs::create_dir_all(&dest_root).map_err(|e| format!("创建目标目录失败: {e}"))?;
  let mut out = Vec::new();
  for p in paths {
    let src = PathBuf::from(&p);
    if !src.exists() {
      return Err(format!("源文件不存在: {p}"));
    }
    let dest = unique_dest_path(&dest_root, &src)?;
    copy_path_recursive(&src, &dest)?;
    out.push(dest.to_string_lossy().to_string());
  }
  Ok(out)
}

/// 检查路径是否都存在（拖拽前校验）
#[tauri::command]
fn paths_exist(paths: Vec<String>) -> Result<bool, String> {
  Ok(paths.iter().all(|p| PathBuf::from(p).exists()))
}

/// 读取当前光标下方的资源管理器文件夹 / 桌面路径（拖放松手后入队下载）
#[tauri::command]
fn folder_under_cursor(app: tauri::AppHandle) -> Result<Option<String>, String> {
  #[cfg(windows)]
  {
    run_clipboard_on_main_thread(app, || win_folder_under_cursor::folder_path_under_cursor())
  }
  #[cfg(not(windows))]
  {
    let _ = app;
    Err("当前平台暂不支持拖放到文件夹后自动识别路径".into())
  }
}

/// 等待鼠标左键松开，再解析光标下的文件夹路径（拖出下载专用）。
/// 在本窗口内松开返回错误 CANCELLED；无法识别返回 UNRECOGNIZED。
#[tauri::command]
async fn await_drop_folder_path(app: tauri::AppHandle) -> Result<String, String> {
  #[cfg(windows)]
  {
    tauri::async_runtime::spawn_blocking(move || {
      let own_hwnd = main_window_hwnd(&app);
      let start = std::time::Instant::now();
      // 拖出时左键通常仍按下；轮询直到松开（不阻塞 UI 线程）
      while win_folder_under_cursor::is_primary_mouse_down() {
        if start.elapsed() > std::time::Duration::from_secs(120) {
          return Err("拖放超时，已取消".into());
        }
        std::thread::sleep(std::time::Duration::from_millis(30));
      }
      std::thread::sleep(std::time::Duration::from_millis(50));

      if win_folder_under_cursor::is_cursor_over_window(own_hwnd) {
        return Err("CANCELLED".into());
      }

      let path = run_clipboard_on_main_thread(app, || {
        win_folder_under_cursor::folder_path_under_cursor()
      })?;
      match path {
        Some(p) if !p.is_empty() => Ok(p),
        _ => Err("UNRECOGNIZED".into()),
      }
    })
    .await
    .map_err(|e| format!("拖放等待失败: {e}"))?
  }
  #[cfg(not(windows))]
  {
    let _ = app;
    Err("当前平台暂不支持拖放到文件夹后自动识别路径".into())
  }
}

/// 将文本写入用户选择的本地路径（导出任务等）
#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<(), String> {
  let p = PathBuf::from(path.trim());
  if p.as_os_str().is_empty() {
    return Err("保存路径无效".into());
  }
  if let Some(parent) = p.parent() {
    if !parent.as_os_str().is_empty() {
      fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {e}"))?;
    }
  }
  fs::write(&p, contents).map_err(|e| format!("写入文件失败: {e}"))
}

/// 读取用户选择的文本文件（导入任务等）
#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
  let p = PathBuf::from(path.trim());
  if !p.is_file() {
    return Err("文件不存在".into());
  }
  fs::read_to_string(&p).map_err(|e| format!("读取文件失败: {e}"))
}

/// 将本地文件/文件夹路径写入系统剪贴板（Windows CF_HDROP，可在资源管理器中粘贴）
#[tauri::command]
fn clipboard_write_files(app: tauri::AppHandle, paths: Vec<String>) -> Result<(), String> {
  #[cfg(windows)]
  {
    let hwnd = main_window_hwnd(&app);
    // 写入必须在 UI 主线程，并 OleFlushClipboard，否则资源管理器常无法粘贴
    run_clipboard_on_main_thread(app, move || clipboard_write_files_windows(hwnd, paths))
  }
  #[cfg(not(windows))]
  {
    let _ = (app, paths);
    Err("当前平台暂不支持将文件复制到系统剪贴板".into())
  }
}

/// 读取系统剪贴板中的文件/文件夹路径（资源管理器复制后可在此粘贴上传）
#[tauri::command]
fn clipboard_read_files(app: tauri::AppHandle) -> Result<Vec<String>, String> {
  #[cfg(windows)]
  {
    let hwnd = main_window_hwnd(&app);
    // 先直接读；失败再回退主线程一次（兼容偶发 OpenClipboard 限制）
    match clipboard_read_files_windows(hwnd) {
      Ok(paths) if !paths.is_empty() => Ok(paths),
      Ok(_) => {
        // 空结果也可能是格式延迟，主线程再试一次
        match run_clipboard_on_main_thread(app.clone(), move || clipboard_read_files_windows(hwnd)) {
          Ok(paths) => Ok(paths),
          Err(_) => Ok(Vec::new()),
        }
      }
      Err(e1) => run_clipboard_on_main_thread(app, move || clipboard_read_files_windows(hwnd))
        .map_err(|e2| format!("{e1}; 主线程重试: {e2}")),
    }
  }
  #[cfg(not(windows))]
  {
    let _ = app;
    Ok(Vec::new())
  }
}

/// 系统剪贴板是否包含可粘贴的文件路径
#[tauri::command]
fn clipboard_has_files(app: tauri::AppHandle) -> Result<bool, String> {
  let files = clipboard_read_files(app)?;
  Ok(!files.is_empty())
}

#[cfg(windows)]
fn main_window_hwnd(app: &tauri::AppHandle) -> isize {
  app
    .get_webview_window("main")
    .and_then(|w| w.hwnd().ok())
    .map(|h| h.0 as isize)
    .unwrap_or(0)
}

#[cfg(windows)]
fn run_clipboard_on_main_thread<T, F>(app: tauri::AppHandle, f: F) -> Result<T, String>
where
  T: Send + 'static,
  F: FnOnce() -> Result<T, String> + Send + 'static,
{
  let (tx, rx) = std::sync::mpsc::channel();
  app
    .run_on_main_thread(move || {
      let _ = tx.send(f());
    })
    .map_err(|e| format!("无法在主线程访问剪贴板: {e}"))?;
  rx.recv_timeout(std::time::Duration::from_secs(3))
    .map_err(|_| "等待剪贴板操作超时，请重试".to_string())?
}

#[cfg(windows)]
fn normalize_fs_path_for_hdrop(raw: &str) -> String {
  let mut p = raw.trim().trim_matches('"').trim().replace('/', "\\");
  // canonicalize 可能带 \\?\ 前缀，Explorer/CF_HDROP 无法粘贴
  if let Ok(canon) = PathBuf::from(&p).canonicalize() {
    p = canon.to_string_lossy().to_string();
  }
  if let Some(stripped) = p.strip_prefix(r"\\?\UNC\") {
    p = format!(r"\\{stripped}");
  } else if let Some(stripped) = p.strip_prefix(r"\\?\") {
    p = stripped.to_string();
  }
  p.replace('/', "\\")
}

#[cfg(windows)]
fn clipboard_write_files_windows(hwnd: isize, paths: Vec<String>) -> Result<(), String> {
  use clipboard_win::{formats, options, Clipboard, Format, Getter};

  if paths.is_empty() {
    return Err("没有可复制的路径".into());
  }
  let normalized: Vec<String> = paths
    .iter()
    .map(|p| normalize_fs_path_for_hdrop(p))
    .filter(|p| !p.is_empty())
    .collect();
  if normalized.is_empty() {
    return Err("没有可复制的路径".into());
  }
  for p in &normalized {
    if !PathBuf::from(p).exists() {
      return Err(format!("文件不存在: {p}"));
    }
  }

  // OleInitialize 提升 Shell 剪贴板兼容性（可重复调用）
  #[link(name = "ole32")]
  extern "system" {
    fn OleInitialize(pvReserved: *mut core::ffi::c_void) -> i32;
  }
  unsafe {
    let _ = OleInitialize(std::ptr::null_mut());
  }

  let owner = hwnd as clipboard_win::types::HWND;
  {
    let _clip = if owner.is_null() {
      Clipboard::new_attempts(40)
    } else {
      Clipboard::new_attempts_for(owner, 40)
    }
    .map_err(|e| format!("打开剪贴板失败: {e}"))?;

    // 先清空再写 CF_HDROP
    clipboard_win::raw::set_file_list_with(&normalized, options::DoClear)
      .map_err(|e| format!("写入文件列表失败: {e}"))?;

    // Preferred DropEffect 必须 NoClear，否则会 EmptyClipboard 把 CF_HDROP 清掉
    let fmt = clipboard_win::raw::register_format("Preferred DropEffect")
      .ok_or_else(|| "注册 Preferred DropEffect 格式失败".to_string())?;
    let effect: u32 = 1; // DROPEFFECT_COPY
    clipboard_win::raw::set_without_clear(fmt.get(), &effect.to_le_bytes())
      .map_err(|e| format!("写入 DropEffect 失败: {e}"))?;
  } // CloseClipboard

  // 回读校验：确认 CF_HDROP 真的在剪贴板上
  {
    let _clip = Clipboard::new_attempts(20).map_err(|e| format!("校验剪贴板失败: {e}"))?;
    if !formats::FileList.is_format_avail() {
      return Err("写入后剪贴板中没有文件列表（CF_HDROP），请重试".into());
    }
    let mut check = Vec::<String>::new();
    let _ = formats::FileList.read_clipboard(&mut check);
    if check.is_empty() {
      return Err("写入后无法读回文件路径，请重试".into());
    }
  }

  log::info!("clipboard write ok, {} path(s)", normalized.len());
  Ok(())
}

#[cfg(windows)]
fn clipboard_read_files_windows(hwnd: isize) -> Result<Vec<String>, String> {
  use clipboard_win::{formats::FileList, Clipboard, Format, Getter};
  use std::path::PathBuf;

  // 读文件列表时优先用 NULL 打开，避免与窗口所有者纠缠；失败再用窗口句柄重试
  let try_open = |owner: clipboard_win::types::HWND| -> Result<Clipboard, String> {
    if owner.is_null() {
      Clipboard::new_attempts(40).map_err(|e| format!("打开剪贴板失败: {e}"))
    } else {
      Clipboard::new_attempts_for(owner, 40).map_err(|e| format!("打开剪贴板失败: {e}"))
    }
  };

  let owner = hwnd as clipboard_win::types::HWND;
  let _clip = match try_open(std::ptr::null_mut()) {
    Ok(c) => c,
    Err(_) => try_open(owner)?,
  };

  let mut out = Vec::new();

  // 1) 始终尝试 CF_HDROP（即使 is_format_avail 偶发不准）
  {
    let mut files = Vec::<String>::new();
    if let Ok(_) = FileList.read_clipboard(&mut files) {
      out.extend(normalize_clipboard_paths(files));
    }
    if out.is_empty() {
      let mut path_bufs = Vec::<PathBuf>::new();
      if let Ok(_) = FileList.read_clipboard(&mut path_bufs) {
        let files: Vec<String> = path_bufs
          .into_iter()
          .map(|p| p.to_string_lossy().to_string())
          .collect();
        out.extend(normalize_clipboard_paths(files));
      }
    }
  }

  if !out.is_empty() {
    log::info!("clipboard CF_HDROP paths: {}", out.len());
    return Ok(out);
  }

  if FileList.is_format_avail() {
    log::warn!("CF_HDROP format available but path list empty");
  }

  // 2) FileNameW 单路径兜底
  if let Some(path) = read_clipboard_filename_w_opened() {
    return Ok(normalize_clipboard_paths(vec![path]));
  }

  // 3) 文本兜底：复制为路径 / 单行绝对路径
  if let Some(paths) = read_clipboard_path_text_opened() {
    return Ok(paths);
  }

  Ok(Vec::new())
}

#[cfg(windows)]
fn normalize_clipboard_paths(paths: Vec<String>) -> Vec<String> {
  let mut out = Vec::new();
  for raw in paths {
    let p = raw
      .trim()
      .trim_matches('"')
      .trim()
      .replace('/', "\\");
    if p.is_empty() {
      continue;
    }
    out.push(p);
  }
  out
}

#[cfg(windows)]
fn read_clipboard_filename_w_opened() -> Option<String> {
  use clipboard_win::{formats::RawData, Getter};
  use std::os::windows::ffi::OsStringExt;

  let fmt = clipboard_win::raw::register_format("FileNameW")?;
  let mut bytes = Vec::<u8>::new();
  RawData(fmt.get()).read_clipboard(&mut bytes).ok()?;
  if bytes.len() < 2 {
    return None;
  }
  let mut wide: Vec<u16> = bytes
    .chunks_exact(2)
    .map(|c| u16::from_le_bytes([c[0], c[1]]))
    .collect();
  if let Some(end) = wide.iter().position(|&c| c == 0) {
    wide.truncate(end);
  }
  let s = std::ffi::OsString::from_wide(&wide)
    .to_string_lossy()
    .trim()
    .trim_matches('"')
    .to_string();
  if s.is_empty() {
    None
  } else {
    Some(s)
  }
}

#[cfg(windows)]
fn read_clipboard_path_text_opened() -> Option<Vec<String>> {
  use clipboard_win::{formats, Getter};
  let mut text = String::new();
  formats::Unicode.read_clipboard(&mut text).ok()?;
  let mut out = Vec::new();
  for line in text.lines() {
    let p = line.trim().trim_matches('"').trim().replace('/', "\\");
    if p.is_empty() {
      continue;
    }
    // Windows 绝对路径，或 \\server\share
    let looks_path = (p.len() >= 3
      && p.as_bytes()[0].is_ascii_alphabetic()
      && p.as_bytes()[1] == b':'
      && (p.as_bytes()[2] == b'\\' || p.as_bytes()[2] == b'/'))
      || p.starts_with("\\\\");
    if looks_path && PathBuf::from(&p).exists() {
      out.push(p);
    }
  }
  if out.is_empty() {
    None
  } else {
    Some(out)
  }
}

#[cfg(windows)]
const WINDOWS_AUTOSTART_VALUE_NAME: &str = "hyh-aliyun-oss-browser";

#[cfg(windows)]
fn windows_run_key() -> Result<winreg::RegKey, String> {
  use winreg::enums::{HKEY_CURRENT_USER, KEY_READ, KEY_SET_VALUE};
  use winreg::RegKey;
  let hkcu = RegKey::predef(HKEY_CURRENT_USER);
  hkcu
    .open_subkey_with_flags(
      r"SOFTWARE\Microsoft\Windows\CurrentVersion\Run",
      KEY_READ | KEY_SET_VALUE,
    )
    .map_err(|e| format!("打开开机自启注册表失败: {e}"))
}

/// 读取本应用是否已注册开机自启（Windows 走注册表；其它平台走插件状态由前端处理）
#[tauri::command]
fn get_app_autostart() -> Result<bool, String> {
  #[cfg(windows)]
  {
    let key = windows_run_key()?;
    Ok(key.get_value::<String, _>(WINDOWS_AUTOSTART_VALUE_NAME).is_ok())
  }
  #[cfg(not(windows))]
  {
    Err("请使用系统自启插件接口".into())
  }
}

/// 设置开机自启。Windows 写入 HKCU Run，路径含空格时自动加引号；关闭时若项不存在视为成功。
#[tauri::command]
fn set_app_autostart(enabled: bool) -> Result<(), String> {
  #[cfg(windows)]
  {
    let key = windows_run_key()?;
    if enabled {
      let exe = std::env::current_exe().map_err(|e| format!("获取程序路径失败: {e}"))?;
      let path = exe.to_string_lossy();
      let value = if path.contains(' ') {
        format!("\"{path}\"")
      } else {
        path.into_owned()
      };
      key
        .set_value(WINDOWS_AUTOSTART_VALUE_NAME, &value)
        .map_err(|e| format!("写入开机自启失败: {e}"))?;
    } else {
      match key.delete_value(WINDOWS_AUTOSTART_VALUE_NAME) {
        Ok(()) => {}
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(e) => return Err(format!("关闭开机自启失败: {e}")),
      }
    }
    Ok(())
  }
  #[cfg(not(windows))]
  {
    let _ = enabled;
    Err("当前平台请使用系统自启插件".into())
  }
}

fn kill_sidecar(state: &SidecarState) {
  if let Some(mut child) = state.child.lock().unwrap().take() {
    let _ = child.kill();
  }
}

#[tauri::command]
fn get_allow_multiple_instances() -> bool {
  allow_multiple_instances()
}

#[tauri::command]
fn set_allow_multiple_instances(allow: bool) -> Result<(), String> {
  write_instance_prefs(&InstancePrefs {
    allow_multiple: allow,
  })
}

/// 确认退出：先刷盘传输任务，再结束 sidecar 并退出进程
#[tauri::command]
fn quit_app(app: tauri::AppHandle, state: tauri::State<'_, SidecarState>) -> Result<(), String> {
  // 尽力通知 sidecar 落盘（超时后仍退出）
  let _ = persist_sidecar_jobs_blocking();
  kill_sidecar_for_exit(&state);
  app.exit(0);
  Ok(())
}

fn persist_sidecar_jobs_blocking() {
  let meta_path = app_data_dir().join("sidecar.json");
  let Ok(text) = fs::read_to_string(&meta_path) else {
    return;
  };
  let Ok(meta) = serde_json::from_str::<SidecarMeta>(&text) else {
    return;
  };
  use std::io::{Read, Write};
  use std::net::TcpStream;
  use std::time::Duration;
  let Ok(mut stream) = TcpStream::connect(format!("{}:{}", meta.host, meta.port)) else {
    return;
  };
  let _ = stream.set_read_timeout(Some(Duration::from_millis(1500)));
  let _ = stream.set_write_timeout(Some(Duration::from_millis(1500)));
  let req = format!(
    "POST /transfer/persist HTTP/1.1\r\nHost: {}:{}\r\nX-Sidecar-Token: {}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
    meta.host, meta.port, meta.token
  );
  let _ = stream.write_all(req.as_bytes());
  let mut buf = [0u8; 256];
  let _ = stream.read(&mut buf);
}

/// 隐藏主窗口到系统托盘（不结束 sidecar）
#[tauri::command]
fn hide_to_tray(app: tauri::AppHandle) -> Result<(), String> {
  if let Some(win) = app.get_webview_window("main") {
    win.hide().map_err(|e| e.to_string())?;
  }
  Ok(())
}

fn show_main_window(app: &tauri::AppHandle) {
  if let Some(win) = app.get_webview_window("main") {
    let _ = win.show();
    let _ = win.unminimize();
    // 短暂置顶，确保从托盘/后台再次启动时能把主界面拉到前台
    let _ = win.set_always_on_top(true);
    let _ = win.set_focus();
    let _ = win.set_always_on_top(false);
  }
}

/// WebView2 会把 Ctrl+C/V/X 当作文本编辑加速键吞掉，前端 keydown/copy 都收不到。
/// 在 AcceleratorKeyPressed 里接管并转成前端事件。
#[cfg(windows)]
fn setup_webview2_file_clipboard_accelerators(win: &tauri::WebviewWindow) {
  let app = win.app_handle().clone();
  if let Err(e) = win.with_webview(move |platform| {
    use webview2_com::{
      Microsoft::Web::WebView2::Win32::{
        ICoreWebView2AcceleratorKeyPressedEventArgs,
        COREWEBVIEW2_KEY_EVENT_KIND_KEY_DOWN,
      },
      AcceleratorKeyPressedEventHandler,
    };

    #[link(name = "user32")]
    extern "system" {
      fn GetKeyState(nVirtKey: i32) -> i16;
    }
    const VK_CONTROL: i32 = 0x11;
    const VK_SHIFT: i32 = 0x10;
    const VK_MENU: i32 = 0x12; // Alt
    const VK_C: u32 = 0x43;
    const VK_V: u32 = 0x56;
    const VK_X: u32 = 0x58;

    let key_down = |vk: i32| -> bool { unsafe { (GetKeyState(vk) as u16) & 0x8000 != 0 } };

    let controller = platform.controller();
    let mut token = 0i64;
    let handler = AcceleratorKeyPressedEventHandler::create(Box::new(move |_sender, args| {
      let Some(args) = args else {
        return Ok(());
      };
      let args: ICoreWebView2AcceleratorKeyPressedEventArgs = args;
      unsafe {
        let mut kind = COREWEBVIEW2_KEY_EVENT_KIND_KEY_DOWN;
        args.KeyEventKind(&mut kind)?;
        if kind != COREWEBVIEW2_KEY_EVENT_KIND_KEY_DOWN {
          return Ok(());
        }

        let mut vk = 0u32;
        args.VirtualKey(&mut vk)?;
        if vk != VK_C && vk != VK_V && vk != VK_X {
          return Ok(());
        }
        if !key_down(VK_CONTROL) || key_down(VK_MENU) {
          return Ok(());
        }

        let shift = key_down(VK_SHIFT);
        let action = match vk {
          VK_C => "copy",
          VK_V => "paste",
          VK_X => "cut",
          _ => return Ok(()),
        };

        // 阻止 WebView2 内部文本剪贴板处理，改由前端决定（文件复制 / 文本回退）
        args.SetHandled(true)?;
        let payload = serde_json::json!({ "action": action, "shift": shift });
        if let Err(err) = app.emit("native-file-clipboard", payload) {
          log::warn!("emit native-file-clipboard failed: {err}");
        }
      }
      Ok(())
    }));

    if let Err(e) = unsafe { controller.add_AcceleratorKeyPressed(&handler, &mut token) } {
      log::warn!("register AcceleratorKeyPressed failed: {e}");
    } else {
      log::info!("WebView2 file-clipboard accelerators registered");
    }
  }) {
    log::warn!("with_webview for clipboard accelerators failed: {e}");
  }
}

#[cfg(not(windows))]
fn setup_webview2_file_clipboard_accelerators(_win: &tauri::WebviewWindow) {}

fn setup_tray(app: &tauri::App) -> tauri::Result<()> {
  let show_i = MenuItem::with_id(app, "show", "显示主窗口", true, None::<&str>)?;
  let quit_i = MenuItem::with_id(app, "quit", "退出应用", true, None::<&str>)?;
  let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

  let mut builder = TrayIconBuilder::new()
    .menu(&menu)
    .tooltip("hyh-aliyun-oss-browser")
    .on_menu_event(|app, event| match event.id.as_ref() {
      "show" => show_main_window(app),
      "quit" => {
        persist_sidecar_jobs_blocking();
        if let Some(state) = app.try_state::<SidecarState>() {
          kill_sidecar_for_exit(&state);
        }
        app.exit(0);
      }
      _ => {}
    })
    .on_tray_icon_event(|tray, event| {
      if let TrayIconEvent::Click {
        button: MouseButton::Left,
        button_state: MouseButtonState::Up,
        ..
      } = event
      {
        show_main_window(tray.app_handle());
      }
    });

  if let Some(icon) = app.default_window_icon() {
    builder = builder.icon(icon.clone());
  }

  let _tray = builder.build(app)?;
  Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  // 单实例插件必须最先注册；多实例开关由 ~/.hyh-oss-browser/instance.json 控制（下次启动生效）
  let allow_multi = allow_multiple_instances();
  let mut builder = tauri::Builder::default();
  #[cfg(any(target_os = "macos", windows, target_os = "linux"))]
  if !allow_multi {
    builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
      show_main_window(app);
    }));
  }

  builder
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_store::Builder::new().build())
    .plugin(tauri_plugin_drag::init())
    .plugin(
      tauri_plugin_autostart::Builder::new()
        .app_name("hyh-aliyun-oss-browser")
        .build(),
    )
    .manage(SidecarState {
      child: Mutex::new(None),
      meta: Mutex::new(None),
    })
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      if let Some(win) = app.get_webview_window("main") {
        apply_window_geometry(&win);
        setup_webview2_file_clipboard_accelerators(&win);
      }
      if let Err(e) = setup_tray(app) {
        log::warn!("tray setup failed: {e}");
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      get_sidecar_meta,
      ensure_sidecar,
      save_session,
      load_session,
      clear_session,
      get_drag_icon_path,
      copy_paths_to_dir,
      paths_exist,
      folder_under_cursor,
      await_drop_folder_path,
      write_text_file,
      read_text_file,
      clipboard_write_files,
      clipboard_read_files,
      clipboard_has_files,
      get_app_autostart,
      set_app_autostart,
      get_allow_multiple_instances,
      set_allow_multiple_instances,
      quit_app,
      hide_to_tray
    ])
    .on_window_event(|window, event| {
      match event {
        WindowEvent::Moved(_) | WindowEvent::Resized(_) => {
          save_window_geometry(window);
        }
        WindowEvent::CloseRequested { .. } => {
          save_window_geometry(window);
        }
        WindowEvent::Destroyed => {
          if let Some(state) = window.try_state::<SidecarState>() {
            kill_sidecar_for_exit(&state);
          }
        }
        _ => {}
      }
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
