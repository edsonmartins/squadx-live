use tauri::State;

use crate::input::{self, InputEvent, Modifiers, MouseButton};
use crate::state::AppState;
use crate::{Error, Result};

#[tauri::command]
pub async fn inject_mouse_event(
    event_type: String,
    x: f64,
    y: f64,
    button: Option<String>,
    delta_x: Option<f64>,
    delta_y: Option<f64>,
    state: State<'_, AppState>,
) -> Result<()> {
    let inner = state.inner.read().await;
    if !inner.is_input_enabled {
        return Err(Error::Input("Input injection is disabled".to_string()));
    }
    drop(inner);

    let button = button.map(|b| match b.as_str() {
        "right" => MouseButton::Right,
        "middle" => MouseButton::Middle,
        _ => MouseButton::Left,
    });

    let event = match event_type.as_str() {
        "move" => InputEvent::MouseMove { x, y },
        "down" => InputEvent::MouseDown {
            button: button.unwrap_or(MouseButton::Left),
            x,
            y,
        },
        "up" => InputEvent::MouseUp {
            button: button.unwrap_or(MouseButton::Left),
            x,
            y,
        },
        "click" => InputEvent::MouseClick {
            button: button.unwrap_or(MouseButton::Left),
            x,
            y,
        },
        "scroll" => InputEvent::MouseScroll {
            delta_x: delta_x.unwrap_or(0.0),
            delta_y: delta_y.unwrap_or(0.0),
        },
        _ => return Err(Error::Input(format!("Unknown mouse event type: {}", event_type))),
    };

    input::inject_event(event)
}

#[tauri::command]
pub async fn inject_keyboard_event(
    event_type: String,
    key: String,
    ctrl: Option<bool>,
    alt: Option<bool>,
    shift: Option<bool>,
    meta: Option<bool>,
    state: State<'_, AppState>,
) -> Result<()> {
    let inner = state.inner.read().await;
    if !inner.is_input_enabled {
        return Err(Error::Input("Input injection is disabled".to_string()));
    }
    drop(inner);

    let modifiers = Modifiers {
        ctrl: ctrl.unwrap_or(false),
        alt: alt.unwrap_or(false),
        shift: shift.unwrap_or(false),
        meta: meta.unwrap_or(false),
    };

    let event = match event_type.as_str() {
        "down" => InputEvent::KeyDown { key, modifiers },
        "up" => InputEvent::KeyUp { key, modifiers },
        "press" => InputEvent::KeyPress { key, modifiers },
        _ => return Err(Error::Input(format!("Unknown keyboard event type: {}", event_type))),
    };

    input::inject_event(event)
}

#[tauri::command]
pub async fn set_input_enabled(enabled: bool, state: State<'_, AppState>) -> Result<()> {
    let mut inner = state.inner.write().await;
    inner.is_input_enabled = enabled;
    tracing::info!("Input injection {}", if enabled { "enabled" } else { "disabled" });
    Ok(())
}
