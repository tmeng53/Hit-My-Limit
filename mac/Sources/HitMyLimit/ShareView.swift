import SwiftUI

// Asks for the plan where the logs don't have it, shows the exact reports, and sends them only on Send.
struct ShareView: View {
    @ObservedObject var model: Model
    var sample: String? = nil
    @State private var plans: [String: String] = [:]
    @State private var preview: String?
    @State private var result: String?
    @State private var error: String?
    @State private var busy = false
    @Environment(\.dismiss) private var dismiss

    private var labsNeedingPlan: [String] {
        Array(Set(model.unsent.filter { $0.plan == nil }.map(\.lab))).sorted()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 10) {
                Image(systemName: "square.and.arrow.up.fill")
                    .font(.system(size: 14, weight: .semibold)).foregroundStyle(.white)
                    .frame(width: 30, height: 30)
                    .background(Color.accentColor.gradient, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                VStack(alignment: .leading, spacing: 1) {
                    Text("Share \(model.unsent.count) new limit \(model.unsent.count == 1 ? "hit" : "hits")").font(.system(size: 15, weight: .semibold))
                    Text("Sent to hitmylimit.com only when you press Send.").font(.system(size: 12)).foregroundStyle(.secondary)
                }
            }
            Text("Each report says when the limit ran out, how many tokens it took and which plan you were on. No prompts, code, file names or paths.")
                .font(.system(size: 12)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)

            ForEach(labsNeedingPlan, id: \.self) { lab in
                Picker("\(lab == "anthropic" ? "Claude" : "ChatGPT") plan", selection: binding(lab)) {
                    Text("Choose").tag("")
                    ForEach(Options.plans[lab] ?? [], id: \.0) { Text($0.1).tag($0.0) }
                }
                .frame(width: 260)
            }

            if let preview {
                ScrollView {
                    Text(preview).font(.system(size: 11, design: .monospaced)).textSelection(.enabled)
                        .frame(maxWidth: .infinity, alignment: .leading).padding(10)
                }
                .frame(height: 220)
                .background(.primary.opacity(0.05), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            }
            if let error { Label(error, systemImage: "exclamationmark.triangle.fill").font(.system(size: 12)).foregroundStyle(.orange) }
            if let result { Label(result, systemImage: "checkmark.circle.fill").font(.system(size: 12)).foregroundStyle(.green).fixedSize(horizontal: false, vertical: true) }

            HStack {
                Button(result == nil ? "Cancel" : "Close") { dismiss() }.controlSize(.large)
                Spacer()
                Button(preview == nil ? "Show the data" : "Refresh the data") { Task { await run(send: false) } }
                    .controlSize(.large).disabled(busy || !ready)
                Button("Send") { Task { await run(send: true) } }
                    .primaryButton().keyboardShortcut(.defaultAction)
                    .disabled(busy || !ready || preview == nil || result != nil)
            }
        }
        .padding(20)
        .frame(width: 480)
        .onAppear {
            plans = model.status?.plans ?? [:]
            preview = sample
            result = nil
            error = nil
        }
    }

    private var ready: Bool { labsNeedingPlan.allSatisfy { !(plans[$0] ?? "").isEmpty } }

    private func binding(_ lab: String) -> Binding<String> {
        Binding(get: { plans[lab] ?? "" }, set: { plans[lab] = $0; preview = nil })
    }

    private func run(send: Bool) async {
        busy = true
        defer { busy = false }
        error = nil
        let chosen = plans.filter { labsNeedingPlan.contains($0.key) && !$0.value.isEmpty }
        do {
            if send {
                let r = try await CLI.send(plans: chosen, pick: nil)
                result = "Sent \(r.sent) \(r.sent == 1 ? "report" : "reports"). Thank you. \(r.comparison_line ?? "")"
                await model.refresh()
            } else {
                preview = try await CLI.preview(plans: chosen, pick: nil)
            }
        } catch {
            self.error = error.localizedDescription
        }
    }
}
