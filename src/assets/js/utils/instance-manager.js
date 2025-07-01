const nodeFetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Downloads assets from a remote server with integrity verification
 * @param {string} url - URL to fetch the asset list from
 * @param {string} folder - Local folder to download assets to
 * @param {Array} ignoredList - List of files to ignore during verification
 * @param {Function} progressCallback - Callback function to report progress
 * @param {Function} statusCallback - Callback to update status text
 * @returns {Promise<boolean>} - Returns true if successful
 */
async function downloadAssets(url, folder, ignoredList = [], progressCallback = null, statusCallback = null) {
    const MAX_RETRIES = 3;
    const CONCURRENT_DOWNLOADS = 3; // Limit concurrent downloads
    
    try {
        console.log(`Starting asset download from: ${url}`);
        console.log(`Target folder: ${folder}`);
        
        if (statusCallback) statusCallback('Inicializando descarga de assets...');
        
        // Ensure the folder exists
        await ensureDirectoryExists(folder);
        
        // Obtain remote list of assets
        if (statusCallback) statusCallback('Obteniendo lista de assets...');
        const remoteAssets = await fetchRemoteAssetList(url);
        
        if (!remoteAssets || remoteAssets.length === 0) {
            console.log('No assets to download');
            if (statusCallback) statusCallback('No hay assets para descargar');
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
        console.log(`📁 Target folder: ${folder}`);
        
        // Check if target folder exists
        if (!fs.existsSync(folder)) {
            console.log(`📁 Target folder does not exist, will download all assets`);
        }
        
        for (const asset of remoteAssets) {
            verificationCount++;
            const localPath = path.join(folder, asset.path);
            const shouldIgnoreChecksum = ignoredList.some(ignored => 
                asset.path.includes(ignored) || asset.path.endsWith('.disabled')
            );
            
            validFiles.add(asset.path);
            
            // Update status every 20 files
            if (verificationCount % 20 === 0 || verificationCount === remoteAssets.length) {
                if (statusCallback) statusCallback(`Verificando assets... ${verificationCount}/${remoteAssets.length}`);
            }
            
            // Log detailed info for first few files
            if (verificationCount <= 5) {
                console.log(`🔍 DETAILED CHECK #${verificationCount}:`);
                console.log(`   Asset path: ${asset.path}`);
                console.log(`   Local path: ${localPath}`);
                console.log(`   File exists: ${fs.existsSync(localPath)}`);
                console.log(`   Expected size: ${asset.size} bytes`);
                console.log(`   Expected hash: ${asset.hash}`);
                console.log(`   Should ignore checksum: ${shouldIgnoreChecksum}`);
            }
            
            // Check if file exists and verify integrity
            const needsDownload = await shouldDownloadFile(localPath, asset, shouldIgnoreChecksum);
            
            if (needsDownload) {
                filesToDownload.push({ asset, localPath });
                if (verificationCount <= 5) {
                    console.log(`   ❌ NEEDS DOWNLOAD: ${asset.path}`);
                }
            } else {
                skippedFiles++;
                if (verificationCount <= 5) {
                    console.log(`   ✅ VALID: ${asset.path}`);
                }
                // Only log every 50th skip to avoid spam
                if (skippedFiles % 50 === 0) {
                    console.log(`✅ Verified ${skippedFiles} valid assets so far...`);
                }
            }
        }
        
        console.log(`Files to download: ${filesToDownload.length}, already valid: ${skippedFiles}`);
        
        if (filesToDownload.length === 0) {
            if (statusCallback) statusCallback('Todos los assets están actualizados');
            // Still clean up obsolete files
            await cleanupObsoleteFiles(folder, localFiles, validFiles, ignoredList);
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
                        processedFiles++;
                        downloadedSize += asset.size || 0;
                        
                        // Report progress
                        if (progressCallback) {
                            const totalFiles = remoteAssets.length;
                            const currentProgress = Math.round((processedFiles / totalFiles) * 100);
                            progressCallback(currentProgress, processedFiles, totalFiles, downloadedSize, totalSize);
                        }
                        
                        if (statusCallback) {
                            const percentage = Math.round((processedFiles / remoteAssets.length) * 100);
                            statusCallback(`Descargando assets... ${percentage}% (${processedFiles}/${remoteAssets.length})`);
                        }
                        
                        console.log(`Downloaded: ${asset.path} (${processedFiles}/${remoteAssets.length})`);
                    })
                    .catch((error) => {
                        console.error(`Failed to download ${asset.path}:`, error);
                        throw new Error(`Asset download failed: ${asset.path} - ${error.message}`);
                    })
                    .finally(() => {
                        currentDownloads--;
                        return downloadNext(); // Continue with next download
                    });
                
                downloadPromises.push(downloadPromise);
            }
        };
        
        // Start initial downloads
        await downloadNext();
        
        // Wait for all downloads to complete
        await Promise.all(downloadPromises);
        
        // Update progress for skipped files
        processedFiles += skippedFiles;
        if (progressCallback) {
            progressCallback(100, processedFiles, remoteAssets.length, downloadedSize, totalSize);
        }
        
        // Clean up files that are not in the remote list and not ignored
        if (statusCallback) statusCallback('Limpiando archivos obsoletos...');
        const cleanedFiles = await cleanupObsoleteFiles(folder, localFiles, validFiles, ignoredList);
        
        if (statusCallback) statusCallback('Descarga de assets completada');
        
        console.log(`Asset download completed successfully. Downloaded: ${downloadedFiles}, Skipped: ${skippedFiles}, Cleaned: ${cleanedFiles}`);
        return true;
        
    } catch (error) {
        console.error('Asset download failed:', error);
        if (statusCallback) statusCallback(`Error en descarga: ${error.message}`);
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
                'User-Agent': 'Miguelki-Network-MCLauncher',
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
            'User-Agent': 'Miguelki-Network-MCLauncher'
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

export {
    downloadAssets,
    verifyAssetIntegrity
};