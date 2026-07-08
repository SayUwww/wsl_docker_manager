mod commands;
mod docker;
mod tray;
mod wsl_docker;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--hidden"]),
        ))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .manage(docker::DockerState::new())
        .setup(|app| {
            let state = app.state::<docker::DockerState>();
            tauri::async_runtime::block_on(state.initialize_storage(app.handle()))?;

            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                docker::DockerState::connect(&handle).await;
            });

            tray::create_tray(app)?;

            // Register global shortcut via the plugin
            let handle = app.handle().clone();
            app.handle().plugin(
                tauri_plugin_global_shortcut::Builder::new()
                    .with_handler(move |_app, shortcut, _event| {
                        if shortcut.matches(
                            tauri_plugin_global_shortcut::Modifiers::ALT,
                            tauri_plugin_global_shortcut::Code::KeyD,
                        ) {
                            if let Some(w) = handle.get_webview_window("main") {
                                if w.is_visible().unwrap_or(false) {
                                    let _ = w.hide();
                                } else {
                                    let _ = w.show();
                                    let _ = w.set_focus();
                                }
                            }
                        }
                    })
                    .build(),
            )?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::docker_status::get_docker_status,
            commands::docker_status::get_connection_mode,
            commands::docker_status::set_connection_mode,
            commands::docker_status::get_resource_stats,
            commands::containers::list_containers,
            commands::containers::start_container,
            commands::containers::stop_container,
            commands::containers::restart_container,
            commands::containers::remove_container,
            commands::containers::batch_start_containers,
            commands::containers::batch_stop_containers,
            commands::containers::batch_restart_containers,
            commands::containers::batch_remove_containers,
            commands::containers::get_container_logs,
            commands::containers::exec_container,
            commands::containers::update_container_meta,
            commands::images::list_images,
            commands::images::remove_image,
            commands::images::prune_images,
            commands::networks::list_networks,
            commands::networks::remove_network,
            commands::volumes::list_volumes,
            commands::volumes::remove_volume,
            commands::volumes::prune_volumes,
        ])
        .run(tauri::generate_context!())
        .expect("error while running WSL Docker Manager");
}
