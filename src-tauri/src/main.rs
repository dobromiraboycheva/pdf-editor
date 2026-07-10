// Prevents an extra console window on Windows in release builds. Without this
// attribute the app launches with the "console" subsystem and Windows shows a
// black terminal window behind the GUI. `windows_subsystem = "windows"` tells
// the linker to use the GUI subsystem instead. Guarded to release so `println!`
// debugging still works in `cargo run` during development.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Entry point for `cargo run` (dev). Delegates to the library crate.
fn main() {
    pdf_editor_lib::run()
}
