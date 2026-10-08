#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use std::{
    io::{BufRead, BufReader},
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
struct Runtime(Arc<Mutex<Option<Child>>>);
impl Runtime {
    fn stop(&self) {
        if let Ok(mut owned) = self.0.lock() {
            if let Some(mut child) = owned.take() {
                #[cfg(unix)]
                unsafe {
                    libc::kill(-(child.id() as i32), libc::SIGTERM);
                }
                #[cfg(not(unix))]
                {
                    let _ = child.kill();
                }
                for _ in 0..50 {
                    if child.try_wait().ok().flatten().is_some() {
                        return;
                    }
                    std::thread::sleep(std::time::Duration::from_millis(100));
                }
                #[cfg(unix)]
                unsafe {
                    libc::kill(-(child.id() as i32), libc::SIGKILL);
                }
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}
impl Drop for Runtime {
    fn drop(&mut self) {
        self.stop();
    }
}
fn main() {
    let runtime = Runtime(Arc::new(Mutex::new(None)));
    let app = tauri::Builder::default()
        .manage(runtime)
        .setup(|app| {
            let root = std::env::var_os("BH_RUNTIME_ROOT")
                .map(PathBuf::from)
                .unwrap_or_else(|| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../.."));
            let root = root.canonicalize()?;
            let binary = std::env::var_os("BH_MEMORY_BINARY")
                .map(PathBuf::from)
                .unwrap_or_else(|| root.join("../../target/debug/brain-memory"));
            if !binary.exists() {
                return Err(
                    "BrainHarness Rust services are missing; build brain-memory first".into(),
                );
            }
            let node = std::env::var_os("BH_NODE_BINARY").unwrap_or_else(|| "node".into());
            let home = std::env::var_os("BH_HOME")
                .map(PathBuf::from)
                .unwrap_or_else(|| app.path().app_data_dir().unwrap().join("harness"));
            let mut cmd = Command::new(node);
            #[cfg(unix)]
            {
                use std::os::unix::process::CommandExt;
                cmd.process_group(0);
            }
            let port = std::net::TcpListener::bind("127.0.0.1:0")?
                .local_addr()?
                .port();
            cmd.current_dir(&root)
                .arg(root.join("apps/brainharness/launch.mjs"));
            let mut child = cmd
                .env("BH_HOME", home)
                .env("BH_MEMORY_BINARY", binary)
                .env("BH_PORT", port.to_string())
                .stdin(Stdio::null())
                .stdout(Stdio::piped())
                .stderr(Stdio::inherit())
                .spawn()?;
            let stdout = child.stdout.take().ok_or("missing GUI readiness stream")?;
            let shared = app.state::<Runtime>().0.clone();
            *shared.lock().map_err(|_| "runtime lock poisoned")? = Some(child);
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                let mut opened = false;
                for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                    // The harness publishes this only after all GUI plugins settle.
                    if let Some(raw) = line.strip_prefix("BrainHarness ready: ") {
                        if let Some(raw) = raw.split_whitespace().next() {
                            if let Ok(url) = url::Url::parse(raw) {
                                if url.scheme() == "http"
                                    && url.host_str() == Some("127.0.0.1")
                                    && url.port().is_some()
                                    && !opened
                                {
                                    match WebviewWindowBuilder::new(
                                        &handle,
                                        "main",
                                        WebviewUrl::External(url),
                                    )
                                    .on_new_window({
                                        let popup_handle = handle.clone();
                                        let counter = std::sync::atomic::AtomicU64::new(0);
                                        move |url, features| {
                                            if !matches!(url.scheme(), "http" | "https" | "about") {
                                                return tauri::webview::NewWindowResponse::Deny;
                                            }
                                            let label = format!("provider-auth-{}", counter.fetch_add(1, std::sync::atomic::Ordering::Relaxed));
                                            match WebviewWindowBuilder::new(&popup_handle, label, WebviewUrl::External("about:blank".parse().unwrap()))
                                                .title("BrainHarness").inner_size(620.0, 820.0).window_features(features).build() {
                                                Ok(window) => tauri::webview::NewWindowResponse::Create { window },
                                                Err(error) => {eprintln!("Could not open provider sign-in window: {error}"); tauri::webview::NewWindowResponse::Deny}
                                            }
                                        }
                                    })
                                    .title("BrainHarness")
                                    .inner_size(1440.0, 940.0)
                                    .min_inner_size(850.0, 600.0)
                                    .build()
                                    {
                                        Ok(_) => opened = true,
                                        Err(e) => {
                                            eprintln!("BrainHarness GUI failed: {e}");
                                            handle.exit(1);
                                            break;
                                        }
                                    }
                                    continue;
                                }
                            }
                        }
                    }
                    // Avoid printing the authenticated readiness URL to logs.
                    if !line.starts_with("BrainHarness ready:") {
                        eprintln!("{line}");
                    }
                }
                eprintln!("BrainHarness GUI runtime exited");
                handle.exit(1);
            });
            let timeout_handle = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_secs(60));
                if timeout_handle.get_webview_window("main").is_none() {
                    eprintln!("BrainHarness GUI startup timed out");
                    timeout_handle.exit(1);
                }
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("BrainHarness desktop initialization failed");
    app.run(|handle, event| {
        if let tauri::RunEvent::WindowEvent {
            label,
            event: tauri::WindowEvent::Destroyed,
            ..
        } = &event
        {
            if label == "main" {
                handle.exit(0);
            }
        }
        if matches!(event, tauri::RunEvent::Exit) {
            handle.state::<Runtime>().stop();
        }
    });
}
