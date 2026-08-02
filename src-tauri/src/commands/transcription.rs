use crate::audio_toolkit::file::decode_file_for_transcription;
use crate::managers::audio::AudioRecordingManager;
use crate::managers::transcription::TranscriptionManager;
use crate::settings::{get_settings, write_settings, ModelUnloadTimeout};
use serde::Serialize;
use specta::Type;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, State};

#[derive(Serialize, Type)]
pub struct ModelLoadStatus {
    is_loaded: bool,
    current_model: Option<String>,
}

#[derive(Serialize, Type)]
pub struct FileTranscriptionResult {
    pub text: String,
    pub duration_seconds: f64,
}

/// Decode and transcribe one local audio file through the same model session as
/// dictation. Decoding and inference run off the Tauri event loop.
#[tauri::command]
#[specta::specta]
pub async fn transcribe_file(
    app: AppHandle,
    transcription_manager: State<'_, Arc<TranscriptionManager>>,
    audio_manager: State<'_, Arc<AudioRecordingManager>>,
    path: String,
) -> Result<FileTranscriptionResult, String> {
    if audio_manager.is_recording() {
        return Err("Stop the current dictation before transcribing a file".to_string());
    }

    let decoded =
        tokio::task::spawn_blocking(move || decode_file_for_transcription(&PathBuf::from(path)))
            .await
            .map_err(|error| format!("Audio decoding task failed: {error}"))?
            .map_err(|error| error.to_string())?;

    let selected_model = get_settings(&app).selected_model;
    if selected_model.is_empty() {
        return Err("Choose and download a transcription model before starting".to_string());
    }

    let manager = transcription_manager.inner().clone();
    let text = tokio::task::spawn_blocking(move || {
        if !manager.is_model_loaded() {
            let _loading_guard = manager
                .try_start_loading()
                .ok_or_else(|| anyhow::anyhow!("A transcription model is already loading"))?;
            manager.load_model(&selected_model)?;
        }
        manager.transcribe(decoded.samples)
    })
    .await
    .map_err(|error| format!("Transcription task failed: {error}"))?
    .map_err(|error| error.to_string())?;

    Ok(FileTranscriptionResult {
        text,
        duration_seconds: decoded.duration_seconds,
    })
}

#[tauri::command]
#[specta::specta]
pub fn save_transcription_text(path: String, text: String) -> Result<(), String> {
    let output = PathBuf::from(path);
    if output.extension().and_then(|extension| extension.to_str()) != Some("txt") {
        return Err("Choose a .txt file for the transcription export".to_string());
    }
    std::fs::write(&output, text)
        .map_err(|error| format!("Could not save {}: {error}", output.display()))
}

#[tauri::command]
#[specta::specta]
pub fn set_model_unload_timeout(app: AppHandle, timeout: ModelUnloadTimeout) {
    let mut settings = get_settings(&app);
    settings.model_unload_timeout = timeout;
    write_settings(&app, settings);
}

#[tauri::command]
#[specta::specta]
pub fn get_model_load_status(
    transcription_manager: State<TranscriptionManager>,
) -> Result<ModelLoadStatus, String> {
    Ok(ModelLoadStatus {
        is_loaded: transcription_manager.is_model_loaded(),
        current_model: transcription_manager.get_current_model(),
    })
}

#[tauri::command]
#[specta::specta]
pub fn unload_model_manually(
    transcription_manager: State<TranscriptionManager>,
) -> Result<(), String> {
    transcription_manager
        .unload_model()
        .map_err(|e| format!("Failed to unload model: {}", e))
}
