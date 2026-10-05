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