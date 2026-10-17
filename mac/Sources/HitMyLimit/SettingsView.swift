import SwiftUI

struct SettingsView: View {
    @ObservedObject var model: Model

    var body: some View {
        Form {
            Section("Notifications") {
                Toggle("When a lab changes its usage limits", isOn: $model.notifyChanges)
                Toggle("At 90% of a Codex limit", isOn: $model.notifyNearLimit)
            }
            Section {
                Toggle("Open at login", isOn: $model.openAtLogin)
            }
            Section {
                LabeledContent("Reads") { Text("~/.claude/projects, ~/.codex/sessions").foregroundStyle(.secondary) }
                LabeledContent("Never reads") { Text("logins, keys, browser cookies").foregroundStyle(.secondary) }
                HStack {
                    Button("Limits by plan") { Links.open(Links.limits) }
                    Spacer()
                    Button("Quit Hit My Limit") { NSApp.terminate(nil) }
                }
            }
        }
        .formStyle(.grouped)
        .frame(width: 420)
        .fixedSize()
    }
}
