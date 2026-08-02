# Building Voice Everywhere

Voice Everywhere is currently released and tested for Windows x64.

## Prerequisites

- Windows 10 or Windows 11 x64.
- [Rust stable](https://rustup.rs/).
- [Bun](https://bun.sh/).
- Visual Studio Build Tools with the Desktop development with C++ workload.
- CMake.
- Vulkan SDK for the GPU-accelerated Whisper backend.

## Development

```powershell
bun install
bun run tauri dev
```

The first launch can download a recommended transcription model. Models are intentionally excluded from source control.

## Release Build

```powershell
bun run tauri build
```

The Windows installer is written to:

```text
src-tauri/target/release/bundle/nsis/
```

## Verification

```powershell
bun run lint
bun run build
bun run test:playwright
cd src-tauri
cargo fmt -- --check
cargo test --lib
```
