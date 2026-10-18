import AppKit
import SwiftUI

struct PanelView: View {
    @ObservedObject var model: Model
    @Environment(\.openWindow) private var openWindow
    // The day under the pointer in the limit-hit strip; its hits show below the strip.
    @State var hoverDay: Int? = nil
    @State var showSettings = false
    // Opens every tool's model list, for the preview screenshots.
    var expanded = false

    private struct Tool {
        let percent: Double
        let view: AnyView
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header.padding(.bottom, showSettings ? 0 : 16)
            if showSettings {
                SettingsView(model: model)
            } else {
                usage
            }
        }
        .padding(16)
        .frame(width: 340)
    }

    @ViewBuilder private var usage: some View {
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
                } else {
                    // The tools sit on one card; everything below is flat on the panel.
                    VStack(alignment: .leading, spacing: 0) {
                        ForEach(list.indices, id: \.self) { i in
                            if i > 0 { Hairline().padding(.vertical, 12) }
                            list[i].view
                        }
                    }
                    .padding(12)
                    .background(.primary.opacity(0.05), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                }
                hitStrip(s)
            } else if model.error == nil {
                ProgressView().controlSize(.small).frame(maxWidth: .infinity).padding(20)
            }
            news
            footer
    }

    private var header: some View {
        HStack(spacing: 10) {
            if showSettings {
                Button { showSettings = false } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "chevron.left").font(.system(size: 12, weight: .semibold))
                        Text("Settings").font(.system(size: 15, weight: .semibold))
                    }
                }
                .buttonStyle(.plain).help("Back")
                Spacer()
            } else {
                Text("Hit My Limit").font(.system(size: 15, weight: .semibold))
                Spacer()
                if model.loading { ProgressView().controlSize(.mini) }
                // The data refreshes on its own; the age only shows when it's stale.
                if let s = model.status, Date().timeIntervalSince(date(s.generated_at)) > 600 {
                    Button { Task { await model.refresh(); await model.refreshFeed() } } label: {
                        Text("updated \(Format.span(Date().timeIntervalSince(date(s.generated_at)))) ago")
                            .font(.system(size: 12)).lineLimit(1)
                    }
                    .buttonStyle(.plain).foregroundStyle(.secondary).help("Click to refresh")
                }
                Button { showSettings = true } label: {
                    Image(systemName: "gearshape").font(.system(size: 13, weight: .medium))
                }
                .buttonStyle(.plain).foregroundStyle(.secondary).help("Settings")
            }
        }
    }

    // The tool closest to its limit goes first, so the panel leads with the number in the menu bar. Idle tools go last.
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
        let now = Date().timeIntervalSince1970
        if let until = c.limited_until, until > now * 1000 {
            return Tool(percent: 100, view: AnyView(ToolRow(
                dot: Look.claude, name: "Claude Code", plan: plan, big: "100%", percent: 100, tint: Look.minus,
                left: Text("Limit reached"), right: "resets \(Format.until(date(until)))", chip: chip, open: expanded
            )))
        }
        guard let w = c.window else {
            let help = "A 5-hour window opens with your first Claude Code message after the last one ended. Only Claude Code on this Mac writes the logs read here; claude.ai and Claude Code on the web don't."
            let meta: String
            var models: [String: Status.ModelTokens]? = nil
            if let lw = c.last_window, lw.tokens > 0 {
                meta = "Last window \(Format.tokens(lw.tokens)) tokens · ended \(Format.span(now - lw.ended_at / 1000)) ago"
                models = lw.models
            } else {
                meta = "Last used \(Format.span(now - c.last_used / 1000)) ago"
            }
            return Tool(percent: -1, view: AnyView(ToolRow(
                dot: Look.claude, name: "Claude Code", plan: plan, status: "Idle",
                left: Text(meta), chip: chip, models: models, help: help, open: expanded
            )))
        }
        let resets = "resets \(Format.until(date(w.resets_at)))"
        guard let typical = w.typical_at_limit, typical > 0 else {
            return Tool(percent: 0, view: AnyView(ToolRow(
                dot: Look.claude, name: "Claude Code", plan: plan, big: Format.tokens(w.tokens),
                left: Text("tokens, no limit hits to compare"), right: resets, chip: chip, models: w.models,
                help: "The percentage shows once you've hit this limit at least once.", open: expanded
            )))
        }
        let p = 100 * w.tokens / typical
        let left = Text(Format.tokens(w.tokens)).fontWeight(.semibold).foregroundColor(.primary)
            + Text(" of your usual \(Format.tokens(typical))")
        return Tool(percent: p, view: AnyView(ToolRow(
            dot: Look.claude, name: "Claude Code", plan: plan, big: "\(Int(p.rounded()))%", percent: p,
            tint: Look.bar(p, Look.claude), left: left, right: resets, chip: chip, models: w.models, help: note, open: expanded
        )))
    }

    private func codex(_ x: Status.Codex, _ s: Status) -> Tool? {
        let sorted = x.limits.sorted { $0.used > $1.used }
        guard let top = sorted.first else { return nil }
        let name = { (l: Status.CodexLimit) -> String in
            let n = l.window == "5h" ? "5-hour" : Options.windows[l.window] ?? l.window
            return n.prefix(1).uppercased() + n.dropFirst()
        }
        let left = [name(top), top.resets_at.map { "resets \(Format.until(date($0)))" }].compactMap { $0 }.joined(separator: " · ")
        let other = sorted.dropFirst().map { l in
            name(l) + " \(Int(l.used.rounded()))%"
        }.joined(separator: " · ")
        return Tool(percent: top.used, view: AnyView(ToolRow(
            dot: Look.codex, name: "Codex", plan: Options.planName("openai", x.plan ?? s.plans["openai"]),
            big: "\(Int(top.used.rounded()))%", percent: top.used, tint: Look.bar(top.used, Look.codex),
            left: Text(left), right: other.isEmpty ? nil : other, chip: trendChip(s, "openai"), models: x.models,
            help: x.models == nil ? nil : "Click for tokens by model in this 5-hour window", open: expanded
        )))
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
                    SectionTitle("Last 30 days")
                    Spacer()
                    Text(hits.count == 1 ? "1 limit hit" : "\(hits.count) limit hits")
                        .font(.system(size: 13)).foregroundStyle(.secondary).monospacedDigit()
                }
                // A solid baseline with a short colored bar on each day you hit a limit.
                HStack(alignment: .bottom, spacing: 3) {
                    ForEach(0..<30, id: \.self) { i in
                        if let h = days[i].first {
                            RoundedRectangle(cornerRadius: 1.5, style: .continuous).fill(Look.lab(h.lab))
                                .opacity(hoverDay == nil || hoverDay == i ? 1 : 0.45)
                                .frame(maxWidth: .infinity).frame(height: 14)
                                .contentShape(Rectangle().inset(by: -3))
                                .onHover { if $0 { hoverDay = i } }
                        } else {
                            Color.clear.frame(maxWidth: .infinity).frame(height: 14)
                        }
                    }
                }
                .frame(height: 14, alignment: .bottom)
                .overlay(alignment: .bottom) { Rectangle().fill(.primary.opacity(0.2)).frame(height: 1) }
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
            .padding(.top, 20)
        }
    }

    // What a report of this hit would hold: when it ran out, and tokens per model.
    private func hitDetail(_ h: Status.Hit) -> some View {
        let window = h.window == "5h" ? "5-hour" : Options.windows[h.window] ?? h.window
        let models = h.models ?? [:]
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
            if !models.isEmpty { ModelLines(models: models, indent: 0) }
        }
    }

    @ViewBuilder private var news: some View {
        let list = Array(model.changes.filter { $0.lab.map(model.labs.contains) ?? true }.prefix(2))
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
            .padding(.top, 20)
        }
    }

    // The site link and Share are always there; the count shows when there are new limit hits.
    private var footer: some View {
        let n = model.unsent.count
        return VStack(spacing: 0) {
            Hairline().padding(.top, 20)
            HStack(spacing: 10) {
                Button { Links.open(Links.site) } label: {
                    HStack(spacing: 3) {
                        Text("hitmylimit.com")
                        Image(systemName: "arrow.up.right").font(.system(size: 10, weight: .semibold))
                    }
                }
                .buttonStyle(.plain).font(.system(size: 13, weight: .medium)).foregroundStyle(.secondary)
                .help("Limits by plan and the full change log")
                Spacer()
                if n > 0 {
                    Text(n == 1 ? "1 new hit" : "\(n) new hits").font(.system(size: 13)).foregroundStyle(.secondary)
                }
                Button("Share") {
                    NSApp.activate(ignoringOtherApps: true)
                    openWindow(id: "share")
                }
                .inkButton()
            }
            .frame(minHeight: 28)
            .padding(.top, 12)
        }
    }
}
