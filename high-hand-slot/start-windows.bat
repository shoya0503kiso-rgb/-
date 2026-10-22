@echo off
chcp 65001 > nul
cd /d "%~dp0"
title ハイハンドスロット
where node > nul 2> nul
if errorlevel 1 (
  echo.
  echo Node.js が入っていません。README.md の「はじめに一度だけ」を見て入れてください。
  echo.
  pause
  exit /b 1
)
if not exist node_modules (
  echo 初回の準備をしています。インターネットが必要です。少し待ってください
  call npm install --omit=dev
  if errorlevel 1 (
    echo.
    echo 準備に失敗しました。インターネットにつながっているか確認して、もう一度ダブルクリックしてください。
    pause
    exit /b 1
  )
)
call npm start
pause
