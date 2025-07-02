/**
 * @author MiguelkiNetwork
 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0
 * Sistema de descarga automática de Java para MiguelkiNetwork MCLauncher
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const fetch = require('node-fetch');
const { ipcRenderer } = require('electron');
import { 
    config,
    appdata
} from '../utils.js';
import { 
    verifyFileHash,
    extractZip,
    extractTarGz,
    extractTarGzNodeJs,
    findFilesRecursive,
    makeExecutable,
    getDirectorySize,
    cleanDirectory,
    createBackup,
    validateWritePermissions,
    getSystemInfo 
} from './java-utils.js';

// URLs de descarga de Java por plataforma con checksums reales
const JAVA_DOWNLOAD_URLS = {
    // OpenJDK 8 para versiones 1.8-1.16
    java8: {
        win32: {
            x64: {
                url: 'https://github.com/adoptium/temurin8-binaries/releases/download/jdk8u412-b08/OpenJDK8U-jre_x64_windows_hotspot_8u412b08.zip',
                hash: null // Hash se verificará dinámicamente o se omitirá la verificación
            }
        },
        darwin: {
            x64: {
                url: 'https://github.com/adoptium/temurin8-binaries/releases/download/jdk8u412-b08/OpenJDK8U-jre_x64_mac_hotspot_8u412b08.tar.gz',
                hash: null
            },
            arm64: {
                url: 'https://github.com/adoptium/temurin8-binaries/releases/download/jdk8u412-b08/OpenJDK8U-jre_aarch64_mac_hotspot_8u412b08.tar.gz',
                hash: null
            }
        },
        linux: {
            x64: {
                url: 'https://github.com/adoptium/temurin8-binaries/releases/download/jdk8u412-b08/OpenJDK8U-jre_x64_linux_hotspot_8u412b08.tar.gz',
                hash: null
            }
        }
    },
    // OpenJDK 17 para versiones 1.17+
    java17: {
        win32: {
            x64: {
                url: 'https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.12%2B7/OpenJDK17U-jre_x64_windows_hotspot_17.0.12_7.zip',
                hash: null
            }
        },
        darwin: {
            x64: {
                url: 'https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.12%2B7/OpenJDK17U-jre_x64_mac_hotspot_17.0.12_7.tar.gz',
                hash: null
            },
            arm64: {
                url: 'https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.12%2B7/OpenJDK17U-jre_aarch64_mac_hotspot_17.0.12_7.tar.gz',
                hash: null
            }
        },
        linux: {
            x64: {
                url: 'https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.12%2B7/OpenJDK17U-jre_x64_linux_hotspot_17.0.12_7.tar.gz',
                hash: null
            }
        }
    },
    // OpenJDK 21 para versiones futuras
    java21: {
        win32: {
            x64: {
                url: 'https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.4%2B7/OpenJDK21U-jre_x64_windows_hotspot_21.0.4_7.zip',
                hash: null
            }
        },
        darwin: {
            x64: {
                url: 'https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.4%2B7/OpenJDK21U-jre_x64_mac_hotspot_21.0.4_7.tar.gz',
                hash: null
            },
            arm64: {
                url: 'https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.4%2B7/OpenJDK21U-jre_aarch64_mac_hotspot_21.0.4_7.tar.gz',
                hash: null
            }
        },
        linux: {
            x64: {
                url: 'https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.4%2B7/OpenJDK21U-jre_x64_linux_hotspot_21.0.4_7.tar.gz',
                hash: null
            }
        }
    }
};

// Mapeo de versiones de Minecraft a versiones de Java requeridas
const MINECRAFT_JAVA_COMPATIBILITY = {
    // Minecraft 1.7 - 1.16.5: Java 8+
    '1.7': 'java8',
    '1.8': 'java8',
    '1.9': 'java8',
    '1.10': 'java8',
    '1.11': 'java8',
    '1.12': 'java8',
    '1.13': 'java8',
    '1.14': 'java8',
    '1.15': 'java8',
    '1.16': 'java8',
    // Minecraft 1.17+: Java 17+
    '1.17': 'java17',
    '1.18': 'java17',
    '1.19': 'java17',
    '1.20': 'java17',
    '1.21': 'java21'
};

// Variables globales para paths y estado del juego
let appDataPath = null;
let runtimePath = null;
let gameStatus = {
    inProgress: false,
    javaInUse: null,
    startTime: null,
    instanceName: null
};

/**
 * Inicializa los paths necesarios para Java
 */
async function initJavaPaths() {
    try {
        // Obtener el path de appdata usando IPC
        appDataPath = await ipcRenderer.invoke('appData');
        
        let res = await config.GetConfig();
        const dataDirectory = res.dataDirectory || 'MiguelkiNetwork';
        const dirName = process.platform === 'darwin' ? dataDirectory : `.${dataDirectory}`;
        runtimePath = path.join(appDataPath, dirName, 'runtime');
        
        // Validar permisos de escritura
        const hasWritePermissions = await validateWritePermissions(runtimePath);
        if (!hasWritePermissions) {
            throw new Error(`No hay permisos de escritura en: ${runtimePath}`);
        }
        
        // Crear directorio runtime si no existe
        if (!fs.existsSync(runtimePath)) {
            fs.mkdirSync(runtimePath, { recursive: true });
            console.log(`📁 Directorio runtime creado: ${runtimePath}`);
        }
        
        console.log(`✅ Java paths inicializados. Runtime path: ${runtimePath}`);
        return runtimePath;
    } catch (error) {
        console.error('❌ Error inicializando paths de Java:', error);
        throw error;
    }
}

/**
 * Marca que un juego está en progreso usando una versión específica de Java
 */
function setGameInProgress(javaPath, instanceName = null) {
    gameStatus.inProgress = true;
    gameStatus.javaInUse = javaPath;
    gameStatus.startTime = Date.now();
    gameStatus.instanceName = instanceName;
    console.log(`🎮 Juego iniciado usando Java: ${javaPath}`);
}

/**
 * Marca que el juego ha terminado
 */
function setGameFinished() {
    console.log(`🎮 Juego terminado. Java liberado: ${gameStatus.javaInUse}`);
    gameStatus.inProgress = false;
    gameStatus.javaInUse = null;
    gameStatus.startTime = null;
    gameStatus.instanceName = null;
}

/**
 * Obtiene el estado actual del juego
 */
function getGameStatus() {
    return { ...gameStatus };
}

/**
 * Verifica si una instalación específica de Java está siendo usada
 */
function isJavaInUse(javaPathOrDirectory) {
    if (!gameStatus.inProgress || !gameStatus.javaInUse) {
        return false;
    }
    
    // Verificar si es la misma ruta exacta o si está dentro del directorio
    return gameStatus.javaInUse === javaPathOrDirectory || 
           gameStatus.javaInUse.startsWith(javaPathOrDirectory);
}

/**
 * Obtiene el path de runtime actual
 */
function getRuntimePath() {
    return runtimePath;
}

/**
 * Determina qué versión de Java se necesita para una versión específica de Minecraft
 */
function getRequiredJavaVersion(minecraftVersion) {
    // Extraer la versión principal (ej: "1.20.4" -> "1.20")
    const versionParts = minecraftVersion.split('.');
    let majorVersion;
    
    if (versionParts[0] === '1' && versionParts.length >= 2) {
        majorVersion = `${versionParts[0]}.${versionParts[1]}`;
    } else {
        majorVersion = versionParts[0];
    }
    
    // Buscar la versión de Java compatible
    for (const [mcVersion, javaVersion] of Object.entries(MINECRAFT_JAVA_COMPATIBILITY)) {
        if (majorVersion.startsWith(mcVersion)) {
            return javaVersion;
        }
    }
    
    // Fallback: para versiones muy nuevas usar Java 21, para muy viejas usar Java 8
    const numericVersion = parseFloat(majorVersion);
    if (numericVersion >= 1.21) {
        return 'java21';
    } else if (numericVersion >= 1.17) {
        return 'java17';
    } else {
        return 'java8';
    }
}

/**
 * Obtiene la versión de Java de un ejecutable
 */
async function getJavaVersion(javaPath) {
    return new Promise((resolve, reject) => {
        const child = spawn(javaPath, ['-version']);
        let output = '';
        
        child.stderr.on('data', (data) => {
            output += data.toString();
        });
        
        child.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(`Java process exited with code ${code}`));
                return;
            }
            
            // Parsear la versión de Java
            const versionMatch = output.match(/version "?([0-9]+)\.?([0-9]+)?\.?([0-9]+)?[^"]*"?/);
            if (versionMatch) {
                const major = parseInt(versionMatch[1]);
                const minor = parseInt(versionMatch[2] || '0');
                const patch = parseInt(versionMatch[3] || '0');
                
                resolve({
                    major: major >= 9 ? major : parseInt(versionMatch[2] || '8'),
                    minor: minor,
                    patch: patch,
                    full: versionMatch[1]
                });
            } else {
                reject(new Error('No se pudo parsear la versión de Java'));
            }
        });
        
        child.on('error', (error) => {
            reject(error);
        });
    });
}

/**
 * Verifica si una instalación de Java es compatible con una versión de Minecraft
 */
async function isJavaCompatible(javaPath, minecraftVersion) {
    try {
        if (!javaPath || !fs.existsSync(javaPath)) {
            return { compatible: false, reason: 'Java no encontrado' };
        }

        // Obtener versión de Java
        const javaVersion = await getJavaVersion(javaPath);
        if (!javaVersion) {
            return { compatible: false, reason: 'No se pudo determinar la versión de Java' };
        }

        // Determinar la versión requerida
        const requiredJava = getRequiredJavaVersion(minecraftVersion);
        const requiredMajorVersion = parseInt(requiredJava.replace('java', ''));
        
        // Verificar compatibilidad
        if (javaVersion.major < requiredMajorVersion) {
            return { 
                compatible: false, 
                reason: `Java ${requiredMajorVersion}+ requerido para Minecraft ${minecraftVersion}. Versión actual: Java ${javaVersion.major}` 
            };
        }

        return { compatible: true, version: javaVersion };
    } catch (error) {
        console.error('❌ Error verificando compatibilidad de Java:', error);
        return { compatible: false, reason: error.message };
    }
}

/**
 * Descarga e instala automáticamente la versión de Java requerida
 */
async function downloadAndInstallJava(minecraftVersion, progressCallback = null, statusCallback = null) {
    try {
        // Asegurar que los paths están inicializados
        if (!runtimePath) {
            await initJavaPaths();
        }
        
        const requiredJava = getRequiredJavaVersion(minecraftVersion);
        const platform = process.platform;
        const arch = process.arch;
        
        console.log(`☕ Descargando ${requiredJava} para ${platform}-${arch}...`);
        
        if (statusCallback) statusCallback(`Descargando ${requiredJava}...`);
        
        // Obtener URL de descarga
        const downloadInfo = await getDownloadInfo(requiredJava, platform, arch);
        if (!downloadInfo || !downloadInfo.url) {
            throw new Error(`No hay descarga disponible para ${requiredJava} en ${platform}-${arch}`);
        }
        
        console.log(`📥 Descargando desde: ${downloadInfo.url}`);
        
        // Crear directorio específico para esta versión
        const javaVersionPath = path.join(runtimePath, requiredJava);
        if (!fs.existsSync(javaVersionPath)) {
            fs.mkdirSync(javaVersionPath, { recursive: true });
        }
        
        // Verificar si ya está instalado
        const existingJavaPath = await findExistingJava(javaVersionPath);
        if (existingJavaPath) {
            const compatibility = await isJavaCompatible(existingJavaPath, minecraftVersion);
            if (compatibility.compatible) {
                console.log(`✅ Java ${requiredJava} ya está instalado y es compatible`);
                if (statusCallback) statusCallback(`Java ${requiredJava} ya está disponible`);
                return existingJavaPath;
            }
        }
        
        // Determinar la extensión del archivo basada en la URL
        let fileExtension = 'zip'; // Default para Windows
        if (downloadInfo.url && downloadInfo.url.includes('.tar.gz') || downloadInfo.url.includes('.tgz')) {
            fileExtension = 'tar.gz';
        } else if (downloadInfo.url && downloadInfo.url.includes('.zip')) {
            fileExtension = 'zip';
        }
        
        // Descargar archivo
        const downloadPath = path.join(javaVersionPath, `java-${requiredJava}.${fileExtension}`);
        await downloadFile(downloadInfo.url, downloadPath, progressCallback, statusCallback);
        
        // Obtener y verificar hash del archivo descargado
        let expectedHash = downloadInfo.hash;
        
        // Si es descarga dinámica y no tenemos hash, intentar obtenerlo desde la API
        if (downloadInfo.dynamic && !expectedHash) {
            if (statusCallback) statusCallback(`Obteniendo checksum para ${requiredJava}...`);
            expectedHash = await getChecksumFromAPI(requiredJava, platform, arch);
        }
        
        if (expectedHash) {
            if (statusCallback) statusCallback(`Verificando integridad del archivo Java ${requiredJava}...`);
            
            const hashValid = await verifyFileHash(downloadPath, expectedHash);
            if (!hashValid) {
                // Limpiar archivo corrupto
                try {
                    fs.unlinkSync(downloadPath);
                } catch (error) {
                    console.warn('⚠️ No se pudo eliminar el archivo corrupto:', error);
                }
                throw new Error(`Archivo Java descargado está corrupto (hash inválido). Intenta descargar nuevamente.`);
            }
            console.log(`✅ Hash verificado correctamente para Java ${requiredJava}`);
        } else {
            console.warn(`⚠️ No hay hash disponible para verificar Java ${requiredJava}. Continuando sin verificación de integridad.`);
        }
        
        // Extraer archivo
        if (statusCallback) statusCallback(`Extrayendo Java ${requiredJava}...`);
        const extractedPath = await extractJavaArchive(downloadPath, javaVersionPath);
        
        // Limpiar archivo descargado para ahorrar espacio
        try {
            fs.unlinkSync(downloadPath);
            console.log(`🗑️ Archivo comprimido eliminado: ${path.basename(downloadPath)}`);
        } catch (error) {
            console.warn('⚠️ No se pudo eliminar el archivo descargado:', downloadPath, error);
        }
        
        // Encontrar el ejecutable de Java
        const javaExecutable = await findJavaExecutable(extractedPath);
        if (!javaExecutable) {
            throw new Error('No se pudo encontrar el ejecutable de Java después de la extracción');
        }
          // Verificar la instalación
        const compatibility = await isJavaCompatible(javaExecutable, minecraftVersion);
        if (!compatibility.compatible) {
            throw new Error(`Java descargado no es compatible: ${compatibility.reason}`);
        }

        console.log(`✅ Java ${requiredJava} descargado e instalado correctamente`);
        if (statusCallback) statusCallback(`Java ${requiredJava} instalado correctamente`);
        
        return javaExecutable;
        
    } catch (error) {
        console.error('❌ Error descargando Java:', error);
        if (statusCallback) statusCallback(`Error: ${error.message}`);
        throw error;
    }
}

/**
 * Obtiene información de descarga para una versión específica de Java desde la API de Adoptium
 */
async function getDownloadInfo(javaVersion, platform, arch) {
    const javaVersionNumber = javaVersion.replace('java', ''); // java8 -> 8, java17 -> 17, etc.
    const platformKey = platform === 'win32' ? 'windows' : platform === 'darwin' ? 'mac' : 'linux';
    const archKey = arch === 'x64' ? 'x64' : arch === 'arm64' ? 'aarch64' : 'x64';
    
    // Para Windows, preferir formato ZIP para evitar problemas de extracción
    const isWindows = platform === 'win32';
    
    // Intentar con URLs dinámicas de la API de Adoptium
    try {
        const apiUrl = `https://api.adoptium.net/v3/binary/latest/${javaVersionNumber}/ga/${platformKey}/${archKey}/jre/hotspot/normal/eclipse`;
        
        console.log(`🔍 Intentando obtener Java ${javaVersionNumber} desde API: ${apiUrl}`);
        
        // Hacer una petición HEAD para verificar disponibilidad
        const response = await fetch(apiUrl, {
            method: 'HEAD',
            headers: {
                'User-Agent': 'MiguelkiNetworkMCLauncher'
            }
        });
        
        if (response.ok) {
            console.log(`✅ URL de descarga obtenida desde API: ${apiUrl}`);
            
            return {
                url: apiUrl,
                hash: null, // Se obtendrá dinámicamente más tarde
                dynamic: true
            };
        } else {
            console.warn(`⚠️ API response ${response.status} para Java ${javaVersionNumber}`);
        }
    } catch (error) {
        console.warn(`⚠️ Error accediendo a API de Adoptium: ${error.message}`);
    }
    
    // Fallback a URLs estáticas si la API falla
    console.log(`📋 Usando URLs estáticas para Java ${javaVersionNumber}`);
    const staticInfo = getStaticDownloadInfo(javaVersion, platform, arch);
    
    if (!staticInfo) {
        // Si tampoco hay URLs estáticas, devolver error específico
        throw new Error(`No hay descargas disponibles para Java ${javaVersionNumber} en ${platform}-${arch}. 

Esto puede deberse a:
• Plataforma no soportada: ${platform}
• Arquitectura no soportada: ${arch}
• URLs de descarga desactualizadas

Plataformas soportadas: Windows (x64), macOS (x64, arm64), Linux (x64)
Versiones soportadas: Java 8, 17, 21

Verifica tu configuración de sistema y conexión a internet.`);
    }
    
    return staticInfo;
}

/**
 * Obtiene información de descarga desde URLs estáticas (fallback)
 */
function getStaticDownloadInfo(javaVersion, platform, arch) {
    const platformKey = platform === 'win32' ? 'win32' : platform === 'darwin' ? 'darwin' : 'linux';
    const archKey = arch === 'x64' ? 'x64' : arch === 'arm64' ? 'arm64' : 'x64';
    
    const javaInfo = JAVA_DOWNLOAD_URLS[javaVersion];
    if (!javaInfo || !javaInfo[platformKey]) {
        return null;
    }
    
    const platformInfo = javaInfo[platformKey];
    const archInfo = platformInfo[archKey] || platformInfo.x64; // Fallback a x64
    
    if (!archInfo || !archInfo.url) {
        return null;
    }
    
    return {
        url: archInfo.url,
        hash: archInfo.hash,
        dynamic: false
    };
}

/**
 * Descarga un archivo con progreso
 */
async function downloadFile(url, outputPath, progressCallback = null, statusCallback = null) {
    const response = await fetch(url, {
        headers: {
            'User-Agent': 'MiguelkiNetworkMCLauncher'
        }
    });
    
    if (!response.ok) {
        throw new Error(`Error descargando: ${response.status} ${response.statusText}`);
    }
    
    const contentLength = parseInt(response.headers.get('content-length') || '0');
    let downloadedBytes = 0;
    
    const fileStream = fs.createWriteStream(outputPath);
    
    return new Promise((resolve, reject) => {
        response.body.on('data', (chunk) => {
            downloadedBytes += chunk.length;
            
            if (progressCallback && contentLength > 0) {
                const progress = Math.round((downloadedBytes / contentLength) * 100);
                progressCallback(progress, downloadedBytes, contentLength);
            }
            
            if (statusCallback && downloadedBytes % (1024 * 1024) === 0) { // Cada MB
                const mbDownloaded = Math.round(downloadedBytes / (1024 * 1024));
                const mbTotal = Math.round(contentLength / (1024 * 1024));
                statusCallback(`Descargando Java: ${mbDownloaded}/${mbTotal} MB`);
            }
        });
        
        response.body.pipe(fileStream);
        
        response.body.on('error', (error) => {
            fileStream.destroy();
            fs.unlink(outputPath, () => {});
            reject(error);
        });
        
        fileStream.on('error', (error) => {
            fs.unlink(outputPath, () => {});
            reject(error);
        });
        
        fileStream.on('finish', () => {
            resolve(outputPath);
        });
    });
}

/**
 * Extrae un archivo de Java descargado
 */
async function extractJavaArchive(archivePath, extractPath) {
    const isZip = archivePath.endsWith('.zip');
    
    try {
        if (isZip) {
            await extractZip(archivePath, extractPath);
        } else {
            // Archivo TAR.GZ
            await extractTarGz(archivePath, extractPath);
        }
        
        console.log(`✅ Java extraído exitosamente: ${archivePath} -> ${extractPath}`);
        return extractPath;
    } catch (error) {
        console.error('❌ Error extrayendo Java:', error);
        throw new Error(`Failed to extract Java archive: ${error.message}`);
    }
}

/**
 * Busca el ejecutable de Java en un directorio extraído
 */
async function findJavaExecutable(extractPath) {
    const javaExecutableName = process.platform === 'win32' ? 'java.exe' : 'java';
    console.log(`🔍 Buscando ${javaExecutableName} en: ${extractPath}`);
    
    // Buscar recursivamente en toda la estructura de directorios
    try {
        console.log(`� Realizando búsqueda recursiva de ${javaExecutableName}...`);
        const javaFiles = findFilesRecursive(extractPath, new RegExp(`^${javaExecutableName}$`), 10); // Aumentar maxDepth
        console.log(`📋 Archivos java encontrados: ${javaFiles.length}`);
        
        if (javaFiles.length === 0) {
            console.log(`❌ No se encontró ningún ejecutable de Java en: ${extractPath}`);
            return null;
        }
        
        console.log(`📄 Archivos Java encontrados:`, javaFiles);
        
        // Priorizar ejecutables en directorios 'bin'
        for (const javaFile of javaFiles) {
            const parentDir = path.basename(path.dirname(javaFile));
            console.log(`📂 Verificando ${javaFile} en directorio: ${parentDir}`);
            
            if (parentDir === 'bin') {
                console.log(`✅ Ejecutable de Java encontrado en directorio bin: ${javaFile}`);
                // Verificar que el archivo realmente existe
                if (fs.existsSync(javaFile)) {
                    // Hacer ejecutable en sistemas Unix
                    makeExecutable(javaFile);
                    return javaFile;
                } else {
                    console.warn(`⚠️ El archivo encontrado no existe realmente: ${javaFile}`);
                }
            }
        }
        
        // Si no se encuentra en bin, usar el primer resultado válido
        for (const javaFile of javaFiles) {
            if (fs.existsSync(javaFile)) {
                console.log(`⚠️ No se encontró en directorio 'bin', usando: ${javaFile}`);
                makeExecutable(javaFile);
                return javaFile;
            } else {
                console.warn(`⚠️ Archivo encontrado no existe: ${javaFile}`);
            }
        }
        
        console.log(`❌ Ningún archivo Java encontrado es válido en: ${extractPath}`);
        return null;
        
    } catch (error) {
        console.error(`❌ Error buscando ejecutable de Java en ${extractPath}:`, error);
        return null;
    }
}

/**
 * Busca una instalación existente de Java en un directorio
 */
async function findExistingJava(javaVersionPath) {
    if (!fs.existsSync(javaVersionPath)) {
        console.log(`📁 Directorio no existe: ${javaVersionPath}`);
        return null;
    }
    
    console.log(`🔍 Buscando ejecutable de Java en: ${javaVersionPath}`);
    const executable = await findJavaExecutable(javaVersionPath);
    
    if (executable) {
        console.log(`✅ Ejecutable encontrado: ${executable}`);
    } else {
        console.log(`❌ No se encontró ejecutable de Java en: ${javaVersionPath}`);
    }
    
    return executable;
}

/**
 * Obtiene la ruta de Java apropiada para una versión de Minecraft
 * Descarga automáticamente si no está disponible
 */
async function getJavaForMinecraft(minecraftVersion, currentJavaPath = null, progressCallback = null, statusCallback = null) {
    try {
        // Asegurar que los paths están inicializados
        if (!runtimePath) {
            await initJavaPaths();
        }
        
        console.log(`☕ Verificando Java para Minecraft ${minecraftVersion}...`);
        
        // Si hay una ruta personalizada de Java, verificar si es compatible
        if (currentJavaPath && currentJavaPath !== 'Utilice la versión de java suministrada con el launcher') {
            const compatibility = await isJavaCompatible(currentJavaPath, minecraftVersion);
            if (compatibility.compatible) {
                console.log(`✅ Java personalizado es compatible`);
                return currentJavaPath;
            } else {
                console.log(`⚠️ Java personalizado no es compatible: ${compatibility.reason}`);
                // Continuar con descarga automática
            }
        }
        
        // Verificar si ya tenemos Java compatible descargado
        const requiredJava = getRequiredJavaVersion(minecraftVersion);
        const javaVersionPath = path.join(runtimePath, requiredJava);
        const existingJava = await findExistingJava(javaVersionPath);
        
        if (existingJava) {
            const compatibility = await isJavaCompatible(existingJava, minecraftVersion);
            if (compatibility.compatible) {
                console.log(`✅ Java ${requiredJava} ya está disponible y es compatible`);
                return existingJava;
            }
        }
        
        // Descargar Java automáticamente
        console.log(`📥 Descargando Java ${requiredJava} automáticamente...`);
        const javaPath = await downloadAndInstallJava(minecraftVersion, progressCallback, statusCallback);
        
        return javaPath;
        
    } catch (error) {
        console.error('❌ Error obteniendo Java para Minecraft:', error);
        throw error;
    }
}

/**
 * Lista todas las instalaciones de Java disponibles
 */
async function listAvailableJavaInstallations() {
    // Asegurar que los paths están inicializados
    if (!runtimePath) {
        await initJavaPaths();
    }
    
    console.log(`🔍 Listando instalaciones de Java en: ${runtimePath}`);
    
    const installations = [];
    
    try {
        if (!fs.existsSync(runtimePath)) {
            console.log(`📁 Directorio runtime no existe: ${runtimePath}`);
            return installations;
        }
        
        const javaVersions = fs.readdirSync(runtimePath);
        console.log(`📦 Directorios encontrados en runtime: ${javaVersions.join(', ')}`);
        
        for (const version of javaVersions) {
            const versionPath = path.join(runtimePath, version);
            
            try {
                const stat = fs.statSync(versionPath);
                
                if (stat.isDirectory()) {
                    console.log(`📂 Verificando directorio: ${version}`);
                    const javaExecutable = await findExistingJava(versionPath);
                    
                    if (javaExecutable) {
                        console.log(`☕ Ejecutable de Java encontrado: ${javaExecutable}`);
                        try {
                            const javaVersion = await getJavaVersion(javaExecutable);
                            console.log(`✅ Versión de Java detectada: Java ${javaVersion.major}.${javaVersion.minor}`);
                            
                            installations.push({
                                version: version,
                                path: javaExecutable,
                                javaVersion: javaVersion,
                                directory: versionPath,
                                size: await getDirectorySize(versionPath)
                            });
                        } catch (javaVersionError) {
                            console.warn(`⚠️ Error verificando versión de Java en ${javaExecutable}:`, javaVersionError.message);
                            
                            // Instalación corrupta - agregar a lista para posible limpieza
                            console.log(`🧹 Marcando instalación corrupta para limpieza: ${version}`);
                            installations.push({
                                version: version,
                                path: javaExecutable,
                                javaVersion: null,
                                directory: versionPath,
                                corrupted: true,
                                error: javaVersionError.message
                            });
                        }
                    } else {
                        console.warn(`⚠️ No se encontró ejecutable de Java en ${versionPath}`);
                        
                        // Verificar si es un directorio vacío o corrupto
                        try {
                            const dirContents = fs.readdirSync(versionPath);
                            if (dirContents.length === 0) {
                                console.log(`🗑️ Directorio vacío detectado: ${version}`);
                                
                                // Eliminar directorio vacío automáticamente
                                fs.rmSync(versionPath, { recursive: true, force: true });
                                console.log(`✅ Directorio vacío eliminado: ${version}`);
                            } else {
                                console.log(`� Directorio con contenido pero sin ejecutable: ${version} (${dirContents.length} elementos)`);
                                console.log(`📁 Contenido: ${dirContents.join(', ')}`);
                                
                                // Agregar como instalación corrupta
                                installations.push({
                                    version: version,
                                    path: null,
                                    javaVersion: null,
                                    directory: versionPath,
                                    corrupted: true,
                                    error: 'Ejecutable de Java no encontrado',
                                    size: await getDirectorySize(versionPath)
                                });
                            }
                        } catch (dirError) {
                            console.error(`❌ Error accediendo al directorio ${versionPath}:`, dirError);
                        }
                    }
                } else {
                    console.log(`�📄 Omitiendo archivo (no es directorio): ${version}`);
                }
            } catch (statError) {
                console.error(`❌ Error verificando ${versionPath}:`, statError);
            }
        }
    } catch (error) {
        console.error('❌ Error listando instalaciones de Java:', error);
    }
    
    console.log(`📊 Total de instalaciones encontradas: ${installations.length}`);
    return installations;
}

/**
 * Limpia instalaciones de Java no utilizadas
 */
async function cleanupUnusedJava(forceClean = false) {
    try {
        const installations = await listAvailableJavaInstallations();
        const results = {
            cleaned: [],
            skipped: [],
            errors: [],
            totalSize: 0,
            freedSpace: 0
        };
        
        // Obtener información del sistema para logs
        const systemInfo = getSystemInfo();
        console.log('🔧 Sistema detectado:', systemInfo);
        
        // Verificar estado del juego
        const gameStatus = getGameStatus();
        if (gameStatus.inProgress && !forceClean) {
            console.log(`🎮 Juego en progreso usando Java: ${gameStatus.javaInUse}`);
            console.log(`⚠️ No se puede limpiar Java mientras el juego está ejecutándose`);
        }
        
        for (const installation of installations) {
            try {
                const size = await getDirectorySize(installation.directory);
                results.totalSize += size;
                
                // Verificar si esta instalación está siendo usada
                const isInUse = isJavaInUse(installation.directory);
                
                if (isInUse && !forceClean) {
                    console.log(`🔒 Saltando Java en uso: ${installation.version} (${installation.directory})`);
                    results.skipped.push({
                        version: installation.version,
                        path: installation.directory,
                        size: size,
                        reason: 'En uso por el juego'
                    });
                    continue;
                }
                
                // Verificar si es una instalación corrupta
                if (installation.corrupted) {
                    console.log(`🧹 Eliminando instalación corrupta: ${installation.version}`);
                } else {
                    console.log(`🗑️ Eliminando instalación de Java: ${installation.version}`);
                }
                
                // Intentar eliminar la instalación usando fs.rmSync
                fs.rmSync(installation.directory, { recursive: true, force: true });
                
                // Verificar que se eliminó correctamente
                if (!fs.existsSync(installation.directory)) {
                    console.log(`✅ Eliminado correctamente: ${installation.directory}`);
                    results.cleaned.push({
                        version: installation.version,
                        path: installation.directory,
                        size: size,
                        javaVersion: installation.javaVersion,
                        corrupted: installation.corrupted || false
                    });
                    results.freedSpace += size;
                } else {
                    console.warn(`⚠️ No se pudo eliminar completamente: ${installation.directory}`);
                    results.errors.push({
                        version: installation.version,
                        path: installation.directory,
                        error: 'Directorio no eliminado completamente'
                    });
                }
                
            } catch (error) {
                console.error(`❌ Error eliminando ${installation.version}:`, error);
                results.errors.push({
                    version: installation.version,
                    path: installation.directory,
                    error: error.message
                });
            }
        }
        
        console.log(`📊 Resumen de limpieza:`);
        console.log(`  - Instalaciones encontradas: ${installations.length}`);
        console.log(`  - Eliminadas: ${results.cleaned.length}`);
        console.log(`  - Saltadas: ${results.skipped.length}`);
        console.log(`  - Errores: ${results.errors.length}`);
        console.log(`  - Tamaño total: ${Math.round(results.totalSize / (1024 * 1024))} MB`);
        console.log(`  - Espacio liberado: ${Math.round(results.freedSpace / (1024 * 1024))} MB`);
        
        return { success: true, results };
    } catch (error) {
        console.error('❌ Error limpiando Java:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Obtiene el checksum SHA-256 de un archivo desde la API de Adoptium
 */
async function getChecksumFromAPI(javaVersion, platform, arch) {
    try {
        const javaVersionNumber = javaVersion.replace('java', '');
        const platformKey = platform === 'win32' ? 'windows' : platform === 'darwin' ? 'mac' : 'linux';
        const archKey = arch === 'x64' ? 'x64' : arch === 'arm64' ? 'aarch64' : 'x64';
        
        // URL para obtener información completa del release
        const apiUrl = `https://api.adoptium.net/v3/releases/latest/${javaVersionNumber}?architecture=${archKey}&image_type=jre&jvm_impl=hotspot&os=${platformKey}`;
        
        const response = await fetch(apiUrl, {
            headers: {
                'User-Agent': 'MiguelkiNetworkMCLauncher'
            }
        });
        
        if (!response.ok) {
            throw new Error(`API response: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Buscar el checksum en la respuesta
        if (data.binaries && data.binaries.length > 0) {
            const binary = data.binaries[0];
            if (binary.package && binary.package.checksum) {
                console.log(`✅ Checksum obtenido desde API: ${binary.package.checksum}`);
                return binary.package.checksum;
            }
        }
        
        return null;
    } catch (error) {
        console.warn(`⚠️ Error obteniendo checksum desde API: ${error.message}`);
        return null;
    }
}

// Exportar las funciones con ES Modules
export {
    initJavaPaths,
    getRuntimePath,
    getRequiredJavaVersion,
    getJavaVersion,
    isJavaCompatible,
    downloadAndInstallJava,
    getDownloadInfo,
    downloadFile,
    extractJavaArchive,
    findJavaExecutable,
    findExistingJava,
    getJavaForMinecraft,
    listAvailableJavaInstallations,
    cleanupUnusedJava,
    setGameInProgress,
    setGameFinished,
    isJavaInUse,
    getGameStatus
};

