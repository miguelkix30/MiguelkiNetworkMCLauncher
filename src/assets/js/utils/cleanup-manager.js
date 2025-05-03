const fs = require('fs');
const path = require('path');
const { ipcRenderer } = require('electron');
import config from './config.js';

class CleanupManager {
    constructor() {
        // Inicialmente no inicializamos la base de datos para evitar referencias circulares
        this.db = null;
        this.cleanupQueue = [];
        this.isProcessing = false;
        this.activeInstances = new Set();
        this.pendingCleanups = new Map();
        this.debugMode = false;
        this.gameFullyStarted = new Set();
        this.startupCleanupCompleted = new Set();
        this.patterns = {
            gameFullyStartedPatterns: [],
            earlyStartupPatterns: [],
            startupSafePatterns: [],
            safeMinecraftDirectories: [],
            unsafePatterns: []
        };
        this.enabled = false;
    }

    debug(message) {
        if (this.debugMode) {
            console.log(`[CleanupManager] ${message}`);
        }
    }

    /**
     * Inicializa el administrador de limpieza con la instancia de base de datos
     * @param {Object} database - Instancia de la base de datos
     */
    async initializeWithDatabase(database) {
        if (this.db) {
            return; // Ya inicializado
        }
        
        this.db = database;
        await this.initialize();
    }

    async initialize() {
        if (!this.db) {
            console.warn("CleanupManager: No se ha inicializado con la base de datos");
            return;
        }
        
        try {
            const configClient = await this.db.readData('configClient');
            
            // Verificar que configClient existe antes de continuar
            if (!configClient) {
                console.warn("CleanupManager: No se encontró configClient, inicialización parcial");
                this.enabled = await this.loadPatterns();
                return;
            }
            
            // Inicializar pendingCleanup si no existe
            if (!configClient.pendingCleanup) {
                configClient.pendingCleanup = [];
                await this.db.updateData('configClient', configClient);
            } 
            // Cargar tareas pendientes si existen
            else if (Array.isArray(configClient.pendingCleanup) && configClient.pendingCleanup.length > 0) {
                this.cleanupQueue = configClient.pendingCleanup;
                this.processQueue();
            }
            
            await this.cleanupPendingDirectories();
            
            this.enabled = await this.loadPatterns();
            
            if (!this.enabled) {
                console.warn("CleanupManager: Desactivado debido a configuración de patrones faltante");
            } else {
                console.log("CleanupManager: Inicializado correctamente");
            }
        } catch (error) {
            console.error('Error initializing cleanup manager:', error);
            this.enabled = false;
        }
    }
    
    async loadPatterns() {
        try {
            const serverConfig = await config.GetConfig();
            if (serverConfig && serverConfig.cleanupPatterns) {
                const hasRequiredPatterns = 
                    Array.isArray(serverConfig.cleanupPatterns.gameFullyStartedPatterns) &&
                    Array.isArray(serverConfig.cleanupPatterns.startupSafePatterns) &&
                    Array.isArray(serverConfig.cleanupPatterns.safeMinecraftDirectories) &&
                    Array.isArray(serverConfig.cleanupPatterns.unsafePatterns);
                    
                if (hasRequiredPatterns) {
                    this.patterns = {
                        gameFullyStartedPatterns: serverConfig.cleanupPatterns.gameFullyStartedPatterns,
                        earlyStartupPatterns: serverConfig.cleanupPatterns.earlyStartupPatterns || [],
                        startupSafePatterns: serverConfig.cleanupPatterns.startupSafePatterns,
                        safeMinecraftDirectories: serverConfig.cleanupPatterns.safeMinecraftDirectories,
                        unsafePatterns: serverConfig.cleanupPatterns.unsafePatterns
                    };
                    return true;
                } else {
                    console.warn('Cleanup patterns available but missing required fields');
                    return false;
                }
            } else {
                console.warn('No cleanup patterns available in server config');
                return false;
            }
        } catch (error) {
            console.error('Error loading patterns:', error);
            return false;
        }
    }

    async queueCleanup(instanceName, basePath, files, isImmediate = false) {
        if (!this.enabled) {
            return;
        }
        
        if (!instanceName || !basePath || !files || !Array.isArray(files)) {
            return;
        }

        this.markInstanceActive(instanceName);
        this.pendingCleanups.set(instanceName, {
            basePath,
            files,
            timestamp: Date.now()
        });
        
        if (isImmediate && !this.isGameStarting(instanceName)) {
            await this.createAndProcessCleanupTask(instanceName);
        }
    }

    async createAndProcessCleanupTask(instanceName) {
        if (!this.enabled) {
            return;
        }
        
        if (!this.pendingCleanups.has(instanceName)) {
            return;
        }

        const pendingCleanup = this.pendingCleanups.get(instanceName);
        
        const cleanupTask = {
            instanceName,
            basePath: pendingCleanup.basePath,
            files: pendingCleanup.files,
            timestamp: Date.now(),
            isCompleted: false,
            retryCount: 0,
            maxRetries: 3
        };

        this.cleanupQueue.push(cleanupTask);
        await this.updateQueueInDatabase();
        await this.processQueue();
        this.pendingCleanups.delete(instanceName);
    }

    isGameStarting(instanceName) {
        return this.activeInstances.has(instanceName);
    }

    markInstanceActive(instanceName) {
        if (!this.activeInstances.has(instanceName)) {
            this.activeInstances.add(instanceName);
        }
    }

    markGameFullyStarted(instanceName) {
        if (!this.enabled) {
            return;
        }
        
        if (!this.gameFullyStarted.has(instanceName)) {
            this.gameFullyStarted.add(instanceName);
            
            if (this.pendingCleanups.has(instanceName) && !this.hasCompletedStartupCleanup(instanceName)) {
                this.performStartupCleanup(instanceName);
            }
        }
    }

    isGameFullyStarted(instanceName) {
        return this.gameFullyStarted.has(instanceName);
    }

    resetGameStartedState(instanceName) {
        if (this.gameFullyStarted.has(instanceName)) {
            this.gameFullyStarted.delete(instanceName);
        }
    }

    markInstanceInactive(instanceName) {
        if (this.activeInstances.has(instanceName)) {
            this.activeInstances.delete(instanceName);
            
            this.resetGameStartedState(instanceName);
            this.resetStartupCleanupState(instanceName);
            
            if (this.pendingCleanups.has(instanceName)) {
                setTimeout(() => {
                    this.createAndProcessCleanupTask(instanceName);
                }, 5000);
            }
        }
    }

    async updateQueueInDatabase() {
        try {
            const configClient = await this.db.readData('configClient');
            configClient.pendingCleanup = this.cleanupQueue.filter(task => !task.isCompleted);
            await this.db.updateData('configClient', configClient);
        } catch (error) {
            console.error('Error updating cleanup queue in database:', error);
        }
    }

    async processQueue() {
        if (!this.enabled || this.isProcessing || this.cleanupQueue.length === 0) {
            return;
        }

        this.isProcessing = true;
        
        try {
            for (let i = 0; i < this.cleanupQueue.length; i++) {
                const task = this.cleanupQueue[i];
                
                if (task.isCompleted) {
                    continue;
                }
                
                if (this.isGameStarting(task.instanceName)) {
                    continue;
                }
                
                const success = await this.performCleanup(task);
                
                if (success || task.retryCount >= task.maxRetries) {
                    task.isCompleted = true;
                } else {
                    task.retryCount++;
                }
                
                await this.updateQueueInDatabase();
            }
            
            this.cleanupQueue = this.cleanupQueue.filter(task => !task.isCompleted);
            await this.updateQueueInDatabase();
        } catch (error) {
            console.error('Error processing cleanup queue:', error);
        } finally {
            this.isProcessing = false;
        }
    }

    async performCleanup(task) {
        if (!this.enabled) {
            return false;
        }
        
        const { instanceName, basePath, files } = task;
        
        let allSuccessful = true;
        let processedFiles = 0;
        let deferredModsFolders = [];
        
        for (const file of files) {
            const filePath = path.join(basePath, "instances", instanceName, file);
            const lowerCaseFile = file.toLowerCase();
            
            try {
                if (fs.existsSync(filePath)) {
                    const stats = fs.lstatSync(filePath);
                    
                    if (stats.isDirectory() && (lowerCaseFile === 'mods' || lowerCaseFile.startsWith('mods/'))) {
                        deferredModsFolders.push({ file, filePath });
                        continue;
                    }
                    
                    if (stats.isDirectory()) {
                        try {
                            fs.rmSync(filePath, { recursive: true, force: true });
                            processedFiles++;
                        } catch (dirError) {
                            const deleteSuccess = this.recursiveDelete(filePath);
                            if (deleteSuccess) processedFiles++;
                            else allSuccessful = false;
                        }
                    } else {
                        try {
                            fs.accessSync(filePath, fs.constants.W_OK);
                            fs.unlinkSync(filePath);
                            processedFiles++;
                        } catch (accessErr) {
                            allSuccessful = false;
                        }
                    }
                }
            } catch (err) {
                allSuccessful = false;
            }
        }
        
        if (deferredModsFolders.length > 0) {
            for (const { file, filePath } of deferredModsFolders) {
                try {
                    if (fs.existsSync(filePath)) {
                        const stats = fs.lstatSync(filePath);
                        
                        if (stats.isDirectory()) {
                            try {
                                let deletedJars = await this.cleanModsFolderJars(filePath);
                                processedFiles += deletedJars;
                            } catch (innerErr) {
                                allSuccessful = false;
                            }
                        }
                    }
                } catch (err) {
                    allSuccessful = false;
                }
            }
        }
        
        return allSuccessful;
    }
    
    async cleanModsFolderJars(folderPath) {
        if (!this.enabled) {
            return 0;
        }
        
        let deletedFiles = 0;
        
        try {
            if (fs.existsSync(folderPath)) {
                const files = fs.readdirSync(folderPath);
                
                for (const file of files) {
                    const filePath = path.join(folderPath, file);
                    
                    try {
                        const stats = fs.lstatSync(filePath);
                        
                        if (stats.isDirectory()) {
                            deletedFiles += await this.cleanModsFolderJars(filePath);
                        } else if (file.toLowerCase().endsWith('.jar')) {
                            try {
                                fs.accessSync(filePath, fs.constants.W_OK);
                                fs.unlinkSync(filePath);
                                deletedFiles++;
                            } catch (err) {
                            }
                        } else {
                            try {
                                fs.unlinkSync(filePath);
                                deletedFiles++;
                            } catch (err) {
                            }
                        }
                    } catch (err) {
                    }
                }
            }
        } catch (err) {
        }
        
        return deletedFiles;
    }
    
    async delayedModsCleanup(instanceName) {
        return new Promise(resolve => {
            setTimeout(() => {
                resolve();
            }, 10000);
        });
    }
    
    async cleanupPendingDirectories() {
        try {
            const configClient = await this.db.readData('configClient');
            
            if (!configClient.pendingDirectoryDeletions || !Array.isArray(configClient.pendingDirectoryDeletions) || configClient.pendingDirectoryDeletions.length === 0) {
                return;
            }
            
            const remainingDirs = [];
            
            for (const dirPath of configClient.pendingDirectoryDeletions) {
                try {
                    if (fs.existsSync(dirPath)) {
                        fs.rmSync(dirPath, { recursive: true, force: true });
                    }
                } catch (err) {
                    remainingDirs.push(dirPath);
                }
            }
            
            configClient.pendingDirectoryDeletions = remainingDirs;
            await this.db.updateData('configClient', configClient);
        } catch (err) {
        }
    }

    processGameOutput(instanceName, logLine) {
        if (!this.enabled || this.isGameFullyStarted(instanceName)) {
            return;
        }

        const { gameFullyStartedPatterns, earlyStartupPatterns } = this.patterns;

        if (gameFullyStartedPatterns.some(pattern => logLine.includes(pattern))) {
            this.markGameFullyStarted(instanceName);
            return;
        }
    }
    
    async cleanupOnGameClose(instanceName) {
        if (!this.enabled) {
            return;
        }
        
        this.markInstanceInactive(instanceName);
    }

    hasCompletedStartupCleanup(instanceName) {
        return this.startupCleanupCompleted.has(instanceName);
    }

    markStartupCleanupCompleted(instanceName) {
        if (!this.startupCleanupCompleted.has(instanceName)) {
            this.startupCleanupCompleted.add(instanceName);
        }
    }

    resetStartupCleanupState(instanceName) {
        if (this.startupCleanupCompleted.has(instanceName)) {
            this.startupCleanupCompleted.delete(instanceName);
        }
    }

    async performStartupCleanup(instanceName) {
        if (!this.enabled) {
            console.log(`CleanupManager: Limpieza deshabilitada, no se puede realizar para ${instanceName}`);
            return;
        }
        
        if (!this.pendingCleanups.has(instanceName)) {
            console.log(`CleanupManager: No hay limpiezas pendientes para ${instanceName}`);
            return;
        }

        console.log(`CleanupManager: Iniciando limpieza para ${instanceName}`);
        const pendingCleanup = this.pendingCleanups.get(instanceName);
        const { startupSafePatterns, safeMinecraftDirectories, unsafePatterns } = this.patterns;
        
        let filesToClean = [];
        let modFiles = [];
        
        console.log(`CleanupManager: Analizando ${pendingCleanup.files.length} archivos para limpieza`);
        
        for (const file of pendingCleanup.files) {
            const lowerCaseFile = file.toLowerCase();
            
            if (lowerCaseFile === 'mods' || lowerCaseFile.startsWith('mods/') || lowerCaseFile.endsWith('.jar')) {
                modFiles.push(file);
                continue;
            }
            
            const isUnsafe = unsafePatterns.some(pattern => 
                lowerCaseFile.includes(pattern)
            );
            
            if (isUnsafe) {
                console.log(`CleanupManager: Archivo considerado inseguro para limpieza: ${file}`);
                continue;
            }
            
            let isSafeToClean = startupSafePatterns.some(pattern => 
                lowerCaseFile.includes(pattern)
            );
            
            if (!isSafeToClean) {
                isSafeToClean = safeMinecraftDirectories.some(dir => {
                    return file.startsWith(dir + '/') || file === dir;
                });
            }
            
            if (isSafeToClean) {
                console.log(`CleanupManager: Archivo seguro para limpieza: ${file}`);
                filesToClean.push(file);
            }
        }
        
        console.log(`CleanupManager: Se limpiarán ${filesToClean.length} archivos y ${modFiles.length} mods`);
        
        if (filesToClean.length > 0) {
            const task = {
                instanceName,
                basePath: pendingCleanup.basePath,
                files: filesToClean
            };
            
            console.log(`CleanupManager: Limpiando archivos generales para ${instanceName}`);
            await this.performCleanup(task);
        }
        
        if (modFiles.length > 0) {
            await this.delayedModsCleanup(instanceName);
            
            const modsTask = {
                instanceName,
                basePath: pendingCleanup.basePath,
                files: modFiles
            };
            
            console.log(`CleanupManager: Limpiando mods para ${instanceName}`);
            await this.performCleanup(modsTask);
        }
        
        this.markStartupCleanupCompleted(instanceName);
        console.log(`CleanupManager: Limpieza de inicio completada para ${instanceName}`);
        
        if (this.pendingCleanups.has(instanceName)) {
            const cleanedFiles = [...filesToClean, ...modFiles];
            const remainingFiles = pendingCleanup.files.filter(file => !cleanedFiles.includes(file));
            
            this.pendingCleanups.set(instanceName, {
                basePath: pendingCleanup.basePath,
                files: remainingFiles,
                timestamp: pendingCleanup.timestamp
            });
            console.log(`CleanupManager: Quedan ${remainingFiles.length} archivos pendientes de limpieza para ${instanceName}`);
        }
    }

    async cleanMKLibMods(instanceName, basePath) {
        console.log(`CleanupManager: Buscando librerías extra para eliminar en ${instanceName}...`);
        try {
            const modsPath = path.join(basePath, "instances", instanceName, "mods");
            
            if (!fs.existsSync(modsPath)) {
                console.log(`CleanupManager: Directorio de mods no existe: ${modsPath}`);
                return false;
            }
            
            let modsCleaned = 0;
            const files = fs.readdirSync(modsPath);
            
            for (const file of files) {
                if (file.startsWith("MiguelkiNetworkMCCore") && file.endsWith(".jar")) {
                    try {
                        const modPath = path.join(modsPath, file);
                        
                        fs.accessSync(modPath, fs.constants.W_OK);
                        fs.unlinkSync(modPath);
                        modsCleaned++;
                        console.log(`CleanupManager: Librería eliminada correctamente: ${file}`);
                    } catch (err) {
                        console.error(`CleanupManager: Error al eliminar librería extra ${file}: ${err.message}`);
                    }
                }
            }
            
            console.log(`CleanupManager: Se eliminaron ${modsCleaned} librerías extra.`);
            return modsCleaned > 0;
        } catch (error) {
            console.error(`CleanupManager: Error en cleanMKLibMods: ${error.message}`);
            return false;
        }
    }
}

const cleanupManager = new CleanupManager();
export default cleanupManager;