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
                Toggle("At 90% of a limit", isOn: $model.notifyNearLimit)
            }
            Section {
                Toggle("Open at login", isOn: $model.openAtLogin)
            }
            Section("Privacy") {
                LabeledContent("Reads") {
                    Text("Claude Code and Codex logs").foregroundStyle(.secondary)
                        .help("~/.claude/projects (or ~/.config/claude/projects) and ~/.codex/sessions")
                }
                LabeledContent("Never reads") { Text("logins, API keys, browser cookies").foregroundStyle(.secondary) }
                LabeledContent("Where") { Text("On this Mac. Nothing leaves it unless you share.").foregroundStyle(.secondary) }
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
