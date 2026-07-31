//! 解析鼠标指针下方的资源管理器 / 桌面文件夹路径（拖放松手后入队下载用）。

#![cfg(windows)]

use std::path::PathBuf;

use windows::core::Interface;
use windows::Win32::Foundation::{HWND, MAX_PATH, POINT};
use windows::Win32::System::Com::{
  CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, IServiceProvider,
  CLSCTX_LOCAL_SERVER, COINIT_APARTMENTTHREADED,
};
use windows::Win32::System::Variant::VARIANT;
use windows::Win32::UI::Shell::Common::ITEMIDLIST;
use windows::Win32::UI::Shell::{
  IFolderView, IPersistFolder2, IShellBrowser, IShellWindows, IWebBrowserApp, SHGetPathFromIDListW,
  SID_STopLevelBrowser, ShellWindows,
};
use windows::Win32::UI::WindowsAndMessaging::{
  GetAncestor, GetClassNameW, GetCursorPos, WindowFromPoint, GA_ROOT,
};

fn hwnd_class_name(hwnd: HWND) -> String {
  unsafe {
    let mut buf = [0u16; 256];
    let n = GetClassNameW(hwnd, &mut buf);
    if n <= 0 {
      return String::new();
    }
    String::from_utf16_lossy(&buf[..n as usize])
  }
}

fn path_from_pidl(pidl: *const ITEMIDLIST) -> Option<String> {
  if pidl.is_null() {
    return None;
  }
  unsafe {
    let mut buf = [0u16; MAX_PATH as usize];
    if !SHGetPathFromIDListW(pidl, &mut buf).as_bool() {
      return None;
    }
    let len = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
    let s = String::from_utf16_lossy(&buf[..len]);
    let t = s.trim();
    if !t.is_empty() && PathBuf::from(t).is_dir() {
      Some(t.to_string())
    } else {
      None
    }
  }
}

fn desktop_dir_path() -> Option<String> {
  dirs::desktop_dir().and_then(|p| {
    if p.is_dir() {
      Some(p.to_string_lossy().to_string())
    } else {
      None
    }
  })
}

fn explorer_folder_for_hwnd(target: HWND) -> Option<String> {
  unsafe {
    let shell_windows: IShellWindows =
      CoCreateInstance(&ShellWindows, None, CLSCTX_LOCAL_SERVER).ok()?;
    let count = shell_windows.Count().ok()?;
    for i in 0..count {
      let item = match shell_windows.Item(&VARIANT::from(i)) {
        Ok(v) => v,
        Err(_) => continue,
      };
      let app: IWebBrowserApp = match item.cast() {
        Ok(v) => v,
        Err(_) => continue,
      };
      let hwnd_raw = match app.HWND() {
        Ok(h) => h,
        Err(_) => continue,
      };
      let hwnd = HWND(hwnd_raw.0 as *mut _);
      if hwnd != target {
        continue;
      }

      let sp: IServiceProvider = match app.cast() {
        Ok(v) => v,
        Err(_) => continue,
      };
      let browser: IShellBrowser = match sp.QueryService(&SID_STopLevelBrowser) {
        Ok(v) => v,
        Err(_) => continue,
      };
      let view = match browser.QueryActiveShellView() {
        Ok(v) => v,
        Err(_) => continue,
      };
      let folder_view: IFolderView = match view.cast() {
        Ok(v) => v,
        Err(_) => continue,
      };
      let folder: IPersistFolder2 = match folder_view.GetFolder() {
        Ok(v) => v,
        Err(_) => continue,
      };
      let pidl = match folder.GetCurFolder() {
        Ok(p) => p,
        Err(_) => continue,
      };
      if pidl.is_null() {
        continue;
      }
      let path = path_from_pidl(pidl);
      CoTaskMemFree(Some(pidl as _));
      return path;
    }
  }
  None
}

/// 返回光标下方资源管理器窗口当前文件夹，或桌面路径；无法解析时返回 None。
pub fn folder_path_under_cursor() -> Result<Option<String>, String> {
  unsafe {
    let hr = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
    let hr_code = hr.0;
    if hr_code < 0 {
      return Err(format!("COM 初始化失败: {hr:?}"));
    }

    let mut pt = POINT::default();
    if let Err(e) = GetCursorPos(&mut pt) {
      if hr_code == 0 {
        CoUninitialize();
      }
      return Err(format!("读取光标位置失败: {e}"));
    }

    let hwnd = WindowFromPoint(pt);
    let result = if hwnd.0.is_null() {
      None
    } else {
      let root = GetAncestor(hwnd, GA_ROOT);
      let class = hwnd_class_name(root);
      if class == "Progman" || class == "WorkerW" {
        desktop_dir_path()
      } else {
        explorer_folder_for_hwnd(root).or_else(|| explorer_folder_for_hwnd(hwnd))
      }
    };

    if hr_code == 0 {
      CoUninitialize();
    }
    Ok(result)
  }
}

/// 光标是否落在指定顶层窗口（或其子窗口）上。
pub fn is_cursor_over_window(hwnd_raw: isize) -> bool {
  if hwnd_raw == 0 {
    return false;
  }
  unsafe {
    let mut pt = POINT::default();
    if GetCursorPos(&mut pt).is_err() {
      return false;
    }
    let hwnd = WindowFromPoint(pt);
    if hwnd.0.is_null() {
      return false;
    }
    let root = GetAncestor(hwnd, GA_ROOT);
    root.0 as isize == hwnd_raw || hwnd.0 as isize == hwnd_raw
  }
}

/// 左键是否处于按下状态。
pub fn is_primary_mouse_down() -> bool {
  unsafe {
    use windows::Win32::UI::Input::KeyboardAndMouse::GetAsyncKeyState;
    (GetAsyncKeyState(0x01) as u16 & 0x8000) != 0
  }
}
