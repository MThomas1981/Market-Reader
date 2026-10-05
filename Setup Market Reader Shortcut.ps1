<#
.SYNOPSIS
  Market Reader: one-click desktop shortcut that starts the app with no window.

.DESCRIPTION
  One run does everything:
    1. Audits the project folder, the old OneDrive copy and your desktop for old launcher files
       and outdated Market Reader shortcuts, and lists every one of them.
    2. After you confirm, closes the copy running in a command window and deletes the listed files.
    3. Writes the windowless launcher "Market Reader.js" into the project folder.
    4. Creates the desktop shortcut "Market Reader" (wscript.exe, so no console window ever opens)
       with the project icon assets\market-reader.ico and the project folder as working directory,
       plus Start menu entries "Restart Market Reader" and "Stop Market Reader".
    5. Starts Market Reader through the new shortcut's launcher.
  It never touches source code, .env files, Supabase files, node_modules or any data.

  How to run: right-click this file > Run with PowerShell.

.PARAMETER ListOnly
  Only show what would be removed and created. Changes nothing.

.PARAMETER Yes
  Do not ask for confirmation (and do not wait for Enter at the end).

.PARAMETER NoStart
  Do not start Market Reader at the end.
#>
param(
  [switch]$ListOnly,
  [switch]$Yes,
  [switch]$NoStart
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2

function Say([string]$Text, [string]$Color = 'Gray') { Write-Host $Text -ForegroundColor $Color }
function Finish([int]$Code) {
  if (-not $Yes) { [void](Read-Host 'Press Enter to close') }
  exit $Code
}

Say ''
Say 'MARKET READER - WINDOWLESS DESKTOP SHORTCUT' Cyan
Say ''

# ---------------------------------------------------------------------------
# 1. Inherit the existing paths (this script lives in the project root)
# ---------------------------------------------------------------------------
$Root     = $PSScriptRoot
$Icon     = Join-Path $Root 'assets\market-reader.ico'
$Launcher = Join-Path $Root 'Market Reader.js'
$WScript  = Join-Path $env:SystemRoot 'System32\wscript.exe'

foreach ($need in @('package.json', 'apps\web\package.json', 'assets\market-reader.ico')) {
  if (-not (Test-Path -LiteralPath (Join-Path $Root $need))) {
    Say "This script must sit in the Market Reader project folder. Missing: $need (looked in $Root)" Red
    Finish 1
  }
}

$Desktop       = [Environment]::GetFolderPath('Desktop')
$PublicDesktop = [Environment]::GetFolderPath('CommonDesktopDirectory')
$StartMenu     = Join-Path ([Environment]::GetFolderPath('Programs')) 'Market Reader'
$OldCopy       = Join-Path $Desktop 'Market Watcher\market-reader'
$HasOldCopy    = (Test-Path -LiteralPath $OldCopy) -and ((Resolve-Path -LiteralPath $OldCopy).Path -ne (Resolve-Path -LiteralPath $Root).Path)
$Shell         = New-Object -ComObject WScript.Shell

Say "Project folder:  $Root"
Say "Run command:     npm run dev (unchanged), started by $WScript with no window"
Say "Icon:            $Icon"
Say "Desktop:         $Desktop"
$node = Get-Command node -ErrorAction SilentlyContinue
if ($node) { Say "Node.js:         $($node.Source)" } else { Say 'Node.js:         NOT FOUND - install it from https://nodejs.org before using the shortcut' Yellow }
Say ''

# ---------------------------------------------------------------------------
# 2. Audit: find redundant launcher files and outdated shortcuts
# ---------------------------------------------------------------------------
$Remove = New-Object System.Collections.Generic.List[object]
function Add-Removal([string]$Path, [string]$Why) {
  if (-not (Test-Path -LiteralPath $Path)) { return }
  foreach ($r in $Remove) { if ($r.Path -eq $Path) { return } }
  $Remove.Add([pscustomobject]@{ Path = $Path; Why = $Why })
}
function Test-Contains([string]$Text, [string]$Part) {
  return $Text.ToLowerInvariant().Contains($Part.ToLowerInvariant())
}

# a) Old launchers in the project folder
Add-Removal (Join-Path $Root 'Start Market Reader.cmd')     'old launcher - kept a command window open running npm run dev'
Add-Removal (Join-Path $Root 'Restart Market Reader.cmd')   'old restart launcher - replaced by Start menu > Restart Market Reader'
Add-Removal (Join-Path $Root 'Create Desktop Shortcut.cmd') 'old shortcut maker - replaced by this script'
Add-Removal (Join-Path $Root 'assets\shortcut-result.txt')  'leftover output of the old shortcut maker'

# Any other .bat / .cmd / .vbs wrapper in the project root or assets that starts the app
$KeepTools = @('Check Prices.cmd', 'Publish Website.cmd')
foreach ($dir in @($Root, (Join-Path $Root 'assets'))) {
  Get-ChildItem -LiteralPath $dir -File | Where-Object { @('.bat', '.cmd', '.vbs') -contains $_.Extension.ToLowerInvariant() } | ForEach-Object {
    if ($KeepTools -contains $_.Name) { return }
    $text = Get-Content -LiteralPath $_.FullName -Raw
    if ($text -match 'npm run dev|npm start|next dev|Start Market Reader') {
      Add-Removal $_.FullName 'wrapper script that starts the app in a command window'
    }
  }
}

# b) Launcher files left in the old OneDrive copy (the app runs from the project folder above now)
if ($HasOldCopy) {
  Get-ChildItem -LiteralPath $OldCopy -File | Where-Object { @('.bat', '.cmd', '.vbs') -contains $_.Extension.ToLowerInvariant() } | ForEach-Object {
    Add-Removal $_.FullName 'launcher in the old OneDrive copy - the app no longer runs from there'
  }
  Add-Removal (Join-Path $OldCopy 'move-result.txt')            'leftover output of the old move script'
  Add-Removal (Join-Path $OldCopy 'assets\shortcut-result.txt') 'leftover output of the old shortcut maker'
}

# c) Outdated Market Reader shortcuts on the desktop and in the Start menu
$Conflict = $null
foreach ($dir in @($Desktop, $PublicDesktop)) {
  if (-not $dir -or -not (Test-Path -LiteralPath $dir)) { continue }
  Get-ChildItem -LiteralPath $dir -Filter '*.lnk' -File | ForEach-Object {
    $lnk = $Shell.CreateShortcut($_.FullName)
    $target = [string]$lnk.TargetPath
    $line = "$target $($lnk.Arguments)"
    $isScript = $target -match '\.(cmd|bat|vbs|ps1)$'
    $ours = ($line -match 'Start Market Reader\.cmd|Restart Market Reader\.cmd|Market Reader\.js') -or
            ($isScript -and ((Test-Contains $line $Root) -or ($HasOldCopy -and (Test-Contains $line $OldCopy))))
    if ($ours) {
      Add-Removal $_.FullName "outdated app shortcut -> $target"
    } elseif ($_.Name -eq 'Market Reader.lnk' -and $dir -eq $Desktop) {
      $Conflict = $_.FullName   # a "Market Reader" shortcut to something else: leave it alone
    }
  }
}
if (Test-Path -LiteralPath $StartMenu) {
  Get-ChildItem -LiteralPath $StartMenu -Filter '*.lnk' -File | ForEach-Object { Add-Removal $_.FullName 'old Start menu entry (recreated below)' }
}

# ---------------------------------------------------------------------------
# 3. Show the list before anything is deleted
# ---------------------------------------------------------------------------
if ($Remove.Count -eq 0) {
  Say 'Redundant files found: none.' Green
} else {
  Say "Redundant files identified for removal ($($Remove.Count)):" Yellow
  $i = 1
  foreach ($r in $Remove) {
    Say ('  {0,2}. {1}' -f $i, $r.Path) White
    Say ('      {0}' -f $r.Why) DarkGray
    $i++
  }
}
Say ''
Say 'Kept on purpose:' Yellow
Say '  - All source code, apps\web\.env.local and other settings, supabase\, node_modules, data.'
Say '  - Check Prices.cmd (a test tool; its one line that started the old launcher now starts the new one).'
Say '  - Publish Website.cmd (puts the site on Vercel; it needs its window for questions).'
if ($HasOldCopy) {
  Say "  - The rest of the old OneDrive copy at $OldCopy."
  Say '    It is an older duplicate of the whole project and still holds apps\web\.env.local (your API keys).' DarkYellow
  Say '    This script does not touch it. Delete that folder yourself once you are sure you do not need it.' DarkYellow
}
Say ''
Say 'Will create:' Yellow
$ShortcutName = 'Market Reader.lnk'
if ($Conflict) {
  $ShortcutName = 'Market Reader (app).lnk'
  Say "  ($Conflict points somewhere else, so it is left alone.)" DarkGray
}
Say "  - $(Join-Path $Desktop $ShortcutName)"
Say "      runs: `"$WScript`" `"$Launcher`"   (no console window)"
Say "      start in: $Root     icon: $Icon"
Say "  - $Launcher   (windowless launcher; logs to %LOCALAPPDATA%\Market Reader\server.log)"
Say "  - Start menu > Market Reader: Market Reader, Restart Market Reader, Stop Market Reader"
Say ''

if ($ListOnly) { Say 'List only: nothing was changed.' Green; Finish 0 }

if (-not $Yes) {
  $answer = Read-Host 'Close the running copy, delete the files listed above and create the new shortcut? [Y/N]'
  if ($answer -notmatch '^(y|yes)$') { Say 'Nothing was changed.' Green; Finish 0 }
}

# ---------------------------------------------------------------------------
# 4. Stop the copy running in a command window (so the old batch file is not in use)
# ---------------------------------------------------------------------------
$needle = (Join-Path $Root 'node_modules\').ToLowerInvariant()
$procs = @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe' OR Name = 'cmd.exe'" -ErrorAction SilentlyContinue)
$stopped = 0
foreach ($p in $procs) {
  $cl = [string]$p.CommandLine
  if (-not $cl) { continue }
  $isAppNode = ($p.Name -eq 'node.exe') -and $cl.ToLowerInvariant().Contains($needle)
  $isOldWindow = ($p.Name -eq 'cmd.exe') -and ($cl -match 'Start Market Reader\.cmd|Restart Market Reader\.cmd')
  if ($isAppNode -or $isOldWindow) {
    Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
    $stopped++
  }
}
if ($stopped -gt 0) { Say "Closed the running copy ($stopped processes)." Green; Start-Sleep -Seconds 2 }

# ---------------------------------------------------------------------------
# 5. Delete the redundant files
# ---------------------------------------------------------------------------
$failed = 0
foreach ($r in $Remove) {
  try {
    Remove-Item -LiteralPath $r.Path -Force
    Say "Deleted  $($r.Path)" DarkGreen
  } catch {
    $failed++
    Say "Could not delete $($r.Path): $($_.Exception.Message)" Red
    if ($r.Path.StartsWith($PublicDesktop)) { Say '  (shortcuts on the shared Public desktop need an administrator PowerShell)' DarkGray }
  }
}

# ---------------------------------------------------------------------------
# 6. Write the windowless launcher
# ---------------------------------------------------------------------------
$LauncherSource = @'
// Market Reader launcher (Windows). Runs with wscript.exe, so no console window ever appears.
//   wscript.exe "Market Reader.js"            start the app (or just open it if it is already running)
//   wscript.exe "Market Reader.js" /restart   stop, clear the compiled cache, start again
//   wscript.exe "Market Reader.js" /stop      stop the app
// The app runs `npm run dev` from this folder, exactly as the old Start Market Reader.cmd did.
// Its output goes to %LOCALAPPDATA%\Market Reader\server.log instead of a window.
// Created by "Setup Market Reader Shortcut.ps1".

var sh = new ActiveXObject('WScript.Shell');
var fso = new ActiveXObject('Scripting.FileSystemObject');
var root = fso.GetParentFolderName(WScript.ScriptFullName);
var DASHBOARD = 'http://localhost:3000/dashboard';
var TITLE = 'Market Reader';
var logDir = sh.ExpandEnvironmentStrings('%LOCALAPPDATA%') + '\\Market Reader';
var logFile = logDir + '\\server.log';
var mode = WScript.Arguments.length ? String(WScript.Arguments(0)).toLowerCase() : '';

sh.CurrentDirectory = root;

// Run a command line with no window and wait for it; returns its exit code.
function hidden(cmd) {
  return sh.Run('%ComSpec% /d /c ' + cmd, 0, true);
}

function listening() {
  return hidden('netstat -ano -p tcp | findstr /r /c:":3000 .*LISTENING" >nul') === 0;
}

// Stop this app only: every node.exe running from this folder's node_modules (next dev and its
// server), then whatever still holds port 3000.
function stopApp() {
  var needle = (root + '\\node_modules\\').toLowerCase();
  try {
    var wmi = GetObject('winmgmts:{impersonationLevel=impersonate}!\\\\.\\root\\cimv2');
    var procs = new Enumerator(wmi.ExecQuery("SELECT ProcessId, CommandLine FROM Win32_Process WHERE Name = 'node.exe'"));
    for (; !procs.atEnd(); procs.moveNext()) {
      var p = procs.item();
      if (p.CommandLine && String(p.CommandLine).toLowerCase().indexOf(needle) >= 0) {
        hidden('taskkill /pid ' + p.ProcessId + ' /t /f >nul 2>nul');
      }
    }
  } catch (e) { /* WMI unavailable: the port check below still stops it */ }
  if (listening()) {
    hidden('for /f "tokens=5" %p in (\'netstat -ano -p tcp ^| findstr /r /c:":3000 .*LISTENING"\') do @taskkill /pid %p /t /f >nul 2>nul');
  }
  for (var i = 0; i < 20 && listening(); i++) WScript.Sleep(500);
}

function note(text, seconds) {
  sh.Popup(text, seconds || 0, TITLE, 64);
}

function fail(text) {
  sh.Popup(text, 0, TITLE, 48);
  WScript.Quit(1);
}

// Put the private keys file back if an old installer build was interrupted (same as the old launcher).
var hiddenEnv = root + '\\apps\\web\\.env.local.hidden-during-build';
var env = root + '\\apps\\web\\.env.local';
if (fso.FileExists(hiddenEnv) && !fso.FileExists(env)) fso.MoveFile(hiddenEnv, env);

if (mode === '/stop') {
  if (listening()) {
    stopApp();
    note('Market Reader has stopped.', 3);
  } else {
    note('Market Reader was not running.', 3);
  }
  WScript.Quit(0);
}

if (mode === '/restart') {
  stopApp();
  // Clear the compiled cache so every code change is picked up (same as the old restart file).
  var cache = root + '\\apps\\web\\.next';
  if (fso.FolderExists(cache)) {
    try { fso.DeleteFolder(cache, true); } catch (e) { /* in use: Next.js rebuilds what it needs */ }
  }
} else if (listening()) {
  // Already running: just open it.
  sh.Run(DASHBOARD, 1, false);
  WScript.Quit(0);
}

if (hidden('where node >nul 2>nul') !== 0) {
  fail('Node.js is not installed. Install it from https://nodejs.org, then click the Market Reader shortcut again.');
}

if (!fso.FolderExists(logDir)) fso.CreateFolder(logDir);

if (!fso.FolderExists(root + '\\node_modules')) {
  note('Installing Market Reader\'s packages. The first time takes a few minutes; the dashboard opens when it is done.', 6);
  if (hidden('npm install > "' + logDir + '\\install.log" 2>&1') !== 0) {
    fail('The install failed. Details are in:\n' + logDir + '\\install.log');
  }
}

// Start the app with no window. Output goes to the log file.
sh.Run('%ComSpec% /d /c npm run dev > "' + logFile + '" 2>&1', 0, false);

// Open the dashboard as soon as the app is listening (up to 2 minutes).
for (var t = 0; t < 240; t++) {
  if (listening()) {
    WScript.Sleep(1500);
    sh.Run(DASHBOARD, 1, false);
    WScript.Quit(0);
  }
  WScript.Sleep(500);
}
fail('Market Reader did not start within 2 minutes. Details are in:\n' + logFile);
'@
[IO.File]::WriteAllText($Launcher, ($LauncherSource -replace "`r?`n", "`r`n"), [Text.Encoding]::ASCII)
Say "Wrote    $Launcher" DarkGreen

# Check Prices.cmd started the old launcher when the app was not running; point it at the new one.
$CheckPrices = Join-Path $Root 'Check Prices.cmd'
if (Test-Path -LiteralPath $CheckPrices) {
  $text = [IO.File]::ReadAllText($CheckPrices)
  $old = 'start "Market Reader" "%~dp0Start Market Reader.cmd"'
  if ($text.Contains($old)) {
    $text = $text.Replace($old, 'start "" "%SystemRoot%\System32\wscript.exe" "%~dp0Market Reader.js"')
    [IO.File]::WriteAllText($CheckPrices, $text, [Text.Encoding]::ASCII)
    Say "Updated  $CheckPrices (now starts the windowless launcher)" DarkGreen
  }
}

# ---------------------------------------------------------------------------
# 7. Create the shortcuts
# ---------------------------------------------------------------------------
function New-AppShortcut([string]$Path, [string]$Arguments, [string]$Description) {
  $s = $Shell.CreateShortcut($Path)
  $s.TargetPath = $WScript
  $s.Arguments = $Arguments
  $s.WorkingDirectory = $Root
  $s.IconLocation = "$Icon,0"
  $s.WindowStyle = 1
  $s.Description = $Description
  $s.Save()
}
$quoted = '"' + $Launcher + '"'
$DesktopLink = Join-Path $Desktop $ShortcutName
New-AppShortcut $DesktopLink $quoted 'Start Market Reader (no window) and open the dashboard'
New-Item -ItemType Directory -Path $StartMenu -Force | Out-Null
New-AppShortcut (Join-Path $StartMenu 'Market Reader.lnk') $quoted 'Start Market Reader (no window) and open the dashboard'
New-AppShortcut (Join-Path $StartMenu 'Restart Market Reader.lnk') "$quoted /restart" 'Restart Market Reader and pick up code changes'
New-AppShortcut (Join-Path $StartMenu 'Stop Market Reader.lnk') "$quoted /stop" 'Stop Market Reader'
Start-Process -FilePath 'ie4uinit.exe' -ArgumentList '-show' -WindowStyle Hidden -ErrorAction SilentlyContinue   # refresh icons

# Read the desktop shortcut back to confirm it
$check = $Shell.CreateShortcut($DesktopLink)
$ok = ($check.TargetPath -ieq $WScript) -and ($check.Arguments -eq $quoted) -and ($check.WorkingDirectory -ieq $Root) -and (Test-Path -LiteralPath $Launcher)
Say ''
Say "Desktop shortcut: $DesktopLink" White
Say "  Target:     $($check.TargetPath) $($check.Arguments)"
Say "  Start in:   $($check.WorkingDirectory)"
Say "  Icon:       $($check.IconLocation)"
if ($ok) { Say '  Check:      OK' Green } else { Say '  Check:      the shortcut did not save as expected' Red; $failed++ }
Say ''
Say 'Start menu > Market Reader > Restart Market Reader  restarts it (and picks up code changes).'
Say 'Start menu > Market Reader > Stop Market Reader     stops it.'
Say 'If the dashboard does not open, the log is at %LOCALAPPDATA%\Market Reader\server.log.'
Say ''

# ---------------------------------------------------------------------------
# 8. Start it the new way
# ---------------------------------------------------------------------------
if (-not $NoStart -and $node) {
  Start-Process -FilePath $WScript -ArgumentList $quoted -WorkingDirectory $Root
  Say 'Market Reader is starting with no window. The dashboard opens in your browser in a few seconds.' Green
}

if ($failed -gt 0) { Say "Finished with $failed problem(s); see the red lines above." Yellow; Finish 1 }
Say 'Done.' Green
Finish 0
