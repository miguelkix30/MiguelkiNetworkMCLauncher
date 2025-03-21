const fs = require('fs');
const path = require('path');
const { ipcRenderer } = require('electron');
import { database, config } from '../utils.js';

class CleanupManager {
    constructor() {
        this.db = new database();
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

    async initialize() {
        try {
            const configClient = await this.db.readData('configClient');
            if (configClient.pendingCleanup && Array.isArray(configClient.pendingCleanup)) {
                this.cleanupQueue = configClient.pendingCleanup;
                
                if (this.cleanupQueue.length > 0) {
                    this.processQueue();
                }
            } else {
                if (!configClient.pendingCleanup) {
                    configClient.pendingCleanup = [];
                    await this.db.updateData('configClient', configClient);
                }
            }
            
            await this.cleanupPendingDirectories();
            
            this.enabled = await this.loadPatterns();
            
            if (!this.enabled) {
                console.warn("Cleanup manager has been disabled due to missing pattern configuration");
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
            return;
        }
        
        if (!this.pendingCleanups.has(instanceName)) {
            return;
        }

        const pendingCleanup = this.pendingCleanups.get(instanceName);
        const { startupSafePatterns, safeMinecraftDirectories, unsafePatterns } = this.patterns;
        
        let filesToClean = [];
        let modFiles = [];
        
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
                filesToClean.push(file);
            }
        }
        
        if (filesToClean.length > 0) {
            const task = {
                instanceName,
                basePath: pendingCleanup.basePath,
                files: filesToClean
            };
            
            await this.performCleanup(task);
        }
        
        if (modFiles.length > 0) {
            await this.delayedModsCleanup(instanceName);
            
            const modsTask = {
                instanceName,
                basePath: pendingCleanup.basePath,
                files: modFiles
            };
            
            await this.performCleanup(modsTask);
        }
        
        this.markStartupCleanupCompleted(instanceName);
        
        if (this.pendingCleanups.has(instanceName)) {
            const cleanedFiles = [...filesToClean, ...modFiles];
            const remainingFiles = pendingCleanup.files.filter(file => !cleanedFiles.includes(file));
            
            this.pendingCleanups.set(instanceName, {
                basePath: pendingCleanup.basePath,
                files: remainingFiles,
                timestamp: pendingCleanup.timestamp
            });
        }
    }
}

const cleanupManager = new CleanupManager();
export default cleanupManager;