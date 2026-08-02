# Voice Everywhere

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="blackthemelogo.png">
    <img src="logo.png" alt="Voice Everywhere" width="380">
  </picture>
</p>

<p align="center">Local, tray-first speech-to-text for Windows.</p>

Voice Everywhere turns speech into text on your computer. Press a global shortcut, speak, and the transcription is pasted into the active app. The main dictation path runs locally with downloadable Whisper-family models.

> This is an experimental Windows-focused fork of [Handy](https://github.com/cjpais/Handy). It is an independent project and is not affiliated with or endorsed by Handy.

## Highlights

- Local dictation with global shortcuts and a compact recording overlay beside the active text field or in any screen corner.
- Tray-first workflow: autostart launches silently to the system tray.
- File transcription for common audio formats, including WAV, MP3, FLAC, M4A, OGG, and Opus.
- Whisper model management with GPU acceleration when available.
- Whisper Medium Q8 is the default recommendation for Russian speech on systems with 12 GB RAM or more.
- Light, dark, and system themes with 30 accent palettes.

## Install

1. Download `Voice.Everywhere_0.9.5_x64-setup.exe` from [Releases](https://github.com/izandeissele666/voice-everywhere/releases).
2. Run the installer and grant microphone access when Windows asks.
3. Pick or download a model during onboarding, then use the configured global shortcut.

The application starts hidden in the system tray when Windows starts. Click the tray icon to open settings.

## Status And Requirements

- Supported release target: Windows 11 x64.
- Tested on Ryzen 5 3600, 16 GB RAM, and NVIDIA GTX 1660 Ti.
- The installer is not code-signed. Windows SmartScreen may show a warning for a new publisher.
- Models are downloaded after installation and are not included in the repository or installer.
- Core speech recognition is local. Optional AI post-processing only sends data to a provider if you explicitly configure and enable it.

## Build From Source

See [BUILD.md](BUILD.md) for prerequisites and the Windows build steps.

```powershell
bun install
bun run tauri dev
```

Run the verification suite before contributing:

```powershell
bun run lint
bun run build
bun run test:playwright
cd src-tauri
cargo test --lib
```

## Attribution

Voice Everywhere is built on the work of the [Handy](https://github.com/cjpais/Handy) project by CJ Pais and its contributors. The original MIT copyright notice is retained in [LICENSE](LICENSE), and project attribution is documented in [NOTICE](NOTICE).

Voice Everywhere uses its own name and visual assets. The Handy name and branding remain the property of their respective owners.

## Contributing

Bug reports, fixes, documentation improvements, translations, and Windows compatibility reports are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## License

MIT. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
