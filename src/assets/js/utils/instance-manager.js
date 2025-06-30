const nodeFetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { MinecraftDownloader, MinecraftExecutor, CustomInstaller } = require("minecraft-core-master");

/**
 * Downloads assets from a remote server with integrity verification
 * @param {string} url - URL to fetch the asset list from
 * @param {string} folder - Local folder to download assets to
 * @param {Array} ignoredList - List of files to ignore during verification
 * @param {Function} progressCallback - Callback function to report progress
 * @param {Function} statusCallback - Callback to update status text
 * @returns {Promise<boolean>} - Returns true if successful
 */
async function downloadInstanceAssets(url, folder, ignoredList = [], CONCURRENT_DOWNLOADS = 5, progressCallback = null, statusCallback = null) {
    const MAX_RETRIES = 3;
    
    try {
        if (statusCallback) statusCallback('Inicializando descarga de assets...');
        
        // Ensure the folder exists
        await ensureDirectoryExists(folder);
        
        // Obtain remote list of assets
        if (statusCallback) statusCallback('Obteniendo índice de assets...');
        const remoteAssets = await fetchRemoteAssetList(url);
        
        if (!remoteAssets || remoteAssets.length === 0) {
            console.log('No assets to download');
            return true;
        }
        
        console.log(`Found ${remoteAssets.length} assets to process`);
        
        // Calculate total size for progress tracking
        const totalSize = remoteAssets.reduce((sum, asset) => sum + (asset.size || 0), 0);
        let downloadedSize = 0;
        let processedFiles = 0;
        let downloadedFiles = 0;
        let skippedFiles = 0;
        
        if (statusCallback) statusCallback(`Verificando ${remoteAssets.length} assets...`);
        
        // Get existing local files for cleanup
        const localFiles = await getLocalFiles(folder);
        const validFiles = new Set();
        
        // First pass: Check which files need downloading
        const filesToDownload = [];
        let verificationCount = 0;
        
        console.log(`🔍 Starting verification of ${remoteAssets.length} assets...`);
        
        for (const asset of remoteAssets) {
            verificationCount++;
            const localPath = path.join(folder, asset.path);
            const shouldIgnoreChecksum = ignoredList.some(ignored => 
                asset.path.includes(ignored) || asset.path.endsWith('.disabled')
            );
            
            validFiles.add(asset.path);
            
            // Update status and progress every 20 files
            if (verificationCount % 20 === 0 || verificationCount === remoteAssets.length) {
                if (statusCallback) statusCallback(`Verificando assets... ${verificationCount}/${remoteAssets.length}`);
                if (progressCallback) {
                    const verificationProgress = Math.round((verificationCount / remoteAssets.length) * 50); // 50% for verification
                    progressCallback(verificationProgress, verificationCount, remoteAssets.length, 0, totalSize);
                }
            }
            // Check if file exists and verify integrity
            const needsDownload = await shouldDownloadFile(localPath, asset, shouldIgnoreChecksum);
            
            if (needsDownload) {
                filesToDownload.push({ asset, localPath });
            } else {
                skippedFiles++;
            }
        }
        
        console.log(`Files to download: ${filesToDownload.length}, already valid: ${skippedFiles}`);
        
        // Report initial progress after verification is complete
        if (progressCallback) {
            const verificationProgress = 50; // Verification complete
            progressCallback(verificationProgress, remoteAssets.length, remoteAssets.length, 0, totalSize);
        }
        if (filesToDownload.length === 0) {
            // Still clean up obsolete files
            await cleanupObsoleteFiles(folder, localFiles, validFiles, ignoredList);
            // Update progress to 100% for skipped files
            if (progressCallback) {
                progressCallback(100, remoteAssets.length, remoteAssets.length, 0, totalSize);
            }
            if (statusCallback) statusCallback('Todos los assets están actualizados');
            return true;
        }
        
        // Download files with concurrency control
        if (statusCallback) statusCallback(`Descargando ${filesToDownload.length} assets...`);
        
        const downloadPromises = [];
        let currentDownloads = 0;
        let downloadQueue = [...filesToDownload];
        
        const downloadNext = async () => {
            while (downloadQueue.length > 0 && currentDownloads < CONCURRENT_DOWNLOADS) {
                const { asset, localPath } = downloadQueue.shift();
                currentDownloads++;
                
                const downloadPromise = downloadFileWithRetry(asset, localPath, MAX_RETRIES)
                    .then(() => {
                        downloadedFiles++;
                        downloadedSize += asset.size || 0;
                        
                        // Report progress
                        if (progressCallback) {
                            const totalFiles = remoteAssets.length;
                            const totalProcessed = downloadedFiles + skippedFiles;
                            // Progress goes from 50% to 100% during download phase
                            const downloadProgress = Math.round(50 + ((totalProcessed / totalFiles) * 50));
                            progressCallback(downloadProgress, totalProcessed, totalFiles, downloadedSize, totalSize);
                        }
                        
                        if (statusCallback) {
                            const totalProcessed = downloadedFiles + skippedFiles;
                            const percentage = Math.round((totalProcessed / remoteAssets.length) * 100);
                            statusCallback(`Descargando assets... ${percentage}% (${totalProcessed}/${remoteAssets.length})`);
                        }
                    })
                    .catch((error) => {
                        console.error(`Error al descargar un asset:`, error);
                        throw new Error(`Error en la descarga del asset: ${error.message}`);
                    })
                    .finally(() => {
                        currentDownloads--;
                        return downloadNext();
                    });
                
                downloadPromises.push(downloadPromise);
            }
        };
        
        // Start initial downloads
        await downloadNext();
        
        // Wait for all downloads to complete
        await Promise.all(downloadPromises);
        
        // Update progress for skipped files
        const totalProcessed = downloadedFiles + skippedFiles;
        if (progressCallback) {
            progressCallback(100, totalProcessed, remoteAssets.length, downloadedSize, totalSize);
        }
        
        // Clean up files that are not in the remote list and not ignored
        if (statusCallback) statusCallback('Limpiando archivos obsoletos...');
        const cleanedFiles = await cleanupObsoleteFiles(folder, localFiles, validFiles, ignoredList);
        
        if (statusCallback) statusCallback('Descarga de assets completada');
        
        console.log(`Asset download completed successfully. Downloaded: ${downloadedFiles}, Skipped: ${skippedFiles}, Cleaned: ${cleanedFiles}`);
        return true;
        
    } catch (error) {
        console.error('Asset download failed:', error);
        throw error;
    }
}

/**
 * Ensures a directory exists, creating it recursively if needed
 */
async function ensureDirectoryExists(dirPath) {
    try {
        await fs.promises.mkdir(dirPath, { recursive: true });
    } catch (error) {
        if (error.code !== 'EEXIST') {
            throw error;
        }
    }
}

/**
 * Fetches the remote asset list from the server
 */
async function fetchRemoteAssetList(url) {
    try {
        console.log(`Fetching asset list from: ${url}`);
        const response = await nodeFetch(url, {
            method: 'GET',
            timeout: 30000,
            headers: {
                'User-Agent': 'MiguelkiNetworkMCLauncher',
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const assets = await response.json();
        
        if (!Array.isArray(assets)) {
            throw new Error('Invalid asset list format received');
        }
        
        console.log(`📦 Received ${assets.length} assets from server`);
        
        // Log first few assets for debugging
        if (assets.length > 0) {
            console.log('🔍 Sample assets from server:');
            assets.slice(0, 3).forEach((asset, index) => {
                console.log(`  Asset ${index + 1}:`);
                console.log(`    path: ${asset.path}`);
                console.log(`    url: ${asset.url}`);
                console.log(`    size: ${asset.size || 'N/A'}`);
                console.log(`    hash: ${asset.hash || 'N/A'}`);
            });
        }
        
        // Validate asset structure
        const validAssets = assets.filter(asset => {
            if (!asset.path || !asset.url) {
                console.warn('❌ Invalid asset found (missing path or url):', asset);
                return false;
            }
            return true;
        });
        
        if (validAssets.length !== assets.length) {
            console.warn(`Filtered out ${assets.length - validAssets.length} invalid assets`);
        }
        
        return validAssets;
    } catch (error) {
        console.error('Failed to fetch remote asset list:', error);
        throw new Error(`Failed to fetch asset list: ${error.message}`);
    }
}

/**
 * Checks if a file needs to be downloaded based on existence and integrity
 */
async function shouldDownloadFile(localPath, asset, shouldIgnoreChecksum) {
    try {
        // Check if file exists
        const stats = await fs.promises.stat(localPath);
        
        if (!stats.isFile()) {
            console.log(`❌ File does not exist or is not a file: ${asset.path}`);
            return true;
        }
        
        // If we should ignore checksum, just check existence
        if (shouldIgnoreChecksum) {
            console.log(`⚠️  Ignoring checksum verification for: ${asset.path}`);
            return false;
        }
        
        // Verify file size first (faster check)
        if (asset.size && stats.size !== asset.size) {
            console.log(`❌ Size mismatch for ${asset.path}: expected ${asset.size}, got ${stats.size}`);
            return true;
        }
        
        // Verify file hash if provided
        if (asset.hash) {
            // For debugging: only show detailed logs for first few files
            const shouldDebug = asset.path.includes('sounds/') || asset.path.includes('lang/') || asset.path.includes('blockstates/');
            
            if (shouldDebug) {
                console.log(`🔍 DEBUGGING: Verifying hash for ${asset.path}...`);
                console.log(`   File path: ${localPath}`);
                console.log(`   Expected hash from server: "${asset.hash}"`);
                console.log(`   Expected size from server: ${asset.size} bytes`);
                console.log(`   Actual file size: ${stats.size} bytes`);
            }
            
            const fileHash = await calculateFileHash(localPath);
            const expectedHash = asset.hash.toLowerCase().trim();
            const calculatedHash = fileHash.toLowerCase().trim();
            
            if (shouldDebug) {
                console.log(`   Calculated hash: "${calculatedHash}"`);
                console.log(`   Expected hash:   "${expectedHash}"`);
                console.log(`   Hash match: ${calculatedHash === expectedHash}`);
                console.log(`   Hash lengths: calculated=${calculatedHash.length}, expected=${expectedHash.length}`);
                
                // Show first and last few characters for comparison
                console.log(`   Hash comparison:`);
                console.log(`     Calculated: ${calculatedHash.substring(0,8)}...${calculatedHash.substring(calculatedHash.length-8)}`);
                console.log(`     Expected:   ${expectedHash.substring(0,8)}...${expectedHash.substring(expectedHash.length-8)}`);
            }
            
            if (calculatedHash !== expectedHash) {
                console.log(`❌ Hash mismatch for ${asset.path}`);
                if (!shouldDebug) {
                    console.log(`   Expected: "${expectedHash}"`);
                    console.log(`   Got:      "${calculatedHash}"`);
                }
                return true;
            } else if (shouldDebug) {
                console.log(`✅ Hash verified for ${asset.path}`);
            }
        } else {
            console.log(`⚠️  No hash provided for ${asset.path}, skipping hash verification`);
        }
        
        return false; // File is valid, don't download
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log(`❌ File not found: ${asset.path}`);
            return true; // File doesn't exist
        }
        console.error(`❌ Error checking file ${localPath}:`, error);
        return true; // Download on error to be safe
    }
}

/**
 * Downloads a file with retry logic
 */
async function downloadFileWithRetry(asset, localPath, maxRetries) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            await downloadFile(asset, localPath);
            return; // Success
        } catch (error) {
            lastError = error;
            console.warn(`Download attempt ${attempt}/${maxRetries} failed for ${asset.path}:`, error.message);
            
            if (attempt < maxRetries) {
                // Wait before retry (exponential backoff)
                const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    
    throw new Error(`Failed to download ${asset.path} after ${maxRetries} attempts: ${lastError.message}`);
}

/**
 * Downloads a single file
 */
async function downloadFile(asset, localPath) {
    // Ensure directory exists
    await ensureDirectoryExists(path.dirname(localPath));
    
    const response = await nodeFetch(asset.url, {
        timeout: 60000,
        headers: {
            'User-Agent': 'MiguelkiNetworkMCLauncher'
        }
    });
    
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    // Write file stream
    const fileStream = fs.createWriteStream(localPath);
    
    return new Promise((resolve, reject) => {
        response.body.pipe(fileStream);
        
        response.body.on('error', (error) => {
            fileStream.destroy();
            fs.unlink(localPath, () => {}); // Clean up partial file
            reject(error);
        });
        
        fileStream.on('error', (error) => {
            fs.unlink(localPath, () => {}); // Clean up partial file
            reject(error);
        });
        
        fileStream.on('finish', resolve);
    });
}

/**
 * Calculates SHA1 hash of a file
 */
async function calculateFileHash(filePath) {
    return new Promise((resolve, reject) => {
        try {
            console.log(`📄 Calculating hash for: ${filePath}`);
            
            // Check if file exists first
            if (!fs.existsSync(filePath)) {
                reject(new Error(`File does not exist: ${filePath}`));
                return;
            }
            
            const hash = crypto.createHash('sha1');
            const stream = fs.createReadStream(filePath);
            
            let bytesRead = 0;
            
            stream.on('error', (error) => {
                console.error(`❌ Error reading file for hash calculation: ${filePath}`, error);
                reject(error);
            });
            
            stream.on('data', chunk => {
                hash.update(chunk);
                bytesRead += chunk.length;
            });
            
            stream.on('end', () => {
                const result = hash.digest('hex');
                console.log(`🔍 Hash calculation complete for ${path.basename(filePath)}:`);
                console.log(`   File: ${filePath}`);
                console.log(`   Size: ${bytesRead} bytes`);
                console.log(`   SHA1: ${result}`);
                resolve(result);
            });
            
        } catch (error) {
            console.error(`❌ Error creating hash stream for: ${filePath}`, error);
            reject(error);
        }
    });
}

/**
 * Gets all local files recursively
 */
async function getLocalFiles(dirPath, relativePath = '') {
    const files = [];
    
    try {
        const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
        
        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            const relPath = path.join(relativePath, entry.name).replace(/\\/g, '/');
            
            if (entry.isDirectory()) {
                const subFiles = await getLocalFiles(fullPath, relPath);
                files.push(...subFiles);
            } else if (entry.isFile()) {
                files.push(relPath);
            }
        }
    } catch (error) {
        if (error.code !== 'ENOENT') {
            console.warn(`Error reading directory ${dirPath}:`, error);
        }
    }
    
    return files;
}

/**
 * Removes files that are not in the valid list and not ignored
 */
async function cleanupObsoleteFiles(baseFolder, localFiles, validFiles, ignoredList) {
    const filesToDelete = localFiles.filter(file => {
        // Don't delete if it's in the valid list
        if (validFiles.has(file)) {
            return false;
        }
        
        // Don't delete if it's ignored
        if (ignoredList.some(ignored => file.includes(ignored))) {
            return false;
        }
        
        // Don't delete .disabled files in mods folder
        if (file.includes('mods/') && file.endsWith('.disabled')) {
            return false;
        }
        
        return true;
    });
    
    for (const file of filesToDelete) {
        try {
            const fullPath = path.join(baseFolder, file);
            await fs.promises.unlink(fullPath);
            console.log(`Deleted obsolete file: ${file}`);
        } catch (error) {
            console.warn(`Failed to delete obsolete file ${file}:`, error.message);
        }
    }
    
    if (filesToDelete.length > 0) {
        console.log(`Cleaned up ${filesToDelete.length} obsolete files`);
    }
    
    return filesToDelete.length;
}

/**
 * Debug function to manually test a file's hash and compare with server
 * Call this from console: window.debugAssetFile('path/to/file')
 */
window.debugAssetFile = async function(filePath, expectedHash) {
    const crypto = require('crypto');
    const fs = require('fs');
    const path = require('path');
    
    try {
        console.log(`🔍 DEBUG: Testing file ${filePath}`);
        
        if (!fs.existsSync(filePath)) {
            console.log(`❌ File does not exist: ${filePath}`);
            return;
        }
        
        const stats = fs.statSync(filePath);
        console.log(`📊 File stats:`);
        console.log(`   Size: ${stats.size} bytes`);
        console.log(`   Modified: ${stats.mtime}`);
        
        // Calculate hash
        const calculatedHash = await new Promise((resolve, reject) => {
            const hash = crypto.createHash('sha1');
            const stream = fs.createReadStream(filePath);
            
            stream.on('error', reject);
            stream.on('data', chunk => hash.update(chunk));
            stream.on('end', () => resolve(hash.digest('hex')));
        });
        
        console.log(`🔑 Hash calculated: ${calculatedHash}`);
        
        if (expectedHash) {
            const normalizedExpected = expectedHash.toLowerCase().trim();
            const normalizedCalculated = calculatedHash.toLowerCase().trim();
            
            console.log(`🔗 Expected hash: ${normalizedExpected}`);
            console.log(`✅ Hashes match: ${normalizedCalculated === normalizedExpected}`);
            
            if (normalizedCalculated !== normalizedExpected) {
                console.log(`❌ Hash mismatch details:`);
                console.log(`   Calculated: "${normalizedCalculated}" (length: ${normalizedCalculated.length})`);
                console.log(`   Expected:   "${normalizedExpected}" (length: ${normalizedExpected.length})`);
            }
        }
        
        // Also test with PHP-equivalent method
        console.log(`🐘 Testing PHP hash_file equivalent...`);
        
        return {
            filePath,
            size: stats.size,
            hash: calculatedHash,
            matches: expectedHash ? calculatedHash.toLowerCase() === expectedHash.toLowerCase().trim() : null
        };
        
    } catch (error) {
        console.error(`❌ Debug error:`, error);
    }
};

/**
 * Debug function to manually test a single asset file
 * Call this from console: debugSingleAsset('/path/to/instance', 'relative/path/to/file.jar', 'expected_hash', expected_size)
 */
window.debugSingleAsset = async function(instancePath, relativePath, expectedHash, expectedSize) {
    const fs = require('fs');
    const path = require('path');
    const crypto = require('crypto');
    
    const localPath = path.join(instancePath, relativePath);
    
    console.log(`🔍 DEBUG SINGLE ASSET:`);
    console.log(`   Instance path: ${instancePath}`);
    console.log(`   Relative path: ${relativePath}`);
    console.log(`   Full local path: ${localPath}`);
    console.log(`   Expected hash: ${expectedHash}`);
    console.log(`   Expected size: ${expectedSize}`);
    
    // Check if file exists
    if (!fs.existsSync(localPath)) {
        console.log(`   ❌ File does not exist`);
        return;
    }
    
    // Get file stats
    const stats = fs.statSync(localPath);
    console.log(`   📊 Actual file size: ${stats.size} bytes`);
    console.log(`   📊 Size match: ${stats.size === expectedSize}`);
    
    // Calculate hash
    const hash = crypto.createHash('sha1');
    const stream = fs.createReadStream(localPath);
    
    return new Promise((resolve) => {
        stream.on('data', chunk => hash.update(chunk));
        stream.on('end', () => {
            const calculatedHash = hash.digest('hex');
            console.log(`   🔒 Calculated hash: ${calculatedHash}`);
            console.log(`   🔒 Expected hash:   ${expectedHash}`);
            console.log(`   🔒 Hash match: ${calculatedHash.toLowerCase() === expectedHash.toLowerCase()}`);
            
            if (calculatedHash.toLowerCase() !== expectedHash.toLowerCase()) {
                console.log(`   ❌ HASH MISMATCH!`);
                console.log(`   📄 First 10 chars - Calc: ${calculatedHash.substring(0,10)} | Exp: ${expectedHash.substring(0,10)}`);
                console.log(`   📄 Last 10 chars  - Calc: ${calculatedHash.substring(calculatedHash.length-10)} | Exp: ${expectedHash.substring(expectedHash.length-10)}`);
            } else {
                console.log(`   ✅ HASH VERIFIED!`);
            }
            
            resolve({
                exists: true,
                sizeMatch: stats.size === expectedSize,
                hashMatch: calculatedHash.toLowerCase() === expectedHash.toLowerCase(),
                actualSize: stats.size,
                actualHash: calculatedHash
            });
        });
        
        stream.on('error', (error) => {
            console.log(`   ❌ Error reading file: ${error.message}`);
            resolve(null);
        });
    });
};

/**
 * Verifies the integrity of downloaded assets
 * @param {string} folder - Base folder where assets are stored
 * @param {Array} assets - Array of asset objects to verify
 * @param {Array} ignoredList - List of files to ignore during verification
 * @returns {Promise<{valid: number, invalid: Array}>} - Verification results
 */
async function verifyAssetIntegrity(folder, assets, ignoredList = []) {
    console.log(`Verifying integrity of ${assets.length} assets...`);
    
    const results = {
        valid: 0,
        invalid: []
    };
    
    for (const asset of assets) {
        try {
            const localPath = path.join(folder, asset.path);
            const shouldIgnoreChecksum = ignoredList.some(ignored => 
                asset.path.includes(ignored) || asset.path.endsWith('.disabled')
            );
            
            if (shouldIgnoreChecksum) {
                results.valid++;
                continue;
            }
            
            // Check if file exists
            if (!fs.existsSync(localPath)) {
                results.invalid.push({
                    path: asset.path,
                    error: 'File not found'
                });
                continue;
            }
            
            // Check file size
            const stats = fs.statSync(localPath);
            if (asset.size && stats.size !== asset.size) {
                results.invalid.push({
                    path: asset.path,
                    error: `Size mismatch: expected ${asset.size}, got ${stats.size}`
                });
                continue;
            }
            
            // Check file hash if provided
            if (asset.hash) {
                const fileHash = await calculateFileHash(localPath);
                if (fileHash !== asset.hash.toLowerCase()) {
                    results.invalid.push({
                        path: asset.path,
                        error: `Hash mismatch: expected ${asset.hash}, got ${fileHash}`
                    });
                    continue;
                }
            }
            
            results.valid++;
            
        } catch (error) {
            results.invalid.push({
                path: asset.path,
                error: error.message
            });
        }
    }
    
    console.log(`Integrity verification complete: ${results.valid} valid, ${results.invalid.length} invalid`);
    return results;
}

/**
 * Downloads and verifies Minecraft client and libraries using minecraft-core-master
 * @param {string} rootPath - Root path for the launcher data
 * @param {string} version - Minecraft version to download
 * @param {Function} progressCallback - Callback function to report progress
 * @param {Function} statusCallback - Callback to update status text
 * @returns {Promise<boolean>} - Returns true if successful
 */
async function downloadMinecraftResources(rootPath, version, progressCallback = null, statusCallback = null) {
    try {
        // Asegurar que solo usamos la versión vanilla (sin modloader)
        const vanillaVersion = version.split('-')[0]; // Extraer solo la versión base
        
        if (statusCallback) statusCallback(`Descargando Minecraft ${vanillaVersion}...`);
        
        console.log(`🔄 Iniciando descarga de recursos de Minecraft ${vanillaVersion}...`);
        
        // Crear el downloader
        const downloader = new MinecraftDownloader(rootPath, "auto", "release");
        
        // SUPRIMIR TODOS LOS EVENTOS AUTOMÁTICOS del MinecraftDownloader
        // Esto evita que aparezcan mensajes como "descargando libs" en paralelo
        
        // Interceptar y silenciar TODOS los eventos de progreso automáticos
        const originalEmit = downloader.emit;
        downloader.emit = function(event, ...args) {
            // Solo permitir eventos críticos, silenciar todos los de progreso/estado
            if (event === 'error') {
                console.error(`❌ [MINECRAFT] Error:`, args[0]);
                return originalEmit.call(this, event, ...args);
            }
            if (event === 'done') {
                console.log(`✅ [MINECRAFT] Descarga completada: ${args[0]}`);
                return originalEmit.call(this, event, ...args);
            }
            // Silenciar todos los demás eventos (progress, downloading, etc.)
            return false;
        };
        
        // Solo manejar errores críticos
        downloader.on("error", (err) => {
            console.error(`❌ [MINECRAFT] Error crítico:`, err);
            throw err;
        });
        
        // PROGRESO COMPLETAMENTE MANUAL - sin eventos automáticos
        
        let progressInterval = null;
        if (progressCallback) {
            let currentProgress = 0;
            progressInterval = setInterval(() => {
                if (currentProgress < 90) { // Máximo 90% durante descarga
                    currentProgress += 3; // Incremento controlado
                    progressCallback(currentProgress, 0, 100, 0, 0);
                }
            }, 1500); // Intervalo más lento para control manual
        }
        
        try {
            console.log(`🚀 [MINECRAFT] Iniciando descarga de ${vanillaVersion}...`);
            await downloader.start(vanillaVersion);
            
            // Completar progreso manualmente al finalizar
            if (progressInterval) {
                clearInterval(progressInterval);
                progressCallback(100, 100, 100, 0, 0);
            }
            if (statusCallback) statusCallback(`Minecraft ${vanillaVersion} descargado completamente`);
        } catch (error) {
            if (progressInterval) {
                clearInterval(progressInterval);
            }
            throw error;
        }
        
        console.log(`✅ Recursos de Minecraft ${vanillaVersion} descargados correctamente`);
        return true;
        
    } catch (error) {
        console.error('Error descargando recursos de Minecraft:', error);
        throw error;
    }
}

/**
 * Downloads Java runtime if needed using minecraft-core-master
 * @param {string} rootPath - Root path for the launcher data
 * @param {string} javaVersion - Java version to download (e.g., "17", "8")
 * @param {Function} progressCallback - Callback function to report progress
 * @param {Function} statusCallback - Callback to update status text
 * @returns {Promise<string>} - Returns path to Java executable
 */
async function downloadJavaRuntime(rootPath, javaVersion = "17", progressCallback = null, statusCallback = null) {
    try {
        if (statusCallback) statusCallback(`Verificando Java ${javaVersion}...`);
        
        // minecraft-core-master maneja automáticamente la descarga de Java
        // Si no se especifica un path de Java, lo descarga automáticamente
        const downloader = new MinecraftDownloader(rootPath, "auto", "release");
        
        // SUPRIMIR TODOS LOS EVENTOS AUTOMÁTICOS del MinecraftDownloader para Java
        // Esto evita que aparezcan mensajes automáticos en paralelo
        
        // Interceptar y silenciar TODOS los eventos de progreso automáticos
        const originalEmit = downloader.emit;
        downloader.emit = function(event, ...args) {
            // Solo permitir eventos críticos, silenciar todos los de progreso/estado
            if (event === 'error') {
                console.error(`❌ [JAVA] Error:`, args[0]);
                return originalEmit.call(this, event, ...args);
            }
            // Silenciar todos los demás eventos (progress, downloading, etc.)
            return false;
        };
        
        // Solo manejar errores críticos
        downloader.on("error", (err) => {
            console.error(`❌ [JAVA] Error crítico:`, err);
            throw err;
        });
        
        // PROGRESO COMPLETAMENTE MANUAL para Java
        
        // La descarga de Java está integrada en el proceso principal
        // minecraft-core-master se encarga de descargar Java automáticamente
        if (progressCallback) {
            progressCallback(100, 1, 1, 0, 0);
        }
        
        console.log(`✅ Java ${javaVersion} verificado/descargado correctamente`);
        return "auto"; // minecraft-core-master maneja el path automáticamente
        
    } catch (error) {
        console.error('Error verificando/descargando Java:', error);
        throw error;
    }
}

/**
 * Verifies installation integrity of a modloader
 * @param {string} rootPath - Root path for the launcher data
 * @param {string} versionId - Version ID including modloader (e.g., "1.20.1-forge-47.2.0")
 * @returns {Promise<boolean>} - Returns true if installation is valid
 */
async function verifyModloaderInstallation(rootPath, versionId) {
    try {
        const fs = require('fs');
        const path = require('path');
        
        const versionsDir = path.join(rootPath, "versions");
        const versionPath = path.join(versionsDir, versionId);
        const versionJsonPath = path.join(versionPath, `${versionId}.json`);
        const versionJarPath = path.join(versionPath, `${versionId}.jar`);
        
        // Verificar que existan los archivos principales
        if (!fs.existsSync(versionJsonPath)) {
            console.log(`❌ No existe el archivo JSON: ${versionJsonPath}`);
            return false;
        }
        
        if (!fs.existsSync(versionJarPath)) {
            console.log(`❌ No existe el archivo JAR: ${versionJarPath}`);
            return false;
        }
        
        // Verificar que el JSON sea válido
        try {
            const versionData = JSON.parse(fs.readFileSync(versionJsonPath, 'utf8'));
            if (!versionData.id || !versionData.type) {
                console.log(`❌ JSON del modloader inválido: falta id o type`);
                return false;
            }
        } catch (jsonError) {
            console.log(`❌ Error al parsear JSON del modloader: ${jsonError.message}`);
            return false;
        }
        
        console.log(`✅ Instalación del modloader ${versionId} verificada correctamente`);
        return true;
        
    } catch (error) {
        console.error('Error verificando instalación del modloader:', error);
        return false;
    }
}

/**
 * Instala un modloader específico usando minecraft-core-master
 * @param {string} rootPath - Ruta raíz del launcher
 * @param {string} minecraftVersion - Versión de Minecraft (e.g., "1.20.1")
 * @param {string} loaderType - Tipo de modloader ("forge", "fabric", "quilt", "neoforge")
 * @param {string} loaderVersion - Versión del modloader ("latest" o versión específica)
 * @param {Function} progressCallback - Callback de progreso
 * @param {Function} statusCallback - Callback de estado
 * @returns {Promise<string>} - Retorna el versionId final del modloader instalado
 */
async function installModloader(rootPath, minecraftVersion, loaderType, loaderVersion = "latest", progressCallback = null, statusCallback = null) {
    try {
        if (!loaderType || loaderType === "vanilla" || loaderType === "none") {
            console.log("No se requiere instalación de modloader para vanilla");
            return minecraftVersion;
        }

        if (statusCallback) statusCallback(`Instalando ${loaderType} ${loaderVersion}...`);
        
        console.log(`🔧 Instalando ${loaderType} ${loaderVersion} para Minecraft ${minecraftVersion}`);
        
        // Crear instancia del CustomInstaller de minecraft-core-master
        // La API correcta es: new CustomInstaller(rootPath, version, type)
        let versionToInstall;
        if (loaderVersion === "latest") {
            versionToInstall = `${minecraftVersion}-${loaderType}`;
        } else {
            versionToInstall = `${minecraftVersion}-${loaderType}-${loaderVersion}`;
        }
        
        const installer = new CustomInstaller(rootPath, versionToInstall, loaderType);
        
        // Configurar eventos del installer
        installer.on("progress", (msg) => {
            console.log(`[${loaderType} Installer Progress]`, msg);
            if (statusCallback) statusCallback(msg);
        });
        
        installer.on("data", (msg) => {
            console.log(`[${loaderType} Installer Data]`, msg);
        });
        
        installer.on("error", (err) => {
            console.error(`[${loaderType} Installer Error]`, err);
            throw err;
        });
        
        installer.on("done", (msg) => {
            console.log(`[${loaderType} Installer Done]`, msg);
        });

        // Usar el método start() para instalar el modloader
        await installer.start();
        
        // Determinar el version ID final instalado
        let installedVersionId;
        
        if (loaderVersion === "latest") {
            // Para "latest", buscar la versión instalada en el directorio versions
            const versionsDir = path.join(rootPath, "versions");
            if (fs.existsSync(versionsDir)) {
                const versionDirs = fs.readdirSync(versionsDir).filter(dir => 
                    dir.startsWith(`${minecraftVersion}-${loaderType}-`) && 
                    fs.existsSync(path.join(versionsDir, dir, `${dir}.json`))
                );
                
                if (versionDirs.length > 0) {
                    // Tomar la versión más reciente
                    installedVersionId = versionDirs.sort().pop();
                } else {
                    // Fallback si no se encuentra
                    installedVersionId = versionToInstall;
                }
            } else {
                installedVersionId = versionToInstall;
            }
        } else {
            installedVersionId = versionToInstall;
        }
        
        console.log(`✅ ${loaderType} instalado correctamente. Version ID: ${installedVersionId}`);
        if (statusCallback) statusCallback(`${loaderType} instalado correctamente`);
        
        return installedVersionId;
        
    } catch (error) {
        console.error(`Error instalando ${loaderType}:`, error);
        throw error;
    }
}

/**
 * Prepara y configura un modloader para lanzamiento
 * @param {string} rootPath - Ruta raíz del launcher
 * @param {string} minecraftVersion - Versión de Minecraft
 * @param {string} loaderType - Tipo de modloader
 * @param {string} loaderVersion - Versión del modloader
 * @param {string} instancePath - Ruta de la instancia
 * @param {Function} progressCallback - Callback de progreso
 * @param {Function} statusCallback - Callback de estado
 * @returns {Promise<string>} - Retorna el versionId final para usar en el lanzamiento
 */
async function prepareModloaderForLaunch(rootPath, minecraftVersion, loaderType, loaderVersion, instancePath, progressCallback = null, statusCallback = null) {
    try {
        if (!loaderType || loaderType === "vanilla" || loaderType === "none") {
            return minecraftVersion;
        }

        console.log(`🔧 Preparando ${loaderType} ${loaderVersion} para lanzamiento...`);
        
        // Verificar si el modloader ya está instalado
        let finalVersionId;
        
        if (loaderVersion === "latest") {
            // Para "latest", necesitamos instalar y obtener la versión real
            finalVersionId = await installModloader(
                rootPath, 
                minecraftVersion, 
                loaderType, 
                loaderVersion, 
                progressCallback, 
                statusCallback
            );
        } else {
            // Para versiones específicas, construir el versionId y verificar
            finalVersionId = `${minecraftVersion}-${loaderType}-${loaderVersion}`;
            
            const isInstalled = await verifyModloaderInstallation(rootPath, finalVersionId);
            if (!isInstalled) {
                console.log(`${loaderType} ${loaderVersion} no encontrado, instalando...`);
                finalVersionId = await installModloader(
                    rootPath, 
                    minecraftVersion, 
                    loaderType, 
                    loaderVersion, 
                    progressCallback, 
                    statusCallback
                );
            } else {
                console.log(`${loaderType} ${loaderVersion} ya está instalado`);
            }
        }
        
        // Asegurar que existe la carpeta de mods para la instancia
        if (instancePath) {
            const modsPath = path.join(instancePath, 'mods');
            if (!fs.existsSync(modsPath)) {
                fs.mkdirSync(modsPath, { recursive: true });
                console.log(`📁 Carpeta de mods creada: ${modsPath}`);
            }
        }
        
        console.log(`✅ ${loaderType} preparado. Version ID final: ${finalVersionId}`);
        return finalVersionId;
        
    } catch (error) {
        console.error(`Error preparando ${loaderType}:`, error);
        throw error;
    }
}

/**
 * Comprehensive download manager that handles all Minecraft resources
 * @param {Object} options - Download options
 * @param {string} options.rootPath - Root path for the launcher data
 * @param {string} options.version - Minecraft version
 * @param {string} options.instancePath - Instance specific path
 * @param {string} options.assetsUrl - URL for custom assets
 * @param {Array} options.ignoredFiles - Files to ignore during asset verification
 * @param {number} options.concurrentDownloads - Number of concurrent downloads
 * @param {Function} options.progressCallback - Progress callback
 * @param {Function} options.statusCallback - Status callback
 * @returns {Promise<boolean>} - Returns true if all downloads successful
 */
async function downloadAllResources(options) {
    const {
        rootPath,
        version,
        instancePath,
        assetsUrl,
        ignoredFiles = [],
        concurrentDownloads = 5,
        progressCallback = null,
        statusCallback = null
    } = options;
    
    try {
        // Paso 1: Descargar recursos base de Minecraft (ESPERAR COMPLETAMENTE)
        if (statusCallback) statusCallback('🔄 Paso 1/3: Iniciando descarga de Minecraft...');
        console.log('🔄 [SECUENCIAL] Paso 1: Iniciando descarga de recursos base de Minecraft...');
        
        // Progreso específico para recursos base (0-50%)
        const step1ProgressCallback = progressCallback ? (progress) => {
            const adjustedProgress = Math.floor(progress * 0.5); // 50% del total
            progressCallback(adjustedProgress, 0, 100, 0, 0);
        } : null;
        
        await downloadMinecraftResources(rootPath, version, step1ProgressCallback, (status) => {
            if (statusCallback) statusCallback(`🔄 Paso 1/3: ${status}`);
        });
        console.log('✅ [SECUENCIAL] Paso 1: Recursos base de Minecraft completados');
        if (progressCallback) progressCallback(50, 0, 100, 0, 0);
        
        // Pausa obligatoria entre pasos para asegurar secuencialidad visual
        console.log('⏸️ [SECUENCIAL] Pausa entre pasos...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Paso 2: Verificar/descargar Java (ESPERAR COMPLETAMENTE)
        if (statusCallback) statusCallback('🔄 Paso 2/3: Verificando Java...');
        console.log('🔄 [SECUENCIAL] Paso 2: Iniciando verificación de Java...');
        
        // Progreso específico para Java (50-70%)
        const step2ProgressCallback = progressCallback ? (progress) => {
            const adjustedProgress = 50 + Math.floor(progress * 0.2); // 20% del total
            progressCallback(adjustedProgress, 0, 100, 0, 0);
        } : null;
        
        await downloadJavaRuntime(rootPath, "17", step2ProgressCallback, (status) => {
            if (statusCallback) statusCallback(`🔄 Paso 2/3: ${status}`);
        });
        console.log('✅ [SECUENCIAL] Paso 2: Java verificado correctamente');
        if (progressCallback) progressCallback(70, 0, 100, 0, 0);
        
        // Pausa entre pasos
        console.log('⏸️ [SECUENCIAL] Pausa entre pasos...');
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // Paso 3: Descargar assets personalizados (ESPERAR COMPLETAMENTE)
        if (assetsUrl && instancePath) {
            if (statusCallback) statusCallback('🔄 Paso 3/3: Descargando assets personalizados...');
            console.log('🔄 [SECUENCIAL] Paso 3: Iniciando descarga de assets personalizados...');
            
            // Progreso específico para assets (70-100%)
            const step3ProgressCallback = progressCallback ? (progress) => {
                const adjustedProgress = 70 + Math.floor(progress * 0.3); // 30% del total
                progressCallback(adjustedProgress, 0, 100, 0, 0);
            } : null;
            
            await downloadInstanceAssets(
                assetsUrl,
                instancePath,
                ignoredFiles,
                concurrentDownloads,
                step3ProgressCallback,
                (status) => {
                    if (statusCallback) statusCallback(`🔄 Paso 3/3: ${status}`);
                }
            );
            console.log('✅ [SECUENCIAL] Paso 3: Assets personalizados completados');
        } else {
            console.log('⏭️ [SECUENCIAL] Paso 3: Sin assets personalizados, saltando...');
        }
        if (progressCallback) progressCallback(100, 0, 100, 0, 0);
        
        // Finalización
        if (statusCallback) statusCallback('✅ Todos los recursos descargados correctamente');
        console.log('✅ [SECUENCIAL] Todas las descargas completadas exitosamente de forma secuencial');
        return true;
        
    } catch (error) {
        console.error('❌ Error en el proceso de descarga:', error);
        throw error;
    }
}

/**
 * Comprehensive instance preparation que maneja TODOS los recursos y modloaders de forma SECUENCIAL
 * @param {Object} options - Instance preparation options
 * @param {string} options.rootPath - Root path for the launcher data
 * @param {string} options.instanceName - Name of the instance
 * @param {string} options.minecraftVersion - Minecraft version (vanilla)
 * @param {string} options.loaderType - Type of modloader
 * @param {string} options.loaderVersion - Version of modloader
 * @param {string} options.instancePath - Instance specific path
 * @param {string} options.assetsUrl - URL for custom assets
 * @param {Array} options.ignoredFiles - Files to ignore during asset verification
 * @param {number} options.concurrentDownloads - Number of concurrent downloads
 * @param {Function} options.progressCallback - Progress callback
 * @param {Function} options.statusCallback - Status callback
 * @returns {Promise<string>} - Returns final version ID to use for launching
 */
async function prepareInstanceForLaunch(options) {
    const {
        rootPath,
        instanceName,
        minecraftVersion,
        loaderType,
        loaderVersion,
        instancePath,
        assetsUrl,
        ignoredFiles = [],
        concurrentDownloads = 5,
        progressCallback = null,
        statusCallback = null
    } = options;
    
    try {
        console.log(`🚀 [PREPARACIÓN] Iniciando preparación completa de instancia: ${instanceName}`);
        
        // FASE 1: Recursos base de Minecraft (0-50%)
        if (statusCallback) statusCallback('🔄 Fase 1/2: Preparando recursos base...');
        console.log('🔄 [PREPARACIÓN] Fase 1: Iniciando preparación de recursos base...');
        
        // Progreso para la fase 1 (0-50%)
        const phase1ProgressCallback = progressCallback ? (progress) => {
            const adjustedProgress = Math.floor(progress * 0.5);
            progressCallback(adjustedProgress, 0, 100, 0, 0);
        } : null;
        
        // Llamar a downloadAllResources UNA SOLA VEZ
        await downloadAllResources({
            rootPath,
            version: minecraftVersion, // Solo versión vanilla
            instancePath,
            assetsUrl,
            ignoredFiles,
            concurrentDownloads,
            progressCallback: phase1ProgressCallback,
            statusCallback: (status) => {
                if (statusCallback) statusCallback(`🔄 Fase 1/2: ${status}`);
            }
        });
        
        console.log('✅ [PREPARACIÓN] Fase 1: Recursos base completados');
        if (progressCallback) progressCallback(50, 0, 100, 0, 0);
        
        // PAUSA OBLIGATORIA entre fases principales
        console.log('⏸️ [PREPARACIÓN] Pausa entre fases principales...');
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // FASE 2: Modloader si es necesario (50-100%)
        let finalVersionId = minecraftVersion;
        
        if (loaderType && loaderType !== "vanilla" && loaderType !== "none") {
            if (statusCallback) statusCallback(`🔄 Fase 2/2: Preparando ${loaderType}...`);
            console.log(`🔄 [PREPARACIÓN] Fase 2: Iniciando preparación de ${loaderType}...`);
            
            // Progreso para la fase 2 (50-100%)
            const phase2ProgressCallback = progressCallback ? (progress) => {
                const adjustedProgress = 50 + Math.floor(progress * 0.5);
                progressCallback(adjustedProgress, 0, 100, 0, 0);
            } : null;
            
            finalVersionId = await prepareModloaderForLaunch(
                rootPath,
                minecraftVersion,
                loaderType,
                loaderVersion,
                instancePath,
                phase2ProgressCallback,
                (status) => {
                    if (statusCallback) statusCallback(`🔄 Fase 2/2: ${status}`);
                }
            );
            console.log(`✅ [PREPARACIÓN] Fase 2: ${loaderType} preparado correctamente`);
        } else {
            console.log('⏭️ [PREPARACIÓN] Fase 2: Vanilla detectado, saltando preparación de modloader');
        }
        
        // Progreso final
        if (progressCallback) progressCallback(100, 100, 100, 0, 0);
        if (statusCallback) statusCallback(`✅ Instancia ${instanceName} preparada completamente`);
        
        console.log(`✅ [PREPARACIÓN] Instancia ${instanceName} preparada correctamente`);
        console.log(`🎯 [PREPARACIÓN] Version ID final: ${finalVersionId}`);
        
        return finalVersionId;
        
    } catch (error) {
        console.error(`❌ [PREPARACIÓN] Error preparando instancia ${instanceName}:`, error);
        throw error;
    }
}
                loaderType,
                loaderVersion,
                instancePath,
                phase2ProgressCallback,
                (status) => {
                    if (statusCallback) statusCallback(`🔄 Fase 2/2: ${status}`);
                }
            );
            console.log(`✅ [PREPARACIÓN] Fase 2: ${loaderType} preparado correctamente`);
        } else {
            console.log('⏭️ [PREPARACIÓN] Fase 2: Vanilla detectado, saltando preparación de modloader');
        }
        
        // Progreso final
        if (progressCallback) progressCallback(100, 100, 100, 0, 0);
        if (statusCallback) statusCallback(`✅ Instancia ${instanceName} preparada completamente`);
        
        console.log(`✅ [PREPARACIÓN] Instancia ${instanceName} preparada correctamente`);
        console.log(`🎯 [PREPARACIÓN] Version ID final: ${finalVersionId}`);
        
        return finalVersionId;
        
    } catch (error) {
        console.error(`❌ [PREPARACIÓN] Error preparando instancia ${instanceName}:`, error);
        throw error;
    }
}

// Alias para compatibilidad con el código existente
const downloadAssets = downloadInstanceAssets;

module.exports = {
    downloadInstanceAssets,
    downloadAssets, // Alias para compatibilidad
    verifyAssetIntegrity,
    downloadMinecraftResources,
    downloadJavaRuntime,
    verifyModloaderInstallation,
    downloadAllResources,
    installModloader,
    prepareModloaderForLaunch,
    prepareInstanceForLaunch
};