use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::{
  LogicalSize, Manager, PhysicalPosition, PhysicalSize, Position, Size, WindowEvent,
};
use tauri_plugin_store::StoreExt;

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

fn window_geometry_path() -> PathBuf {
  app_data_dir().join("window.json")
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

  if let Some(meta) = read_meta_file() {
    if meta.port.to_string() == port {
      if sidecar_health_ok(&meta.host, meta.port, &token) {
        *state.meta.lock().unwrap() = Some(SidecarMeta {
          host: meta.host,
          port: meta.port,
          token: token.clone(),
          pid: meta.pid,
        });
        return Ok(state.meta.lock().unwrap().clone().unwrap());
      }
      let alive = meta.pid.map(process_alive).unwrap_or(false);
      if alive {
        return Err(format!(
          "sidecar 进程仍在运行但健康检查失败（端口 {}），请重启应用或结束占用进程后重试",
          meta.port
        ));
      }
      let _ = fs::remove_file(app_data_dir().join("sidecar.json"));
    }
  }

  // 端口上已有可响应的 sidecar（孤儿进程 / meta 丢失）时直接接管，避免重复拉起失败
  if sidecar_health_ok("127.0.0.1", port_num, &token) {
    let meta = SidecarMeta {
      host: "127.0.0.1".into(),
      port: port_num,
      token: token.clone(),
      pid: None,
    };
    let _ = fs::write(
      app_data_dir().join("sidecar.json"),
      serde_json::to_string_pretty(&meta).unwrap_or_default(),
    );
    *state.meta.lock().unwrap() = Some(meta.clone());
    return Ok(meta);
  }

  let sidecar_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
    .join("../../transfer-sidecar");
  let entry = sidecar_dir.join("src/index.js");
  if !entry.exists() {
    return Err(format!("找不到 sidecar: {}", entry.display()));
  }

  fs::create_dir_all(app_data_dir()).map_err(|e| e.to_string())?;

  let mut child = Command::new("node")
    .arg(entry)
    .env("SIDECAR_TOKEN", &token)
    .env("SIDECAR_PORT", &port)
    .current_dir(&sidecar_dir)
    .stdout(Stdio::null())
    .stderr(Stdio::null())
    .spawn()
    .map_err(|e| format!("启动 sidecar 失败: {e}"))?;

  // wait briefly for meta file
  for _ in 0..50 {
    std::thread::sleep(std::time::Duration::from_millis(100));
    if let Some(mut meta) = read_meta_file() {
      meta.token = token.clone();
      let _ = fs::write(
        app_data_dir().join("sidecar.json"),
        serde_json::to_string_pretty(&meta).unwrap_or_default(),
      );
      *state.meta.lock().unwrap() = Some(meta.clone());
      *state.child.lock().unwrap() = Some(child);
      let _ = app;
      return Ok(meta);
    }
  }

  let _ = child.kill();
  Err("sidecar 启动超时".into())
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

fn kill_sidecar(state: &SidecarState) {
  if let Some(mut child) = state.child.lock().unwrap().take() {
    let _ = child.kill();
  }
}

/// 确认退出：结束 sidecar 并退出进程
#[tauri::command]
fn quit_app(app: tauri::AppHandle, state: tauri::State<'_, SidecarState>) -> Result<(), String> {
  kill_sidecar(&state);
  app.exit(0);
  Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_store::Builder::new().build())
    .plugin(tauri_plugin_drag::init())
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
      quit_app
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
            kill_sidecar(&state);
          }
        }
        _ => {}
      }
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
