import Foundation

// The JSON printed by `hitmylimit status --json` (cli/src/status.js). Times are milliseconds since 1970.
struct Status: Decodable {
    struct ClaudeWindow: Decodable {
        let start: Double
        let resets_at: Double
        let tokens: Double
        let requests: Int
        let typical_at_limit: Double?
        let past_hits: Int
    }
    struct Claude: Decodable {
        let window: ClaudeWindow?
        let limited_until: Double?
        let week_tokens: Double
        let last_used: Double
    }
    struct CodexLimit: Decodable {
        let window: String
        let used: Double
        let resets_at: Double?
    }
    struct Codex: Decodable {
        let as_of: Double
        let plan: String?
        let limits: [CodexLimit]
    }
    struct Hit: Decodable, Identifiable {
        let key: String
        let lab: String
        let product: String
        let window: String
        let start: Double
        let hit: Double
        let tokens: Double?
        let plan: String?
        let sent: Bool
        var id: String { key }
    }
    struct Side: Decodable {
        let n: Int
        let tokens: Double?
        let minutes: Double?
    }
    struct Trend: Decodable, Identifiable {
        let lab: String
        let window: String
        let recent: Side
        let earlier: Side
        var id: String { "\(lab):\(window)" }
    }
    struct Unread: Decodable {
        let claude: Int
        let codex: Int
    }

    let generated_at: Double
    let claude: Claude?
    let codex: Codex?
    let hits: [Hit]
    let trend: [Trend]
    let plans: [String: String]
    let unread: Unread
}

// What `hitmylimit --json --dry-run` and `--json --yes` print.
struct SendResult: Decodable {
    let sent: Int
    let duplicate: Bool?
    let comparison_line: String?
}

func date(_ ms: Double) -> Date { Date(timeIntervalSince1970: ms / 1000) }
