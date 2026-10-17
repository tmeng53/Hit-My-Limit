import AppKit
import SwiftUI

struct PanelView: View {
    @ObservedObject var model: Model
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            header
            if let e = model.error { errorCard(e) }
            if let s = model.status {
                if s.claude == nil && s.codex == nil { empty }
                if let c = s.claude { claude(c) }
                if let x = s.codex { codex(x) }
                if let t = s.trend.first(where: { ratio($0) < 0.85 }) ?? s.trend.first { trend(t) }
                if !s.hits.isEmpty { hits(s.hits) }
            } else if model.error == nil {
                ProgressView().controlSize(.small).frame(maxWidth: .infinity).padding(20)
            }
            if !model.changes.isEmpty { changes }
            share
        }
        .padding(12)
        .frame(width: 340)
    }

    private var header: some View {
        HStack(spacing: 8) {
            Image(nsImage: NSApp.applicationIconImage)
                .resizable()
                .frame(width: 28, height: 28)
            VStack(alignment: .leading, spacing: 0) {
                Text("Hit My Limit").font(.system(size: 13, weight: .semibold))
                if let s = model.status {
                    Text("Updated \(Format.when(date(s.generated_at)))").font(.system(size: 11)).foregroundStyle(.secondary)
                }
            }
            Spacer()
            Button { Task { await model.refresh(); await model.refreshFeed() } } label: {
                Image(systemName: "arrow.clockwise").font(.system(size: 12, weight: .medium)).frame(width: 18, height: 18)
            }
            .iconButton().help("Refresh")
            Button { NSApp.activate(ignoringOtherApps: true); openWindow(id: "settings") } label: {
                Image(systemName: "gearshape").font(.system(size: 12, weight: .medium)).frame(width: 18, height: 18)
            }
            .iconButton().help("Settings")
        }
        .padding(.horizontal, 4)
        .padding(.bottom, 2)
    }

    private func errorCard(_ e: String) -> some View {
        Card {
            Label(e, systemImage: "exclamationmark.triangle.fill")
                .font(.system(size: 12))
                .foregroundStyle(.orange)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var empty: some View {
        Card {
            Text("No Claude Code or Codex use on this Mac in the last 30 days.")
                .font(.system(size: 12)).foregroundStyle(.secondary)
        }
    }

    private func claude(_ c: Status.Claude) -> some View {
        Card {
            CardHeader(symbol: "terminal.fill", title: "Claude Code", tint: Look.claude, badge: Options.planName("anthropic", model.status?.plans["anthropic"]))
            if let until = c.limited_until, until > Date().timeIntervalSince1970 * 1000 {
                Label("Limit reached. Resets \(Format.until(date(until))).", systemImage: "hourglass")
                    .font(.system(size: 12, weight: .medium)).foregroundStyle(.red)
            }
            if let w = c.window {
                HStack(spacing: 12) {
                    if let typical = w.typical_at_limit, typical > 0 {
                        let p = 100 * w.tokens / typical
                        Ring(fraction: p / 100, tint: p >= 90 ? .red : Look.claude, label: "\(Int(p.rounded()))%")
                    }
                    VStack(alignment: .leading, spacing: 2) {
                        Text("5-hour window").font(.system(size: 11)).foregroundStyle(.secondary)
                        Text("\(Format.tokens(w.tokens)) tokens")
                            .font(.system(size: 20, weight: .semibold, design: .rounded)).monospacedDigit()
                        Text("Resets \(Format.until(date(w.resets_at)))").font(.system(size: 11)).foregroundStyle(.secondary)
                    }
                    Spacer(minLength: 0)
                }
                if let typical = w.typical_at_limit, typical > 0 {
                    Text("\(Int((100 * w.tokens / typical).rounded()))% of the \(Format.tokens(typical)) tokens you usually reach before this limit. Claude app use isn't counted.")
                        .font(.system(size: 11)).foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            } else {
                Text("No 5-hour window open.").font(.system(size: 12)).foregroundStyle(.secondary)
            }
            HStack {
                Text("Last 7 days").font(.system(size: 12)).foregroundStyle(.secondary)
                Spacer()
                Text("\(Format.tokens(c.week_tokens)) tokens").font(.system(size: 12, weight: .medium)).monospacedDigit()
            }
        }
    }

    private func codex(_ x: Status.Codex) -> some View {
        Card {
            CardHeader(symbol: "chevron.left.forwardslash.chevron.right", title: "Codex", tint: Look.codex, badge: Options.planName("openai", x.plan))
            ForEach(x.limits, id: \.window) { l in
                Meter(
                    title: l.window == "5h" ? "5-hour" : (Options.windows[l.window] ?? l.window).capitalized,
                    percent: l.used,
                    detail: l.resets_at.map { "resets \(Format.until(date($0)))" }
                )
            }
        }
    }

    private func ratio(_ t: Status.Trend) -> Double {
        guard let r = t.recent.tokens, let e = t.earlier.tokens, e > 0 else { return 1 }
        return r / e
    }

    // Fewer tokens before the limit this week than before is what a quiet cut looks like.
    private func trend(_ t: Status.Trend) -> some View {
        let r = ratio(t)
        let down = r < 0.85, up = r > 1.15
        let name = t.lab == "anthropic" ? "Claude Code" : "Codex"
        let change = Int((abs(1 - r) * 100).rounded())
        return Card {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: down ? "arrow.down.right" : up ? "arrow.up.right" : "equal")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(down ? Look.minus : up ? Look.plus : .secondary)
                    .frame(width: 26, height: 26)
                    .background((down ? Look.minus : up ? Look.plus : Color.secondary).opacity(0.14), in: Circle())
                VStack(alignment: .leading, spacing: 3) {
                    Text(down ? "\(name) limit came \(change)% sooner" : up ? "\(name) limit came \(change)% later" : "\(name) limit about the same")
                        .font(.system(size: 12, weight: .semibold))
                    Text("This week you hit it at \(Format.tokens(t.recent.tokens ?? 0)) tokens, before at \(Format.tokens(t.earlier.tokens ?? 0)). From \(t.recent.n + t.earlier.n) of your own hits.")
                        .font(.system(size: 11)).foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }

    private func hits(_ list: [Status.Hit]) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            SectionTitle(text: "Limit hits")
            ForEach(list.prefix(4)) { h in
                HStack(spacing: 8) {
                    Circle().fill(Look.lab(h.lab)).frame(width: 7, height: 7)
                    Text(Options.products[h.product] ?? h.product).font(.system(size: 12)).lineLimit(1)
                    Text("\(h.window == "5h" ? "5-hour" : Options.windows[h.window] ?? h.window) · \(Format.duration(minutes: (h.hit - h.start) / 60000))")
                        .font(.system(size: 11)).foregroundStyle(.secondary).lineLimit(1)
                    Spacer(minLength: 4)
                    Text(Format.ago(date(h.hit))).font(.system(size: 11)).foregroundStyle(.secondary).lineLimit(1)
                }
                .padding(.horizontal, 8).padding(.vertical, 4)
            }
        }
    }

    private var changes: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                SectionTitle(text: "Limit changes and resets")
                Spacer()
                Button("All") { Links.open(Links.site) }.buttonStyle(.link).font(.system(size: 11)).padding(.trailing, 4)
            }
            .padding(.bottom, 2)
            ForEach(model.changes.prefix(3)) { c in
                HoverRow(action: { Links.open(c.link ?? Links.site) }) {
                    VStack(alignment: .leading, spacing: 1) {
                        HStack(spacing: 5) {
                            Text(c.lab.flatMap { Options.labs[$0] } ?? "Change")
                                .font(.system(size: 10, weight: .semibold)).foregroundStyle(Look.lab(c.lab))
                            if c.isReset {
                                Text("Free reset")
                                    .font(.system(size: 9, weight: .semibold))
                                    .padding(.horizontal, 5).padding(.vertical, 1)
                                    .background(Look.plus.opacity(0.15), in: Capsule())
                                    .foregroundStyle(Look.plus)
                            }
                            if let d = c.date { Text(Format.ago(d)).font(.system(size: 10)).foregroundStyle(.tertiary) }
                        }
                        Text(c.title).font(.system(size: 12)).lineLimit(2).multilineTextAlignment(.leading)
                    }
                }
            }
        }
    }

    @ViewBuilder private var share: some View {
        let n = model.unsent.count
        if n > 0 {
            VStack(spacing: 6) {
                Button {
                    NSApp.activate(ignoringOtherApps: true)
                    openWindow(id: "share")
                } label: {
                    Text("Share \(n) new limit \(n == 1 ? "hit" : "hits")").frame(maxWidth: .infinity)
                }
                .primaryButton()
                Text("Optional. Reports from many people show when a plan's limit shrinks without an announcement.")
                    .font(.system(size: 11)).foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.top, 4)
        }
    }
}
