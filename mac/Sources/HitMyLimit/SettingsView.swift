import SwiftUI

struct SettingsView: View {
    @ObservedObject var model: Model

    var body: some View {
        Form {
            Section {
                Toggle("Anthropic: Claude Code", isOn: lab("anthropic"))
                Toggle("OpenAI: Codex", isOn: lab("openai"))
                Toggle("Google: Gemini", isOn: lab("google"))
            } header: {
                Text("Providers")
            } footer: {
                Text("Turned-off providers are hidden in the panel and send no notifications. For Gemini, only limit changes and free resets for now.")
                    .font(.system(size: 11)).foregroundStyle(.secondary)
            }
            Section("Notifications") {
                Toggle("When a lab changes its usage limits", isOn: $model.notifyChanges)
                Toggle("When a lab gives out a free limit reset", isOn: $model.notifyResets)
                Toggle("At 90% of a limit (Codex only)", isOn: $model.notifyNearLimit)
            }
            Section {
                Toggle("Open at login", isOn: $model.openAtLogin)
            }
            Section("Privacy") {
                LabeledContent("Reads") { Text("~/.claude/projects, ~/.codex/sessions").foregroundStyle(.secondary) }
                LabeledContent("Never reads") { Text("logins, keys, browser cookies").foregroundStyle(.secondary) }
            }
            HStack {
                Button("Limits by plan") { Links.open(Links.limits) }
                Spacer()
                Button("Quit Hit My Limit") { NSApp.terminate(nil) }
            }
            .padding(.horizontal, 10)
        }
        .formStyle(.grouped)
        .frame(width: 420)
        .fixedSize()
    }

    private func lab(_ key: String) -> Binding<Bool> {
        Binding(get: { model.labs.contains(key) }, set: { on in
            if on { model.labs.insert(key) } else { model.labs.remove(key) }
        })
    }
}
