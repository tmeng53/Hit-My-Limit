import AppKit
import SwiftUI

// HITMYLIMIT_PREVIEW=1 shows the panel and the share window as ordinary windows filled with sample data,
// so CI can take screenshots of the design. HITMYLIMIT_APPEARANCE=dark switches to dark mode.
enum Preview {
    static var enabled: Bool { ProcessInfo.processInfo.environment["HITMYLIMIT_PREVIEW"] != nil }
    private static var windows: [NSWindow] = []

    static func sampleStatus() -> Status {
        let now = Date().timeIntervalSince1970 * 1000
        let h = 3_600_000.0, d = 24 * h
        let start = (now / h).rounded(.down) * h - 2 * h
        let json = """
        {"generated_at":\(now),
         "claude":{"window":{"start":\(start),"resets_at":\(start + 5 * h),"tokens":2900000,"requests":214,"typical_at_limit":4600000,"past_hits":4},
                   "limited_until":null,"week_tokens":31200000,"last_used":\(now - 60_000)},
         "codex":{"as_of":\(now - 300_000),"plan":"plus","limits":[
                   {"window":"5h","used":43,"resets_at":\(now + 2.5 * h)},
                   {"window":"weekly","used":71,"resets_at":\(now + 3 * d)}]},
         "hits":[
           {"key":"a1","lab":"anthropic","product":"claude-code","window":"5h","start":\(now - 2 * d - 3 * h),"hit":\(now - 2 * d - 1 * h),"tokens":3100000,"plan":null,"sent":false},
           {"key":"a2","lab":"openai","product":"codex","window":"5h","start":\(now - 4 * d - 4 * h),"hit":\(now - 4 * d - 1.5 * h),"tokens":5200000,"plan":"plus","sent":false},
           {"key":"a3","lab":"anthropic","product":"claude-code","window":"5h","start":\(now - 12 * d - 5 * h),"hit":\(now - 12 * d - 1.75 * h),"tokens":4500000,"plan":"max-5x","sent":true},
           {"key":"a4","lab":"anthropic","product":"claude-code","window":"5h","start":\(now - 19 * d - 5 * h),"hit":\(now - 19 * d - 1.5 * h),"tokens":4700000,"plan":"max-5x","sent":true}],
         "trend":[{"lab":"anthropic","window":"5h","recent":{"n":1,"tokens":3100000,"minutes":120},"earlier":{"n":3,"tokens":4600000,"minutes":205}}],
         "plans":{"anthropic":"max-5x"},
         "unread":{"claude":0,"codex":0}}
        """
        return try! JSONDecoder().decode(Status.self, from: Data(json.utf8))
    }

    static let sampleChanges: [Change] = [
        Change(id: "0", lab: "anthropic", title: "Usage limits reset for all paid plans after an outage", link: nil, date: Date().addingTimeInterval(-3600), kind: "reset"),
        Change(id: "1", lab: "google", title: "Free Gemini users limited to Flash-Lite", link: nil, date: Date().addingTimeInterval(-8 * 86400)),
        Change(id: "2", lab: "openai", title: "New Pro $500 tier; Pro $200 allowances changed", link: nil, date: Date().addingTimeInterval(-18 * 86400)),
        Change(id: "3", lab: "anthropic", title: "Claude Code weekly limits settle 25% above old base", link: nil, date: Date().addingTimeInterval(-33 * 86400)),
    ]

    static let sampleReport = """
    [
      {
        "account" : "own",
        "client_id" : "3f9c0d2a8b7e4c1f9a6d5e2b1c0f8a7d",
        "felt" : null,
        "hit_on" : "2026-10-15",
        "lab" : "anthropic",
        "minutes_to_limit" : 120,
        "model" : "opus",
        "plan" : "max-5x",
        "product" : "claude-code",
        "requests" : 241,
        "source" : "cli",
        "start_hour" : 14,
        "tokens" : { "cache_read" : 2900000, "cache_write" : 160000, "input" : 30, "output" : 40000, "total" : 3100030 },
        "window" : "5h",
        "work" : "coding"
      }
    ]
    """

    @MainActor static func show(_ model: Model) {
        if ProcessInfo.processInfo.environment["HITMYLIMIT_APPEARANCE"] == "dark" {
            NSApp.appearance = NSAppearance(named: .darkAqua)
        }
        model.status = sampleStatus()
        model.changes = sampleChanges
        guard let screen = NSScreen.main?.visibleFrame else { return }
        // The panel as the menu bar shows it: a rounded popover on the system material.
        // The panel as the menu bar shows it, a rounded popover on the system material, over a wallpaper-like
        // backdrop so the material has something to show.
        let panelView = ZStack {
            LinearGradient(colors: [Color(red: 0.35, green: 0.45, blue: 0.85), Color(red: 0.75, green: 0.45, blue: 0.7), Color(red: 0.95, green: 0.65, blue: 0.45)],
                           startPoint: .topLeading, endPoint: .bottomTrailing)
            PanelView(model: model)
                .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                .shadow(color: .black.opacity(0.25), radius: 18, y: 8)
                .padding(28)
        }
        .fixedSize()
        let panel = window(panelView, title: "Panel")
        panel.setFrameTopLeftPoint(NSPoint(x: screen.maxX - panel.frame.width - 10, y: screen.maxY))
        let share = window(ShareView(model: model, sample: sampleReport), title: "Share limit hits")
        share.setFrameTopLeftPoint(NSPoint(x: screen.minX + 40, y: screen.maxY - 10))
        let sent = window(ShareView(model: model, sampleSent: SendResult(sent: 2, duplicate: false, comparison_line: "You hit the limit sooner than 64% of 212 recent reports on the same plan.")), title: "Share limit hits")
        sent.setFrameTopLeftPoint(NSPoint(x: screen.minX + 520, y: screen.maxY - 10))
        let settings = window(SettingsView(model: model), title: "Hit My Limit Settings")
        settings.setFrameTopLeftPoint(NSPoint(x: screen.minX + 40, y: screen.maxY - share.frame.height - 30))
        NSApp.activate(ignoringOtherApps: true)
        panel.makeKeyAndOrderFront(nil)
        // Window numbers for `screencapture -l`.
        if let out = ProcessInfo.processInfo.environment["HITMYLIMIT_PREVIEW_WINDOWS"] {
            try? "panel \(panel.windowNumber)\nshare \(share.windowNumber)\nsent \(sent.windowNumber)\nsettings \(settings.windowNumber)\n".write(toFile: out, atomically: true, encoding: .utf8)
        }
    }

    @MainActor private static func window<V: View>(_ view: V, title: String) -> NSWindow {
        let w = NSWindow(contentViewController: NSHostingController(rootView: view))
        w.title = title
        w.styleMask = [.titled]
        w.makeKeyAndOrderFront(nil)
        windows.append(w)
        return w
    }
}
