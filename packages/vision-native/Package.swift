// swift-tools-version: 6.2

import PackageDescription

let package = Package(
    name: "AppleVisionBridge",
    platforms: [.macOS("27.0")],
    products: [
        .library(name: "AppleVisionBridge", targets: ["AppleVisionBridge"]),
    ],
    targets: [
        .target(
            name: "AppleVisionBridge",
            path: "Sources"
        ),
        .testTarget(
            name: "AppleVisionBridgeTests",
            dependencies: ["AppleVisionBridge"],
            path: "Tests"
        ),
    ]
)
