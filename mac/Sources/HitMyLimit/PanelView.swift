import AppKit
import SwiftUI

struct PanelView: View {
    @ObservedObject var model: Model
    @Environment(\.openWindow) private var openWindow
    // The day under the pointer in the limit-hit strip; its hits show below the strip.
    @State var hoverDay: Int? = nil

    private struct Tool {
        let percent: Double
        let view: AnyView
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header.padding(.bottom, 16)
            if let e = model.error {
                Label(e, systemImage: "exclamationmark.triangle.fill")
                    .font(.system(size: 12)).foregroundStyle(Look.amber)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.bottom, 14)
            }
            if let s = model.status {
                let list = tools(s)
                if list.isEmpty {
                    Text(model.labs.isEmpty ? "No providers picked. Choose them in Settings." : "No Claude Code or Codex use on this Mac in the last 30 days.")
                        .font(.system(size: 12)).foregroundStyle(.secondary)
                }
                ForEach(list.indices, id: \.self) { i in
                    if i > 0 { Divider().padding(.vertical, 16) }
                    list[i].view
                }
                hitStrip(s)
            } else if model.error == nil {
                ProgressView().controlSize(.small).frame(maxWidth: .infinity).padding(20)
            }
            news
            footer
        }
        .padding(16)
        .frame(width: 340)
    }

    private var header: some View {
        HStack(spacing: 10) {
            Text("Hit My Limit").font(.system(size: 15, weight: .semibold))
            Spacer()
            if model.loading { ProgressView().controlSize(.mini) }
            if let s = model.status {
                Button { Task { await model.refresh(); await model.refreshFeed() } } label: {
                    Text(Format.when(date(s.generated_at))).font(.system(size: 12)).monospacedDigit()
                }
                .buttonStyle(.plain).foregroundStyle(.secondary).help("Last updated. Click to refresh.")
            }
            Button { NSApp.activate(ignoringOtherApps: true); openWindow(id: "settings") } label: {
                Image(systemName: "gearshape").font(.system(size: 13, weight: .medium))
            }
            .buttonStyle(.plain).foregroundStyle(.secondary).help("Settings")
        }
    }

    // The fullest limit goes first, so the panel leads with the number in the menu bar.
    private func tools(_ s: Status) -> [Tool] {
        var list: [Tool] = []
        if model.labs.contains("anthropic"), let c = s.claude { list.append(claude(c, s)) }
        if model.labs.contains("openai"), let x = s.codex, let t = codex(x, s) { list.append(t) }
        return list.sorted { $0.percent > $1.percent }
    }

    private func claude(_ c: Status.Claude, _ s: Status) -> Tool {
        let plan = Options.planName("anthropic", s.plans["anthropic"])
        let chip = trendChip(s, "anthropic")
        let note = "Compared with the tokens you had used when you hit this limit before. Claude app use isn't in the logs, so it isn't counted."
        if let until = c.limited_until, until > Date().timeIntervalSince1970 * 1000 {
            return Tool(percent: 100, view: AnyView(ToolBlock(
                dot: Look.claude, name: "Claude Code", plan: plan, resets: "resets \(Format.until(date(until)))",
                big: "100", unit: "%", detail: Text("Limit reached"), percent: 100, tint: Look.minus, chip: chip
            ) { EmptyView() }))
        }
        guard let w = c.window else {
            return Tool(percent: 0, view: AnyView(ToolBlock(
                dot: Look.claude, name: "Claude Code", plan: plan, resets: nil,
                big: "0", unit: "tokens", detail: Text("No 5-hour window open\nlast used \(Format.span(Date().timeIntervalSince1970 - c.last_used / 1000)) ago"),
                percent: nil, tint: Look.claude, chip: chip,
                help: "A 5-hour window opens with your first Claude Code message after the last one ended. Only Claude Code on this Mac writes the logs read here; claude.ai and Claude Code on the web don't."
            ) { EmptyView() }))
        }
        let resets = "resets \(Format.until(date(w.resets_at)))"
        guard let typical = w.typical_at_limit, typical > 0 else {
            return Tool(percent: 0, view: AnyView(ToolBlock(
                dot: Look.claude, name: "Claude Code", plan: plan, resets: resets,
                big: Format.tokens(w.tokens), unit: "tokens",
                detail: Text("No earlier limit hits\nto compare with yet"), percent: nil, tint: Look.claude, chip: chip, help: note
            ) { claudeModels(w) }))
        }
        let p = 100 * w.tokens / typical
        let detail = Text(Format.tokens(w.tokens)).fontWeight(.semibold).foregroundColor(.primary)
            + Text(" of your usual \(Format.tokens(typical))\ntokens this window")
        return Tool(percent: p, view: AnyView(ToolBlock(
            dot: Look.claude, name: "Claude Code", plan: plan, resets: resets,
            big: "\(Int(p.rounded()))", unit: "%", detail: detail, percent: p, tint: Look.bar(p, Look.claude), chip: chip, help: note
        ) { claudeModels(w) }))
    }

    @ViewBuilder private func claudeModels(_ w: Status.ClaudeWindow) -> some View {
        if let m = w.models, !m.isEmpty { ModelList(label: "By model, this window", models: m, tint: Look.claude) }
    }

    private func codex(_ x: Status.Codex, _ s: Status) -> Tool? {
        let sorted = x.limits.sorted { $0.used > $1.used }
        guard let top = sorted.first else { return nil }
        let name = { (l: Status.CodexLimit) in l.window == "5h" ? "5-hour" : Options.windows[l.window] ?? l.window }
        let rest = Array(sorted.dropFirst())
        return Tool(percent: top.used, view: AnyView(ToolBlock(
            dot: Look.ink, name: "Codex", plan: Options.planName("openai", x.plan ?? s.plans["openai"]),
            resets: top.resets_at.map { "\(name(top)) resets \(Format.until(date($0)))" },
            big: "\(Int(top.used.rounded()))", unit: "%", detail: Text("of \(name(top)) limit"),
            percent: top.used, tint: Look.bar(top.used, Look.ink), chip: trendChip(s, "openai")
        ) {
            ForEach(rest, id: \.window) { l in
                HStack(spacing: 10) {
                    Text(name(l).prefix(1).uppercased() + name(l).dropFirst()).font(.system(size: 12)).foregroundStyle(.secondary)
                    Bar(fraction: l.used / 100, tint: Look.bar(l.used, .secondary), height: 4)
                    Text("\(Int(l.used.rounded()))%").font(.system(size: 12, weight: .semibold)).monospacedDigit()
                        .frame(minWidth: 34, alignment: .trailing)
                }
                .padding(.top, 4)
                .help(l.resets_at.map { "Resets \(Format.until(date($0)))" } ?? "")
            }
            if let m = x.models, !m.isEmpty { ModelList(label: "By model, this 5-hour window", models: m, tint: Look.ink) }
        }))
    }

    // Fewer tokens before the limit this week than before is what a quiet cut looks like. Small changes are noise.
    private func trendChip(_ s: Status, _ lab: String) -> TrendChip? {
        guard let t = s.trend.first(where: { $0.lab == lab && $0.window == "5h" }) ?? s.trend.first(where: { $0.lab == lab }),
              let r = t.recent.tokens, let e = t.earlier.tokens, e > 0 else { return nil }
        let change = Int((abs(1 - r / e) * 100).rounded())
        guard change >= 15 else { return nil }
        let detail = "This week you hit it at \(Format.tokens(r)) tokens, before at \(Format.tokens(e)). From \(t.recent.n + t.earlier.n) of your own limit hits."
        return TrendChip(text: "Limit hit \(change)% \(r < e ? "sooner" : "later") this week", sooner: r < e, detail: detail)
    }

    // One bar per day for the last 30 days, tall on days you hit a limit.
    @ViewBuilder private func hitStrip(_ s: Status) -> some View {
        let cal = Calendar.current
        let today = cal.startOfDay(for: Date())
        let first = cal.date(byAdding: .day, value: -29, to: today)!
        let hits = s.hits.filter { model.labs.contains($0.lab) && date($0.hit) >= first }
        if !hits.isEmpty {
            let days: [[Status.Hit]] = (0..<30).map { i in
                let d = cal.date(byAdding: .day, value: i, to: first)!
                return hits.filter { cal.isDate(date($0.hit), inSameDayAs: d) }
            }
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    SectionTitle("Limit hits, last 30 days")
                    Spacer()
                    Text("\(hits.count)").font(.system(size: 13, weight: .semibold)).monospacedDigit()
                }
                HStack(alignment: .bottom, spacing: 3) {
                    ForEach(0..<30, id: \.self) { i in
                        if let h = days[i].first {
                            RoundedRectangle(cornerRadius: 2, style: .continuous).fill(Look.lab(h.lab))
                                .opacity(hoverDay == nil || hoverDay == i ? 1 : 0.45)
                                .frame(maxWidth: .infinity).frame(height: 20)
                                .contentShape(Rectangle().inset(by: -3))
                                .onHover { if $0 { hoverDay = i } }
                        } else {
                            Capsule().fill(.primary.opacity(0.12)).frame(maxWidth: .infinity).frame(height: 3)
                        }
                    }
                }
                .frame(height: 20, alignment: .bottom)
                HStack {
                    Text(Format.day(first))
                    Spacer()
                    Text("today")
                }
                .font(.system(size: 11)).foregroundStyle(.tertiary)
                if let d = hoverDay, d < days.count, !days[d].isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        ForEach(days[d]) { hitDetail($0) }
                    }
                    .padding(.top, 4)
                }
            }
            .onHover { if !$0 { hoverDay = nil } }
            .padding(.top, 22)
        }
    }

    // What a report of this hit would hold: when it ran out, and tokens per model.
    private func hitDetail(_ h: Status.Hit) -> some View {
        let window = h.window == "5h" ? "5-hour" : Options.windows[h.window] ?? h.window
        let models = (h.models ?? [:]).sorted { $0.value.total > $1.value.total }
        let top = max(1, models.first?.value.total ?? 1)
        return VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Text("\(Options.products[h.product] ?? h.product) \(window)").font(.system(size: 13, weight: .semibold))
                Spacer()
                Text(Format.when(date(h.hit))).font(.system(size: 12)).foregroundStyle(.secondary)
            }
            Text([
                Format.duration(minutes: (h.hit - h.start) / 60000),
                h.tokens.map { "\(Format.tokens($0)) tokens" },
                h.requests.map { "\($0) requests" },
            ].compactMap { $0 }.joined(separator: " · "))
            .font(.system(size: 12)).foregroundStyle(.secondary)
            ForEach(models, id: \.key) { name, m in
                VStack(alignment: .leading, spacing: 3) {
                    HStack(alignment: .firstTextBaseline) {
                        Text(name).font(.system(size: 12))
                        Spacer()
                        Text(Format.tokens(m.total)).font(.system(size: 12, weight: .semibold)).monospacedDigit()
                    }
                    Bar(fraction: m.total / top, tint: Look.lab(h.lab), height: 3)
                    Text("in \(Format.tokens(m.input))   out \(Format.tokens(m.output))   cache \(Format.tokens(m.cache_read + m.cache_write))")
                        .font(.system(size: 11)).monospacedDigit().foregroundStyle(.secondary)
                }
            }
        }
    }

    @ViewBuilder private var news: some View {
        let list = Array(model.changes.filter { $0.lab.map(model.labs.contains) ?? true }.prefix(3))
        if !list.isEmpty {
            VStack(alignment: .leading, spacing: 2) {
                HStack {
                    SectionTitle("News")
                    Spacer()
                    Button("See all") { Links.open(Links.site) }
                        .buttonStyle(.plain).font(.system(size: 12)).foregroundStyle(.secondary)
                }
                .padding(.bottom, 4)
                ForEach(list) { c in
                    HoverRow(action: { Links.open(c.link ?? Links.site) }) {
                        VStack(alignment: .leading, spacing: 2) {
                            let lab = c.lab.flatMap { Options.labs[$0] } ?? "Change log"
                            Text(c.isReset ? "Free reset · \(lab)" : lab)
                                .font(.system(size: 11, weight: c.isReset ? .semibold : .regular))
                                .foregroundStyle(c.isReset ? Look.plus : Color.secondary)
                            Text(c.title).font(.system(size: 13)).lineLimit(2).multilineTextAlignment(.leading)
                        }
                        Spacer(minLength: 8)
                        if let d = c.date { Text(Format.day(d)).font(.system(size: 11)).foregroundStyle(.secondary) }
                    }
                    .padding(.horizontal, -8)
                }
            }
            .padding(.top, 22)
        }
    }

    @ViewBuilder private var footer: some View {
        let n = model.unsent.count
        if n > 0 {
            Divider().padding(.top, 14)
            HStack {
                Text(n == 1 ? "1 new limit hit" : "\(n) new limit hits").font(.system(size: 13)).foregroundStyle(.secondary)
                Spacer()
                Button("Share") {
                    NSApp.activate(ignoringOtherApps: true)
                    openWindow(id: "share")
                }
                .inkButton()
            }
            .padding(.top, 12)
        }
    }
}
