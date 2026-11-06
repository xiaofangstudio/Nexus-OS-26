@echo off
rem ===================================================================
rem  Nexus OS 26 - one-click deploy for ACCOUNT + STORE backend
rem  (Cloudflare Worker + KV). Double-click this file.
rem  It will: log in -> create/reuse KV -> patch wrangler.toml
rem            -> deploy -> verify /api/acc/*
rem  You need a Cloudflare account and Node.js installed.
rem ===================================================================
chcp 65001 >nul
title Nexus OS 26 - Deploy Account + Store
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-account.ps1"
