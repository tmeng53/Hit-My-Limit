import SwiftUI

// A rounded module, like the ones in Control Center.
struct Card<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 10) { content }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.primary.opacity(0.05), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(.primary.opacity(0.06)))
    }
}

struct CardHeader: View {
    let symbol: String
    let title: String
    let tint: Color
    var badge: String? = nil

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: symbol)
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 22, height: 22)
                .background(tint.gradient, in: RoundedRectangle(cornerRadius: 6, style: .continuous))
            Text(title).font(.system(size: 13, weight: .semibold))
            if let badge {
                Text(badge)
                    .font(.system(size: 10, weight: .medium))
                    .padding(.horizontal, 6).padding(.vertical, 2)
                    .background(.primary.opacity(0.08), in: Capsule())
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
        }
    }
}

// A ring that fills with the share of a limit used.
struct Ring: View {
    let fraction: Double
    let tint: Color
    let label: String

    var body: some View {
        ZStack {
            Circle().stroke(.primary.opacity(0.1), lineWidth: 5)
            Circle()
                .trim(from: 0, to: max(0.02, min(1, fraction)))
                .stroke(tint.gradient, style: StrokeStyle(lineWidth: 5, lineCap: .round))
                .rotationEffect(.degrees(-90))
            Text(label).font(.system(size: 12, weight: .semibold, design: .rounded)).monospacedDigit()
        }
        .frame(width: 48, height: 48)
    }
}

// A labeled bar for one limit window.
struct Meter: View {
    let title: String
    let percent: Double
    let detail: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack(alignment: .firstTextBaseline) {
                Text(title).font(.system(size: 12, weight: .medium))
                Spacer()
                if let detail { Text(detail).font(.system(size: 11)).foregroundStyle(.secondary) }
                Text("\(Int(percent.rounded()))%")
                    .font(.system(size: 12, weight: .semibold, design: .rounded)).monospacedDigit()
                    .frame(minWidth: 34, alignment: .trailing)
            }
            GeometryReader { g in
                ZStack(alignment: .leading) {
                    Capsule().fill(.primary.opacity(0.1))
                    Capsule().fill(Look.level(percent).gradient)
                        .frame(width: max(6, g.size.width * min(1, percent / 100)))
                }
            }
            .frame(height: 6)
        }
    }
}

// A row that highlights on hover, for clickable lists.
struct HoverRow<Content: View>: View {
    var action: () -> Void
    @ViewBuilder var content: Content
    @State private var hover = false

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) { content }
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
    var body: some View {
        Text(text).font(.system(size: 11, weight: .semibold)).foregroundStyle(.secondary).padding(.horizontal, 4)
    }
}

extension View {
    // The primary button: Liquid Glass on macOS 26, a regular prominent button before.
    @ViewBuilder func primaryButton() -> some View {
        if #available(macOS 26, *) {
            self.buttonStyle(.glassProminent).controlSize(.large)
        } else {
            self.buttonStyle(.borderedProminent).controlSize(.large)
        }
    }

    @ViewBuilder func iconButton() -> some View {
        if #available(macOS 26, *) {
            self.buttonStyle(.glass).buttonBorderShape(.circle)
        } else {
            self.buttonStyle(.borderless)
        }
    }
}
