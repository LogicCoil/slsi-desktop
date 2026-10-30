const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: '#0A0B0E',
    frame: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'src/index.html'));
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// App launcher dictionary
const APP_COMMANDS = {
  'notepad': 'notepad.exe',
  'cmd': 'start cmd.exe',
  'roblox': 'start roblox://',
  'calculator': 'calc.exe',
  'chrome': 'start chrome'
};

// Application Launcher
ipcMain.handle('open-app', async (event, appName) => {
  const cleanName = appName.toLowerCase().trim();
  const command = APP_COMMANDS[cleanName] || `start ${cleanName}`;

  return new Promise((resolve) => {
    exec(command, (error) => {
      if (error) {
        exec(`start ${cleanName}`, (err2) => {
          if (err2) resolve({ success: false, output: `Could not launch "${appName}".` });
          else resolve({ success: true, output: `Successfully launched ${appName}.` });
        });
      } else {
        resolve({ success: true, output: `Successfully launched ${appName}.` });
      }
    });
  });
});

// 🎯 Fixed Notepad HTML Auto-Type using Semicolon-Separated PowerShell Commands
ipcMain.handle('open-notepad-and-type', async (event, htmlCodeText) => {
  return new Promise((resolve) => {
    const tempHtmlFile = path.join(app.getPath('temp'), 'slsi_code.txt');
    
    // 1. Force write the pure HTML string into disk
    fs.writeFileSync(tempHtmlFile, htmlCodeText, 'utf8');

    // 2. PowerShell script with explicit semicolons (;) between commands
    const sanitizedPath = tempHtmlFile.replace(/\\/g, '\\\\');
    const psScript = `Get-Content -Path '${sanitizedPath}' -Raw | Set-Clipboard; Start-Process notepad.exe; Start-Sleep -Milliseconds 800; $wshell = New-Object -ComObject wscript.shell; $wshell.AppActivate('Notepad'); Start-Sleep -Milliseconds 300; $wshell.SendKeys('^v')`;

    // Execute PowerShell command safely
    exec(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${psScript}"`, (error) => {
      if (error) {
        resolve({ success: false, output: `PowerShell Error: ${error.message}` });
      } else {
        resolve({ success: true, output: `Successfully launched Notepad and pasted HTML code!` });
      }
    });
  });
});

// General Terminal Command Runner
ipcMain.handle('run-terminal', async (event, command) => {
  return new Promise((resolve) => {
    exec(command, (error, stdout, stderr) => {
      if (error) resolve({ success: false, output: stderr || error.message });
      else resolve({ success: true, output: stdout });
    });
  });
});