# Nexus OS 26 - Local Bridge (PowerShell edition, zero-dependency)
# =============================================================================
# Read-only bridge that lets the web-based Nexus OS 26 browse the REAL disks
# (C:\ D:\ ...) of this machine.
#
# Why this file exists: the Python bridge needs Python installed. This one only
# needs Windows PowerShell, which ships with every Windows 10/11 machine, so
# any user can just double-click "Start-Bridge.bat" and it works.
#
# Same HTTP API and same port as tools/nexus-bridge.py, so the OS auto-detects
# whichever one is running:
#   GET /api/ping            -> {ok:true,...}
#   GET /api/roots           -> {roots:[{name,path,ok}]}
#   GET /api/ls?path=C:\     -> {path, entries:[{name,isDir,size,mtime}]}
#   GET /api/read?path=...   -> {path, text, encoding}
#   GET /api/file?path=...   -> raw bytes (images / audio / video / pdf)
#
# Safety: listens on 127.0.0.1 only, GET only, no write endpoints, hidden
# dot-files skipped. Close the window to stop.
#
# Usage:  powershell -NoProfile -ExecutionPolicy Bypass -File nexus-bridge.ps1 [port]
# =============================================================================

param([int]$Port = 8899)

$ErrorActionPreference = 'Stop'
$MaxText = 4MB
$MaxRaw = 64MB

$Utf8 = [System.Text.Encoding]::UTF8
$Listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
try { $Listener.Start() } catch {
    Write-Host ""
    Write-Host "  [!] Port $Port is already in use - the bridge may already be running." -ForegroundColor Yellow
    Write-Host "      Open http://127.0.0.1:$Port/api/ping in a browser to check."
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""
Write-Host "  Nexus OS 26 - Local Bridge (PowerShell)" -ForegroundColor Cyan
Write-Host "  --------------------------------------" -ForegroundColor DarkGray
Write-Host "  http://127.0.0.1:$Port   |  READ-ONLY  |  127.0.0.1 only" -ForegroundColor Green
Write-Host "  Now open Nexus OS 26 -> Files -> Real system -> This PC (Real)" -ForegroundColor Gray
Write-Host "  Close this window to stop the bridge." -ForegroundColor DarkGray
Write-Host ""

function Get-MimeType([string]$ext) {
    switch ($ext.ToLower()) {
        '.png'  { 'image/png' }
        '.jpg'  { 'image/jpeg' }
        '.jpeg' { 'image/jpeg' }
        '.gif'  { 'image/gif' }
        '.webp' { 'image/webp' }
        '.bmp'  { 'image/bmp' }
        '.ico'  { 'image/x-icon' }
        '.svg'  { 'image/svg+xml' }
        '.mp3'  { 'audio/mpeg' }
        '.wav'  { 'audio/wav' }
        '.ogg'  { 'audio/ogg' }
        '.m4a'  { 'audio/mp4' }
        '.flac' { 'audio/flac' }
        '.mp4'  { 'video/mp4' }
        '.webm' { 'video/webm' }
        '.mov'  { 'video/quicktime' }
        '.pdf'  { 'application/pdf' }
        '.json' { 'application/json' }
        default { 'application/octet-stream' }
    }
}

function Send-Response($Stream, [int]$Status, [string]$ContentType, [byte[]]$Body) {
    $reason = switch ($Status) {
        200 { 'OK' }
        400 { 'Bad Request' }
        403 { 'Forbidden' }
        404 { 'Not Found' }
        413 { 'Payload Too Large' }
        415 { 'Unsupported Media Type' }
        default { 'OK' }
    }
    $head = "HTTP/1.1 $Status $reason`r`n" +
            "Content-Type: $ContentType`r`n" +
            "Content-Length: $($Body.Length)`r`n" +
            "Access-Control-Allow-Origin: *`r`n" +
            "Access-Control-Allow-Methods: GET, OPTIONS`r`n" +
            "Access-Control-Allow-Headers: *`r`n" +
            "Cache-Control: no-store`r`n" +
            "Connection: close`r`n`r`n"
    $hb = $Utf8.GetBytes($head)
    $Stream.Write($hb, 0, $hb.Length)
    if ($Body.Length -gt 0) { $Stream.Write($Body, 0, $Body.Length) }
    $Stream.Flush()
}

function Send-Json($Stream, $Obj, [int]$Status = 200) {
    $json = $Obj | ConvertTo-Json -Depth 6 -Compress
    Send-Response $Stream $Status 'application/json; charset=utf-8' $Utf8.GetBytes($json)
}

function Send-Error($Stream, [string]$Msg, [int]$Status = 400) {
    Send-Json $Stream @{ error = $Msg } $Status
}

function Get-QueryValue([string]$query, [string]$key) {
    if ([string]::IsNullOrEmpty($query)) { return '' }
    foreach ($pair in $query.Split('&')) {
        $i = $pair.IndexOf('=')
        if ($i -lt 0) { continue }
        if ($pair.Substring(0, $i) -eq $key) {
            return [System.Uri]::UnescapeDataString($pair.Substring($i + 1).Replace('+', ' '))
        }
    }
    return ''
}

while ($true) {
    $client = $null
    try {
        $client = $Listener.AcceptTcpClient()
        $client.ReceiveTimeout = 4000
        $client.SendTimeout = 10000
        $stream = $client.GetStream()

        # --- read request head (until blank line) ---
        $buf = New-Object byte[] 8192
        $sb = New-Object System.Text.StringBuilder
        $deadline = [DateTime]::UtcNow.AddSeconds(4)
        while ([DateTime]::UtcNow -lt $deadline) {
            if (-not $stream.DataAvailable) { Start-Sleep -Milliseconds 15; continue }
            $n = $stream.Read($buf, 0, $buf.Length)
            if ($n -le 0) { break }
            [void]$sb.Append($Utf8.GetString($buf, 0, $n))
            if ($sb.ToString().Contains("`r`n`r`n")) { break }
        }
        $head = $sb.ToString()
        if ([string]::IsNullOrWhiteSpace($head)) { $client.Close(); continue }

        $firstLine = ($head -split "`r`n")[0]
        $parts = $firstLine -split ' '
        if ($parts.Length -lt 2) { $client.Close(); continue }
        $method = $parts[0].ToUpper()
        $target = $parts[1]

        if ($method -eq 'OPTIONS') {
            Send-Response $stream 200 'text/plain' ([byte[]]@())
            $client.Close(); continue
        }
        if ($method -ne 'GET') {
            Send-Error $stream 'only GET is supported' 403
            $client.Close(); continue
        }

        $qi = $target.IndexOf('?')
        if ($qi -ge 0) { $pathPart = $target.Substring(0, $qi); $query = $target.Substring($qi + 1) }
        else { $pathPart = $target; $query = '' }

        switch ($pathPart) {
            '/api/ping' {
                Send-Json $stream @{ ok = $true; bridge = 'nexus-bridge-ps'; version = 1 }
            }
            '/api/roots' {
                $roots = @()
                foreach ($drive in [System.IO.DriveInfo]::GetDrives()) {
                    if ($drive.DriveType -eq 'NoRootDirectory') { continue }
                    $roots += @{ name = $drive.Name.TrimEnd('\'); path = $drive.Name; ok = $drive.IsReady }
                }
                Send-Json $stream @{ roots = $roots }
            }
            '/api/ls' {
                $p = Get-QueryValue $query 'path'
                if (-not $p) { Send-Error $stream 'missing path'; break }
                if (-not [System.IO.Directory]::Exists($p)) { Send-Error $stream "not a directory: $p" 404; break }
                $entries = @()
                try { $items = [System.IO.DirectoryInfo]::new($p).GetFileSystemInfos() }
                catch { Send-Error $stream 'permission denied' 403; break }
                foreach ($it in $items) {
                    if ($it.Name.StartsWith('.') -or $it.Name.StartsWith('$')) { continue }
                    $isDir = $it -is [System.IO.DirectoryInfo]
                    $entries += @{
                        name  = $it.Name
                        isDir = $isDir
                        size  = if ($isDir) { 0 } else { $it.Length }
                        mtime = [int64](([DateTimeOffset]$it.LastWriteTimeUtc).ToUnixTimeMilliseconds())
                    }
                }
                $entries = $entries | Sort-Object @{ Expression = { $_.isDir }; Descending = $true }, name
                Send-Json $stream @{ path = $p; entries = @($entries) }
            }
            '/api/read' {
                $p = Get-QueryValue $query 'path'
                if (-not $p) { Send-Error $stream 'missing path'; break }
                if (-not [System.IO.File]::Exists($p)) { Send-Error $stream "not a file: $p" 404; break }
                $fi = [System.IO.FileInfo]::new($p)
                if ($fi.Length -gt $MaxText) { Send-Error $stream 'file too large for text view' 413; break }
                $text = ''
                foreach ($enc in @('utf-8', 'unicode', 'gb18030')) {
                    try {
                        $text = [System.IO.File]::ReadAllText($p, [System.Text.Encoding]::GetEncoding($enc))
                        $usedEnc = $enc
                        break
                    } catch { $text = $null }
                }
                if ($null -eq $text) { Send-Error $stream 'binary file, use /api/file' 415; break }
                Send-Json $stream @{ path = $p; text = $text; encoding = $usedEnc }
            }
            '/api/file' {
                $p = Get-QueryValue $query 'path'
                if (-not $p) { Send-Error $stream 'missing path'; break }
                if (-not [System.IO.File]::Exists($p)) { Send-Error $stream "not a file: $p" 404; break }
                $fi = [System.IO.FileInfo]::new($p)
                if ($fi.Length -gt $MaxRaw) { Send-Error $stream 'file too large' 413; break }
                $bytes = [System.IO.File]::ReadAllBytes($p)
                Send-Response $stream 200 (Get-MimeType $fi.Extension) $bytes
            }
            default {
                Send-Error $stream 'unknown endpoint' 404
            }
        }
        $client.Close()
    }
    catch {
        # A single bad request must never kill the bridge
        try { if ($client) { $client.Close() } } catch { }
    }
}
