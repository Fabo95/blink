//! Frontmost-application + focused-window detection (macOS: AppKit + the
//! Accessibility API). Returns `None` on every other platform.

use crate::core::state::FrontmostSource;

/// Read the frontmost application and its focused window title. Returns `None` on
/// non-macOS platforms or if nothing is frontmost.
#[cfg(target_os = "macos")]
pub fn detect() -> Option<FrontmostSource> {
    use objc2_app_kit::NSWorkspace;

    let app = NSWorkspace::sharedWorkspace().frontmostApplication()?;
    let app_id = app.bundleIdentifier().map(|s| s.to_string()).unwrap_or_default();
    let app_name = app.localizedName().map(|s| s.to_string()).unwrap_or_default();
    let pid = app.processIdentifier();

    Some(FrontmostSource {
        app_id,
        app_name,
        window_title: focused_window_title(pid).unwrap_or_default(),
    })
}

#[cfg(not(target_os = "macos"))]
pub fn detect() -> Option<FrontmostSource> {
    None
}

/// The focused window's title via the Accessibility API. Needs the same
/// Accessibility permission the ⌘C copy-simulation already requires; returns
/// `None` if it isn't granted, so capture still works without a window title.
#[cfg(target_os = "macos")]
fn focused_window_title(pid: i32) -> Option<String> {
    use accessibility_sys::{
        kAXFocusedWindowAttribute, kAXTitleAttribute, AXUIElementCreateApplication, AXUIElementRef,
    };
    use core_foundation::base::{CFType, CFTypeRef, TCFType};
    use core_foundation::string::{CFString, CFStringRef};

    unsafe {
        let app_ref = AXUIElementCreateApplication(pid);
        if app_ref.is_null() {
            return None;
        }
        // Wrapping under the create rule ties each +1 reference to a guard that
        // releases it on drop — no manual CFRelease bookkeeping.
        let _app_guard = CFType::wrap_under_create_rule(app_ref as CFTypeRef);

        let window_ref = copy_attr(app_ref, kAXFocusedWindowAttribute)?;
        let _window_guard = CFType::wrap_under_create_rule(window_ref);

        let title_ref = copy_attr(window_ref as AXUIElementRef, kAXTitleAttribute)?;
        let title = CFString::wrap_under_create_rule(title_ref as CFStringRef).to_string();
        (!title.is_empty()).then_some(title)
    }
}

/// Copy an Accessibility attribute, returning the owned CFTypeRef (caller releases).
#[cfg(target_os = "macos")]
unsafe fn copy_attr(
    element: accessibility_sys::AXUIElementRef,
    attribute: &'static str,
) -> Option<core_foundation::base::CFTypeRef> {
    use std::ptr;

    use accessibility_sys::{kAXErrorSuccess, AXUIElementCopyAttributeValue};
    use core_foundation::base::{CFTypeRef, TCFType};
    use core_foundation::string::CFString;

    let key = CFString::from_static_string(attribute);
    let mut value: CFTypeRef = ptr::null();
    let err = AXUIElementCopyAttributeValue(element, key.as_concrete_TypeRef(), &mut value);
    (err == kAXErrorSuccess && !value.is_null()).then_some(value)
}
