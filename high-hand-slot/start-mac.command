#!/bin/bash
# ダブルクリックでハイハンドスロットを起動する(Mac 用)
cd "$(dirname "$0")" || exit 1
if ! command -v node > /dev/null 2>&1; then
  echo ""
  echo "Node.js が入っていません。README.md の「はじめに一度だけ」を見て入れてください。"
  echo ""
  read -r -p "Enter キーで閉じます"
  exit 1
fi
if [ ! -d node_modules ]; then
  echo "初回の準備をしています(インターネットが必要です)..."
  if ! npm install --omit=dev; then
    echo ""
    echo "準備に失敗しました。インターネットにつながっているか確認して、もう一度ダブルクリックしてください。"
    read -r -p "Enter キーで閉じます"
    exit 1
  fi
fi
npm start
