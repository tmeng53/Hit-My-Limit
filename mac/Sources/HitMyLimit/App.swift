import SwiftUI
import UserNotifications

@main
struct HitMyLimitApp: App {
    @StateObject private var model = Model.shared
    private let opener = NotificationOpener()

    init() {
        UNUserNotificationCenter.current().delegate = opener
        Model.shared.start()
    }

    var body: some Scene {
        MenuBarExtra {
            PanelView(model: model)
        } label: {
            // A gauge, plus the fullest limit when the logs show one.
            HStack(spacing: 3) {
                Image(systemName: "gauge.with.dots.needle.67percent")
                if !model.headline.isEmpty { Text(model.headline).monospacedDigit() }
            }
        }
        .menuBarExtraStyle(.window)

        Window("Share limit hits", id: "share") {
            ShareView(model: model)
        }
        .windowResizability(.contentSize)

        Window("Hit My Limit Settings", id: "settings") {
            SettingsView(model: model)
        }
        .windowResizability(.contentSize)
    }
}
