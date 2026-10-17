// A copy of the site's lists (src/lib/reports.ts), as in cli/src/options.js.
enum Options {
    static let plans: [String: [(String, String)]] = [
        "anthropic": [("free", "Free"), ("pro", "Pro"), ("max-5x", "Max 5x"), ("max-20x", "Max 20x"), ("team", "Team"), ("enterprise", "Enterprise"), ("other", "Other")],
        "openai": [("free", "Free"), ("go", "Go"), ("plus", "Plus"), ("pro-100", "Pro 100"), ("pro-200", "Pro 200"), ("pro-500", "Pro 500"), ("business", "Business"), ("enterprise", "Enterprise"), ("other", "Other")],
    ]
    static let products = ["claude-code": "Claude Code", "codex": "Codex"]
    static let windows = ["5h": "5-hour", "daily": "daily", "weekly": "weekly", "monthly": "monthly"]
    static let labs = ["anthropic": "Anthropic", "openai": "OpenAI", "google": "Google"]
    static let labOrder = ["anthropic", "openai", "google"]

    static func planName(_ lab: String, _ key: String?) -> String? {
        guard let key else { return nil }
        return plans[lab]?.first { $0.0 == key }?.1 ?? key
    }
}
