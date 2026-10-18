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

    // "today", "yesterday", else "Oct 9".
    static func day(_ d: Date) -> String {
        if Calendar.current.isDateInToday(d) { return "today" }
        if Calendar.current.isDateInYesterday(d) { return "yesterday" }
        let f = DateFormatter()
        f.setLocalizedDateFormatFromTemplate("MMMd")
        return f.string(from: d)
    }
}

// Color only says which tool it is, or that something is worse than usual. Claude is clay, Codex is purple, amber is "sooner than usual", red is 90% and up, green is a free reset.
enum Look {
    static let claude = Color(light: 0xd97757, dark: 0xd97757)
    static let ink = Color(light: 0x1d1d1f, dark: 0xf5f5f7)
    static let codex = Color(light: 0x7b61ff, dark: 0x9d8cff)
    static let paper = Color(light: 0xffffff, dark: 0x1d1d1f)
    static let amber = Color(light: 0xb45309, dark: 0xf5a524)
    static let minus = Color(light: 0xd1242f, dark: 0xff7b72)
    static let plus = Color(light: 0x1a7f37, dark: 0x56d364)

    static func lab(_ lab: String?) -> Color {
        switch lab {
        case "anthropic": return claude
        case "openai": return codex
        default: return .secondary
        }
    }

    // A bar in the tool's color until 90%, then red.
    static func bar(_ percent: Double, _ tint: Color) -> Color { percent >= 90 ? minus : tint }
}

extension Color {
    init(light: UInt32, dark: UInt32) {
        self.init(nsColor: NSColor(name: nil) { appearance in
            let hex = appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua ? dark : light
            return NSColor(srgbRed: CGFloat((hex >> 16) & 0xff) / 255, green: CGFloat((hex >> 8) & 0xff) / 255, blue: CGFloat(hex & 0xff) / 255, alpha: 1)
        })
    }
}
