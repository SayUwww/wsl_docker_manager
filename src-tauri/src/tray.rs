use tauri::{
    image::Image,
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, Runtime,
};

pub fn create_tray<R: Runtime>(app: &tauri::App<R>) -> tauri::Result<()> {
    let show = MenuItemBuilder::with_id("show", "Show Window").build(app)?;
    let start_all = MenuItemBuilder::with_id("start_all", "Start All Containers").build(app)?;
    let stop_all = MenuItemBuilder::with_id("stop_all", "Stop All Containers").build(app)?;
    let separator = tauri::menu::PredefinedMenuItem::separator(app)?;
    let quit = MenuItemBuilder::with_id("quit", "Quit").build(app)?;

    let menu = MenuBuilder::new(app)
        .item(&show)
        .item(&start_all)
        .item(&stop_all)
        .item(&separator)
        .item(&quit)
        .build()?;

    let icon = Image::from_bytes(include_bytes!("../icons/icon.png"))
        .unwrap_or_else(|_| Image::new(&[], 1, 1));

    let _tray = TrayIconBuilder::new()
        .icon(icon)
        .menu(&menu)
        .tooltip("WSL Docker Manager")
        .on_menu_event(move |app, event| match event.id().as_ref() {
            "show" => {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
            "start_all" => {
                let handle = app.clone();
                tauri::async_runtime::spawn(async move {
                    if let Ok(docker) = crate::docker::DockerState::get_docker(
                        handle.state::<crate::docker::DockerState>(),
                    )
                    .await
                    {
                        if let Ok(containers) =
                            crate::docker::list_container_infos(&docker, true).await
                        {
                            for c in containers {
                                if c.state.as_deref() == Some("exited") {
                                    let _ = docker
                                        .start_container::<String>(&c.id.unwrap_or_default(), None)
                                        .await;
                                }
                            }
                        }
                    }
                });
            }
            "stop_all" => {
                let handle = app.clone();
                tauri::async_runtime::spawn(async move {
                    if let Ok(docker) = crate::docker::DockerState::get_docker(
                        handle.state::<crate::docker::DockerState>(),
                    )
                    .await
                    {
                        if let Ok(containers) =
                            crate::docker::list_container_infos(&docker, false).await
                        {
                            for c in containers {
                                let _ =
                                    docker.stop_container(&c.id.unwrap_or_default(), None).await;
                            }
                        }
                    }
                });
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(w) = app.get_webview_window("main") {
                    if w.is_visible().unwrap_or(false) {
                        let _ = w.hide();
                    } else {
                        let _ = w.show();
                        let _ = w.set_focus();
                    }
                }
            }
        })
        .build(app)?;

    Ok(())
}
