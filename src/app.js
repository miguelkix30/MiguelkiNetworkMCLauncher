const { app, ipcMain, BrowserWindow } = require('electron');
const { Microsoft } = require('minecraft-java-core');
const { autoUpdater } = require('electron-updater');
const pkg = require('../package.json');
const path = require('path');
const fs = require('fs');
const { URLSearchParams } = require('url');
const express = require('express');

const UpdateWindow = require("./assets/js/windows/updateWindow.js");
const MainWindow = require("./assets/js/windows/mainWindow.js");
let dev = process.env.NODE_ENV === 'dev';
let server;
let authToken;
let config = {
    "clientId": "1307003977442787451",
    "clientSecret": "UZSX-RM_KnL10I8vCGRYFaIKBDFzYn4Y",
    "redirectUri": "http://localhost:3030/auth/discord/"
  }

  function startServer() {
    const expressApp = express();
    const port = 3030;

    expressApp.get("/auth/discord/", (request, response) => {
        var code = request.query["code"];
        var params = new URLSearchParams();
        params.append("client_id", config["clientId"]);
        params.append("client_secret", config["clientSecret"]);
        params.append("grant_type", "authorization_code");
        params.append("code", code);
        params.append("redirect_uri", config["redirectUri"]);
        fetch(`https://discord.com/api/oauth2/token`, {
            method: "POST",
            body: params
        })
        .then(res => res.json())
        .then(json => {
            // Guardar token
            const token = json.access_token;
            authToken = token;
            console.log("Token de Discord:", token);
            response.send(`<script>window.close();</script>`);
            server.close();

        })
        .catch(err => {
            console.error("Error al obtener la token de Discord:", err);
            response.status(500).send("Error al obtener la token de Discord.");
        });
    });

    server = expressApp.listen(port, () => {
        console.log(`Servidor escuchando en http://localhost:${port}`);
    });
}


function stopServer() {
    if (server) {
        server.close(() => {
            console.log('Servidor cerrado');
        });
    }
}

if (dev) {
    let appPath = path.resolve('./data/Launcher').replace(/\\/g, '/');
    let appdata = path.resolve('./data').replace(/\\/g, '/');
    if (!fs.existsSync(appPath)) fs.mkdirSync(appPath, { recursive: true });
    if (!fs.existsSync(appdata)) fs.mkdirSync(appdata, { recursive: true });
    app.setPath('userData', appPath);
    app.setPath('appData', appdata);
}

if (!app.requestSingleInstanceLock()) app.quit();
else app.whenReady().then(() => {
    if (dev) return MainWindow.createWindow();
    UpdateWindow.createWindow();
});

ipcMain.on('main-window-open', () => MainWindow.createWindow());
ipcMain.on('main-window-dev-tools', () => MainWindow.getWindow().webContents.openDevTools({ mode: 'detach' }));
ipcMain.on('main-window-dev-tools-close', () => MainWindow.getWindow().webContents.closeDevTools());
ipcMain.on('main-window-close', () => MainWindow.destroyWindow());
ipcMain.on('main-window-reload', () => MainWindow.getWindow().reload());
ipcMain.on('main-window-progress', (event, options) => MainWindow.getWindow().setProgressBar(options.progress / options.size));
ipcMain.on('main-window-progress-reset', () => MainWindow.getWindow().setProgressBar(-1));
ipcMain.on('main-window-progress-load', () => MainWindow.getWindow().setProgressBar(2));
ipcMain.on('main-window-minimize', () => MainWindow.getWindow().minimize());

ipcMain.on('update-window-close', () => UpdateWindow.destroyWindow());
ipcMain.on('update-window-dev-tools', () => UpdateWindow.getWindow().webContents.openDevTools({ mode: 'detach' }));
ipcMain.on('update-window-progress', (event, options) => UpdateWindow.getWindow().setProgressBar(options.progress / options.size));
ipcMain.on('update-window-progress-reset', () => UpdateWindow.getWindow().setProgressBar(-1));
ipcMain.on('update-window-progress-load', () => UpdateWindow.getWindow().setProgressBar(2));

ipcMain.handle('path-user-data', () => app.getPath('userData'));
ipcMain.handle('appData', e => app.getPath('appData'));

ipcMain.on('main-window-maximize', () => {
    if (MainWindow.getWindow().isMaximized()) {
        MainWindow.getWindow().unmaximize();
    } else {
        MainWindow.getWindow().maximize();
    }
});

ipcMain.on('main-window-hide', () => MainWindow.getWindow().hide());
ipcMain.on('main-window-show', () => MainWindow.getWindow().show());

ipcMain.on('create-store-window', () => {
    let storewin = new BrowserWindow({
        width: 1280,
        height: 795,
        minimizable: false,
        maximizable: false,
        resizable: false,
        webPreferences: {
            nodeIntegration: true,
        }
    });
    storewin.loadURL(pkg.store_url);
});

ipcMain.on('create-skin-window', () => {
    let skinwin = new BrowserWindow({
        width: 500,
        height: 800,
        minimizable: false,
        maximizable: false,
        resizable: false,
        webPreferences: {
            nodeIntegration: true,
        }
    });
    skinwin.loadURL(pkg.azuriom_url + 'skin-api');
});

ipcMain.on('create-register-window', () => {
    let registerWin = new BrowserWindow({
        width: 500,
        height: 800,
        minimizable: false,
        maximizable: false,
        resizable: false,
        webPreferences: {
            nodeIntegration: true,
            partition: `persist:${Math.random()}`
        }
    });

    registerWin.loadURL(pkg.azuriom_url + 'user/register');
});

ipcMain.on('open-discord-url', () => {
    require('electron').shell.openExternal(pkg.discord_url);
});

ipcMain.on('app-restart', () => {
    console.log('Reiniciando aplicación...');
    
    // Clear any cached data
    app.relaunch({ args: process.argv.slice(1).concat(['--restarted']) });
    app.exit(0);
});

ipcMain.handle('open-discord-auth', async () => {
    return new Promise((resolve, reject) => {
        authToken = null;
        startServer();

        const discordWin = new BrowserWindow({
            width: 1000,
            height: 725,
            minimizable: false,
            maximizable: false,
            resizable: false,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: true,
            }
        });

        discordWin.loadURL('https://discord.com/oauth2/authorize?client_id=1307003977442787451&response_type=code&redirect_uri=http%3A%2F%2Flocalhost%3A3030%2Fauth%2Fdiscord%2F&scope=identify+guilds');

        discordWin.on('closed', () => {
            console.log("Ventana de Discord cerrada");
            stopServer();
            if (!authToken || authToken === "" || authToken === null) {
                reject(new Error('No se recibió un token de Discord.'));
            } else {
                resolve(authToken);
            }
        });
    });
});

ipcMain.handle('Microsoft-window', async (_, client_id) => {
    return await new Microsoft(client_id).getAuth();
});

ipcMain.handle('is-dark-theme', (_, theme) => {
    return true;
});

app.on('window-all-closed', () => {
    app.quit();
});

autoUpdater.autoDownload = false;

ipcMain.handle('update-app', async () => {
    return await new Promise(async (resolve, reject) => {
        autoUpdater.checkForUpdates().then(res => {
            resolve(res);
        }).catch(error => {
            reject({
                error: true,
                message: error
            });
        });
    });
});

autoUpdater.on('update-available', () => {
    const updateWindow = UpdateWindow.getWindow();
    if (updateWindow) updateWindow.webContents.send('updateAvailable');
});

ipcMain.on('start-update', () => {
    autoUpdater.downloadUpdate();
});

autoUpdater.on('update-not-available', () => {
    const updateWindow = UpdateWindow.getWindow();
    if (updateWindow) updateWindow.webContents.send('update-not-available');
});

autoUpdater.on('update-downloaded', () => {
    autoUpdater.quitAndInstall();
});

autoUpdater.on('download-progress', (progress) => {
    const updateWindow = UpdateWindow.getWindow();
    if (updateWindow) updateWindow.webContents.send('download-progress', progress);
});

autoUpdater.on('error', (err) => {
    const updateWindow = UpdateWindow.getWindow();
    if (updateWindow) updateWindow.webContents.send('error', err);
});
