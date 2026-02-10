use tauri::{AppHandle, Manager};

use crate::Result;

/// Minimize the main window (used before screen sharing to avoid mirror effect)
#[tauri::command]
pub async fn minimize_window(app: AppHandle) -> Result<()> {
    if let Some(window) = app.get_webview_window("main") {
        window.minimize()?;
        tracing::info!("Window minimized for screen sharing");
    }
    Ok(())
}

/// Restore the main window (used after stopping screen sharing)
#[tauri::command]
pub async fn restore_window(app: AppHandle) -> Result<()> {
    if let Some(window) = app.get_webview_window("main") {
        window.unminimize()?;
        window.set_focus()?;
        tracing::info!("Window restored after screen sharing");
    }
    Ok(())
}
