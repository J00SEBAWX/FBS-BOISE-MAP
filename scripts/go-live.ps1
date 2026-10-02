# FBS Store Planner: one-time go-live (Windows PowerShell 5.1+ or PowerShell 7).
#   Run from the repo folder:  npm run go-live
# Safe to run again: it never rotates existing secrets (that would lock everyone out) and only
# makes a setup code while no admin account exists.
# Nothing secret is printed. The alert topic and the one-time setup code go to a file on your Desktop.

$ErrorActionPreference = "Continue"
Set-Location (Split-Path $PSScriptRoot -Parent)
$DB = "fbs-boise-map"
$env:WRANGLER_SEND_METRICS = "false"
# Call wrangler's own entry with node: the npx.ps1 shim drops splatted arguments in Windows PowerShell.
$WR = Join-Path (Get-Location) "node_modules\wrangler\bin\wrangler.js"

function Step($t) { Write-Host ""; Write-Host "== $t" -ForegroundColor Green }
function Fail($t) { Write-Host ""; Write-Host "STOPPED: $t" -ForegroundColor Red; exit 1 }
function Wrangler { $a = $args; & node $WR $a; if ($LASTEXITCODE -ne 0) { Fail "wrangler $($a -join ' ') failed" } }
function WranglerJson {
  $a = $args
  $out = (& node $WR $a) | Out-String
  if ($LASTEXITCODE -ne 0) { Fail "wrangler $($a -join ' ') failed" }
  $i = $out.IndexOfAny([char[]]@('[', '{'))
  if ($i -lt 0) { Fail "wrangler $($a -join ' ') didn't return JSON" }
  return ($out.Substring($i) | ConvertFrom-Json)
}
function StatusOf($u) {
  try { return (Invoke-WebRequest $u -UseBasicParsing -MaximumRedirection 0 -ErrorAction Stop).StatusCode }
  catch { if ($_.Exception.Response) { return [int]$_.Exception.Response.StatusCode } else { return 0 } }
}
function RandomText([int]$bytes) { $b = New-Object byte[] $bytes; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); return $b }
function WriteUtf8($path, $text) { [IO.File]::WriteAllText((Resolve-Path -LiteralPath $path), $text, (New-Object Text.UTF8Encoding $false)) }
# Notes for AJ are written to the Desktop file the moment they exist, so nothing is lost if a later step fails.
$NOTES = Join-Path ([Environment]::GetFolderPath("Desktop")) "FBS-planner-setup.txt"
function AddNote([string[]]$lines) {
  if (-not (Test-Path $NOTES)) { [IO.File]::WriteAllText($NOTES, "FBS Store Planner setup notes (delete this file once you're set up)`r`n`r`n", (New-Object Text.UTF8Encoding $false)) }
  [IO.File]::AppendAllText($NOTES, (($lines + "") -join "`r`n") + "`r`n", (New-Object Text.UTF8Encoding $false))
}

Step "1/8 Installing packages"
npm ci --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { Fail "npm ci failed" }

Step "2/8 Checks and tests"
npm run check
if ($LASTEXITCODE -ne 0) { Fail "checks failed" }
npm test
if ($LASTEXITCODE -ne 0) { Fail "unit tests failed" }

Step "3/8 Cloudflare sign-in"
& node $WR whoami *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Your browser will open a Cloudflare page. Sign in if it asks, check the code matches the one below, and click Allow." -ForegroundColor Yellow
  Write-Host "You have 5 minutes. If it runs out, just run npm run go-live again." -ForegroundColor Yellow
  Wrangler login --device
}

Step "4/8 Database"
$dbs = WranglerJson d1 list --json
$dbInfo = $dbs | Where-Object { $_.name -eq $DB } | Select-Object -First 1
if (-not $dbInfo) {
  Wrangler d1 create $DB --location wnam
  $dbs = WranglerJson d1 list --json
  $dbInfo = $dbs | Where-Object { $_.name -eq $DB } | Select-Object -First 1
}
if (-not $dbInfo) { Fail "couldn't find or create the $DB database" }
$cfg = Get-Content wrangler.jsonc -Raw
$cfg2 = $cfg -replace '"database_id":\s*"[^"]*"', ('"database_id": "' + $dbInfo.uuid + '"')
if ($cfg2 -ne $cfg) { WriteUtf8 "wrangler.jsonc" $cfg2; Write-Host "wrangler.jsonc now points at database $($dbInfo.uuid)" }
$env:CI = "true"
Wrangler d1 migrations apply $DB --remote
Remove-Item Env:\CI
if (Test-Path "seed\seed.sql") {
  Wrangler d1 execute $DB --remote --yes --file "seed\seed.sql"
  Write-Host "Store layout and suggested plan loaded into the database (not into git)."
} else {
  Write-Host "No seed\seed.sql here, so the store layout wasn't loaded. Ask Claude for the seed files." -ForegroundColor Yellow
}

Step "5/8 Secrets (only the missing ones)"
$have = @((WranglerJson secret list --format json) | ForEach-Object { $_.name })
if ($have -notcontains "PEPPER") {
  (-join ((RandomText 32) | ForEach-Object { $_.ToString("x2") })) | & node $WR secret put PEPPER
  if ($LASTEXITCODE -ne 0) { Fail "couldn't set PEPPER" }
}
if ($have -notcontains "PHONE_KEY") {
  [Convert]::ToBase64String([byte[]](RandomText 32)) | & node $WR secret put PHONE_KEY
  if ($LASTEXITCODE -ne 0) { Fail "couldn't set PHONE_KEY" }
}
if ($have -notcontains "NTFY_TOPIC") {
  $alphabet = "abcdefghijkmnpqrstuvwxyz23456789".ToCharArray()
  $topic = "fbs-" + (-join ((RandomText 24) | ForEach-Object { $alphabet[$_ % $alphabet.Length] }))
  $topic | & node $WR secret put NTFY_TOPIC
  if ($LASTEXITCODE -ne 0) { Fail "couldn't set NTFY_TOPIC" }
  AddNote @("PUSH ALERTS", "1. Install the free ntfy app (iPhone or Android).", "2. Tap +, keep the server as ntfy.sh, and subscribe to this topic:", "   $topic", "3. Keep this topic private. Anyone who knows it can read the alerts (first names and work areas only, never phone numbers).")
}

Step "6/8 Deploying"
& node $WR deploy 2>&1 | Tee-Object -Variable deployLog
if ($LASTEXITCODE -ne 0) { Fail "deploy failed" }
$url = ([regex]::Match(($deployLog | Out-String), 'https://[a-z0-9.-]+\.workers\.dev')).Value
if (-not $url) { $url = Read-Host "Paste the workers.dev URL wrangler printed" }

Step "7/8 First-time admin setup code"
$admins = WranglerJson d1 execute $DB --remote --json --command "SELECT COUNT(*) AS n FROM users WHERE role = 'admin'"
$n = $admins[0].results[0].n
if ($n -eq 0) {
  $alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789".ToCharArray()
  $raw = -join ((RandomText 16) | ForEach-Object { $alphabet[$_ % $alphabet.Length] })
  $sha = [Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes("setup:" + $raw))
  $hash = -join ($sha | ForEach-Object { $_.ToString("x2") })
  $now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  $exp = $now + 48 * 3600 * 1000
  $pretty = ($raw.Substring(0, 4), $raw.Substring(4, 4), $raw.Substring(8, 4), $raw.Substring(12, 4)) -join "-"
  AddNote @("FIRST-TIME SETUP (works once, expires in 48 hours)", "1. Open $url/login#setup", "2. Enter this setup code, your first name and your mobile number:", "   $pretty", "3. Save the 8 recovery codes it shows you somewhere private.", "4. Later sign-ins: 'AJ sign-in' on the login page sends a code to your ntfy app.")
  Wrangler d1 execute $DB --remote --yes --command "INSERT INTO setup_tokens (token_hash, created_at, expires_at) VALUES ('$hash', $now, $exp)"
} else {
  Write-Host "An admin account already exists, so no setup code was made."
}

Step "8/8 Smoke test"
$ok = $true
try { $r = Invoke-WebRequest "$url/login" -UseBasicParsing; if ($r.StatusCode -ne 200 -or -not $r.Headers["Content-Security-Policy"]) { $ok = $false; Write-Host "login page check failed" -ForegroundColor Red } } catch { $ok = $false; Write-Host "login page didn't load" -ForegroundColor Red }
$s1 = StatusOf "$url/app/"
if ($s1 -ne 302 -and $s1 -ne 401) { $ok = $false; Write-Host "/app/ should refuse anyone not signed in but answered $s1" -ForegroundColor Red }
$s2 = StatusOf "$url/api/bootstrap"
if ($s2 -ne 401) { $ok = $false; Write-Host "the API should refuse anyone not signed in but answered $s2" -ForegroundColor Red }
$s3 = StatusOf "$url/admin/"
if ($s3 -ne 404) { $ok = $false; Write-Host "the admin page should be hidden but answered $s3" -ForegroundColor Red }
if ($ok) { Write-Host "Live and locked: sign-in page works, the planner and API refuse anyone not signed in." -ForegroundColor Green }

AddNote @("The planner is live at $url")
Write-Host ""
Write-Host "Your setup steps are in $NOTES (open it, follow it, then delete it)." -ForegroundColor Cyan
Write-Host ""
Write-Host "Planner: $url" -ForegroundColor Cyan
