import SwiftUI

// Shows each new limit hit as a card to keep or leave out, asks for the plan where the logs don't have it, and
// sends only on Send. The exact JSON is one click away.
struct ShareView: View {
    @ObservedObject var model: Model
    var sample: String? = nil
    var sampleSent: SendResult? = nil

    @State private var plans: [String: String] = [:]
    @State private var picked: Set<String> = []
    @State private var raw: String?
    @State private var showRaw = false
    @State private var result: SendResult?
    @State private var error: String?
    @State private var busy = false
    @Environment(\.dismiss) private var dismiss

    private var hits: [Status.Hit] { model.unsent }
    private var chosen: [Status.Hit] { hits.filter { picked.contains($0.key) } }
    private var labsNeedingPlan: [String] { Array(Set(chosen.filter { $0.plan == nil }.map(\.lab))).sorted() }
    private var ready: Bool { !chosen.isEmpty && labsNeedingPlan.allSatisfy { !(plans[$0] ?? "").isEmpty } }

    var body: some View {
        Group {
            if let result { done(result) } else { form }
        }
        .frame(width: 460)
        .onAppear {
            plans = model.status?.plans ?? [:]
            picked = Set(hits.map(\.key))
            raw = sample
            showRaw = false
            result = sampleSent
            error = nil
        }
    }

    private var form: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 12) {
                Image(systemName: "chart.bar.xaxis.ascending")
                    .font(.system(size: 17, weight: .semibold)).foregroundStyle(.white)
                    .frame(width: 40, height: 40)
                    .background(Color.accentColor.gradient, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                VStack(alignment: .leading, spacing: 2) {
                    Text("Share your limit hits").font(.system(size: 16, weight: .semibold))
                    Text("Reports from many people show when a plan's limit gets smaller without an announcement.")
                        .font(.system(size: 12)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                }
            }

            VStack(spacing: 6) {
                ForEach(hits) { h in hitRow(h) }
            }

            ForEach(labsNeedingPlan, id: \.self) { lab in
                HStack {
                    Text("Your \(lab == "anthropic" ? "Claude" : "ChatGPT") plan").font(.system(size: 13))
                    Spacer()
                    Picker("", selection: binding(lab)) {
                        Text("Choose").tag("")
                        ForEach(Options.plans[lab] ?? [], id: \.0) { Text($0.1).tag($0.0) }
                    }
                    .labelsHidden().fixedSize()
                }
                .padding(.horizontal, 12).padding(.vertical, 8)
                .background(.primary.opacity(0.05), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            }

            privacy

            if let error { Label(error, systemImage: "exclamationmark.triangle.fill").font(.system(size: 12)).foregroundStyle(.orange) }

            HStack {
                Button("Cancel") { dismiss() }.controlSize(.large)
                Spacer()
                if busy { ProgressView().controlSize(.small) }
                Button(chosen.count == 1 ? "Send 1 report" : "Send \(chosen.count) reports") { Task { await send() } }
                    .primaryButton().keyboardShortcut(.defaultAction)
                    .disabled(busy || !ready)
            }
        }
        .padding(20)
    }

    private func hitRow(_ h: Status.Hit) -> some View {
        let on = picked.contains(h.key)
        return Button {
            if on { picked.remove(h.key) } else { picked.insert(h.key) }
            raw = nil
        } label: {
            HStack(spacing: 12) {
                Image(systemName: on ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 18)).foregroundStyle(on ? Color.accentColor : .secondary)
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Circle().fill(Look.lab(h.lab)).frame(width: 7, height: 7)
                        Text("\(Options.products[h.product] ?? h.product), \(h.window == "5h" ? "5-hour" : Options.windows[h.window] ?? h.window) limit")
                            .font(.system(size: 13, weight: .medium))
                    }
                    Text([
                        "Ran out after \(Format.duration(minutes: (h.hit - h.start) / 60000))",
                        h.tokens.map { "\(Format.tokens($0)) tokens" },
                        Format.ago(date(h.hit)),
                    ].compactMap { $0 }.joined(separator: " · "))
                    .font(.system(size: 12)).foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 12).padding(.vertical, 10)
            .background(.primary.opacity(on ? 0.06 : 0.03), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(on ? Color.accentColor.opacity(0.5) : .primary.opacity(0.06)))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private var privacy: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: "lock.shield").font(.system(size: 15)).foregroundStyle(.green)
                VStack(alignment: .leading, spacing: 3) {
                    Text("Sent: when the limit ran out, token counts, model and plan.").font(.system(size: 12))
                    Text("Never sent: prompts, code, file names or paths.").font(.system(size: 12)).foregroundStyle(.secondary)
                }
            }
            // The raw reports stay folded away: nobody needs to read them, they're there for anyone who wants to check.
            Button {
                withAnimation(.easeInOut(duration: 0.15)) { showRaw.toggle() }
                if showRaw && raw == nil { Task { await loadRaw() } }
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 10, weight: .semibold))
                        .rotationEffect(.degrees(showRaw ? 90 : 0))
                    Text("Exact data").font(.system(size: 12, weight: .medium))
                    Text("Optional, to check nothing private is sent")
                        .font(.system(size: 11)).foregroundStyle(.secondary).lineLimit(1)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(.leading, 2)
            if showRaw {
                ScrollView {
                    Text(raw ?? "Loading...").font(.system(size: 11, design: .monospaced)).textSelection(.enabled)
                        .frame(maxWidth: .infinity, alignment: .leading).padding(10)
                }
                .frame(height: 160)
                .background(.primary.opacity(0.05), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            }
        }
        .padding(12)
        .background(.primary.opacity(0.03), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private func done(_ r: SendResult) -> some View {
        VStack(spacing: 14) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 44)).foregroundStyle(.green)
                .padding(.top, 8)
            Text(r.sent == 1 ? "1 report sent. Thank you." : "\(r.sent) reports sent. Thank you.")
                .font(.system(size: 16, weight: .semibold))
            if let line = r.comparison_line, !line.isEmpty {
                Text(line).font(.system(size: 13)).foregroundStyle(.secondary)
                    .multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
            }
            HStack {
                Button("See limits by plan") { Links.open(Links.limits) }.controlSize(.large)
                Button("Done") { dismiss() }.primaryButton().keyboardShortcut(.defaultAction)
            }
            .padding(.top, 4)
        }
        .frame(maxWidth: .infinity)
        .padding(24)
    }

    private func binding(_ lab: String) -> Binding<String> {
        Binding(get: { plans[lab] ?? "" }, set: { plans[lab] = $0; raw = nil })
    }

    private var chosenPlans: [String: String] { plans.filter { labsNeedingPlan.contains($0.key) && !$0.value.isEmpty } }

    private func loadRaw() async {
        do { raw = try await CLI.preview(plans: chosenPlans, picks: chosen.map(\.key)) } catch { self.error = error.localizedDescription }
    }

    private func send() async {
        busy = true
        defer { busy = false }
        error = nil
        do {
            result = try await CLI.send(plans: chosenPlans, picks: chosen.map(\.key))
            await model.refresh()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
