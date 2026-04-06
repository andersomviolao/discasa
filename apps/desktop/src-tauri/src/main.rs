#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{
  menu::{Menu, MenuItem},
  tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
  Manager,
};

fn show_main_window<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
  if let Some(window) = app.get_webview_window("main") {
    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_focus();
  }
}

fn main() {
  tauri::Builder::default()
    .plugin(tauri_plugin_opener::init())
    .setup(|app| {
      let show_item = MenuItem::with_id(app, "show", "Show Discasa", true, None::<&str>)?;
      let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
      let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

      let tray_icon = app.default_window_icon().unwrap().clone();

      let _tray = TrayIconBuilder::new()
        .icon(tray_icon)
        .tooltip("Discasa")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
          "show" => show_main_window(app),
          "quit" => app.exit(0),
          _ => {}
        })
        .on_tray_icon_event(|tray, event| match event {
          TrayIconEvent::Click {
            button: MouseButton::Left,
            button_state: MouseButtonState::Up,
            ..
          } => {
            show_main_window(tray.app_handle());
          }
          TrayIconEvent::DoubleClick {
            button: MouseButton::Left,
            ..
          } => {
            show_main_window(tray.app_handle());
          }
          _ => {}
        })
        .build(app)?;

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running Discasa");
}
