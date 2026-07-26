use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::Manager;
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

fn app_data_dir() -> PathBuf {
  dirs::home_dir()
    .unwrap_or_else(|| PathBuf::from("."))
    .join(".hyh-oss-browser")
}

fn read_meta_file() -> Option<SidecarMeta> {
  let p = app_data_dir().join("sidecar.json");
  let text = fs::read_to_string(p).ok()?;
  serde_json::from_str(&text).ok()
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

  if let Some(meta) = read_meta_file() {
    if meta.port.to_string() == port {
      *state.meta.lock().unwrap() = Some(SidecarMeta {
        host: meta.host,
        port: meta.port,
        token: token.clone(),
        pid: meta.pid,
      });
      return Ok(state.meta.lock().unwrap().clone().unwrap());
    }
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_store::Builder::new().build())
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
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      get_sidecar_meta,
      ensure_sidecar,
      save_session,
      load_session,
      clear_session
    ])
    .on_window_event(|window, event| {
      if let tauri::WindowEvent::CloseRequested { .. } = event {
        if let Some(state) = window.try_state::<SidecarState>() {
          if let Some(mut child) = state.child.lock().unwrap().take() {
            let _ = child.kill();
          }
        }
      }
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
