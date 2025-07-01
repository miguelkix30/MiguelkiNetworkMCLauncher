const nodeFetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Configuration for optimization levels
const OPTIMIZATION_CONFIG = {
    VERIFICATION_BATCH_SIZE: 20,      // Files to verify in parallel (increased from 15)
    CONCURRENT_DOWNLOADS: 5,          // Concurrent downloads
    HASH_CHUNK_SIZE_SMALL: 256 * 1024, // 256KB chunks for small files (increased from 128KB)
    HASH_CHUNK_SIZE_LARGE: 1024 * 1024, // 1MB chunks for large files (increased from 512KB)  
    CACHE_CLEANUP_DAYS: 7,            // Days to keep cache entries
    SIZE_THRESHOLD_FAST: 5 * 1024 * 1024, // 5MB threshold for fast vs optimized hash (increased from 2MB)
    ENABLE_AGGRESSIVE_CACHING: true,  // Enable aggressive caching
    SKIP_HASH_FOR_SMALL_FILES: false, // Skip hash verification for files < 100KB (risky but fast)
    MIN_CACHE_HIT_RATE: 0.3,         // Minimum cache hit rate to consider cache effective
    PARALLEL_HASH_THRESHOLD: 50 * 1024 * 1024, // Files larger than 50MB use parallel hashing
    VERIFICATION_TIMEOUT: 30000       // 30 second timeout per file verification
};

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
    const CONCURRENT_DOWNLOADS = OPTIMIZATION_CONFIG.CONCURRENT_DOWNLOADS;
    
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
        
        // First pass: Check which files need downloading (OPTIMIZED)
        const filesToDownload = [];
        let verificationCount = 0;
        
        console.log(`🔍 Starting FAST verification of ${remoteAssets.length} assets...`);
        console.log(`📁 Target folder: ${folder}`);
        
        // Check if target folder exists
        if (!fs.existsSync(folder)) {
            console.log(`📁 Target folder does not exist, will download all assets`);
            // If folder doesn't exist, all files need downloading
            for (const asset of remoteAssets) {
                validFiles.add(asset.path);
                filesToDownload.push({ asset, localPath: path.join(folder, asset.path) });
            }
            console.log(`Files to download: ${filesToDownload.length}, already valid: 0`);
        } else {
            // Load verification cache
            const verificationCache = await loadVerificationCache(folder);
            
            // Process assets in batches for parallel verification
            const VERIFICATION_BATCH_SIZE = OPTIMIZATION_CONFIG.VERIFICATION_BATCH_SIZE;
            const assetBatches = [];
            
            for (let i = 0; i < remoteAssets.length; i += VERIFICATION_BATCH_SIZE) {
                assetBatches.push(remoteAssets.slice(i, i + VERIFICATION_BATCH_SIZE));
            }
            
            console.log(`📦 Processing ${assetBatches.length} batches of ${VERIFICATION_BATCH_SIZE} files each...`);
            
            for (const [batchIndex, batch] of assetBatches.entries()) {
                // Update status
                if (statusCallback) {
                    const progress = Math.round((batchIndex / assetBatches.length) * 100);
                    statusCallback(`Verificación rápida... ${progress}% (${verificationCount}/${remoteAssets.length})`);
                }
                
                // Verify batch in parallel
                const verificationPromises = batch.map(async (asset) => {
                    const localPath = path.join(folder, asset.path);
                    const shouldIgnoreChecksum = ignoredList.some(ignored => 
                        asset.path.includes(ignored) || asset.path.endsWith('.disabled')
                    );
                    
                    validFiles.add(asset.path);
                    
                    // Fast verification with cache
                    const needsDownload = await shouldDownloadFileFast(localPath, asset, shouldIgnoreChecksum, verificationCache);
                    
                    return { asset, localPath, needsDownload };
                });
                
                const batchResults = await Promise.all(verificationPromises);
                
                // Process results
                for (const { asset, localPath, needsDownload } of batchResults) {
                    verificationCount++;
                    
                    if (needsDownload) {
                        filesToDownload.push({ asset, localPath });
                    } else {
                        skippedFiles++;
                    }
                    
                    // Log detailed info for first few files
                    if (verificationCount <= 3) {
                        console.log(`🔍 BATCH CHECK #${verificationCount}: ${needsDownload ? '❌ NEEDS DOWNLOAD' : '✅ VALID'} - ${asset.path}`);
                    }
                }
                
                // Show progress every few batches
                if (batchIndex % 5 === 0 && batchIndex > 0) {
                    console.log(`⚡ Fast verified ${verificationCount}/${remoteAssets.length} assets (${skippedFiles} valid, ${filesToDownload.length} to download)...`);
                }
            }
            
            // Save updated cache
            await saveVerificationCache(folder, verificationCache);
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
 * Checks if a file needs to be downloaded based on existence and integrity (LEGACY - for fallback)
 */
async function shouldDownloadFileLegacy(localPath, asset, shouldIgnoreChecksum) {
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
 * Calculates SHA1 hash of a file (OPTIMIZED VERSION)
 */
async function calculateFileHash(filePath) {
    // Use the optimized version for all hash calculations
    return await calculateFileHashOptimized(filePath);
}

/**
 * Fast file verification with caching and optimizations
 */
async function shouldDownloadFileFast(localPath, asset, shouldIgnoreChecksum, cache) {
    try {
        // Check if file exists first (fastest check)
        const stats = await fs.promises.stat(localPath).catch(() => null);
        
        if (!stats || !stats.isFile()) {
            return true; // File doesn't exist, needs download
        }
        
        // If we should ignore checksum, just check existence
        if (shouldIgnoreChecksum) {
            return false;
        }
        
        // Quick size check first
        if (asset.size && stats.size !== asset.size) {
            return true; // Size mismatch, needs download
        }
        
        // Check cache first - use file path + mtime + size as cache key
        const cacheKey = `${asset.path}_${stats.mtime.getTime()}_${stats.size}`;
        const cachedHash = cache[cacheKey];
        
        if (cachedHash && asset.hash) {
            // Cache hit - compare with expected hash
            const isValid = cachedHash.toLowerCase() === asset.hash.toLowerCase();
            if (!isValid) {
                console.log(`🔄 Cache indicates hash mismatch for ${asset.path}`);
            }
            return !isValid;
        }
        
        // No hash provided - assume valid if size matches
        if (!asset.hash) {
            return false;
        }
        
        // For small files (< 2MB), calculate hash immediately with fast method
        if (stats.size < OPTIMIZATION_CONFIG.SIZE_THRESHOLD_FAST) {
            const fileHash = await calculateFileHashFast(localPath);
            
            // Update cache
            cache[cacheKey] = fileHash;
            
            const isValid = fileHash.toLowerCase() === asset.hash.toLowerCase();
            return !isValid;
        }
        
        // For larger files, use optimized hash calculation
        const fileHash = await calculateFileHashOptimized(localPath);
        
        // Update cache
        cache[cacheKey] = fileHash;
        
        const isValid = fileHash.toLowerCase() === asset.hash.toLowerCase();
        return !isValid;
        
    } catch (error) {
        console.warn(`⚡ Fast verification error for ${asset.path}:`, error.message);
        return true; // Download on error to be safe
    }
}

/**
 * Fast hash calculation for small files (ULTRA-OPTIMIZED)
 */
async function calculateFileHashFast(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha1');
        const stream = fs.createReadStream(filePath, { 
            highWaterMark: OPTIMIZATION_CONFIG.HASH_CHUNK_SIZE_SMALL // Use configurable chunk size
        });
        
        // Set timeout to avoid hanging
        const timeout = setTimeout(() => {
            stream.destroy();
            reject(new Error(`Hash calculation timeout for ${path.basename(filePath)}`));
        }, OPTIMIZATION_CONFIG.VERIFICATION_TIMEOUT);
        
        stream.on('error', (err) => {
            clearTimeout(timeout);
            reject(err);
        });
        
        stream.on('data', chunk => hash.update(chunk));
        
        stream.on('end', () => {
            clearTimeout(timeout);
            resolve(hash.digest('hex'));
        });
    });
}

/**
 * Optimized hash calculation for larger files (ULTRA-OPTIMIZED)
 */
async function calculateFileHashOptimized(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha1');
        const stats = fs.statSync(filePath);
        
        // Use larger chunks for bigger files
        const chunkSize = stats.size > OPTIMIZATION_CONFIG.PARALLEL_HASH_THRESHOLD 
            ? OPTIMIZATION_CONFIG.HASH_CHUNK_SIZE_LARGE * 2  // 2MB chunks for very large files
            : OPTIMIZATION_CONFIG.HASH_CHUNK_SIZE_LARGE;
            
        const stream = fs.createReadStream(filePath, { 
            highWaterMark: chunkSize
        });
        
        let bytesRead = 0;
        const startTime = Date.now();
        
        // Set timeout to avoid hanging
        const timeout = setTimeout(() => {
            stream.destroy();
            reject(new Error(`Hash calculation timeout for ${path.basename(filePath)}`));
        }, OPTIMIZATION_CONFIG.VERIFICATION_TIMEOUT);
        
        stream.on('error', (err) => {
            clearTimeout(timeout);
            reject(err);
        });
        
        stream.on('data', chunk => {
            hash.update(chunk);
            bytesRead += chunk.length;
        });
        
        stream.on('end', () => {
            clearTimeout(timeout);
            const endTime = Date.now();
            const duration = endTime - startTime;
            const mbPerSec = duration > 0 ? (bytesRead / 1024 / 1024) / (duration / 1000) : 0;
            
            // Only log for larger files to avoid spam
            if (bytesRead > 10 * 1024 * 1024) { // > 10MB
                console.log(`⚡ Hash calculated: ${path.basename(filePath)} (${(bytesRead/1024/1024).toFixed(1)}MB in ${duration}ms, ${mbPerSec.toFixed(1)} MB/s)`);
            }
            
            resolve(hash.digest('hex'));
        });
    });
}

/**
 * Load verification cache from disk
 */
async function loadVerificationCache(folder) {
    const cacheFile = path.join(folder, '.assets_cache.json');
    
    try {
        if (fs.existsSync(cacheFile)) {
            const cacheData = await fs.promises.readFile(cacheFile, 'utf8');
            const cache = JSON.parse(cacheData);
            console.log(`📋 Loaded verification cache with ${Object.keys(cache).length} entries`);
            return cache;
        }
    } catch (error) {
        console.warn(`⚠️ Failed to load verification cache:`, error.message);
    }
    
    return {};
}

/**
 * Save verification cache to disk
 */
async function saveVerificationCache(folder, cache) {
    const cacheFile = path.join(folder, '.assets_cache.json');
    
    try {
        // Clean old cache entries (older than 7 days)
        const cutoffTime = Date.now() - (7 * 24 * 60 * 60 * 1000);
        const cleanedCache = {};
        
        for (const [key, value] of Object.entries(cache)) {
            const parts = key.split('_');
            if (parts.length >= 2) {
                const mtime = parseInt(parts[parts.length - 2]);
                if (mtime > cutoffTime) {
                    cleanedCache[key] = value;
                }
            }
        }
        
        await fs.promises.writeFile(cacheFile, JSON.stringify(cleanedCache, null, 2));
        console.log(`💾 Saved verification cache with ${Object.keys(cleanedCache).length} entries`);
    } catch (error) {
        console.warn(`⚠️ Failed to save verification cache:`, error.message);
    }
}

/**
 * Checks if a file needs to be downloaded based on existence and integrity (LEGACY - for fallback)
 */
async function shouldDownloadFileLegacy(localPath, asset, shouldIgnoreChecksum) {
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
            const fileHash = await calculateFileHash(localPath);
            const expectedHash = asset.hash.toLowerCase().trim();
            const calculatedHash = fileHash.toLowerCase().trim();
            
            if (calculatedHash !== expectedHash) {
                console.log(`❌ Hash mismatch for ${asset.path}`);
                console.log(`   Expected: "${expectedHash}"`);
                console.log(`   Got:      "${calculatedHash}"`);
                return true;
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
 * Verifies the integrity of downloaded assets (OPTIMIZED WITH PARALLELIZATION)
 * @param {string} folder - Base folder where assets are stored
 * @param {Array} assets - Array of asset objects to verify
 * @param {Array} ignoredList - List of files to ignore during verification
 * @returns {Promise<{valid: number, invalid: Array}>} - Verification results
 */
async function verifyAssetIntegrity(folder, assets, ignoredList = []) {
    console.log(`🔍 Starting OPTIMIZED verification of ${assets.length} assets...`);
    const startTime = Date.now();
    
    const results = {
        valid: 0,
        invalid: []
    };
    
    // Load verification cache
    const cache = await loadVerificationCache(folder);
    
    // Process assets in parallel batches
    const batchSize = OPTIMIZATION_CONFIG.VERIFICATION_BATCH_SIZE;
    const batches = [];
    
    for (let i = 0; i < assets.length; i += batchSize) {
        batches.push(assets.slice(i, i + batchSize));
    }
    
    console.log(`⚡ Processing ${batches.length} batches of ${batchSize} assets each...`);
    
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        console.log(`📦 Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} assets)`);
        
        // Process current batch in parallel
        const batchPromises = batch.map(asset => verifyAssetFast(folder, asset, ignoredList, cache));
        const batchResults = await Promise.all(batchPromises);
        
        // Accumulate results
        for (const result of batchResults) {
            if (result.isValid) {
                results.valid++;
            } else {
                results.invalid.push({
                    path: result.path,
                    error: result.error
                });
            }
        }
        
        // Brief pause between batches to avoid overwhelming the system
        if (batchIndex < batches.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 5));
        }
    }
    
    // Save updated cache
    await saveVerificationCache(folder, cache);
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    const assetsPerSecond = (assets.length / (duration / 1000)).toFixed(1);
    
    console.log(`✅ OPTIMIZED verification complete: ${results.valid} valid, ${results.invalid.length} invalid`);
    console.log(`⚡ Performance: ${assets.length} assets in ${duration}ms (${assetsPerSecond} assets/sec)`);
    
    return results;
}

/**
 * Fast verification of a single asset with caching
 * @param {string} folder - Base folder where assets are stored
 * @param {Object} asset - Asset object to verify
 * @param {Array} ignoredList - List of files to ignore during verification
 * @param {Object} cache - Hash cache object
 * @returns {Promise<{isValid: boolean, path: string, error?: string}>}
 */
async function verifyAssetFast(folder, asset, ignoredList, cache) {
    try {
        const localPath = path.join(folder, asset.path);
        const shouldIgnoreChecksum = ignoredList.some(ignored => 
            asset.path.includes(ignored) || asset.path.endsWith('.disabled')
        );
        
        if (shouldIgnoreChecksum) {
            return { isValid: true, path: asset.path };
        }
        
        // Check if file exists (async stat)
        const stats = await fs.promises.stat(localPath).catch(() => null);
        
        if (!stats || !stats.isFile()) {
            return { 
                isValid: false, 
                path: asset.path, 
                error: 'File not found' 
            };
        }
        
        // Check file size
        if (asset.size && stats.size !== asset.size) {
            return { 
                isValid: false, 
                path: asset.path, 
                error: `Size mismatch: expected ${asset.size}, got ${stats.size}` 
            };
        }
        
        // Check file hash if provided
        if (asset.hash) {
            // Check cache first - use file path + mtime + size as cache key
            const cacheKey = `${asset.path}_${stats.mtime.getTime()}_${stats.size}`;
            const cachedHash = cache[cacheKey];
            
            let fileHash;
            
            if (cachedHash) {
                // Cache hit - use cached hash
                fileHash = cachedHash;
            } else {
                // Cache miss - calculate hash with optimized method
                if (stats.size < OPTIMIZATION_CONFIG.SIZE_THRESHOLD_FAST) {
                    fileHash = await calculateFileHashFast(localPath);
                } else {
                    fileHash = await calculateFileHashOptimized(localPath);
                }
                
                // Update cache
                cache[cacheKey] = fileHash;
            }
            
            if (fileHash.toLowerCase() !== asset.hash.toLowerCase()) {
                return { 
                    isValid: false, 
                    path: asset.path, 
                    error: `Hash mismatch: expected ${asset.hash}, got ${fileHash}` 
                };
            }
        }
        
        return { isValid: true, path: asset.path };
        
    } catch (error) {
        return { 
            isValid: false, 
            path: asset.path, 
            error: error.message 
        };
    }
}

export {
    downloadAssets,
    verifyAssetIntegrity
};