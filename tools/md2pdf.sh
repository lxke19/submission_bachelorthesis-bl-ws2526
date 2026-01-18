#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
OUTDIR="$ROOT/docs/pdf"
mkdir -p "$OUTDIR"

files=(
  "README.md"
  "docs/AGENTS.md"
  "docs/CONFIGURATION.md"
  "docs/DATASET.md"
  "docs/LICENSE.md"
  "docs/STARTUP.md"
  "docs/STRUCTURE.md"
  "docs/THIRD_PARTY_NOTICES.md"
)

for f in "${files[@]}"; do
  in="$ROOT/$f"
  base="$(basename "$f" .md)"
  title="${base//_/ }"

  echo "-> $f  =>  $OUTDIR/$base.pdf"

  pandoc "$in" \
    --from=gfm+emoji \
    --pdf-engine=xelatex \
    --highlight-style=tango \
    --toc --toc-depth=3 \
    -M title="$title" \
    -M lang=de \
    -V geometry:margin=2.5cm \
    -V mainfont="DejaVu Serif" \
    -V sansfont="DejaVu Sans" \
    -V monofont="DejaVu Sans Mono" \
    -V colorlinks=true \
    --resource-path="$ROOT:$ROOT/docs:$ROOT/docs/images" \
    -o "$OUTDIR/$base.pdf"
done

echo "Fertig. PDFs liegen in: $OUTDIR"
