# ===================================================================
#  Nexus OS 26 - 账号服务一键部署（Cloudflare Worker + KV）
#
#  作用：把 server/ 这个 Worker（AI 转发 + Nexus 账号 /api/acc/* + 应用/插件市场 /api/store/*）
#        部署到你的 Cloudflare 账号，并自动建好两个 KV 命名空间（账号 + 市场）。
#
#  为什么需要你手动跑一次：部署要登录你自己的 Cloudflare 账号，
#  登录授权只能在你的浏览器里点，脚本没法替你按。
#
#  跑完会输出「验证结果」：/api/acc/check 返回 200 就算成功。
# ===================================================================
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here
$toml = Join-Path $here 'wrangler.toml'

function Say($t, $c = 'Gray') { Write-Host $t -ForegroundColor $c }
function Step($n, $t) { Write-Host ""; Write-Host "[$n] $t" -ForegroundColor Cyan }

# ---------- 0. 找 wrangler ----------
Step 0 '查找 wrangler'
$wranglerCmd = $null
$cmdObj = Get-Command wrangler -ErrorAction SilentlyContinue
if ($cmdObj) { $wranglerCmd = 'wrangler' }
else {
  $npm = Get-Command npm -ErrorAction SilentlyContinue
  if ($npm) { $wranglerCmd = 'npx' }
}
if (-not $wranglerCmd) {
  Say '找不到 wrangler，也没有 npm。请先装 Node.js（https://nodejs.org）再运行本脚本。' 'Red'
  exit 1
}
Say ("使用: " + $wranglerCmd) 'DarkGray'

function Invoke-Wr {
  param([string[]]$WrArgs)
  if ($wranglerCmd -eq 'npx') {
    & npx --yes wrangler@latest @WrArgs
  } else {
    & wrangler @WrArgs
  }
}

# ---------- 1. 登录检查 ----------
Step 1 '检查 Cloudflare 登录状态'
$whoami = ''
try { $whoami = (Invoke-Wr @('whoami') 2>&1 | Out-String) } catch { $whoami = '' }
if ($whoami -match 'You are not authenticated|not logged in|Please run `wrangler login`') {
  Say '还没有登录 Cloudflare，即将打开浏览器让你授权（只需一次）。' 'Yellow'
  Invoke-Wr @('login')
} else {
  Say '已登录。' 'Green'
}

# ---------- 2. 建 KV（已存在就复用）----------
function Ensure-KV {
  param([string]$Name, [string]$Binding)
  Step 2 "准备 KV 命名空间 $Name（$Binding）"
  $id = $null
  $listRaw = ''
  try { $listRaw = (Invoke-Wr @('kv','namespace','list') 2>&1 | Out-String) } catch { $listRaw = '' }
  $line = ($listRaw -split "`n" | Where-Object { $_ -match [regex]::Escape($Name) } | Select-Object -First 1)
  if ($line -match '([0-9a-f]{32})') {
    $id = $Matches[1]
    Say "已存在同名 KV，复用 id = $id" 'Green'
    return $id
  }
  $createRaw = ''
  try { $createRaw = (Invoke-Wr @('kv','namespace','create',$Name) 2>&1 | Out-String) } catch {
    Say ('创建 KV 失败：' + $_.Exception.Message) 'Red'
    Say "如果提示权限不足，去 Cloudflare 控制台 -> Workers & Pages -> KV 手动建一个叫 $Name 的，把 id 填进 wrangler.toml 的 $Binding。" 'Yellow'
    exit 1
  }
  Write-Host $createRaw
  if ($createRaw -match '([0-9a-f]{32})') {
    $id = $Matches[1]
    Say "新建 KV 成功，id = $id" 'Green'
    return $id
  }
  Say "没能从输出里解析出 KV id，请手动把上面这段里的 id 填进 wrangler.toml 的 $Binding。" 'Red'
  exit 1
}

$accKvId = Ensure-KV -Name 'nexus-accounts' -Binding 'ACC_KV'
$storeKvId = Ensure-KV -Name 'nexus-store' -Binding 'STORE_KV'

# ---------- 3. 写回 wrangler.toml（先备份）----------
Step 3 '写入配置'
$bak = $toml + '.bak'
Copy-Item $toml $bak -Force
Say "已备份原配置 -> $bak" 'DarkGray'

$content = Get-Content $toml -Raw -Encoding UTF8
# 两个 KV 的占位符一样：按出现顺序回填 —— 第一个是 ACC_KV，第二个是 STORE_KV。
# （不用 [regex]::Replace 委托：PS 5.1 里脚本块委托拿不到外层变量，坑。）
$ph = 'REPLACE_WITH_YOUR_KV_ID'
$first = $content.IndexOf($ph)
if ($first -ge 0) {
  $content = $content.Substring(0, $first) + $accKvId + $content.Substring($first + $ph.Length)
}
$content = $content -replace [regex]::Escape($ph), $storeKvId
if ($content -match 'ACC_SECRET\s*=\s*"change-me-to-a-random-string"') {
  $secret = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
  $content = $content -replace 'ACC_SECRET\s*=\s*"change-me-to-a-random-string"', ('ACC_SECRET = "' + $secret + '"')
  Say '已生成随机 ACC_SECRET（登录 token 签名用）' 'Green'
}
$script:storeAdmin = $null
if ($content -match 'STORE_ADMIN\s*=\s*"change-me-to-a-random-string"') {
  $storeAdmin = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
  $content = $content -replace 'STORE_ADMIN\s*=\s*"change-me-to-a-random-string"', ('STORE_ADMIN = "' + $storeAdmin + '"')
  Say '已生成随机 STORE_ADMIN（市场审核管理令牌）' 'Green'
}
[System.IO.File]::WriteAllText($toml, $content, (New-Object System.Text.UTF8Encoding($false)))
Say 'wrangler.toml 已更新。' 'Green'

# ---------- 4. 部署 ----------
Step 4 '部署 Worker'
Invoke-Wr @('deploy')
if ($LASTEXITCODE -ne 0) {
  Say '部署失败，请把上面的红字发给我。' 'Red'
  exit 1
}

# ---------- 5. 验证 ----------
Step 5 '验证接口'
Start-Sleep -Seconds 3
$okAll = $false
$okStore = $false
foreach ($probe in @(
  @{ u = 'https://ai.fanggame.company/api/acc/check?accountName=deployprobe'; n = '账号 /api/acc' },
  @{ u = 'https://ai.fanggame.company/api/store/list?kind=app';              n = '市场 /api/store' }
)) {
  for ($i = 1; $i -le 3; $i++) {
    try {
      $r = Invoke-WebRequest -Uri $probe.u -UseBasicParsing -TimeoutSec 12
      Say ("[" + $probe.n + "] HTTP " + $r.StatusCode + "  " + $r.Content) 'Green'
      if ($probe.n -like '账号*') { $okAll = $true } else { $okStore = $true }
      break
    } catch {
      $code = $null
      if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
      Say ("[" + $probe.n + "] 第 $i 次: HTTP " + $code) 'Yellow'
      if ($code -eq 503) {
        Say '接口在了，但 KV 没绑上 —— 回第 2 步检查对应 KV 的 id。' 'Yellow'
      }
      Start-Sleep -Seconds 2
    }
  }
}

Write-Host ""
if ($okAll -and $okStore) {
  Say '=========================================' 'Green'
  Say ' 账号服务 + 应用/插件市场已全部上线。' 'Green'
  Say ' Nexus OS 26 里：' 'Green'
  Say '  · 设置 -> 账户：状态标会变成「已连云端」' 'Green'
  Say '  · 应用商店：自发布应用/插件真正跨设备上架' 'Green'
  Say '  · 审核台第一次用要填 STORE_ADMIN（下面这串，只出现这一次）' 'Green'
  if ($storeAdmin) { Say ("  STORE_ADMIN = " + $storeAdmin) 'Cyan' }
  Say '=========================================' 'Green'
} else {
  Say '有接口还没通。常见原因：' 'Yellow'
  Say '  1) KV 没绑（返回 503）' 'Yellow'
  Say '  2) 自定义域名 ai.fanggame.company 没绑定到本 Worker' 'Yellow'
  Say '  3) 刚部署，DNS 还没生效，等 1-2 分钟再试' 'Yellow'
}
Write-Host ""
Read-Host '按回车关闭'
