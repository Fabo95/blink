fn main() {
    // `option_env!("BLINK_SERVER_URL")` is resolved at compile time, so cargo must
    // rebuild when it changes — otherwise a new value silently reuses a stale binary.
    println!("cargo:rerun-if-env-changed=BLINK_SERVER_URL");
    tauri_build::build()
}
