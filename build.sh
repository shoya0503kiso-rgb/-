#!/bin/sh
# Builds index.html (standalone page for GitHub Pages) from mystery-bounty.html (the claude.ai artifact source).
set -e
cd "$(dirname "$0")"
{
  printf '%s\n' '<!doctype html>' '<html lang="ja">' '<head>' '<meta charset="utf-8">' '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' '<script src="vendor/mqtt.min.js"></script>' '<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>' '</head>' '<body>'
  cat mystery-bounty.html
  printf '%s\n' '</body>' '</html>'
} > index.html
