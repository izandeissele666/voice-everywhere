# Contributing

Contributions that improve Voice Everywhere for Windows users are welcome.

## Before You Start

1. Open an issue for substantial changes so the approach can be discussed first.
2. Keep pull requests focused and include a clear description of the user-facing effect.
3. Do not commit models, recordings, API keys, log files, or generated build output.
4. Preserve the attribution and copyright notices for Handy and other upstream dependencies.

## Development

Follow [BUILD.md](BUILD.md) to set up the Windows toolchain. Then run:

```powershell
bun install
bun run tauri dev
```

Before opening a pull request:

```powershell
bun run lint
bun run build
bun run test:playwright
cd src-tauri
cargo fmt -- --check
cargo test --lib
```

## Bug Reports

Include the application version, Windows version, CPU/GPU, microphone device, selected transcription model, and steps to reproduce. Remove private transcribed text and credentials from logs before sharing them.

## Licensing

By contributing, you agree that your contributions are licensed under the repository's MIT license.
