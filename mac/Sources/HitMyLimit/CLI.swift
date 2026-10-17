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

    // Apps opened from Finder don't get the shell's PATH, so look where Node is usually installed.
    static let node: URL? = {
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        var candidates = ["/opt/homebrew/bin/node", "/usr/local/bin/node", "\(home)/.volta/bin/node", "\(home)/.local/bin/node"]
        let nvm = "\(home)/.nvm/versions/node"
        if let versions = try? FileManager.default.contentsOfDirectory(atPath: nvm) {
            candidates += versions.sorted { $0.compare($1, options: .numeric) == .orderedDescending }.map { "\(nvm)/\($0)/bin/node" }
        }
        if let found = candidates.first(where: { FileManager.default.isExecutableFile(atPath: $0) }) {
            return URL(fileURLWithPath: found)
        }
        // Last try: ask a login shell.
        let p = Process()
        p.executableURL = URL(fileURLWithPath: "/bin/zsh")
        p.arguments = ["-lc", "command -v node"]
        let out = Pipe()
        p.standardOutput = out
        p.standardError = Pipe()
        try? p.run()
        p.waitUntilExit()
        let path = String(data: out.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8)?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return path.isEmpty ? nil : URL(fileURLWithPath: path)
    }()

    static func run(_ args: [String]) async throws -> Data {
        guard let node else { throw Failure(message: "Node.js is needed for now. Install it from nodejs.org or with Homebrew.") }
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
    static func preview(plans: [String: String], pick: String?) async throws -> String {
        var args = ["--json", "--dry-run"] + planArgs(plans)
        if let pick { args += ["--pick", pick] }
        let data = try await run(args)
        let obj = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        let reports = obj?["reports"] ?? []
        let pretty = try JSONSerialization.data(withJSONObject: reports, options: [.prettyPrinted, .sortedKeys])
        return String(data: pretty, encoding: .utf8) ?? ""
    }

    static func send(plans: [String: String], pick: String?) async throws -> SendResult {
        var args = ["--json", "--yes"] + planArgs(plans)
        if let pick { args += ["--pick", pick] }
        return try JSONDecoder().decode(SendResult.self, from: try await run(args))
    }
}
