const { app, ipcMain, BrowserWindow } = require('electron');
const { Authenticator } = require('minecraft-launcher-core');
const { autoUpdater } = require('electron-updater');
const pkg = require('../package.json');
const path = require('path');
const fs = require('fs');
const { URLSearchParams } = require('url');
const express = require('express');
const { vanilla, fabric, forge, quilt } = require('tomate-loaders');

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

async function startServer() {
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
            
            if (!token) {
                console.error("Error: No se recibió un token de acceso válido");
                response.status(500).send("Error: No se recibió un token de acceso válido");
                return;
            }
            
            authToken = token;
            console.log("Token de Discord recibido con éxito");
            
            // Enviar respuesta con verificación de cierre
            response.send(`
                <html>
                <head>
                    <title>Autenticación completada</title>
                    <script>
                        window.onload = function() {
                            // Pequeño retraso para asegurar que el token se procese correctamente
                            setTimeout(function() {
                                window.close();
                            }, 300);
                        }
                    </script>
                    <style>
                        body { 
                            font-family: Arial, sans-serif;
                            text-align: center; 
                            margin-top: 50px;
                            background-color: #36393f;
                            color: white;
                        }
                        h3 { margin-bottom: 10px; }
                    </style>
                </head>
                <body>
                    <h3>Autenticación completada</h3>
                    <p>Esta ventana se cerrará automáticamente...</p>
                </body>
                </html>
            `);
            
            // Cerrar el servidor después de un breve retraso
            setTimeout(() => {
                try {
                    server.close();
                    console.log('Servidor cerrado correctamente');
                } catch (err) {
                    console.error('Error al cerrar servidor:', err);
                }
            }, 1000);
        })
        .catch(err => {
            console.error("Error al obtener la token de Discord:", err);
            response.status(500).send(`
                <html>
                <head>
                    <title>Error de autenticación</title>
                    <style>
                        body { 
                            font-family: Arial, sans-serif;
                            text-align: center; 
                            margin-top: 50px;
                            background-color: #36393f;
                            color: white;
                        }
                        h3 { color: #ed4245; }
                        button {
                            background-color: #5865f2;
                            color: white;
                            border: none;
                            padding: 8px 16px;
                            border-radius: 4px;
                            cursor: pointer;
                            margin-top: 20px;
                        }
                    </style>
                </head>
                <body>
                    <h3>Error al obtener el token de Discord</h3>
                    <p>Ha ocurrido un error durante la autenticación.</p>
                    <button onclick="window.close()">Cerrar ventana</button>
                </body>
                </html>
            `);
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

// Main window IPC handlers
ipcMain.on('main-window-open', () => MainWindow.createWindow());
ipcMain.on('main-window-dev-tools', () => MainWindow.getWindow().webContents.openDevTools({ mode: 'detach' }));
ipcMain.on('main-window-dev-tools-close', () => MainWindow.getWindow().webContents.closeDevTools());
ipcMain.on('main-window-close', async () => {
    const mainWindow = MainWindow.getWindow();
    if (mainWindow) {
        await processCleanupQueue(mainWindow);
    }
    MainWindow.destroyWindow();
});
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

// Tomate-loaders IPC handlers
ipcMain.handle('get-launcher-config', async (event, options) => {
    try {
        const { loaderType, gameVersion, rootPath } = options;
        
        // Validar parámetros de entrada
        if (!loaderType || !gameVersion || !rootPath) {
            throw new Error('Faltan parámetros requeridos: loaderType, gameVersion, rootPath');
        }

        console.log(`Getting launcher config for ${loaderType} version ${gameVersion} at ${rootPath}`);
        
        // Verificar que el directorio raíz existe
        if (!fs.existsSync(rootPath)) {
            console.log(`Creating root directory: ${rootPath}`);
            fs.mkdirSync(rootPath, { recursive: true });
        }

        let launchConfig;
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Timeout al obtener configuración del loader')), 30000);
        });

        const configPromise = (async () => {
            switch (loaderType.toLowerCase()) {
                case 'forge':
                    console.log('Using Forge loader configuration');
                    launchConfig = await forge.getMCLCLaunchConfig({
                        gameVersion: gameVersion,
                        rootPath: rootPath,
                    });
                    break;
                case 'fabric':
                    console.log('Using Fabric loader configuration');
                    launchConfig = await fabric.getMCLCLaunchConfig({
                        gameVersion: gameVersion,
                        rootPath: rootPath,
                    });
                    break;
                case 'quilt':
                    console.log('Using Quilt loader configuration');
                    launchConfig = await quilt.getMCLCLaunchConfig({
                        gameVersion: gameVersion,
                        rootPath: rootPath,
                    });
                    break;
                case 'vanilla':
                case 'none':
                default:
                    console.log('Using Vanilla loader configuration');
                    launchConfig = await vanilla.getMCLCLaunchConfig({
                        gameVersion: gameVersion,
                        rootPath: rootPath,
                    });
                    break;
            }
            return launchConfig;
        })();

        // Ejecutar con timeout
        launchConfig = await Promise.race([configPromise, timeoutPromise]);

        // Validar que la configuración es válida
        if (!launchConfig) {
            throw new Error('La configuración del launcher está vacía');
        }

        console.log(`Configuración original de ${loaderType}:`, {
            hasGameDirectory: !!launchConfig.gameDirectory,
            hasDirectory: !!launchConfig.directory,
            hasRoot: !!launchConfig.root,
            hasVersion: !!launchConfig.version,
            allKeys: Object.keys(launchConfig)
        });

        // Asegurar que la configuración tenga el gameDirectory correcto
        if (!launchConfig.gameDirectory && !launchConfig.directory) {
            console.log('Configuración sin gameDirectory, estableciendo basado en rootPath');
            // Para minecraft-launcher-core, necesitamos establecer el gameDirectory
            launchConfig.gameDirectory = rootPath;
        }
        
        // Asegurar compatibilidad con diferentes propiedades
        if (launchConfig.directory && !launchConfig.gameDirectory) {
            launchConfig.gameDirectory = launchConfig.directory;
        }
        
        // Asegurar que el directorio del juego existe
        const gameDir = launchConfig.gameDirectory || launchConfig.directory || rootPath;
        if (!fs.existsSync(gameDir)) {
            console.log(`Creando directorio del juego: ${gameDir}`);
            fs.mkdirSync(gameDir, { recursive: true });
        }

        console.log(`Launcher config obtained successfully for ${loaderType}`);
        console.log(`Config details:`, {
            hasGameDirectory: !!launchConfig.gameDirectory,
            hasDirectory: !!launchConfig.directory,
            hasVersion: !!launchConfig.version,
            configKeys: Object.keys(launchConfig)
        });

        return { 
            success: true, 
            config: launchConfig,
            loaderType: loaderType,
            gameVersion: gameVersion 
        };
    } catch (error) {
        console.error('Error getting launcher config:', error);
        
        // Categorizar el error para mejor manejo
        let errorCategory = 'unknown';
        let userMessage = error.message;
        
        if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
            errorCategory = 'network';
            userMessage = 'No se pudo conectar con los servidores de descarga. Verifica tu conexión a internet.';
        } else if (error.message.includes('ENOENT') || error.message.includes('EPERM')) {
            errorCategory = 'filesystem';
            userMessage = 'Error de permisos o archivos. Verifica que tienes permisos de escritura en la carpeta del launcher.';
        } else if (error.message.includes('Timeout')) {
            errorCategory = 'timeout';
            userMessage = 'La descarga tardó demasiado tiempo. Inténtalo de nuevo.';
        } else if (error.message.includes('version') || error.message.includes('not found')) {
            errorCategory = 'version';
            userMessage = `La versión ${options.gameVersion} no está disponible para ${options.loaderType}. Verifica que la combinación sea válida.`;
        }
        
        return { 
            success: false, 
            error: userMessage,
            originalError: error.message,
            stack: error.stack,
            category: errorCategory,
            loaderType: options.loaderType,
            gameVersion: options.gameVersion
        };
    }
});

// Handler para obtener versiones disponibles de loaders
ipcMain.handle('get-loader-versions', async (event, options) => {
    try {
        const { loaderType, gameVersion } = options;
        
        if (!loaderType || !gameVersion) {
            throw new Error('Faltan parámetros requeridos: loaderType, gameVersion');
        }

        console.log(`Getting available versions for ${loaderType} on Minecraft ${gameVersion}`);
        
        let versions = [];
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Timeout al obtener versiones del loader')), 15000);
        });

        const versionsPromise = (async () => {
            switch (loaderType.toLowerCase()) {
                case 'forge':
                    if (forge.getVersions) {
                        versions = await forge.getVersions(gameVersion);
                    }
                    break;
                case 'fabric':
                    if (fabric.getVersions) {
                        versions = await fabric.getVersions(gameVersion);
                    }
                    break;
                case 'quilt':
                    if (quilt.getVersions) {
                        versions = await quilt.getVersions(gameVersion);
                    }
                    break;
                default:
                    versions = ['latest']; // Para vanilla
                    break;
            }
            return versions;
        })();

        versions = await Promise.race([versionsPromise, timeoutPromise]);

        return {
            success: true,
            versions: versions || [],
            loaderType: loaderType,
            gameVersion: gameVersion
        };
    } catch (error) {
        console.error('Error getting loader versions:', error);
        return {
            success: false,
            error: error.message,
            versions: []
        };
    }
});

// Handler para validar configuración antes de lanzar
ipcMain.handle('validate-launcher-config', async (event, options) => {
    try {
        const { config, loaderType, gameVersion } = options;
        
        if (!config) {
            throw new Error('No se proporcionó configuración para validar');
        }

        const validation = {
            valid: true,
            errors: [],
            warnings: []
        };

        // Validar campos esenciales
        if (!config.gameDirectory && !config.directory && !config.root) {
            validation.warnings.push('Falta directorio del juego en la configuración (se establecerá automáticamente)');
        }

        if (!config.version && !gameVersion) {
            validation.errors.push('No se especificó versión del juego');
        }

        // Validar rutas específicas
        const gameDir = config.gameDirectory || config.directory || config.root;
        if (gameDir && !fs.existsSync(gameDir)) {
            validation.warnings.push(`El directorio ${gameDir} no existe, se creará automáticamente`);
        }

        // Validar loader específico
        if (loaderType !== 'vanilla' && loaderType !== 'none') {
            if (!config.version || !config.version.custom) {
                validation.warnings.push(`Configuración de ${loaderType} puede estar incompleta`);
            }
        }

        validation.valid = validation.errors.length === 0;

        return {
            success: true,
            validation: validation
        };
    } catch (error) {
        console.error('Error validating launcher config:', error);
        return {
            success: false,
            error: error.message,
            validation: { valid: false, errors: [error.message], warnings: [] }
        };
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

// External URL handlers
ipcMain.on('open-discord-url', () => {
    require('electron').shell.openExternal(pkg.discord_url);
});

// App control handlers
ipcMain.on('app-restart', () => {
    console.log('Reiniciando aplicación...');
    
    app.relaunch({ args: process.argv.slice(1).concat(['--restarted']) });
    app.exit(0);
});

// Discord auth handler
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
    const { Auth } = require('msmc');
    
    try {
        console.log('Starting Microsoft authentication with msmc...');
        console.log('Using client_id:', client_id || 'default');
        
        // Create a new Auth manager with select_account prompt
        // Use the provided client_id for better security
        const authManager = client_id ? new Auth("select_account", client_id) : new Auth("select_account");
        
        // Launch using the 'electron' framework 
        const xboxManager = await authManager.launch("electron", {
            width: 500,
            height: 700,
            resizable: false,
            center: true,
            show: true,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true
            }
        });
        
        console.log('Xbox authentication successful, getting Minecraft token...');
        
        // Get Minecraft authentication
        const minecraftAuth = await xboxManager.getMinecraft();
        
        console.log('Minecraft authentication successful');
        
        // Return the authentication data in the expected format
        return {
            access_token: minecraftAuth.mcToken,
            client_token: null,
            uuid: minecraftAuth.profile.id,
            name: minecraftAuth.profile.name,
            user_properties: "{}",
            meta: {
                type: "Microsoft",
                demo: minecraftAuth.profile.demo || false
            },
            refresh_token: xboxManager.save(),
            profile: minecraftAuth.profile
        };
        
    } catch (error) {
        console.error('Microsoft authentication error in main process:', error);
        
        // Handle specific errors for better debugging
        if (error.message && error.message.includes('closed')) {
            throw new Error('error.gui.closed');
        } else if (error.message && error.message.includes('cancelled')) {
            throw new Error('error.user.cancelled');
        } else {
            throw error;
        }
    }
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

async function processCleanupQueue(win) {
    if (win && !win.isDestroyed()) {
        try {
            win.webContents.send('process-cleanup-queue');
            
            await new Promise(resolve => setTimeout(resolve, 800));
        } catch (err) {
            console.error('Error processing cleanup queue on close:', err);
        }
    }
}

ipcMain.on('app-quit', async () => {
    const mainWindow = MainWindow.getWindow();
    if (mainWindow) {
        await processCleanupQueue(mainWindow);
    }
    app.exit(0);
});

ipcMain.handle('process-cleanup-queue', async () => {
    try {
        const mainWindow = MainWindow.getWindow();
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('process-cleanup-queue');
            
            await new Promise(resolve => setTimeout(resolve, 500));
            return { success: true };
        }
        return { success: false, error: 'Window not available' };
    } catch (error) {
        console.error('Error processing cleanup queue:', error);
        return { success: false, error: error.message };
    }
});

app.on('before-quit', async (event) => {
    const mainWindow = MainWindow.getWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
        event.preventDefault();
        await processCleanupQueue(mainWindow);
        setTimeout(() => app.exit(0), 800);
    }
});

// Handler para diagnósticos del sistema
ipcMain.handle('run-diagnostics', async (event) => {
    try {
        const diagnostics = {
            timestamp: new Date().toISOString(),
            system: {
                platform: process.platform,
                arch: process.arch,
                nodeVersion: process.version,
                electronVersion: process.versions.electron
            },
            memory: {
                total: require('os').totalmem(),
                free: require('os').freemem(),
                used: process.memoryUsage()
            },
            directories: {},
            java: {},
            loaders: {}
        };

        // Verificar directorios importantes
        const appDataPath = app.getPath('appData');
        const userDataPath = app.getPath('userData');
        
        diagnostics.directories.appData = {
            path: appDataPath,
            exists: fs.existsSync(appDataPath),
            writable: await checkDirectoryWritable(appDataPath)
        };
        
        diagnostics.directories.userData = {
            path: userDataPath,
            exists: fs.existsSync(userDataPath),
            writable: await checkDirectoryWritable(userDataPath)
        };

        // Verificar Java (si está configurado)
        try {
            const { spawn } = require('child_process');
            const javaVersion = await new Promise((resolve, reject) => {
                const java = spawn('java', ['-version']);
                let output = '';
                java.stderr.on('data', (data) => { output += data.toString(); });
                java.on('close', (code) => {
                    if (code === 0) {
                        resolve(output);
                    } else {
                        reject(new Error('Java not found'));
                    }
                });
                java.on('error', () => reject(new Error('Java not found')));
            });
            
            diagnostics.java.available = true;
            diagnostics.java.version = javaVersion.split('\n')[0];
        } catch (error) {
            diagnostics.java.available = false;
            diagnostics.java.error = error.message;
        }

        // Verificar conectividad con servidores de mods
        try {
            const testUrls = [
                'https://files.minecraftforge.net/',
                'https://maven.fabricmc.net/',
                'https://api.modrinth.com/'
            ];
            
            diagnostics.connectivity = {};
            
            for (const url of testUrls) {
                try {
                    const response = await fetch(url, { 
                        method: 'HEAD', 
                        timeout: 5000 
                    });
                    diagnostics.connectivity[url] = {
                        status: response.status,
                        accessible: response.ok
                    };
                } catch (error) {
                    diagnostics.connectivity[url] = {
                        status: 'error',
                        accessible: false,
                        error: error.message
                    };
                }
            }
        } catch (error) {
            diagnostics.connectivity = { error: error.message };
        }

        return { success: true, diagnostics };
    } catch (error) {
        console.error('Error running diagnostics:', error);
        return { success: false, error: error.message };
    }
});

// Helper para verificar si un directorio es escribible
async function checkDirectoryWritable(dirPath) {
    try {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
        
        const testFile = path.join(dirPath, '.write-test');
        fs.writeFileSync(testFile, 'test');
        fs.unlinkSync(testFile);
        return true;
    } catch (error) {
        return false;
    }
}

// Handler para limpiar caché y archivos temporales
ipcMain.handle('cleanup-cache', async (event, options = {}) => {
    try {
        const results = {
            cleaned: [],
            errors: [],
            totalSize: 0
        };

        const userDataPath = app.getPath('userData');
        const cachePaths = [
            path.join(userDataPath, 'Cache'),
            path.join(userDataPath, 'Code Cache'),
            path.join(userDataPath, 'GPUCache'),
            path.join(userDataPath, 'DawnWebGPUCache'),
            path.join(userDataPath, 'DawnGraphiteCache')
        ];

        for (const cachePath of cachePaths) {
            try {
                if (fs.existsSync(cachePath)) {
                    const size = await getDirectorySize(cachePath);
                    await fs.promises.rm(cachePath, { recursive: true, force: true });
                    results.cleaned.push({
                        path: cachePath,
                        size: size
                    });
                    results.totalSize += size;
                }
            } catch (error) {
                results.errors.push({
                    path: cachePath,
                    error: error.message
                });
            }
        }

        // Limpiar logs antiguos si se especifica
        if (options.cleanLogs) {
            try {
                const logsPath = path.join(userDataPath, 'logs');
                if (fs.existsSync(logsPath)) {
                    const files = fs.readdirSync(logsPath);
                    const cutoffDate = new Date();
                    cutoffDate.setDate(cutoffDate.getDate() - 7); // Mantener solo logs de la última semana
                    
                    for (const file of files) {
                        const filePath = path.join(logsPath, file);
                        const stats = fs.statSync(filePath);
                        
                        if (stats.mtime < cutoffDate) {
                            fs.unlinkSync(filePath);
                            results.cleaned.push({
                                path: filePath,
                                size: stats.size,
                                type: 'log'
                            });
                            results.totalSize += stats.size;
                        }
                    }
                }
            } catch (error) {
                results.errors.push({
                    path: 'logs',
                    error: error.message
                });
            }
        }

        return { success: true, results };
    } catch (error) {
        console.error('Error cleaning cache:', error);
        return { success: false, error: error.message };
    }
});

// Helper para obtener el tamaño de un directorio
async function getDirectorySize(dirPath) {
    let size = 0;
    
    try {
        const files = await fs.promises.readdir(dirPath);
        
        for (const file of files) {
            const filePath = path.join(dirPath, file);
            const stats = await fs.promises.stat(filePath);
            
            if (stats.isDirectory()) {
                size += await getDirectorySize(filePath);
            } else {
                size += stats.size;
            }
        }
    } catch (error) {
        // Ignorar errores de acceso a archivos individuales
    }
    
    return size;
}

// Handler para verificar y reparar configuración de Java
ipcMain.handle('verify-java-config', async (event, javaPath) => {
    try {
        const results = {
            valid: false,
            version: null,
            path: javaPath,
            errors: [],
            suggestions: []
        };

        if (!javaPath || !fs.existsSync(javaPath)) {
            results.errors.push('Ruta de Java no válida o no existe');
            results.suggestions.push('Selecciona una ruta válida de Java');
            return { success: true, results };
        }

        // Verificar que es ejecutable
        const { spawn } = require('child_process');
        
        try {
            const output = await new Promise((resolve, reject) => {
                const java = spawn(javaPath, ['-version']);
                let stderr = '';
                
                java.stderr.on('data', (data) => {
                    stderr += data.toString();
                });
                
                java.on('close', (code) => {
                    if (code === 0) {
                        resolve(stderr);
                    } else {
                        reject(new Error(`Java exited with code ${code}`));
                    }
                });
                
                java.on('error', (error) => {
                    reject(error);
                });
            });

            results.valid = true;
            results.version = output.split('\n')[0];
            
            // Verificar versión mínima
            const versionMatch = output.match(/version "?([0-9]+(\.[0-9]+)*)/);
            if (versionMatch) {
                const majorVersion = parseInt(versionMatch[1].split('.')[0]);
                if (majorVersion < 8) {
                    results.errors.push('Versión de Java demasiado antigua (mínimo Java 8)');
                    results.suggestions.push('Actualiza Java a una versión más reciente');
                } else if (majorVersion >= 17) {
                    results.suggestions.push('Java 17+ detectado - excelente para rendimiento moderno');
                }
            }

        } catch (error) {
            results.errors.push(`Error al ejecutar Java: ${error.message}`);
            results.suggestions.push('Verifica que Java esté instalado correctamente');
        }

        return { success: true, results };
    } catch (error) {
        console.error('Error verifying Java config:', error);
        return { success: false, error: error.message };
    }
});

// ...existing handlers...
