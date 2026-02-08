use enigo::{Enigo, Keyboard, Mouse, Settings};
use serde::{Deserialize, Serialize};
use xcap::Monitor;

use crate::{Error, Result};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum InputEvent {
    MouseMove { x: f64, y: f64 },
    MouseDown { button: MouseButton, x: f64, y: f64 },
    MouseUp { button: MouseButton, x: f64, y: f64 },
    MouseClick { button: MouseButton, x: f64, y: f64 },
    MouseScroll { delta_x: f64, delta_y: f64 },
    KeyDown { key: String, modifiers: Modifiers },
    KeyUp { key: String, modifiers: Modifiers },
    KeyPress { key: String, modifiers: Modifiers },
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MouseButton {
    Left,
    Right,
    Middle,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Modifiers {
    #[serde(default)]
    pub ctrl: bool,
    #[serde(default)]
    pub alt: bool,
    #[serde(default)]
    pub shift: bool,
    #[serde(default)]
    pub meta: bool,
}

fn get_screen_dimensions() -> Result<(i32, i32)> {
    let monitors = Monitor::all().map_err(|e| Error::Input(e.to_string()))?;
    let primary = monitors.first().ok_or_else(|| Error::Input("No monitor found".to_string()))?;
    let width = primary.width().map_err(|e| Error::Input(e.to_string()))?;
    let height = primary.height().map_err(|e| Error::Input(e.to_string()))?;
    Ok((width as i32, height as i32))
}

/// Convert relative coordinates (0-1) to absolute screen coordinates
fn to_absolute(x: f64, y: f64, screen_width: i32, screen_height: i32) -> (i32, i32) {
    let abs_x = (x * screen_width as f64) as i32;
    let abs_y = (y * screen_height as f64) as i32;
    (abs_x.max(0).min(screen_width), abs_y.max(0).min(screen_height))
}

fn convert_button(button: MouseButton) -> enigo::Button {
    match button {
        MouseButton::Left => enigo::Button::Left,
        MouseButton::Right => enigo::Button::Right,
        MouseButton::Middle => enigo::Button::Middle,
    }
}

fn parse_key(key: &str) -> Option<enigo::Key> {
    match key.to_lowercase().as_str() {
        "enter" | "return" => Some(enigo::Key::Return),
        "tab" => Some(enigo::Key::Tab),
        "space" | " " => Some(enigo::Key::Space),
        "backspace" => Some(enigo::Key::Backspace),
        "delete" => Some(enigo::Key::Delete),
        "escape" | "esc" => Some(enigo::Key::Escape),
        "arrowup" | "up" => Some(enigo::Key::UpArrow),
        "arrowdown" | "down" => Some(enigo::Key::DownArrow),
        "arrowleft" | "left" => Some(enigo::Key::LeftArrow),
        "arrowright" | "right" => Some(enigo::Key::RightArrow),
        "home" => Some(enigo::Key::Home),
        "end" => Some(enigo::Key::End),
        "pageup" => Some(enigo::Key::PageUp),
        "pagedown" => Some(enigo::Key::PageDown),
        "f1" => Some(enigo::Key::F1),
        "f2" => Some(enigo::Key::F2),
        "f3" => Some(enigo::Key::F3),
        "f4" => Some(enigo::Key::F4),
        "f5" => Some(enigo::Key::F5),
        "f6" => Some(enigo::Key::F6),
        "f7" => Some(enigo::Key::F7),
        "f8" => Some(enigo::Key::F8),
        "f9" => Some(enigo::Key::F9),
        "f10" => Some(enigo::Key::F10),
        "f11" => Some(enigo::Key::F11),
        "f12" => Some(enigo::Key::F12),
        // Single character
        s if s.len() == 1 => Some(enigo::Key::Unicode(s.chars().next().unwrap())),
        _ => None,
    }
}

fn apply_modifiers(enigo: &mut Enigo, modifiers: &Modifiers, direction: enigo::Direction) -> Result<()> {
    if modifiers.ctrl {
        enigo
            .key(enigo::Key::Control, direction)
            .map_err(|e| Error::Input(e.to_string()))?;
    }
    if modifiers.alt {
        enigo
            .key(enigo::Key::Alt, direction)
            .map_err(|e| Error::Input(e.to_string()))?;
    }
    if modifiers.shift {
        enigo
            .key(enigo::Key::Shift, direction)
            .map_err(|e| Error::Input(e.to_string()))?;
    }
    if modifiers.meta {
        enigo
            .key(enigo::Key::Meta, direction)
            .map_err(|e| Error::Input(e.to_string()))?;
    }
    Ok(())
}

pub fn inject_event(event: InputEvent) -> Result<()> {
    let mut enigo = Enigo::new(&Settings::default())
        .map_err(|e| Error::Input(format!("Failed to create input injector: {}", e)))?;

    let (screen_width, screen_height) = get_screen_dimensions()?;

    match event {
        InputEvent::MouseMove { x, y } => {
            let (abs_x, abs_y) = to_absolute(x, y, screen_width, screen_height);
            enigo
                .move_mouse(abs_x, abs_y, enigo::Coordinate::Abs)
                .map_err(|e| Error::Input(e.to_string()))?;
        }
        InputEvent::MouseDown { button, x, y } => {
            let (abs_x, abs_y) = to_absolute(x, y, screen_width, screen_height);
            enigo
                .move_mouse(abs_x, abs_y, enigo::Coordinate::Abs)
                .map_err(|e| Error::Input(e.to_string()))?;
            enigo
                .button(convert_button(button), enigo::Direction::Press)
                .map_err(|e| Error::Input(e.to_string()))?;
        }
        InputEvent::MouseUp { button, x, y } => {
            let (abs_x, abs_y) = to_absolute(x, y, screen_width, screen_height);
            enigo
                .move_mouse(abs_x, abs_y, enigo::Coordinate::Abs)
                .map_err(|e| Error::Input(e.to_string()))?;
            enigo
                .button(convert_button(button), enigo::Direction::Release)
                .map_err(|e| Error::Input(e.to_string()))?;
        }
        InputEvent::MouseClick { button, x, y } => {
            let (abs_x, abs_y) = to_absolute(x, y, screen_width, screen_height);
            enigo
                .move_mouse(abs_x, abs_y, enigo::Coordinate::Abs)
                .map_err(|e| Error::Input(e.to_string()))?;
            enigo
                .button(convert_button(button), enigo::Direction::Click)
                .map_err(|e| Error::Input(e.to_string()))?;
        }
        InputEvent::MouseScroll { delta_x, delta_y } => {
            if delta_y.abs() > 0.0 {
                let lines = (delta_y * 3.0) as i32;
                enigo
                    .scroll(lines, enigo::Axis::Vertical)
                    .map_err(|e| Error::Input(e.to_string()))?;
            }
            if delta_x.abs() > 0.0 {
                let lines = (delta_x * 3.0) as i32;
                enigo
                    .scroll(lines, enigo::Axis::Horizontal)
                    .map_err(|e| Error::Input(e.to_string()))?;
            }
        }
        InputEvent::KeyDown { key, modifiers } => {
            apply_modifiers(&mut enigo, &modifiers, enigo::Direction::Press)?;
            if let Some(k) = parse_key(&key) {
                enigo
                    .key(k, enigo::Direction::Press)
                    .map_err(|e| Error::Input(e.to_string()))?;
            }
        }
        InputEvent::KeyUp { key, modifiers } => {
            if let Some(k) = parse_key(&key) {
                enigo
                    .key(k, enigo::Direction::Release)
                    .map_err(|e| Error::Input(e.to_string()))?;
            }
            apply_modifiers(&mut enigo, &modifiers, enigo::Direction::Release)?;
        }
        InputEvent::KeyPress { key, modifiers } => {
            apply_modifiers(&mut enigo, &modifiers, enigo::Direction::Press)?;
            if let Some(k) = parse_key(&key) {
                enigo
                    .key(k, enigo::Direction::Click)
                    .map_err(|e| Error::Input(e.to_string()))?;
            }
            apply_modifiers(&mut enigo, &modifiers, enigo::Direction::Release)?;
        }
    }
    Ok(())
}
