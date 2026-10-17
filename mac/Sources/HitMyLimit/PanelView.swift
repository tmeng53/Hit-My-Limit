import AppKit
import SwiftUI

struct PanelView: View {
    @ObservedObject var model: Model
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            header
            if let e = model.error { Text(e).foregroundColor(Look.minus).fixedSize(horizontal: false, vertical: true) }
            if let s = model.status {
                if s.claude == nil && s.codex == nil {
                    Text("No Claude Code or Codex logs from the last 30 days on this Mac.").foregroundColor(Look.muted)
                }
                if let c = s.claude { claude(c) }
                if let x = s.codex { codex(x) }
                if !s.trend.isEmpty { trend(s.trend) }
                if !s.hits.isEmpty { hits(s.hits) }
            } else if model.error == nil {
                Text("Reading logs...").foregroundColor(Look.muted)
            }
            if !model.changes.isEmpty { changes }
            share
            Divider()
            footer
        }
        .font(Look.font)
        .padding(14)
        .frame(width: 380)
    }

    private var header: some View {
        HStack {
            Text("hitmylimit").font(Look.bold)
            Spacer()
            if let s = model.status { Text("updated \(Format.when(date(s.generated_at)))").foregroundColor(Look.muted).font(Look.small) }
        }
    }

    private func section(_ title: String) -> some View {
        Text(title).font(Look.bold)
    }

    private func row(_ label: String, _ value: String, _ note: String? = nil) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(label.padding(toLength: 8, withPad: " ", startingAt: 0))
            Text(value)
            Spacer(minLength: 0)
            if let note { Text(note).foregroundColor(Look.muted) }
        }
    }

    private func claude(_ c: Status.Claude) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            section("Claude Code")
            if let until = c.limited_until, until > Date().timeIntervalSince1970 * 1000 {
                row("limit", "reached", "resets \(Format.when(date(until)))").foregroundColor(Look.minus)
            }
            if let w = c.window {
                row("5-hour", "\(Format.tokens(w.tokens)) tokens", "resets \(Format.when(date(w.resets_at)))")
                if let typical = w.typical_at_limit, typical > 0 {
                    Text("        ~\(Int((100 * w.tokens / typical).rounded()))% of the \(Format.tokens(typical)) you used before hitting it (\(w.past_hits) \(w.past_hits == 1 ? "time" : "times"))")
                        .foregroundColor(Look.muted).font(Look.small).fixedSize(horizontal: false, vertical: true)
                }
            } else {
                row("5-hour", "no open window")
            }
            row("7 days", "\(Format.tokens(c.week_tokens)) tokens")
        }
    }

    private func codex(_ x: Status.Codex) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack {
                section("Codex")
                if let p = Options.planName("openai", x.plan) { Text(p).foregroundColor(Look.muted) }
            }
            ForEach(x.limits, id: \.window) { l in
                row(Options.windows[l.window] ?? l.window, "\(Format.bar(l.used)) \(Int(l.used))%", l.resets_at.map { "resets \(Format.when(date($0)))" })
                    .foregroundColor(l.used >= 90 ? Look.minus : .primary)
            }
            Text("as of \(Format.when(date(x.as_of))), from Codex's own logs").foregroundColor(Look.muted).font(Look.small)
        }
    }

    // − fewer tokens before the limit than before, + more, · about the same.
    private func trend(_ list: [Status.Trend]) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            section("Tokens before you hit the limit")
            ForEach(list) { t in
                let recent = t.recent.tokens ?? 0, earlier = t.earlier.tokens ?? 0
                let ratio = earlier > 0 ? recent / earlier : 1
                let sign = ratio < 0.85 ? "−" : ratio > 1.15 ? "+" : "·"
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(sign).foregroundColor(sign == "−" ? Look.minus : sign == "+" ? Look.plus : Look.muted)
                    Text("\(t.lab == "anthropic" ? "Claude Code" : "Codex") \(Options.windows[t.window] ?? t.window): \(Format.tokens(recent)) this week, \(Format.tokens(earlier)) before")
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Text("Medians of your own hits: \(list.map { "\($0.recent.n) vs \($0.earlier.n)" }.joined(separator: ", ")).")
                .foregroundColor(Look.muted).font(Look.small)
        }
    }

    private func hits(_ list: [Status.Hit]) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            section("Your limit hits, last 30 days")
            ForEach(list.prefix(5)) { h in
                HStack(spacing: 8) {
                    Text(Format.day(date(h.hit)))
                    Text("\(Options.products[h.product] ?? h.product) \(Options.windows[h.window] ?? h.window)")
                    Spacer(minLength: 0)
                    Text(Format.duration(minutes: (h.hit - h.start) / 60000)).foregroundColor(Look.muted)
                    Text(h.sent ? "sent" : "new").foregroundColor(h.sent ? Look.muted : Look.plus)
                }
            }
            if list.count > 5 { Text("and \(list.count - 5) more").foregroundColor(Look.muted).font(Look.small) }
        }
    }

    private var changes: some View {
        VStack(alignment: .leading, spacing: 3) {
            section("Change log")
            ForEach(model.changes.prefix(3)) { c in
                Button {
                    if let l = c.link { Links.open(l) }
                } label: {
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        Text(c.date.map(Format.day) ?? "").foregroundColor(Look.muted)
                        Text("\(c.lab.flatMap { Options.labs[$0] }.map { "\($0): " } ?? "")\(c.title)")
                            .multilineTextAlignment(.leading)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .buttonStyle(.plain)
            }
        }
    }

    @ViewBuilder private var share: some View {
        let n = model.unsent.count
        if n > 0 {
            VStack(alignment: .leading, spacing: 4) {
                Button("Share \(n) new \(n == 1 ? "hit" : "hits") with hitmylimit.com") {
                    NSApp.activate(ignoringOtherApps: true)
                    openWindow(id: "share")
                }
                Text("Optional. Reports from many people show when a plan's limit gets smaller without an announcement. You see the exact data first.")
                    .foregroundColor(Look.muted).font(Look.small).fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private var footer: some View {
        VStack(alignment: .leading, spacing: 4) {
            Toggle("Notify me when a lab changes its limits", isOn: $model.notifyChanges)
            Toggle("Notify me at 90% of a Codex limit", isOn: $model.notifyNearLimit)
            Toggle("Open at login", isOn: $model.openAtLogin)
            HStack {
                Button("Refresh") { Task { await model.refresh(); await model.refreshFeed() } }
                Button("Limits by plan") { Links.open(Links.limits) }
                Spacer()
                Button("Quit") { NSApp.terminate(nil) }
            }
            .padding(.top, 4)
        }
        .toggleStyle(.checkbox)
        .font(Look.small)
    }
}
