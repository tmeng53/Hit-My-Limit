import SwiftUI

// Asks for the plan where the logs don't have it, shows the exact reports, and sends them only on Send.
struct ShareView: View {
    @ObservedObject var model: Model
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
        VStack(alignment: .leading, spacing: 12) {
            Text("Share \(model.unsent.count) new limit \(model.unsent.count == 1 ? "hit" : "hits")").font(Look.bold)
            Text("Each report says when the limit ran out, how many tokens it took, and which plan you were on. No prompts, code, file names or paths. You can read every field below before sending.")
                .foregroundColor(Look.muted).fixedSize(horizontal: false, vertical: true)

            ForEach(labsNeedingPlan, id: \.self) { lab in
                Picker("\(lab == "anthropic" ? "Claude" : "ChatGPT") plan", selection: binding(lab)) {
                    Text("choose").tag("")
                    ForEach(Options.plans[lab] ?? [], id: \.0) { Text($0.1).tag($0.0) }
                }
                .frame(width: 280)
            }

            if let preview {
                ScrollView {
                    Text(preview).font(Look.small).textSelection(.enabled).frame(maxWidth: .infinity, alignment: .leading)
                }
                .frame(height: 260)
                .border(Color.secondary.opacity(0.3))
            }
            if let error { Text(error).foregroundColor(Look.minus).fixedSize(horizontal: false, vertical: true) }
            if let result { Text(result).foregroundColor(Look.plus).fixedSize(horizontal: false, vertical: true) }

            HStack {
                Button("Show the data") { Task { await run(send: false) } }.disabled(busy || !ready)
                Button("Send") { Task { await run(send: true) } }.disabled(busy || !ready || preview == nil || result != nil)
                    .keyboardShortcut(.defaultAction)
                Spacer()
                Button(result == nil ? "Cancel" : "Close") { dismiss() }
            }
        }
        .font(Look.font)
        .padding(18)
        .frame(width: 520)
        .onAppear {
            plans = model.status?.plans ?? [:]
            preview = nil
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
