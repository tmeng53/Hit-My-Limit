import AppKit
import SwiftUI

enum Format {
    static func tokens(_ n: Double) -> String {
        n >= 1e9 ? String(format: "%.1fB", n / 1e9)
            : n >= 1e6 ? String(format: "%.1fM", n / 1e6)
            : n >= 1e3 ? "\(Int((n / 1e3).rounded()))K" : "\(Int(n))"
    }

    // "14:00" today, "Mon 09:00" within a week, else "Oct 20".
    static func when(_ d: Date) -> String {
        let f = DateFormatter()
        let days = abs(d.timeIntervalSinceNow) / 86400
        f.setLocalizedDateFormatFromTemplate(Calendar.current.isDateInToday(d) ? "jmm" : days < 6 ? "EEEjmm" : "MMMd")
        return f.string(from: d)
    }

    // "2h 25m", "3d 4h"
    static func span(_ seconds: Double) -> String {
        let m = max(1, Int((seconds / 60).rounded()))
        let d = m / 1440, h = (m % 1440) / 60, mm = m % 60
        if d > 0 { return h > 0 ? "\(d)d \(h)h" : "\(d)d" }
        if h > 0 { return mm > 0 ? "\(h)h \(mm)m" : "\(h)h" }
        return "\(mm)m"
    }

    static func until(_ d: Date) -> String { d.timeIntervalSinceNow > 0 ? "in \(span(d.timeIntervalSinceNow))" : "now" }

    static func ago(_ d: Date) -> String {
        let days = Calendar.current.dateComponents([.day], from: Calendar.current.startOfDay(for: d), to: Calendar.current.startOfDay(for: Date())).day ?? 0
        return days == 0 ? "Today" : days == 1 ? "Yesterday" : days < 7 ? "\(days) days ago" : when(d)
    }

    static func duration(minutes: Double) -> String { span(minutes * 60) }
}

enum Look {
    static let claude = Color(red: 0.85, green: 0.47, blue: 0.34)
    static let codex = Color(red: 0.25, green: 0.55, blue: 0.95)
    static let google = Color(red: 0.26, green: 0.52, blue: 0.96)
    static let minus = Color(light: 0xd1242f, dark: 0xff7b72)
    static let plus = Color(light: 0x1a7f37, dark: 0x56d364)

    static func lab(_ lab: String?) -> Color {
        switch lab {
        case "anthropic": return claude
        case "openai": return codex
        case "google": return google
        default: return .secondary
        }
    }

    // Green while there's room, then amber, then red.
    static func level(_ percent: Double) -> Color {
        percent >= 90 ? .red : percent >= 70 ? .orange : .green
    }
}

extension Color {
    init(light: UInt32, dark: UInt32) {
        self.init(nsColor: NSColor(name: nil) { appearance in
            let hex = appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua ? dark : light
            return NSColor(srgbRed: CGFloat((hex >> 16) & 0xff) / 255, green: CGFloat((hex >> 8) & 0xff) / 255, blue: CGFloat(hex & 0xff) / 255, alpha: 1)
        })
    }
}
