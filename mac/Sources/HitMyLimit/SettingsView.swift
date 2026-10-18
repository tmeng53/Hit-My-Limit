import SwiftUI

// Settings, shown inside the panel in place of the usage view.
struct SettingsView: View {
    @ObservedObject var model: Model

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            section("Providers") {
                toggle("Anthropic: Claude Code", lab("anthropic"))
                toggle("OpenAI: Codex", lab("openai"))
                toggle("Google: Gemini", lab("google"))
                note("Gemini: news only for now.")
            }
            section("Notifications") {
                toggle("Limit changes", $model.notifyChanges)
                toggle("Free limit resets", $model.notifyResets)
                toggle("At 90% of a limit", $model.notifyNearLimit)
            }
            section("General") {
                toggle("Open at login", $model.openAtLogin)
            }
            section("Privacy") {
                row("Reads", "Claude Code and Codex logs")
                    .help("~/.claude/projects (or ~/.config/claude/projects) and ~/.codex/sessions")
                row("Never reads", "logins, API keys, cookies")
                row("Where", "on this Mac only")
                note("Nothing leaves this Mac unless you share a limit hit.")
            }
            Hairline().padding(.top, 16)
            HStack {
                Button("Limits by plan") { Links.open(Links.limits) }
                Spacer()
                Button("Quit Hit My Limit") { NSApp.terminate(nil) }
            }
            .buttonStyle(.plain).font(.system(size: 13)).foregroundStyle(.secondary)
            .padding(.top, 12)
            Text("Version \(Self.version)").font(.system(size: 11)).foregroundStyle(.tertiary).textSelection(.enabled)
                .padding(.top, 8)
        }
    }

    static var version: String {
        let info = Bundle.main.infoDictionary
        return "\(info?["CFBundleShortVersionString"] as? String ?? "?") (\(info?["CFBundleVersion"] as? String ?? "?"))"
    }

    private func section<C: View>(_ title: String, @ViewBuilder _ content: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionTitle(title)
            content()
        }
        .padding(.top, 16)
    }

    private func toggle(_ title: String, _ on: Binding<Bool>) -> some View {
        Toggle(isOn: on) { Text(title).font(.system(size: 13)).frame(maxWidth: .infinity, alignment: .leading) }
            .toggleStyle(.switch).controlSize(.mini)
    }

    private func row(_ title: String, _ value: String) -> some View {
        HStack {
            Text(title).font(.system(size: 13))
            Spacer()
            Text(value).font(.system(size: 12)).foregroundStyle(.secondary)
        }
    }

    private func note(_ text: String) -> some View {
        Text(text).font(.system(size: 11)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
    }

    private func lab(_ key: String) -> Binding<Bool> {
        Binding(get: { model.labs.contains(key) }, set: { on in
            if on { model.labs.insert(key) } else { model.labs.remove(key) }
        })
    }
}
