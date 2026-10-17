import SwiftUI

// One tool's usage: name and plan, one big number, one bar, and the reset time. Claude Code and Codex use the same
// block so the panel reads the same way for both.
struct ToolBlock<Extra: View>: View {
    let dot: Color
    let name: String
    let plan: String?
    let resets: String?
    let big: String
    let unit: String
    let detail: Text?
    let percent: Double?
    let tint: Color
    var chip: TrendChip? = nil
    var help: String? = nil
    @ViewBuilder var extra: Extra

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                RoundedRectangle(cornerRadius: 2.5, style: .continuous).fill(dot).frame(width: 9, height: 9)
                Text(name).font(.system(size: 13, weight: .semibold))
                if let plan { Text(plan).font(.system(size: 13)).foregroundStyle(.secondary) }
                Spacer(minLength: 4)
                if let resets { Text(resets).font(.system(size: 12)).foregroundStyle(.secondary).lineLimit(1) }
            }
            HStack(alignment: .lastTextBaseline) {
                HStack(alignment: .firstTextBaseline, spacing: 2) {
                    Text(big).font(.system(size: 34, weight: .semibold)).monospacedDigit()
                    Text(unit).font(.system(size: 15, weight: .medium)).foregroundStyle(.secondary)
                }
                Spacer(minLength: 8)
                if let detail {
                    detail.font(.system(size: 12)).foregroundStyle(.secondary)
                        .multilineTextAlignment(.trailing).fixedSize(horizontal: false, vertical: true)
                }
            }
            .help(help ?? "")
            if let percent { Bar(fraction: percent / 100, tint: tint) }
            extra
            if let chip { chip.padding(.top, 2) }
        }
    }
}

struct Bar: View {
    let fraction: Double
    let tint: Color
    var height: CGFloat = 6

    var body: some View {
        GeometryReader { g in
            ZStack(alignment: .leading) {
                Capsule().fill(.primary.opacity(0.1))
                if fraction > 0 {
                    Capsule().fill(tint).frame(width: max(height, g.size.width * min(1, fraction)))
                }
            }
        }
        .frame(height: height)
    }
}

// How your latest limit hits compare with your earlier ones. Sooner is amber: worse than usual, not an error.
struct TrendChip: View {
    let text: String
    let sooner: Bool
    let detail: String

    var body: some View {
        let tint = sooner ? Look.amber : Color.secondary
        HStack(spacing: 4) {
            Image(systemName: sooner ? "arrow.down" : "arrow.up").font(.system(size: 11, weight: .bold))
            Text(text).font(.system(size: 12, weight: .semibold))
        }
        .foregroundStyle(tint)
        .padding(.horizontal, 8).padding(.vertical, 4)
        .background(tint.opacity(0.14), in: RoundedRectangle(cornerRadius: 6, style: .continuous))
        .help(detail)
    }
}

// A row that highlights on hover, for clickable lists.
struct HoverRow<Content: View>: View {
    var action: () -> Void
    @ViewBuilder var content: Content
    @State private var hover = false

    var body: some View {
        Button(action: action) {
            HStack(alignment: .top, spacing: 8) { content }
                .padding(.horizontal, 8).padding(.vertical, 6)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(hover ? Color.primary.opacity(0.07) : .clear, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onHover { hover = $0 }
    }
}

struct SectionTitle: View {
    let text: String
    init(_ text: String) { self.text = text }
    var body: some View {
        Text(text).font(.system(size: 13, weight: .medium)).foregroundStyle(.secondary)
    }
}

// A small dark pill (light in dark mode) for the one action on a screen.
struct InkButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View { Pill(configuration: configuration) }

    private struct Pill: View {
        let configuration: Configuration
        @Environment(\.isEnabled) private var enabled

        var body: some View {
            configuration.label
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Look.paper)
                .padding(.horizontal, 16).padding(.vertical, 6)
                .background(Look.ink.opacity(!enabled ? 0.3 : configuration.isPressed ? 0.75 : 1), in: Capsule())
                .contentShape(Capsule())
        }
    }
}

extension View {
    func inkButton() -> some View { buttonStyle(InkButtonStyle()) }
}
