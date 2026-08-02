use enigo::{Enigo, Key, Keyboard, Mouse, Settings};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

#[cfg(target_os = "windows")]
use std::{
    sync::{mpsc::SyncSender, OnceLock},
    time::{Duration, Instant},
};

/// Wrapper for Enigo to store in Tauri's managed state.
/// Enigo is wrapped in a Mutex since it requires mutable access.
pub struct EnigoState(pub Mutex<Enigo>);

impl EnigoState {
    pub fn new() -> Result<Self, String> {
        let enigo = Enigo::new(&Settings::default())
            .map_err(|e| format!("Failed to initialize Enigo: {}", e))?;
        Ok(Self(Mutex::new(enigo)))
    }
}

/// Get the current mouse cursor position using the managed Enigo instance.
/// Returns None if the state is not available or if getting the location fails.
pub fn get_cursor_position(app_handle: &AppHandle) -> Option<(i32, i32)> {
    let enigo_state = app_handle.try_state::<EnigoState>()?;
    let enigo = enigo_state.0.lock().ok()?;
    enigo.location().ok()
}

#[cfg(target_os = "windows")]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TextTarget {
    Caret((i32, i32, i32, i32)),
    Field((i32, i32, i32, i32)),
}

#[cfg(target_os = "windows")]
impl TextTarget {
    pub fn rect(self) -> (i32, i32, i32, i32) {
        match self {
            Self::Caret(rect) | Self::Field(rect) => rect,
        }
    }
}

#[cfg(target_os = "windows")]
static TEXT_TARGET_CACHE: Mutex<Option<(Instant, Option<TextTarget>)>> = Mutex::new(None);

#[cfg(target_os = "windows")]
type UiaRequest = SyncSender<Option<TextTarget>>;

#[cfg(target_os = "windows")]
static UIA_WORKER: OnceLock<Option<SyncSender<UiaRequest>>> = OnceLock::new();

/// Starts the UI Automation apartment before the first recording so Chromium's
/// comparatively expensive COM startup is not paid on the overlay hot path.
#[cfg(target_os = "windows")]
pub fn initialize_text_target_detection() {
    let _ = uia_worker();
}

/// Returns the focused application's caret or text-field rectangle in physical
/// screen pixels. Native Win32 controls expose a cheap legacy caret; Chromium
/// and other modern apps usually require UI Automation instead.
#[cfg(target_os = "windows")]
pub fn get_text_target() -> Option<TextTarget> {
    if let Ok(cache) = TEXT_TARGET_CACHE.lock() {
        if let Some((captured_at, target)) = *cache {
            if captured_at.elapsed() < Duration::from_millis(500) {
                return target;
            }
        }
    }

    let target = get_legacy_text_caret_rect()
        .map(TextTarget::Caret)
        .or_else(get_uia_text_target_with_timeout);
    if let Ok(mut cache) = TEXT_TARGET_CACHE.lock() {
        *cache = Some((Instant::now(), target));
    }
    target
}

/// `GetGUIThreadInfo` exposes carets owned by classic Win32 controls.
#[cfg(target_os = "windows")]
fn get_legacy_text_caret_rect() -> Option<(i32, i32, i32, i32)> {
    use std::mem::size_of;
    use windows::Win32::{
        Foundation::POINT,
        Graphics::Gdi::ClientToScreen,
        UI::WindowsAndMessaging::{GetGUIThreadInfo, GUITHREADINFO},
    };

    let mut info = GUITHREADINFO {
        cbSize: size_of::<GUITHREADINFO>() as u32,
        ..Default::default()
    };
    unsafe { GetGUIThreadInfo(0, &mut info).ok()? };
    if info.hwndCaret.0.is_null() {
        return None;
    }

    let mut top_left = POINT {
        x: info.rcCaret.left,
        y: info.rcCaret.top,
    };
    let mut bottom_right = POINT {
        x: info.rcCaret.right,
        y: info.rcCaret.bottom,
    };
    let top_left_converted = unsafe { ClientToScreen(info.hwndCaret, &mut top_left) }.as_bool();
    let bottom_right_converted =
        unsafe { ClientToScreen(info.hwndCaret, &mut bottom_right) }.as_bool();
    if !top_left_converted || !bottom_right_converted {
        return None;
    }

    normalize_screen_rect(
        top_left.x.min(bottom_right.x),
        top_left.y.min(bottom_right.y),
        top_left.x.max(bottom_right.x),
        top_left.y.max(bottom_right.y),
    )
}

#[cfg(target_os = "windows")]
fn get_uia_text_target_with_timeout() -> Option<TextTarget> {
    let worker = uia_worker()?;
    let (sender, receiver) = std::sync::mpsc::sync_channel(1);
    worker.try_send(sender).ok()?;
    receiver
        .recv_timeout(Duration::from_millis(180))
        .ok()
        .flatten()
}

#[cfg(target_os = "windows")]
fn uia_worker() -> Option<&'static SyncSender<UiaRequest>> {
    UIA_WORKER
        .get_or_init(|| {
            let (sender, receiver) = std::sync::mpsc::sync_channel(1);
            std::thread::Builder::new()
                .name("uia-text-target".to_string())
                .spawn(move || run_uia_worker(receiver))
                .ok()
                .map(|_| sender)
        })
        .as_ref()
}

#[cfg(target_os = "windows")]
fn run_uia_worker(receiver: std::sync::mpsc::Receiver<UiaRequest>) {
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_ALL, COINIT_MULTITHREADED,
    };
    use windows::Win32::UI::Accessibility::{CUIAutomation8, IUIAutomation};

    if unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) }.is_err() {
        return;
    }
    let automation: IUIAutomation =
        match unsafe { CoCreateInstance(&CUIAutomation8, None, CLSCTX_ALL) } {
            Ok(automation) => automation,
            Err(_) => {
                unsafe { CoUninitialize() };
                return;
            }
        };

    while let Ok(response) = receiver.recv() {
        let _ = response.send(get_uia_text_target(&automation));
    }

    unsafe { CoUninitialize() };
}

#[cfg(target_os = "windows")]
fn get_uia_text_target(
    automation: &windows::Win32::UI::Accessibility::IUIAutomation,
) -> Option<TextTarget> {
    use windows::core::BOOL;
    use windows::Win32::UI::Accessibility::{
        IUIAutomationTextPattern, IUIAutomationTextPattern2, TextPatternRangeEndpoint_End,
        TextPatternRangeEndpoint_Start, UIA_DocumentControlTypeId, UIA_EditControlTypeId,
        UIA_TextPattern2Id, UIA_TextPatternId,
    };

    (|| {
        let focused = unsafe { automation.GetFocusedElement() }.ok()?;
        let mut text_pattern_supported = false;

        if let Ok(pattern) =
            unsafe { focused.GetCurrentPatternAs::<IUIAutomationTextPattern2>(UIA_TextPattern2Id) }
        {
            text_pattern_supported = true;
            let mut active = BOOL::default();
            if let Ok(range) = unsafe { pattern.GetCaretRange(&mut active) } {
                if active.as_bool() {
                    if let Some(rect) = text_range_rect(&range) {
                        return Some(TextTarget::Caret(rect));
                    }
                }
            }
        }

        if let Ok(pattern) =
            unsafe { focused.GetCurrentPatternAs::<IUIAutomationTextPattern>(UIA_TextPatternId) }
        {
            text_pattern_supported = true;
            if let Ok(ranges) = unsafe { pattern.GetSelection() } {
                if unsafe { ranges.Length() }.unwrap_or(0) > 0 {
                    if let Ok(range) = unsafe { ranges.GetElement(0) } {
                        let _ = unsafe {
                            range.MoveEndpointByRange(
                                TextPatternRangeEndpoint_Start,
                                &range,
                                TextPatternRangeEndpoint_End,
                            )
                        };
                        if let Some(rect) = text_range_rect(&range) {
                            return Some(TextTarget::Caret(rect));
                        }
                    }
                }
            }
        }

        let control_type = unsafe { focused.CurrentControlType() }.ok()?;
        if !text_pattern_supported
            && control_type != UIA_EditControlTypeId
            && control_type != UIA_DocumentControlTypeId
        {
            return None;
        }
        let rect = unsafe { focused.CurrentBoundingRectangle() }.ok()?;
        normalize_screen_rect(rect.left, rect.top, rect.right, rect.bottom).map(TextTarget::Field)
    })()
}

#[cfg(target_os = "windows")]
fn text_range_rect(
    range: &windows::Win32::UI::Accessibility::IUIAutomationTextRange,
) -> Option<(i32, i32, i32, i32)> {
    use std::ffi::c_void;
    use windows::Win32::System::Ole::{
        SafeArrayAccessData, SafeArrayDestroy, SafeArrayGetDim, SafeArrayGetElemsize,
        SafeArrayGetLBound, SafeArrayGetUBound, SafeArrayUnaccessData,
    };

    let array = unsafe { range.GetBoundingRectangles() }.ok()?;
    if array.is_null() {
        return None;
    }

    let result = (|| {
        if unsafe { SafeArrayGetDim(array) } != 1
            || unsafe { SafeArrayGetElemsize(array) } as usize != std::mem::size_of::<f64>()
        {
            return None;
        }
        let lower = unsafe { SafeArrayGetLBound(array, 1) }.ok()?;
        let upper = unsafe { SafeArrayGetUBound(array, 1) }.ok()?;
        let len = upper.checked_sub(lower)?.checked_add(1)? as usize;
        if len < 4 {
            return None;
        }

        let mut data: *mut c_void = std::ptr::null_mut();
        unsafe { SafeArrayAccessData(array, &mut data) }.ok()?;
        let values = unsafe { std::slice::from_raw_parts(data.cast::<f64>(), len) };
        let rect = values
            .chunks_exact(4)
            .find_map(|rect| normalize_uia_rect(rect[0], rect[1], rect[2], rect[3]));
        let _ = unsafe { SafeArrayUnaccessData(array) };
        rect
    })();
    let _ = unsafe { SafeArrayDestroy(array) };
    result
}

#[cfg(target_os = "windows")]
fn normalize_uia_rect(x: f64, y: f64, width: f64, height: f64) -> Option<(i32, i32, i32, i32)> {
    if ![x, y, width, height].iter().all(|value| value.is_finite()) || width < 0.0 || height <= 0.0
    {
        return None;
    }
    normalize_screen_rect(
        x.floor() as i32,
        y.floor() as i32,
        (x + width).ceil() as i32,
        (y + height).ceil() as i32,
    )
}

#[cfg(target_os = "windows")]
fn normalize_screen_rect(
    left: i32,
    top: i32,
    right: i32,
    bottom: i32,
) -> Option<(i32, i32, i32, i32)> {
    (right >= left && bottom > top).then_some((left, top, right, bottom))
}

/// Sends a Ctrl+V or Cmd+V paste command using platform-specific virtual key codes.
/// This ensures the paste works regardless of keyboard layout (e.g., Russian, AZERTY, DVORAK).
/// Note: On Wayland, this may not work - callers should check for Wayland and use alternative methods.
///
/// `hold_ms` is how long the modifier stays held after the V click before being
/// released. Most applications read the modifier from the V event's flags and
/// need no hold at all, but applications that poll global keyboard state when
/// handling the key need the modifier to still be down — the hold insures
/// against those. Callers that can detect a failed chord (e.g. the
/// receipt-sequenced paste path) may use a much shorter hold.
pub fn send_paste_ctrl_v(enigo: &mut Enigo, hold_ms: u64) -> Result<(), String> {
    // Platform-specific key definitions
    #[cfg(target_os = "macos")]
    let (modifier_key, v_key_code) = (Key::Meta, Key::Other(9));
    #[cfg(target_os = "windows")]
    let (modifier_key, v_key_code) = (Key::Control, Key::Other(0x56)); // VK_V
    #[cfg(target_os = "linux")]
    let (modifier_key, v_key_code) = (Key::Control, Key::Unicode('v'));

    // Press modifier + V
    enigo
        .key(modifier_key, enigo::Direction::Press)
        .map_err(|e| format!("Failed to press modifier key: {}", e))?;
    enigo
        .key(v_key_code, enigo::Direction::Click)
        .map_err(|e| format!("Failed to click V key: {}", e))?;

    std::thread::sleep(std::time::Duration::from_millis(hold_ms));

    enigo
        .key(modifier_key, enigo::Direction::Release)
        .map_err(|e| format!("Failed to release modifier key: {}", e))?;

    Ok(())
}

/// Sends a Ctrl+Shift+V paste command.
/// This is commonly used in terminal applications on Linux to paste without formatting.
/// Note: On Wayland, this may not work - callers should check for Wayland and use alternative methods.
pub fn send_paste_ctrl_shift_v(enigo: &mut Enigo, hold_ms: u64) -> Result<(), String> {
    // Platform-specific key definitions
    #[cfg(target_os = "macos")]
    let (modifier_key, v_key_code) = (Key::Meta, Key::Other(9)); // Cmd+Shift+V on macOS
    #[cfg(target_os = "windows")]
    let (modifier_key, v_key_code) = (Key::Control, Key::Other(0x56)); // VK_V
    #[cfg(target_os = "linux")]
    let (modifier_key, v_key_code) = (Key::Control, Key::Unicode('v'));

    // Press Ctrl/Cmd + Shift + V
    enigo
        .key(modifier_key, enigo::Direction::Press)
        .map_err(|e| format!("Failed to press modifier key: {}", e))?;
    enigo
        .key(Key::Shift, enigo::Direction::Press)
        .map_err(|e| format!("Failed to press Shift key: {}", e))?;
    enigo
        .key(v_key_code, enigo::Direction::Click)
        .map_err(|e| format!("Failed to click V key: {}", e))?;

    std::thread::sleep(std::time::Duration::from_millis(hold_ms));

    enigo
        .key(Key::Shift, enigo::Direction::Release)
        .map_err(|e| format!("Failed to release Shift key: {}", e))?;
    enigo
        .key(modifier_key, enigo::Direction::Release)
        .map_err(|e| format!("Failed to release modifier key: {}", e))?;

    Ok(())
}

/// Sends a Shift+Insert paste command (Windows and Linux only).
/// This is more universal for terminal applications and legacy software.
/// Note: On Wayland, this may not work - callers should check for Wayland and use alternative methods.
pub fn send_paste_shift_insert(enigo: &mut Enigo, hold_ms: u64) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    let insert_key_code = Key::Other(0x2D); // VK_INSERT
    #[cfg(not(target_os = "windows"))]
    let insert_key_code = Key::Other(0x76); // XK_Insert (keycode 118 / 0x76, also used as fallback)

    // Press Shift + Insert
    enigo
        .key(Key::Shift, enigo::Direction::Press)
        .map_err(|e| format!("Failed to press Shift key: {}", e))?;
    enigo
        .key(insert_key_code, enigo::Direction::Click)
        .map_err(|e| format!("Failed to click Insert key: {}", e))?;

    std::thread::sleep(std::time::Duration::from_millis(hold_ms));

    enigo
        .key(Key::Shift, enigo::Direction::Release)
        .map_err(|e| format!("Failed to release Shift key: {}", e))?;

    Ok(())
}

/// Pastes text directly using the enigo text method.
/// This tries to use system input methods if possible, otherwise simulates keystrokes one by one.
pub fn paste_text_direct(enigo: &mut Enigo, text: &str) -> Result<(), String> {
    enigo
        .text(text)
        .map_err(|e| format!("Failed to send text directly: {}", e))?;

    Ok(())
}
