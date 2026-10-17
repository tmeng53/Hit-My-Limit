import Foundation

// Runs the hitmylimit command-line tool that ships inside the app (Contents/Resources/cli), so the app reads
// the logs with exactly the same code as `npx hitmylimit`.
enum CLI {
    struct Failure: LocalizedError {
        let message: String
        var errorDescription: String? { message }
    }

    static var script: URL? {
        Bundle.main.resourceURL?.appendingPathComponent("cli/bin/hitmylimit.js")
    }

    static let minimum = [18, 17]

    // Apps opened from Finder don't get the shell's PATH, so look where Node is usually installed, ask a login
    // shell too, and use the newest one. An old Node elsewhere on the Mac is skipped.
    private static var found: URL?
    private static let lock = NSLock()

    // Remembered once found; looked up again on each try until then, so installing Node and refreshing works.
    static func node() -> Result<URL, Failure> {
        lock.lock()
        defer { lock.unlock() }
        if let found { return .success(found) }
        let r = lookup()
        if case .success(let url) = r { found = url }
        return r
    }

    private static func lookup() -> Result<URL, Failure> {
        let fm = FileManager.default
        let home = fm.homeDirectoryForCurrentUser.path
        var candidates = ["/opt/homebrew/bin/node", "/usr/local/bin/node", "\(home)/.volta/bin/node", "\(home)/.local/bin/node", "/usr/bin/node"]
        // Version managers keep one folder per version.
        for (dir, bin) in [
            ("\(home)/.nvm/versions/node", "bin/node"),
            ("\(home)/.fnm/node-versions", "installation/bin/node"),
            ("\(home)/Library/Application Support/fnm/node-versions", "installation/bin/node"),
            ("\(home)/.asdf/installs/nodejs", "bin/node"),
            ("\(home)/.local/share/mise/installs/node", "bin/node"),
            ("/usr/local/n/versions/node", "bin/node"),
        ] {
            for v in (try? fm.contentsOfDirectory(atPath: dir)) ?? [] { candidates.append("\(dir)/\(v)/\(bin)") }
        }
        if let shell = output("/bin/zsh", ["-lc", "command -v node"]), shell.hasPrefix("/") { candidates.append(shell) }

        var best: (URL, [Int])?
        var old: (String, String)?
        for path in Set(candidates) where fm.isExecutableFile(atPath: path) {
            guard let v = output(path, ["-p", "process.versions.node"]) else { continue }
            let parts = v.split(separator: ".").compactMap { Int($0) }
            if parts.lexicographicallyPrecedes(minimum) { old = (v, path); continue }
            if best == nil || best!.1.lexicographicallyPrecedes(parts) { best = (URL(fileURLWithPath: path), parts) }
        }
        if let best { return .success(best.0) }
        if let old {
            return .failure(Failure(message: "Hit My Limit needs Node.js 18.17 or later, and the newest one on this Mac is \(old.0). Install the current version from nodejs.org, then click the time at the top to try again."))
        }
        return .failure(Failure(message: "Hit My Limit needs Node.js for now. Install it from nodejs.org, then click the time at the top to try again."))
    }

    private static func output(_ exe: String, _ args: [String]) -> String? {
        let p = Process()
        p.executableURL = URL(fileURLWithPath: exe)
        p.arguments = args
        let out = Pipe()
        p.standardOutput = out
        p.standardError = Pipe()
        do { try p.run() } catch { return nil }
        let data = out.fileHandleForReading.readDataToEndOfFile()
        p.waitUntilExit()
        guard p.terminationStatus == 0 else { return nil }
        let s = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return s.isEmpty ? nil : s.components(separatedBy: "\n").last
    }

    static func run(_ args: [String]) async throws -> Data {
        let node = try CLI.node().get()
        guard let script else { throw Failure(message: "The app is missing its copy of the hitmylimit tool.") }
        return try await withCheckedThrowingContinuation { cont in
            DispatchQueue.global(qos: .utility).async {
                let p = Process()
                p.executableURL = node
                p.arguments = [script.path] + args
                var env = ProcessInfo.processInfo.environment
                env["NO_COLOR"] = "1"
                p.environment = env
                let out = Pipe(), err = Pipe()
                p.standardOutput = out
                p.standardError = err
                do { try p.run() } catch { return cont.resume(throwing: error) }
                // Read before waiting, so a large output can't fill the pipe and stall the tool.
                let data = out.fileHandleForReading.readDataToEndOfFile()
                let errData = err.fileHandleForReading.readDataToEndOfFile()
                p.waitUntilExit()
                if p.terminationStatus == 0 { return cont.resume(returning: data) }
                let msg = (String(data: errData, encoding: .utf8) ?? "")
                    .replacingOccurrences(of: "hitmylimit: ", with: "")
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                cont.resume(throwing: Failure(message: msg.isEmpty ? "The hitmylimit tool exited with \(p.terminationStatus)" : msg))
            }
        }
    }

    static func status() async throws -> Status {
        try JSONDecoder().decode(Status.self, from: try await run(["status", "--json"]))
    }

    static func planArgs(_ plans: [String: String]) -> [String] {
        plans.sorted { $0.key < $1.key }.flatMap { ["--plan", "\($0.key)=\($0.value)"] }
    }

    // The exact reports that would be sent, pretty-printed for showing.
    static func preview(plans: [String: String], picks: [String]) async throws -> String {
        let args = ["--json", "--dry-run"] + planArgs(plans) + picks.flatMap { ["--pick", $0] }
        let data = try await run(args)
        let obj = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        let reports = obj?["reports"] ?? []
        let pretty = try JSONSerialization.data(withJSONObject: reports, options: [.prettyPrinted, .sortedKeys])
        return String(data: pretty, encoding: .utf8) ?? ""
    }

    static func send(plans: [String: String], picks: [String]) async throws -> SendResult {
        let args = ["--json", "--yes"] + planArgs(plans) + picks.flatMap { ["--pick", $0] }
        return try JSONDecoder().decode(SendResult.self, from: try await run(args))
    }
}
