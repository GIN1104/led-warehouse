# Windows PowerShell wrapper for daily/on-demand backup.
# Secrets живут на Fly / в сессии — не коммитить.
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)
node .\scripts\backup-to-r2.mjs @args
