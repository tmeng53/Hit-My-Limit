import SwiftUI

// One tool on the usage card. Every tool uses the same row: name and plan with the big number on the right, one bar,
// and one meta line. A tool with no open window gets no bar and no big number, only a status word. Clicking a row
// with model totals shows them as plain text.
struct ToolRow: View {
    let dot: Color
    let name: String
    let plan: String?
    var big: String? = nil
    var status: String? = nil
    var percent: Double? = nil
    var tint: Color = .primary
    var left: Text? = nil
    var right: String? = nil
    var chip: TrendChip? = nil
    var models: [String: Status.ModelTokens]? = nil
    var help: String? = nil
    @State var open = false

    private var hasModels: Bool { !(models ?? [:]).isEmpty }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button { if hasModels { open.toggle() } } label: { summary }
                .buttonStyle(.plain)
                .help(help ?? "")
            if open, let models { ModelLines(models: models) }
            if let chip { chip }
        }
    }

    private var summary: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                RoundedRectangle(cornerRadius: 2.5, style: .continuous).fill(dot).frame(width: 9, height: 9)
                Text(name).font(.system(size: 13, weight: .semibold)).lineLimit(1).fixedSize()
                if let plan { Text(plan).font(.system(size: 13)).foregroundStyle(.secondary).lineLimit(1) }
                if hasModels {
                    Image(systemName: open ? "chevron.down" : "chevron.right")
                        .font(.system(size: 11, weight: .semibold)).foregroundStyle(.tertiary)
                }
                Spacer(minLength: 8)
                if let big {
                    Text(big).font(.system(size: 34, weight: .semibold)).monospacedDigit()
                        .lineLimit(1).minimumScaleFactor(0.8).fixedSize()
                } else if let status {
                    Text(status).font(.system(size: 13)).foregroundStyle(.secondary).lineLimit(1).fixedSize()
                }
            }
            if let percent { Bar(fraction: percent / 100, tint: tint) }
            if left != nil || right != nil {
                HStack(spacing: 8) {
                    left?.lineLimit(1).minimumScaleFactor(0.85)
                    Spacer(minLength: 8)
                    if let right { Text(right).lineLimit(1).fixedSize() }
                }
                .font(.system(size: 12)).foregroundStyle(.secondary)
            }
        }
        .contentShape(Rectangle())
    }
}

// Tokens per model as plain text, largest first: name, share of the total, tokens. Input, output and cache are in the
// tooltip.
struct ModelLines: View {
    let models: [String: Status.ModelTokens]
    var indent: CGFloat = 15

    var body: some View {
        let list = models.sorted { $0.value.total > $1.value.total }
        let sum = max(1, list.reduce(0) { $0 + $1.value.total })
        VStack(alignment: .leading, spacing: 4) {
            ForEach(list, id: \.key) { name, m in
                HStack(spacing: 8) {
                    Text(name).lineLimit(1).truncationMode(.middle)
                    Spacer(minLength: 8)
                    Text("\(Int((100 * m.total / sum).rounded()))%").foregroundStyle(.secondary).monospacedDigit()
                    Text(Format.tokens(m.total)).fontWeight(.semibold).monospacedDigit()
                        .frame(minWidth: 44, alignment: .trailing)
                }
                .font(.system(size: 12))
                .help("Input \(Format.tokens(m.input)), output \(Format.tokens(m.output)), cache read \(Format.tokens(m.cache_read)), cache write \(Format.tokens(m.cache_write))")
            }
        }
        .padding(.leading, indent)
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

// A section line that still shows on the panel's translucent material, where Divider all but disappears.
struct Hairline: View {
    var body: some View { Rectangle().fill(.primary.opacity(0.12)).frame(height: 1) }
}
