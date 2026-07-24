//! The frontmost app + focused-window title, plus the page URL for browsers — read through
//! the `accessibility` wrapper.

use accessibility_sys::{kAXDocumentAttribute, kAXRoleAttribute, kAXURLAttribute, AXUIElementRef};

use super::accessibility::{find_child, read_string, read_url, AxElement};
use crate::core::state::FrontmostSource;

/// Bound the web-area search so a deep/wide tree can't stall the capture.
const MAX_SEARCH_DEPTH: u32 = 12;
const MAX_SEARCH_NODES: u32 = 600;

pub fn detect_source() -> Option<FrontmostSource> {
    use objc2_app_kit::NSWorkspace;

    let app = NSWorkspace::sharedWorkspace().frontmostApplication()?;
    let app_id = app.bundleIdentifier().map(|s| s.to_string()).unwrap_or_default();
    let app_name = app.localizedName().map(|s| s.to_string()).unwrap_or_default();
    let pid = app.processIdentifier();

    let window = AxElement::for_application(pid).and_then(|app| app.focused_window());
    let window_title = window.as_ref().and_then(AxElement::title).unwrap_or_default();
    let url = window
        .filter(|_| is_known_browser(&app_id))
        .and_then(|window| page_url(&window));

    Some(FrontmostSource { app_id, app_name, window_title, url })
}

/// Apps we try to read a page URL from — the rest skip the (pointless) lookup.
fn is_known_browser(bundle_id: &str) -> bool {
    matches!(
        bundle_id,
        "com.apple.Safari"
            | "com.apple.SafariTechnologyPreview"
            | "com.google.Chrome"
            | "com.google.Chrome.canary"
            | "com.google.Chrome.beta"
            | "com.brave.Browser"
            | "com.microsoft.edgemac"
            | "company.thebrowser.Browser" // Arc
            | "org.mozilla.firefox"
            | "com.vivaldi.Vivaldi"
            | "com.operasoftware.Opera"
    )
}

/// Safari exposes the URL on the window (`AXDocument`); Chromium keeps it on the `AXWebArea`
/// deeper in the tree.
fn page_url(window: &AxElement) -> Option<String> {
    if let Some(url) = read_url(window.raw(), kAXDocumentAttribute).filter(|u| is_http(u)) {
        return Some(url);
    }
    let mut remaining_nodes = MAX_SEARCH_NODES;
    find_web_area_url(window.raw(), 0, &mut remaining_nodes)
}

fn find_web_area_url(element: AXUIElementRef, depth: u32, remaining_nodes: &mut u32) -> Option<String> {
    if depth > MAX_SEARCH_DEPTH || *remaining_nodes == 0 {
        return None;
    }
    *remaining_nodes -= 1;

    if read_string(element, kAXRoleAttribute).as_deref() == Some("AXWebArea") {
        if let Some(url) = read_url(element, kAXURLAttribute).filter(|u| is_http(u)) {
            return Some(url);
        }
    }
    find_child(element, |child| find_web_area_url(child, depth + 1, remaining_nodes))
}

fn is_http(url: &str) -> bool {
    url.starts_with("http://") || url.starts_with("https://")
}
