#!/bin/sh
set -eu

package_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

# macOS 27 runs only on Apple silicon, so only an arm64 addon exists. See ADR-0015.
architecture=${TARGET_ARCH:-$(uname -m)}
if [ "$architecture" != "arm64" ]; then
  echo "Only arm64 is supported. Found: $architecture" >&2
  exit 1
fi

# The Command Line Tools ship the macOS 27 SDK, so Xcode is not required. See ADR-0003.
sdk_version=$(xcrun --sdk macosx --show-sdk-version)
case "$sdk_version" in
  2[7-9].*|[3-9][0-9].*) ;;
  *) echo "A macOS 27 SDK or later is required. Found: $sdk_version" >&2; exit 1 ;;
esac

node_executable=$(node -p 'process.execPath')
node_prefix=$(dirname -- "$(dirname -- "$node_executable")")
node_include_dir=${NODE_INCLUDE_DIR:-"$node_prefix/include/node"}
if [ ! -f "$node_include_dir/node_api.h" ]; then
  echo "node_api.h was not found under $node_include_dir. Set NODE_INCLUDE_DIR." >&2
  exit 1
fi

build_dir=$(mktemp -d "${TMPDIR:-/tmp}/xsai-apple-vision.XXXXXX")
output_dir="$package_dir/npm/darwin-arm64"
trap 'rm -rf -- "$build_dir"' EXIT HUP INT TERM
mkdir -p "$output_dir"

target="arm64-apple-macosx27.0"
swift_header="$build_dir/AppleVisionBridge-Swift.h"
swift_library="$build_dir/libAppleVisionBridge.a"

swiftc \
  -parse-as-library \
  -target "$target" \
  -module-name AppleVisionBridge \
  -emit-module \
  -emit-objc-header \
  -emit-objc-header-path "$swift_header" \
  -emit-library \
  -static \
  "$package_dir/Sources/AppleVisionBridge.swift" \
  -o "$swift_library"

clang++ \
  -std=c++17 \
  -fobjc-arc \
  -mmacosx-version-min=27.0 \
  -target "$target" \
  -I"$node_include_dir" \
  -I"$build_dir" \
  -c "$package_dir/native/addon.mm" \
  -o "$build_dir/addon.o"

swiftc \
  -target "$target" \
  -emit-library \
  "$build_dir/addon.o" \
  "$swift_library" \
  -framework Foundation \
  -framework FoundationModels \
  -framework Vision \
  -framework _Vision_FoundationModels \
  -Xlinker -lc++ \
  -Xlinker -undefined \
  -Xlinker dynamic_lookup \
  -o "$output_dir/apple-vision.node"

echo "Built $output_dir/apple-vision.node"
