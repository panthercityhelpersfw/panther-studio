use serde::Serialize;
use tauri::Manager;
use std::io::Write;

#[derive(Serialize)]
struct AppPaths {
    app_data_dir: String,
    app_local_data_dir: String,
    app_config_dir: String,
    version: String,
}

/// Returns the resolved, crash-safe local storage locations for the app.
/// The frontend uses these to show the user where projects live and to back up
/// exported files. IndexedDB (used for audio blobs) is physically stored under
/// the WebView2 user-data directory inside `app_local_data_dir`.
#[tauri::command]
fn get_app_paths(app: tauri::AppHandle) -> Result<AppPaths, String> {
    let resolver = app.path();
    let app_data_dir = resolver
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .to_string_lossy()
        .to_string();
    let app_local_data_dir = resolver
        .app_local_data_dir()
        .map_err(|e| e.to_string())?
        .to_string_lossy()
        .to_string();
    let app_config_dir = resolver
        .app_config_dir()
        .map_err(|e| e.to_string())?
        .to_string_lossy()
        .to_string();

    Ok(AppPaths {
        app_data_dir,
        app_local_data_dir,
        app_config_dir,
        version: app.package_info().version.to_string(),
    })
}

/// Write base64-encoded bytes to an absolute path chosen by the user via the
/// native save dialog. Used by the WAV export pipeline so exports land exactly
/// where the user picks, without broad filesystem-scope grants.
#[tauri::command]
fn write_binary_file(path: String, base64_data: String) -> Result<(), String> {
    use base64::{engine::general_purpose::STANDARD, Engine};
    let bytes = STANDARD
        .decode(base64_data.as_bytes())
        .map_err(|e| e.to_string())?;
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(())
}

/// Ensure the app data directory exists so first-run saves never fail.
#[tauri::command]
fn ensure_app_dirs(app: tauri::AppHandle) -> Result<String, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.to_string_lossy().to_string())
}

fn append_boot_log_line(app: &tauri::AppHandle, message: &str) -> Result<(), String> {
    let log_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("logs");
    std::fs::create_dir_all(&log_dir).map_err(|e| e.to_string())?;
    let log_path = log_dir.join("boot.log");
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_path)
        .map_err(|e| e.to_string())?;
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs().to_string())
        .unwrap_or_else(|_| "0".to_string());
    writeln!(file, "[{}] {}", ts, message).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn append_boot_log(app: tauri::AppHandle, message: String) -> Result<(), String> {
    append_boot_log_line(&app, &message)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init());

    #[cfg(desktop)]
    {
        if option_env!("PANTHER_ENABLE_UPDATER") == Some("true") {
            builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
        }
    }

    builder
        .setup(|app| {
            // Create the data directory eagerly so the very first autosave works.
            if let Ok(dir) = app.path().app_data_dir() {
                let _ = std::fs::create_dir_all(&dir);
            }
            let handle = app.handle().clone();
            let version = app.package_info().version.to_string();
            let platform = std::env::consts::OS;
            let arch = std::env::consts::ARCH;
            let _ = append_boot_log_line(
                &handle,
                &format!("native setup start version={} platform={} arch={}", version, platform, arch),
            );
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
      get_app_paths,
      ensure_app_dirs,
      write_binary_file,
      append_boot_log
    ])
        .run(tauri::generate_context!())
        .expect("error while running Panther Studio");
}
