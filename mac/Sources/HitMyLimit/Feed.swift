import Foundation

// The hitmylimit.com change log, read from its RSS feed.
struct Change: Identifiable, Codable, Equatable {
    let id: String
    let lab: String?
    let title: String
    let link: URL?
    let date: Date?
}

final class FeedParser: NSObject, XMLParserDelegate {
    private var items: [Change] = []
    private var field = ""
    private var text = ""
    private var current: [String: String]?

    static func parse(_ data: Data, base: URL) -> [Change] {
        let p = FeedParser()
        let xml = XMLParser(data: data)
        xml.delegate = p
        xml.parse()
        // Links in the feed are relative to the site.
        return p.items.map { c in
            Change(id: c.id, lab: c.lab, title: c.title, link: c.link.flatMap { URL(string: $0.relativeString, relativeTo: base)?.absoluteURL }, date: c.date)
        }
    }

    func parser(_ parser: XMLParser, didStartElement name: String, namespaceURI: String?, qualifiedName: String?, attributes: [String: String] = [:]) {
        if name == "item" { current = [:] }
        field = name
        text = ""
    }

    func parser(_ parser: XMLParser, foundCharacters string: String) { text += string }

    func parser(_ parser: XMLParser, didEndElement name: String, namespaceURI: String?, qualifiedName: String?) {
        if name == "item", let c = current {
            // Titles look like "Anthropic: Claude Code weekly limits settle 25% above old base".
            let full = c["title"] ?? ""
            let parts = full.split(separator: ":", maxSplits: 1).map { $0.trimmingCharacters(in: .whitespaces) }
            let lab = parts.count == 2 ? Options.labs.first { $0.value == parts[0] }?.key : nil
            let dates = DateFormatter()
            dates.locale = Locale(identifier: "en_US_POSIX")
            dates.dateFormat = "EEE, dd MMM yyyy HH:mm:ss zzz"
            items.append(Change(
                id: c["guid"] ?? c["link"] ?? full,
                lab: lab,
                title: lab != nil ? parts[1] : full,
                link: c["link"].flatMap { URL(string: $0) },
                date: c["pubDate"].flatMap { dates.date(from: $0) }
            ))
            current = nil
        } else if current != nil {
            current?[name, default: ""] += text.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        text = ""
    }
}

enum Feed {
    static let site = URL(string: "https://hitmylimit.com/")!

    static func fetch() async throws -> [Change] {
        var req = URLRequest(url: site.appendingPathComponent("rss.xml"))
        req.setValue("hitmylimit-mac", forHTTPHeaderField: "User-Agent")
        let (data, _) = try await URLSession.shared.data(for: req)
        return FeedParser.parse(data, base: site)
    }
}
