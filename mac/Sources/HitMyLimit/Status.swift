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
        let models: [String: ModelTokens]?
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
        // Tokens per model since the open 5-hour window started.
        let window_start: Double?
        let models: [String: ModelTokens]?
        let limits: [CodexLimit]
    }
    struct ModelTokens: Decodable {
        let total: Double
        let input: Double
        let output: Double
        let cache_read: Double
        let cache_write: Double
    }
    struct Hit: Decodable, Identifiable {
        let key: String
        let lab: String
        let product: String
        let window: String
        let start: Double
        let hit: Double
        let tokens: Double?
        let models: [String: ModelTokens]?
        let requests: Int?
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

// What `hitmylimit --json --yes` prints. `comparison` is the site's answer for the last report sent; `bins`
// (reports per `bin_minutes` of time to the limit, from 0) and `median_minutes` are there when the site sends them.
struct SendResult: Decodable {
    struct Comparison: Decodable {
        let percent: Int?
        let n: Int
        let sameWork: Bool?
        let median_minutes: Double?
        let bins: [Int]?
        let bin_minutes: Double?
    }
    struct Report: Decodable {
        let lab: String
        let plan: String
        let window: String
        let minutes_to_limit: Double
    }
    let sent: Int
    let duplicate: Bool?
    let comparison: Comparison?
    let comparison_line: String?
    let reports: [Report]?
}

func date(_ ms: Double) -> Date { Date(timeIntervalSince1970: ms / 1000) }
