import AppKit
import Foundation
import ServiceManagement

enum Links {
    static func open(_ url: URL) { NSWorkspace.shared.open(url) }
    static let limits = URL(string: "https://hitmylimit.com/limits")!
    static let site = URL(string: "https://hitmylimit.com/")!
}

@MainActor
final class Model: ObservableObject {
    @Published var status: Status?
    @Published var error: String?
    @Published var changes: [Change] = []
    @Published var loading = false

    // Settings, kept in UserDefaults.
    @Published var notifyChanges: Bool { didSet { defaults.set(notifyChanges, forKey: "notifyChanges") } }
    @Published var notifyNearLimit: Bool { didSet { defaults.set(notifyNearLimit, forKey: "notifyNearLimit") } }
    @Published var notifyResets: Bool { didSet { defaults.set(notifyResets, forKey: "notifyResets") } }
    // The providers to show and notify about: anthropic, openai, google.
    @Published var labs: Set<String> { didSet { defaults.set(Array(labs).sorted(), forKey: "labs") } }
    @Published var openAtLogin: Bool {
        didSet {
            do {
                if openAtLogin { try SMAppService.mainApp.register() } else { try SMAppService.mainApp.unregister() }
            } catch {
                self.error = "Couldn't change Open at login: \(error.localizedDescription)"
            }
        }
    }

    private let defaults = UserDefaults.standard
    private var timers: [Timer] = []
    private var seenChanges: Set<String> {
        get { Set(defaults.stringArray(forKey: "seenChanges") ?? []) }
        set { defaults.set(Array(newValue), forKey: "seenChanges") }
    }
    // One near-limit notification per window, keyed by the window's reset time.
    private var warned: Set<String> {
        get { Set(defaults.stringArray(forKey: "warned") ?? []) }
        set { defaults.set(Array(newValue.suffix(50)), forKey: "warned") }
    }

    static let shared = Model()
    private var started = false

    init() {
        let d = UserDefaults.standard
        d.register(defaults: ["notifyChanges": true, "notifyNearLimit": true, "notifyResets": true, "labs": Options.labOrder])
        labs = Set(d.stringArray(forKey: "labs") ?? Options.labOrder)
        notifyResets = d.bool(forKey: "notifyResets")
        notifyChanges = d.bool(forKey: "notifyChanges")
        notifyNearLimit = d.bool(forKey: "notifyNearLimit")
        openAtLogin = SMAppService.mainApp.status == .enabled
    }

    func start() {
        guard !started else { return }
        started = true
        if Preview.enabled {
            Task { @MainActor in Preview.show(self) }
            return
        }
        Notify.ask()
        Task { await refresh() }
        Task { await refreshFeed() }
        timers = [
            Timer.scheduledTimer(withTimeInterval: 120, repeats: true) { [weak self] _ in Task { await self?.refresh() } },
            Timer.scheduledTimer(withTimeInterval: 3 * 3600, repeats: true) { [weak self] _ in Task { await self?.refreshFeed() } },
        ]
    }

    func refresh() async {
        guard !loading else { return }
        loading = true
        defer { loading = false }
        do {
            let s = try await CLI.status()
            status = s
            error = nil
            warnNearLimit(s)
        } catch {
            self.error = error.localizedDescription
        }
    }

    func refreshFeed() async {
        guard let list = try? await Feed.fetch() else { return }
        changes = list
        let seen = seenChanges
        // On the first run everything already in the log counts as seen.
        if seen.isEmpty {
            seenChanges = Set(list.map(\.id))
            return
        }
        let new = list.filter { !seen.contains($0.id) }
        seenChanges = seen.union(new.map(\.id))
        for c in new where c.lab.map(labs.contains) ?? true {
            let lab = c.lab.flatMap { Options.labs[$0] } ?? "Change log"
            if c.isReset {
                if notifyResets { Notify.post(id: c.id, title: "\(lab): free limit reset", body: c.title, link: c.link) }
            } else if notifyChanges {
                Notify.post(id: c.id, title: "\(lab): limit change", body: c.title, link: c.link)
            }
        }
    }

    var unsent: [Status.Hit] { status?.hits.filter { !$0.sent && labs.contains($0.lab) } ?? [] }

    private var claude: Status.Claude? { labs.contains("anthropic") ? status?.claude : nil }
    private var codex: Status.Codex? { labs.contains("openai") ? status?.codex : nil }

    // How full the fullest limit is, 0 to 1, or nil when the logs don't say. A limit that's been hit counts as full.
    var usedFraction: Double? {
        guard status != nil else { return nil }
        if claude?.limited_until ?? 0 > Date().timeIntervalSince1970 * 1000 { return 1 }
        var best: Double?
        for l in codex?.limits ?? [] { best = max(best ?? 0, l.used / 100) }
        if let w = claude?.window, let typical = w.typical_at_limit, typical > 0 { best = max(best ?? 0, w.tokens / typical) }
        return best.map { min(1, $0) }
    }

    // The fullest limit, for the menu bar: Codex's own percentage, or Claude Code's tokens against past hits.
    var headline: String {
        guard status != nil else { return "" }
        var best: (Double, String)?
        for l in codex?.limits ?? [] where best == nil || l.used > best!.0 { best = (l.used, "\(Int(l.used))%") }
        if let w = claude?.window, let typical = w.typical_at_limit, typical > 0 {
            let p = 100 * w.tokens / typical
            if best == nil || p > best!.0 { best = (p, "~\(Int(p.rounded()))%") }
        }
        if claude?.limited_until ?? 0 > Date().timeIntervalSince1970 * 1000 { return "limit" }
        return best?.1 ?? ""
    }

    private func warnNearLimit(_ s: Status) {
        guard notifyNearLimit, labs.contains("openai") else { return }
        var w = warned
        for l in s.codex?.limits ?? [] where l.used >= 90 {
            let key = "codex:\(l.window):\(Int(l.resets_at ?? 0))"
            guard !w.contains(key) else { continue }
            w.insert(key)
            let when = l.resets_at.map { " It resets \(Format.when(date($0)))." } ?? ""
            Notify.post(id: key, title: "Codex \(Options.windows[l.window] ?? l.window) limit \(Int(l.used))% used", body: "Based on your Codex logs.\(when)")
        }
        warned = w
    }
}
