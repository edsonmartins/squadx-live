use tauri::State;

use crate::capture::{self, CaptureSource};
use crate::state::AppState;
use crate::Result;

#[tauri::command]
pub async fn get_sources() -> Result<Vec<CaptureSource>> {
    capture::get_available_sources()
}

#[tauri::command]
pub async fn start_capture(source_id: String, state: State<'_, AppState>) -> Result<()> {
    let mut inner = state.inner.write().await;
    inner.is_capturing = true;
    tracing::info!("Started capture for source: {}", source_id);
    Ok(())
}

#[tauri::command]
pub async fn stop_capture(state: State<'_, AppState>) -> Result<()> {
    let mut inner = state.inner.write().await;
    inner.is_capturing = false;
    tracing::info!("Stopped capture");
    Ok(())
}
