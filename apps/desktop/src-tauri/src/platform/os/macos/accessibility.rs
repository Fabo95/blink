//! A small wrapper over the macOS Accessibility API: read attributes off UI elements and
//! search their children. Reads need the Accessibility permission the ⌘C copy-simulation
//! already requires; without it, every call returns `None`.

use std::ptr;

use accessibility_sys::{
    kAXChildrenAttribute, kAXErrorSuccess, kAXFocusedWindowAttribute, kAXTitleAttribute,
    AXUIElementCopyAttributeValue, AXUIElementCreateApplication, AXUIElementRef,
};
use core_foundation::array::{CFArray, CFArrayRef};
use core_foundation::base::{CFType, CFTypeRef, TCFType};
use core_foundation::string::CFString;
use core_foundation::url::CFURL;

/// An accessibility element we own (an app, a window); releases its reference on drop.
pub struct AxElement(CFType);

impl AxElement {
    pub fn for_application(pid: i32) -> Option<AxElement> {
        let element = unsafe { AXUIElementCreateApplication(pid) };
        (!element.is_null())
            .then(|| AxElement(unsafe { CFType::wrap_under_create_rule(element as CFTypeRef) }))
    }

    pub fn focused_window(&self) -> Option<AxElement> {
        read_attribute(self.raw(), kAXFocusedWindowAttribute).map(AxElement)
    }

    pub fn title(&self) -> Option<String> {
        read_string(self.raw(), kAXTitleAttribute).filter(|t| !t.is_empty())
    }

    /// The underlying element pointer, for the free `read_*` / `find_child` calls (e.g. a
    /// feature-specific subtree walk).
    pub fn raw(&self) -> AXUIElementRef {
        self.0.as_CFTypeRef() as AXUIElementRef
    }
}

/// A string attribute (title, role, …) as a Rust `String`.
pub fn read_string(element: AXUIElementRef, name: &'static str) -> Option<String> {
    read_attribute(element, name)?.downcast_into::<CFString>().map(|s| s.to_string())
}

/// A URL attribute as a string — handles both the URL-object (`AXURL`) and plain-string
/// (`AXDocument`) shapes browsers use.
pub fn read_url(element: AXUIElementRef, name: &'static str) -> Option<String> {
    let value = read_attribute(element, name)?;
    value
        .downcast::<CFURL>()
        .map(|url| url.get_string().to_string())
        .or_else(|| value.downcast::<CFString>().map(|s| s.to_string()))
}

/// The first child of `element` for which `find` returns `Some`. Children are borrowed in
/// place — nothing is allocated or retained per child.
pub fn find_child<T>(
    element: AXUIElementRef,
    mut find: impl FnMut(AXUIElementRef) -> Option<T>,
) -> Option<T> {
    let children = read_attribute(element, kAXChildrenAttribute)?;
    let array =
        unsafe { CFArray::<CFType>::wrap_under_get_rule(children.as_CFTypeRef() as CFArrayRef) };
    array.iter().find_map(|child| find(child.as_CFTypeRef() as AXUIElementRef))
}

fn read_attribute(element: AXUIElementRef, name: &'static str) -> Option<CFType> {
    let key = CFString::from_static_string(name);
    let mut value: CFTypeRef = ptr::null();
    let status =
        unsafe { AXUIElementCopyAttributeValue(element, key.as_concrete_TypeRef(), &mut value) };
    // `Copy…` returns an owned reference; the `CFType` releases it on drop.
    (status == kAXErrorSuccess && !value.is_null())
        .then(|| unsafe { CFType::wrap_under_create_rule(value) })
}
