use serde::{Deserialize, Serialize};
use xcap::Monitor;

use crate::{Error, Result};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CaptureSource {
    pub id: String,
    pub name: String,
    pub source_type: SourceType,
    pub width: u32,
    pub height: u32,
    pub thumbnail: Option<String>, // Base64 encoded
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SourceType {
    Screen,
    Window,
}

/// Get all available capture sources (screens and windows)
pub fn get_available_sources() -> Result<Vec<CaptureSource>> {
    let mut sources = Vec::new();

    // Get monitors/screens
    let monitors = Monitor::all().map_err(|e| Error::Capture(e.to_string()))?;

    for (index, monitor) in monitors.iter().enumerate() {
        let name = monitor.name().map_err(|e| Error::Capture(e.to_string()))?;
        let width = monitor.width().map_err(|e| Error::Capture(e.to_string()))?;
        let height = monitor.height().map_err(|e| Error::Capture(e.to_string()))?;

        sources.push(CaptureSource {
            id: format!("screen:{}", index),
            name: if name.is_empty() {
                format!("Display {}", index + 1)
            } else {
                name
            },
            source_type: SourceType::Screen,
            width,
            height,
            thumbnail: None, // TODO: Add thumbnail generation
        });
    }

    Ok(sources)
}

/// Capture a frame from the specified source
#[allow(dead_code)]
pub fn capture_frame(source_id: &str) -> Result<Vec<u8>> {
    let parts: Vec<&str> = source_id.split(':').collect();
    if parts.len() != 2 {
        return Err(Error::Capture("Invalid source ID format".to_string()));
    }

    let source_type = parts[0];
    let index: usize = parts[1]
        .parse()
        .map_err(|_| Error::Capture("Invalid source index".to_string()))?;

    match source_type {
        "screen" => {
            let monitors = Monitor::all().map_err(|e| Error::Capture(e.to_string()))?;
            let monitor = monitors
                .get(index)
                .ok_or_else(|| Error::Capture("Monitor not found".to_string()))?;

            let image = monitor
                .capture_image()
                .map_err(|e| Error::Capture(e.to_string()))?;

            // Convert to PNG bytes
            let mut buffer = Vec::new();
            let mut cursor = std::io::Cursor::new(&mut buffer);
            image
                .write_to(&mut cursor, image::ImageFormat::Png)
                .map_err(|e| Error::Capture(e.to_string()))?;

            Ok(buffer)
        }
        "window" => {
            // TODO: Implement window capture
            Err(Error::Capture("Window capture not yet implemented".to_string()))
        }
        _ => Err(Error::Capture("Unknown source type".to_string())),
    }
}
