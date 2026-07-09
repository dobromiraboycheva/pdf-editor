// PDF Editor — Tauri 2 desktop shell.
//
// Responsibilities:
//   - Register dialog + fs plugins so the web layer can open native dialogs and read/write files.
//   - single_instance: forward `.pdf` paths passed via argv to the already-running window
//     (Windows/Linux hot-open behaviour).
//   - RunEvent::Opened: forward `.pdf` paths delivered by Launch Services on macOS
//     (both cold start and hot open route through here on macOS).
//
// Frontend listens for the "open-pdf" event via @tauri-apps/api and loads the file.

use tauri::{Emitter, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init());

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // Second-instance argv → forward any .pdf paths, then focus main window.
            for arg in args.into_iter().skip(1) {
                if arg.to_lowercase().ends_with(".pdf") {
                    let _ = app.emit("open-pdf", arg);
                }
            }
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.set_focus();
            }
        }));
    }

    let app = builder
        .setup(|app| {
            // Cold start on Windows/Linux: check argv for a .pdf argument.
            #[cfg(any(target_os = "windows", target_os = "linux"))]
            {
                if let Some(path) = std::env::args().nth(1) {
                    if path.to_lowercase().ends_with(".pdf") {
                        let _ = app.emit("open-pdf", path);
                    }
                }
            }
            let _ = app; // silence unused warning on macOS
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to build tauri app");

    app.run(move |app_handle, event| {
        // macOS: files opened via Finder / `open -a` arrive as Apple Events →
        // RunEvent::Opened. That variant only exists on macOS/iOS, so the whole
        // handler is gated behind cfg(target_os = "macos") to keep Windows/Linux
        // builds compiling.
        #[cfg(target_os = "macos")]
        {
            if let tauri::RunEvent::Opened { urls } = event {
                for url in urls {
                    if let Ok(path) = url.to_file_path() {
                        if let Some(s) = path.to_str() {
                            let _ = app_handle.emit("open-pdf", s.to_string());
                        }
                    }
                }
            }
        }
        // On non-macOS, the event handler is a no-op; silence unused warnings.
        #[cfg(not(target_os = "macos"))]
        {
            let _ = (app_handle, event);
        }
    });
}
