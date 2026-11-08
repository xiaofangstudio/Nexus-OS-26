@echo off
rem ===================================================================
rem  Nexus OS 26 - one-click local bridge (Windows, no install needed)
rem  Double-click this file. A console window opens; keep it open while
rem  you browse real disks in Nexus OS 26. Close it to stop.
rem ===================================================================
chcp 65001 >nul
title Nexus OS 26 - Local Bridge (port 8899)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0nexus-bridge.ps1" 8899
echo.
echo Bridge stopped.
pause
