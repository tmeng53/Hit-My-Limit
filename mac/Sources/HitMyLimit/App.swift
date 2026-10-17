import AppKit
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
                MenuBarIcon()
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

// The grass-on-a-full-bar logo as a template image, so macOS tints it like the other menu bar icons.
struct MenuBarIcon: View {
    private static let image: NSImage? = {
        guard let i = NSImage(named: "MenuBarIconTemplate") else { return nil }
        i.isTemplate = true
        i.size = NSSize(width: 18, height: 18)
        return i
    }()

    var body: some View {
        if let i = Self.image { Image(nsImage: i) } else { Image(systemName: "gauge.with.dots.needle.67percent") }
    }
}
