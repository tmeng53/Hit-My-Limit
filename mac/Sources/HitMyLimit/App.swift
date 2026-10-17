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
                MenuBarIcon(fraction: model.usedFraction)
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

// Four usage blocks running into a wall: the blocks fill as the fullest limit fills, and grass grows on them once
// it's hit. Template images, so macOS tints them like the other menu bar icons.
struct MenuBarIcon: View {
    let fraction: Double?

    private static let images: [NSImage?] = (0...4).map { k in
        guard let i = NSImage(named: "MenuBarIcon-\(k)Template") else { return nil }
        i.isTemplate = true
        return i
    }

    var body: some View {
        let k = max(0, min(4, Int(((fraction ?? 0) * 4).rounded())))
        if let i = Self.images[k] { Image(nsImage: i) } else { Image(systemName: "gauge.with.dots.needle.67percent") }
    }
}
