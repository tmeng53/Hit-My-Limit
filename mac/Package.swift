// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "HitMyLimit",
    platforms: [.macOS(.v13)],
    targets: [
        .executableTarget(name: "HitMyLimit", path: "Sources/HitMyLimit"),
    ]
)
