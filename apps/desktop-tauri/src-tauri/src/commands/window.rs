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

/// Hide window from screen capture (Windows: WDA_EXCLUDEFROMCAPTURE, macOS: setSharingType)
/// This makes the window invisible to screen recording/sharing
#[tauri::command]
pub async fn hide_from_capture(app: AppHandle) -> Result<()> {
    if let Some(window) = app.get_webview_window("main") {
        // set_content_protected(true) uses native APIs to exclude window from capture:
        // - Windows: SetWindowDisplayAffinity with WDA_EXCLUDEFROMCAPTURE
        // - macOS: setSharingType(.none) on NSWindow
        window.set_content_protected(true)?;
        tracing::info!("Window hidden from screen capture");
    }
    Ok(())
}

/// Show window in screen capture again (restore normal behavior)
#[tauri::command]
pub async fn show_in_capture(app: AppHandle) -> Result<()> {
    if let Some(window) = app.get_webview_window("main") {
        window.set_content_protected(false)?;
        tracing::info!("Window visible in screen capture again");
    }
    Ok(())
}
