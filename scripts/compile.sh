#!/usr/bin/env bash
# Compile one or every lineage with the pinned Compact compiler, from the
# package directory with relative paths (the source map stays path-free).
#
#   scripts/compile.sh                     # every lineage
#   scripts/compile.sh attestation-vault   # one
#   COMPACT_ROOT=.build scripts/compile.sh attestation-vault   # into a scratch copy
#
# Linux / macOS / WSL only (compactc has no Windows build). The compiler
# version comes from packages/<name>/managed/<name>/compiler/contract-info.json
# of the committed artifact, or COMPACT_VERSION.
set -euo pipefail
export PATH="$HOME/.local/bin:$PATH"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# COMPACT_ROOT: a directory holding <name>/src and <name>/managed copies to
# compile into instead of packages/ (the reproducible-build check).
PKG_BASE="${COMPACT_ROOT:+$(cd "$COMPACT_ROOT" && pwd)}"
PKG_BASE="${PKG_BASE:-$ROOT/packages}"
ALL=(counter shielded-token token-factory holder-registry attestation-vault attestation-vault-32)
TARGETS=("$@")
[ ${#TARGETS[@]} -eq 0 ] && TARGETS=("${ALL[@]}")

want="${COMPACT_VERSION:-}"
if [ -z "$want" ]; then
  want=$(grep -ho '"compiler-version": *"[^"]*"' "$ROOT"/packages/*/managed/*/compiler/contract-info.json | head -1 | sed 's/.*: *"\([^"]*\)"/\1/')
fi
have=$(compact compile --version 2>/dev/null || true)
if [ "$have" != "$want" ]; then
  echo "compile: switching compactc $have -> $want"
  compact update "$want"
fi
echo "compile: compactc $(compact compile --version)"

for name in "${TARGETS[@]}"; do
  dir="$PKG_BASE/$name"
  [ -d "$dir" ] || { echo "compile: no package at $dir" >&2; exit 1; }
  echo "=== $name: $(date +%T)"
  start=$(date +%s)
  ( cd "$dir" && compact compile "src/$name.compact" "managed/$name" )
  echo "=== $name: done in $(( $(date +%s) - start )) s"
done
