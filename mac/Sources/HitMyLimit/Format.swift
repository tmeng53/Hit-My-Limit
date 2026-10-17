import AppKit
import SwiftUI

enum Format {
    static func tokens(_ n: Double) -> String {
        n >= 1e9 ? String(format: "%.1fB", n / 1e9)
            : n >= 1e6 ? String(format: "%.1fM", n / 1e6)
            : n >= 1e3 ? "\(Int((n / 1e3).rounded()))K" : "\(Int(n))"
    }

    // "14:00" today, "Mon 09:00" within a week, else "2026-10-20".
    static func when(_ d: Date) -> String {
        let f = DateFormatter()
        let days = d.timeIntervalSinceNow / 86400
        f.dateFormat = Calendar.current.isDateInToday(d) ? "HH:mm" : (days < 6 && days > -6) ? "EEE HH:mm" : "yyyy-MM-dd"
        return f.string(from: d)
    }

    static func day(_ d: Date) -> String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: d)
    }

    static func duration(minutes: Double) -> String {
        let r = max(5, Int((minutes / 5).rounded()) * 5)
        let d = r / 1440, h = (r % 1440) / 60, m = r % 60
        return [d > 0 ? "\(d)d" : nil, h > 0 ? "\(h)h" : nil, m > 0 ? "\(m)m" : nil].compactMap { $0 }.joined(separator: " ")
    }

    static func bar(_ percent: Double, width: Int = 10) -> String {
        let filled = min(width, max(0, Int((percent / 100 * Double(width)).rounded())))
        return String(repeating: "█", count: filled) + String(repeating: "░", count: width - filled)
    }
}

// The site's look: IBM Plex Mono where installed, else the system monospace; red for tighter, green for looser.
enum Look {
    static let font = Font.system(size: 12, design: .monospaced)
    static let small = Font.system(size: 11, design: .monospaced)
    static let bold = Font.system(size: 12, weight: .semibold, design: .monospaced)
    static let minus = Color(light: 0xd1242f, dark: 0xff7b72)
    static let plus = Color(light: 0x1a7f37, dark: 0x56d364)
    static let muted = Color(light: 0x707070, dark: 0x8c8c8c)
}

extension Color {
    init(light: UInt32, dark: UInt32) {
        self.init(nsColor: NSColor(name: nil) { appearance in
            let hex = appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua ? dark : light
            return NSColor(srgbRed: CGFloat((hex >> 16) & 0xff) / 255, green: CGFloat((hex >> 8) & 0xff) / 255, blue: CGFloat(hex & 0xff) / 255, alpha: 1)
        })
    }
}
