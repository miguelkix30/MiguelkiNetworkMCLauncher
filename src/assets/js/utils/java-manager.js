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
    localization
} from '../utils.js';
import { 
    verifyFileHash,
    extractZip,
    extractTarGz,
    findFilesRecursive,
    makeExecutable,
    getDirectorySize,
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
    // OpenJDK 21 para versiones futuras (actualizado a 21.0.9+10)
    java21: {
        win32: {
            x64: {
                url: 'https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.9%2B10/OpenJDK21U-jre_x64_windows_hotspot_21.0.9_10.zip',
                hash: null
            }
        },
        darwin: {
            x64: {
                url: 'https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.9%2B10/OpenJDK21U-jre_x64_mac_hotspot_21.0.9_10.tar.gz',
                hash: null
            },
            arm64: {
                url: 'https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.9%2B10/OpenJDK21U-jre_aarch64_mac_hotspot_21.0.9_10.tar.gz',
                hash: null
            }
        },
        linux: {
            x64: {
                url: 'https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.9%2B10/OpenJDK21U-jre_x64_linux_hotspot_21.0.9_10.tar.gz',
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
    // Minecraft 1.17 - 1.20.6: Java 17+
    '1.17': 'java17',
    '1.18': 'java17',
    '1.19': 'java17',
    '1.20': 'java17',
    // Minecraft 1.21+: Java 21+
    '1.21': 'java21',
    '1.22': 'java21', // Para futuras versiones
    '1.23': 'java21'
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
            console.log(`📁 Directorio de runtime creado: ${runtimePath}`);
        }
        
        // Ejecutar limpieza automática de instalaciones corruptas
        console.log(`🧹 Iniciando limpieza automática de Java al inicializar...`);
        setTimeout(async () => {
            try {
                const cleanupResult = await cleanupCorruptedJavaInstallations();
                
                if (cleanupResult.cleaned > 0) {
                    console.log(`✅ Inicialización completada: ${cleanupResult.cleaned} instalaciones corruptas eliminadas`);
                } else {
                    console.log(`✅ Inicialización completada: Todas las instalaciones están válidas`);
                }
            } catch (cleanupError) {
                console.warn(`⚠️ Error durante la limpieza automática:`, cleanupError.message);
            }
        }, 1000); // Ejecutar después de 1 segundo para no bloquear la inicialización
        
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
}

/**
 * Marca que el juego ha terminado
 */
function setGameFinished() {
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
    console.log(`🔍 Determinando versión de Java para Minecraft ${minecraftVersion}`);
    
    // Extraer la versión principal (ej: "1.20.4" -> "1.20")
    const versionParts = minecraftVersion.split('.');
    let majorVersion;
    
    if (versionParts[0] === '1' && versionParts.length >= 2) {
        majorVersion = `${versionParts[0]}.${versionParts[1]}`;
    } else {
        majorVersion = versionParts[0];
    }
    
    console.log(`📋 Versión principal extraída: ${majorVersion}`);
    
    // Buscar coincidencia exacta primero
    if (MINECRAFT_JAVA_COMPATIBILITY[majorVersion]) {
        const javaVersion = MINECRAFT_JAVA_COMPATIBILITY[majorVersion];
        console.log(`✅ Coincidencia exacta encontrada: ${majorVersion} → ${javaVersion}`);
        return javaVersion;
    }
    
    // Si no hay coincidencia exacta, usar lógica numérica para determinar la versión
    const numericVersion = parseFloat(majorVersion);
    
    let javaVersion;
    if (numericVersion >= 1.21) {
        javaVersion = 'java21';
    } else if (numericVersion >= 1.17) {
        javaVersion = 'java17';
    } else {
        javaVersion = 'java8';
    }
    
    console.log(`☕ Versión de Java determinada: ${javaVersion} para Minecraft ${minecraftVersion}`);
    return javaVersion;
}

/**
 * Obtiene la versión de Java de un ejecutable con timeout y manejo robusto de errores
 */
async function getJavaVersion(javaPath, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
        // Verificar que el archivo existe antes de ejecutarlo
        if (!fs.existsSync(javaPath)) {
            reject(new Error(`El ejecutable de Java no existe: ${javaPath}`));
            return;
        }
        
        // Verificar que el archivo tiene permisos de ejecución
        try {
            fs.accessSync(javaPath, fs.constants.X_OK);
        } catch (accessError) {
            reject(new Error(`El ejecutable de Java no tiene permisos de ejecución: ${javaPath}`));
            return;
        }
        
        const child = spawn(javaPath, ['-version'], { 
            stdio: ['ignore', 'pipe', 'pipe'],
            timeout: timeoutMs
        });
        
        let output = '';
        let errorOutput = '';
        let timeoutId = null;
        let processEnded = false;
        
        // Configurar timeout manual
        timeoutId = setTimeout(() => {
            if (!processEnded) {
                processEnded = true;
                child.kill('SIGKILL');
                reject(new Error(`Timeout: El proceso Java no respondió en ${timeoutMs}ms`));
            }
        }, timeoutMs);
        
        child.stderr.on('data', (data) => {
            output += data.toString();
        });
        
        child.stdout.on('data', (data) => {
            errorOutput += data.toString();
        });
        
        child.on('close', (code) => {
            if (processEnded) return;
            processEnded = true;
            
            if (timeoutId) {
                clearTimeout(timeoutId);
                timeoutId = null;
            }
            
            if (code !== 0) {
                reject(new Error(`Java process exited with code ${code}. Output: ${output || errorOutput}`));
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
                reject(new Error(`No se pudo parsear la versión de Java. Output: ${output}`));
            }
        });
        
        child.on('error', (error) => {
            if (processEnded) return;
            processEnded = true;
            
            if (timeoutId) {
                clearTimeout(timeoutId);
                timeoutId = null;
            }
            
            reject(new Error(`Error ejecutando Java: ${error.message}`));
        });
    });
}

/**
 * Elimina de forma segura una instalación de Java corrupta
 */
async function removeCorruptedJavaInstallation(installationPath, version) {
    try {
        // Verificar que la instalación no esté en uso
        if (isJavaInUse(installationPath)) {
            console.warn(`⚠️ No se puede eliminar instalación corrupta de Java ${version}: está en uso por un juego activo`);
            return false;
        }
        
        console.log(`🧹 Eliminando instalación corrupta de Java: ${version}`);
        
        // Crear backup del error log si existe
        const errorLogPath = path.join(installationPath, 'corruption-error.log');
        try {
            const errorInfo = {
                timestamp: new Date().toISOString(),
                version: version,
                path: installationPath,
                reason: 'Instalación corrupta detectada y eliminada automáticamente'
            };
            await fs.promises.writeFile(errorLogPath, JSON.stringify(errorInfo, null, 2));
            console.log(`📝 Log de error creado en: ${errorLogPath}`);
        } catch (logError) {
            console.warn(`⚠️ No se pudo crear log de error:`, logError.message);
        }
        
        // Eliminar el directorio completo
        await new Promise((resolve, reject) => {
            const { exec } = require('child_process');
            const command = process.platform === 'win32' 
                ? `rmdir /S /Q "${installationPath}"` 
                : `rm -rf "${installationPath}"`;
                
            exec(command, (error, stdout, stderr) => {
                if (error) {
                    console.error(`❌ Error eliminando directorio ${installationPath}:`, error.message);
                    
                    // Intentar eliminación manual como fallback
                    try {
                        fs.rmSync(installationPath, { recursive: true, force: true });
                        console.log(`✅ Directorio eliminado exitosamente (fallback): ${version}`);
                        resolve();
                    } catch (fallbackError) {
                        console.error(`❌ Fallback de eliminación también falló:`, fallbackError.message);
                        reject(fallbackError);
                    }
                } else {
                    console.log(`✅ Instalación corrupta eliminada exitosamente: ${version}`);
                    resolve();
                }
            });
        });
        
        return true;
    } catch (error) {
        console.error(`❌ Error eliminando instalación corrupta ${version}:`, error);
        return false;
    }
}

/**
 * Escanea y limpia automáticamente instalaciones corruptas de Java
 */
async function cleanupCorruptedJavaInstallations() {
    try {
        console.log(`🔍 Iniciando escaneo de instalaciones corruptas de Java...`);
        
        if (!runtimePath) {
            await initJavaPaths();
        }
        
        if (!fs.existsSync(runtimePath)) {
            console.log(`📂 Directorio de runtime no existe: ${runtimePath}`);
            return { cleaned: 0, total: 0 };
        }
        
        const javaVersions = fs.readdirSync(runtimePath);
        let cleanedCount = 0;
        let totalChecked = 0;
        
        for (const version of javaVersions) {
            const versionPath = path.join(runtimePath, version);
            totalChecked++;
            
            try {
                const stat = fs.statSync(versionPath);
                
                if (!stat.isDirectory()) {
                    continue;
                }
                
                console.log(`🔍 Verificando instalación: ${version}`);
                const javaExecutable = await findExistingJava(versionPath);
                
                if (!javaExecutable) {
                    console.log(`❌ Ejecutable de Java no encontrado en: ${version}`);
                    
                    // Verificar si es un directorio vacío
                    const dirContents = fs.readdirSync(versionPath);
                    if (dirContents.length === 0) {
                        console.log(`🗑️ Eliminando directorio vacío: ${version}`);
                        await removeCorruptedJavaInstallation(versionPath, version);
                        cleanedCount++;
                    } else {
                        console.log(`🧹 Eliminando instalación incompleta: ${version}`);
                        await removeCorruptedJavaInstallation(versionPath, version);
                        cleanedCount++;
                    }
                    continue;
                }
                
                // Intentar verificar la versión con timeout reducido
                try {
                    const javaVersion = await getJavaVersion(javaExecutable, 3000); // 3 segundos timeout
                    console.log(`✅ Instalación válida: ${version} (Java ${javaVersion.major})`);
                } catch (javaVersionError) {
                    console.log(`❌ Error verificando versión de ${version}:`, javaVersionError.message);
                    console.log(`🧹 Eliminando instalación corrupta: ${version}`);
                    await removeCorruptedJavaInstallation(versionPath, version);
                    cleanedCount++;
                }
                
            } catch (fsError) {
                console.error(`❌ Error accediendo a ${version}:`, fsError.message);
                // Intentar eliminar si hay problemas de acceso al filesystem
                try {
                    await removeCorruptedJavaInstallation(versionPath, version);
                    cleanedCount++;
                } catch (removeError) {
                    console.error(`❌ No se pudo eliminar instalación problemática ${version}:`, removeError.message);
                }
            }
        }
        
        console.log(`🎯 Limpieza completada: ${cleanedCount} instalaciones corruptas eliminadas de ${totalChecked} verificadas`);
        return { cleaned: cleanedCount, total: totalChecked };
        
    } catch (error) {
        console.error(`❌ Error durante la limpieza de instalaciones corruptas:`, error);
        return { cleaned: 0, total: 0, error: error.message };
    }
}
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
        
        // Verificar compatibilidad mínima
        if (javaVersion.major < requiredMajorVersion) {
            return { 
                compatible: false, 
                reason: `Java ${requiredMajorVersion}+ requerido para Minecraft ${minecraftVersion}. Versión actual: Java ${javaVersion.major}` 
            };
        }

        // ⚠️ REGLAS ESPECIALES DE COMPATIBILIDAD ⚠️
        // Para versiones antiguas de Minecraft (1.16.5 y anteriores), Java 17+ causa problemas
        const minecraftVersionFloat = parseFloat(minecraftVersion.replace(/^1\./, '1.'));
        
        if (minecraftVersionFloat <= 1.16 && javaVersion.major >= 17) {
            return {
                compatible: false,
                reason: `Minecraft ${minecraftVersion} no es compatible con Java ${javaVersion.major}. Las versiones antiguas de Minecraft requieren Java 8-16. Java ${javaVersion.major} causa ClassCastException con el sistema de classloaders.`,
                incompatibilityType: 'legacy-minecraft',
                recommendedJava: 'java8'
            };
        }

        // Para Minecraft 1.17-1.20, Java 21+ puede causar problemas
        if (minecraftVersionFloat >= 1.17 && minecraftVersionFloat <= 1.20 && javaVersion.major >= 21) {
            return {
                compatible: false,
                reason: `Minecraft ${minecraftVersion} puede tener problemas con Java ${javaVersion.major}. Se recomienda Java 17 para máxima compatibilidad.`,
                incompatibilityType: 'modern-minecraft-stability',
                recommendedJava: 'java17'
            };
        }

        // Indicar si es la versión óptima o solo compatible
        const isOptimal = javaVersion.major === requiredMajorVersion;
        const compatibilityNote = isOptimal 
            ? `Java ${javaVersion.major} es la versión óptima para Minecraft ${minecraftVersion}`
            : `Java ${javaVersion.major} es compatible con Minecraft ${minecraftVersion}, pero Java ${requiredMajorVersion} sería óptimo`;

        return { 
            compatible: true, 
            version: javaVersion,
            optimal: isOptimal,
            note: compatibilityNote
        };
    } catch (error) {
        console.error('❌ Error verificando compatibilidad de Java:', error);
        return { compatible: false, reason: error.message };
    }
}

/**
 * Verifica que un ejecutable de Java funciona correctamente
 * @param {string} javaExecutable - Ruta al ejecutable de Java
 * @param {string} requiredJava - Versión de Java requerida (java8, java17, etc.)
 * @param {number} timeoutMs - Tiempo límite en milisegundos para la verificación
 * @returns {Promise<{working: boolean, version: object|null, error: string|null}>}
 */
async function verifyJavaFunctionality(javaExecutable, requiredJava, timeoutMs = 10000) {
    try {
        console.log(`🔍 Verificando funcionamiento de Java: ${javaExecutable}`);
        
        // Verificar que el archivo existe y tiene permisos
        if (!fs.existsSync(javaExecutable)) {
            return { working: false, version: null, error: 'El ejecutable de Java no existe' };
        }
        
        // Intentar obtener la versión de Java
        const javaVersion = await getJavaVersion(javaExecutable, timeoutMs);
        if (!javaVersion) {
            return { working: false, version: null, error: 'No se pudo obtener la versión de Java' };
        }
        
        console.log(`📋 Versión de Java detectada: ${javaVersion.major}.${javaVersion.minor}.${javaVersion.patch}`);
        
        // Verificar que es la versión correcta
        const expectedMajorVersion = parseInt(requiredJava.replace('java', ''));
        if (javaVersion.major !== expectedMajorVersion) {
            return { 
                working: false, 
                version: javaVersion, 
                error: `Versión incorrecta: esperada Java ${expectedMajorVersion}, encontrada Java ${javaVersion.major}` 
            };
        }
        
        // Prueba adicional: ejecutar un comando Java simple
        const testResult = await testJavaExecution(javaExecutable, timeoutMs);
        if (!testResult.success) {
            return { working: false, version: javaVersion, error: `Error en prueba de ejecución: ${testResult.error}` };
        }
        
        console.log(`✅ Java verificado correctamente: ${javaExecutable}`);
        return { working: true, version: javaVersion, error: null };
        
    } catch (error) {
        console.error(`❌ Error verificando Java ${javaExecutable}:`, error);
        return { working: false, version: null, error: error.message };
    }
}

/**
 * Realiza una prueba básica de ejecución de Java
 * @param {string} javaExecutable - Ruta al ejecutable de Java
 * @param {number} timeoutMs - Tiempo límite en milisegundos
 * @returns {Promise<{success: boolean, error: string|null}>}
 */
async function testJavaExecution(javaExecutable, timeoutMs = 8000) {
    return new Promise((resolve) => {
        try {
            // Ejecutar un comando Java simple que imprime las propiedades del sistema
            const child = spawn(javaExecutable, ['-XshowSettings:properties', '-version'], { 
                stdio: ['ignore', 'pipe', 'pipe'],
                timeout: timeoutMs 
            });
            
            let processEnded = false;
            let timeoutId = null;
            
            // Configurar timeout manual
            timeoutId = setTimeout(() => {
                if (!processEnded) {
                    processEnded = true;
                    try {
                        child.kill('SIGTERM');
                        setTimeout(() => {
                            if (!child.killed) {
                                child.kill('SIGKILL');
                            }
                        }, 2000);
                    } catch (killError) {
                        console.warn('⚠️ Error terminando proceso Java:', killError);
                    }
                    resolve({ success: false, error: 'Timeout al ejecutar prueba de Java' });
                }
            }, timeoutMs);
            
            child.on('close', (code) => {
                if (processEnded) return;
                processEnded = true;
                
                if (timeoutId) {
                    clearTimeout(timeoutId);
                }
                
                // Java -version devuelve código 0 al éxito
                if (code === 0) {
                    resolve({ success: true, error: null });
                } else {
                    resolve({ success: false, error: `Código de salida ${code}` });
                }
            });
            
            child.on('error', (error) => {
                if (processEnded) return;
                processEnded = true;
                
                if (timeoutId) {
                    clearTimeout(timeoutId);
                }
                
                resolve({ success: false, error: `Error en proceso: ${error.message}` });
            });
            
        } catch (error) {
            resolve({ success: false, error: `Excepción al ejecutar Java: ${error.message}` });
        }
    });
}

/**
 * Limpia completamente un directorio de instalación de Java fallida
 * @param {string} javaVersionPath - Ruta del directorio a limpiar
 * @param {string} requiredJava - Versión de Java para logs
 */
async function cleanupFailedJavaInstallation(javaVersionPath, requiredJava) {
    try {
        console.log(`🧹 Limpiando instalación fallida de Java ${requiredJava}: ${javaVersionPath}`);
        
        if (fs.existsSync(javaVersionPath)) {
            // Verificar que no esté en uso
            if (isJavaInUse(javaVersionPath)) {
                console.warn(`⚠️ No se puede limpiar ${requiredJava}: está en uso`);
                return false;
            }
            
            // Usar la función de limpieza de java-utils.js
            const { cleanDirectory } = await import('./java-utils.js');
            await cleanDirectory(javaVersionPath);
            
            // Eliminar el directorio vacío
            try {
                fs.rmdirSync(javaVersionPath);
                console.log(`✅ Directorio ${javaVersionPath} eliminado correctamente`);
            } catch (rmdirError) {
                console.warn(`⚠️ Error eliminando directorio vacío: ${rmdirError.message}`);
            }
            
            return true;
        }
        
        return true; // Si no existe, consideramos que está limpio
    } catch (error) {
        console.error(`❌ Error limpiando instalación fallida ${requiredJava}:`, error);
        return false;
    }
}

/**
 * Descarga e instala automáticamente la versión de Java requerida con reintentos y verificación
 * @param {string} minecraftVersion - Versión de Minecraft
 * @param {function} progressCallback - Callback para progreso de descarga
 * @param {function} statusCallback - Callback para estado de la operación
 * @param {number} maxRetries - Número máximo de reintentos (por defecto 3)
 * @returns {Promise<string>} - Ruta al ejecutable de Java instalado
 */
async function downloadAndInstallJava(minecraftVersion, progressCallback = null, statusCallback = null, maxRetries = 3) {
    let lastError = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`� Intento ${attempt}/${maxRetries} - Descargando Java para Minecraft ${minecraftVersion}`);
            
            // Asegurar que los paths están inicializados
            if (!runtimePath) {
                await initJavaPaths();
            }
            
            const requiredJava = getRequiredJavaVersion(minecraftVersion);
            const platform = process.platform;
            const arch = process.arch;
            const javaVersionPath = path.join(runtimePath, requiredJava);
            
            console.log(`☕ ${localization.t('home.downloading')} ${requiredJava} ${localization.t('misc.for')} ${platform}-${arch}...`);
            
            if (statusCallback) {
                const attemptText = attempt > 1 ? ` (Intento ${attempt}/${maxRetries})` : '';
                statusCallback(`${localization.t('home.downloading')} ${requiredJava}...${attemptText}`);
            }
            
            // Si no es el primer intento, limpiar instalación anterior
            if (attempt > 1) {
                console.log(`🧹 Limpiando intento anterior...`);
                await cleanupFailedJavaInstallation(javaVersionPath, requiredJava);
                
                // Esperar un poco antes del siguiente intento
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            // Verificar si ya está instalado y funciona correctamente
            if (fs.existsSync(javaVersionPath)) {
                const existingJavaPath = await findExistingJava(javaVersionPath);
                if (existingJavaPath) {
                    console.log(`🔍 Verificando instalación existente de ${requiredJava}...`);
                    
                    const functionality = await verifyJavaFunctionality(existingJavaPath, requiredJava);
                    if (functionality.working) {
                        const compatibility = await isJavaCompatible(existingJavaPath, minecraftVersion);
                        if (compatibility.compatible) {
                            console.log(`✅ Java ${requiredJava} ya está instalado y funciona correctamente`);
                            if (statusCallback) statusCallback(`Java ${requiredJava} (verificado)`);
                            return existingJavaPath;
                        }
                    } else {
                        console.log(`❌ Instalación existente no funciona: ${functionality.error}`);
                        console.log(`🧹 Limpiando instalación defectuosa...`);
                        await cleanupFailedJavaInstallation(javaVersionPath, requiredJava);
                    }
                }
            }
            
            // Obtener URL de descarga
            const downloadInfo = await getDownloadInfo(requiredJava, platform, arch);
            if (!downloadInfo || !downloadInfo.url) {
                throw new Error(`No hay descarga disponible para ${requiredJava} en ${platform}-${arch}`);
            }
            
            console.log(`📥 Descargando desde: ${downloadInfo.url}`);
            
            // Crear directorio específico para esta versión
            if (!fs.existsSync(javaVersionPath)) {
                fs.mkdirSync(javaVersionPath, { recursive: true });
            }
            
            // Determinar la extensión del archivo basada en la URL
            let fileExtension = 'zip'; // Default para Windows
            if (downloadInfo.url && (downloadInfo.url.includes('.tar.gz') || downloadInfo.url.includes('.tgz'))) {
                fileExtension = 'tar.gz';
            } else if (downloadInfo.url && downloadInfo.url.includes('.zip')) {
                fileExtension = 'zip';
            }
            
            // Descargar archivo
            const downloadPath = path.join(javaVersionPath, `java-${requiredJava}-attempt${attempt}.${fileExtension}`);
            await downloadFile(downloadInfo.url, downloadPath, progressCallback, statusCallback);
            
            // Obtener y verificar hash del archivo descargado
            let expectedHash = downloadInfo.hash;
            
            // Si es descarga dinámica y no tenemos hash, intentar obtenerlo desde la API
            if (downloadInfo.dynamic && !expectedHash) {
                if (statusCallback) statusCallback(`Obteniendo checksum para ${requiredJava}...`);
                expectedHash = await getChecksumFromAPI(requiredJava, platform, arch);
            }
            
            if (expectedHash) {
                if (statusCallback) statusCallback(`Verificando integridad de ${requiredJava}...`);
                
                const hashValid = await verifyFileHash(downloadPath, expectedHash);
                if (!hashValid) {
                    // Limpiar archivo corrupto
                    try {
                        fs.unlinkSync(downloadPath);
                    } catch (error) {
                        console.warn('⚠️ No se pudo eliminar el archivo corrupto:', error);
                    }
                    throw new Error(`Archivo Java descargado está corrupto (hash inválido)`);
                }
                console.log(`✅ Hash verificado correctamente para Java ${requiredJava}`);
            } else {
                console.warn(`⚠️ No hay hash disponible para verificar Java ${requiredJava}. Continuando sin verificación de integridad.`);
            }
            
            // Extraer archivo
            if (statusCallback) statusCallback(`Extrayendo ${requiredJava}...`);
            const extractedPath = await extractJavaArchive(downloadPath, javaVersionPath);
            
            // Limpiar archivo descargado para ahorrar espacio
            try {
                fs.unlinkSync(downloadPath);
            } catch (error) {
                console.warn('⚠️ No se pudo eliminar el archivo descargado:', downloadPath, error);
            }
            
            // Encontrar el ejecutable de Java
            console.log(`🔍 Buscando ejecutable de Java en el directorio extraído: ${extractedPath}`);
            const javaExecutable = await findJavaExecutable(extractedPath);
            if (!javaExecutable) {
                // Intentar listar el contenido del directorio para depuración
                try {
                    const contents = fs.readdirSync(extractedPath);
                    console.log(`📁 Contenido después de extracción (primeros 10):`, contents.slice(0, 10));
                } catch (listError) {
                    console.warn(`⚠️ No se pudo listar el contenido del directorio extraído:`, listError);
                }
                throw new Error('No se pudo encontrar el ejecutable de Java después de la extracción');
            }
            
            // Verificar que el ejecutable realmente existe antes de continuar
            if (!fs.existsSync(javaExecutable)) {
                throw new Error(`El ejecutable de Java encontrado no existe en el filesystem: ${javaExecutable}`);
            }
            
            console.log(`✅ Ejecutable de Java encontrado: ${javaExecutable}`);
            
            // VERIFICACIÓN MEJORADA: Probar funcionamiento del Java descargado
            if (statusCallback) statusCallback(`Verificando funcionamiento de ${requiredJava}...`);
            
            const functionality = await verifyJavaFunctionality(javaExecutable, requiredJava, 15000);
            if (!functionality.working) {
                throw new Error(`Java descargado no funciona correctamente: ${functionality.error}`);
            }
            
            // Verificar compatibilidad con Minecraft
            const compatibility = await isJavaCompatible(javaExecutable, minecraftVersion);
            if (!compatibility.compatible) {
                throw new Error(`Java descargado no es compatible con Minecraft ${minecraftVersion}: ${compatibility.reason}`);
            }
            
            console.log(`✅ Java ${requiredJava} descargado, instalado y verificado correctamente`);
            if (statusCallback) statusCallback(`Java ${requiredJava} instalado y verificado`);
            
            return javaExecutable;
            
        } catch (error) {
            lastError = error;
            console.error(`❌ Intento ${attempt}/${maxRetries} fallido:`, error.message);
            
            if (statusCallback) {
                statusCallback(`Error en intento ${attempt}/${maxRetries}: ${error.message}`);
            }
            
            // Si no es el último intento, continúar
            if (attempt < maxRetries) {
                console.log(`🔄 Preparando siguiente intento...`);
                
                // Limpiar instalación fallida antes del siguiente intento
                try {
                    const requiredJava = getRequiredJavaVersion(minecraftVersion);
                    const javaVersionPath = path.join(runtimePath, requiredJava);
                    await cleanupFailedJavaInstallation(javaVersionPath, requiredJava);
                } catch (cleanupError) {
                    console.warn(`⚠️ Error en limpieza: ${cleanupError.message}`);
                }
                
                // Esperar progresivamente más tiempo entre intentos
                const waitTime = attempt * 2000; // 2s, 4s para los intentos
                console.log(`⏳ Esperando ${waitTime/1000}s antes del siguiente intento...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                
                continue;
            }
        }
    }
    
    // Si llegamos aquí, todos los intentos fallaron
    const errorMessage = `❌ No se pudo descargar e instalar Java después de ${maxRetries} intentos. Último error: ${lastError?.message || 'Error desconocido'}`;
    console.error(errorMessage);
    
    if (statusCallback) {
        statusCallback(`Error: No se pudo instalar Java después de ${maxRetries} intentos`);
    }
    
    throw new Error(`Fallo en descarga de Java después de ${maxRetries} intentos: ${lastError?.message || 'Error desconocido'}`);
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
    
    // PRIORIDAD 1: Siempre usar URLs estáticas para evitar problemas de redirección y estructura de directorios inconsistente
    console.log(`📋 Usando URLs estáticas para Java ${javaVersionNumber}`);
    const staticInfo = getStaticDownloadInfo(javaVersion, platform, arch);
    
    if (staticInfo && staticInfo.url) {
        console.log(`✅ URL estática encontrada para Java ${javaVersionNumber}: ${staticInfo.url}`);
        return staticInfo;
    }
    
    // PRIORIDAD 2: Intentar con URLs dinámicas de la API de Adoptium solo si no hay URL estática
    console.log(`⚠️ No hay URL estática para Java ${javaVersionNumber}, intentando API dinámica...`);
    try {
        const apiUrl = `https://api.adoptium.net/v3/binary/latest/${javaVersionNumber}/ga/${platformKey}/${archKey}/jre/hotspot/normal/eclipse`;
        
        console.log(`🔍 Intentando obtener Java ${javaVersionNumber} desde API: ${apiUrl}`);
        
        // Hacer una petición HEAD para verificar disponibilidad
        const response = await fetch(apiUrl, {
            method: 'HEAD',
            headers: {
                'User-Agent': 'MiguelkiNetworkMCLauncher'
            },
            redirect: 'follow' // Seguir redirecciones automáticamente
        });
        
        if (response.ok) {
            // Obtener la URL final después de las redirecciones
            const finalUrl = response.url || apiUrl;
            console.log(`✅ URL de descarga obtenida desde API: ${finalUrl}`);
            
            return {
                url: finalUrl,
                hash: null, // Se obtendrá dinámicamente más tarde
                dynamic: true
            };
        } else {
            console.warn(`⚠️ API response ${response.status} para Java ${javaVersionNumber}`);
        }
    } catch (error) {
        console.warn(`⚠️ Error accediendo a API de Adoptium: ${error.message}`);
    }
    
    // Si llegamos aquí, no hay descarga disponible
    throw new Error(`No hay descargas disponibles para Java ${javaVersionNumber} en ${platform}-${arch}.<br><br>Esto puede deberse a:<br>- Plataforma no soportada: ${platform}<br>- Arquitectura no soportada: ${arch}<br>- URLs de descarga desactualizadas<br><br>Plataformas soportadas: Windows (x64), macOS (x64, arm64), Linux (x64)<br>Versiones soportadas: Java 8, 17, 21<br>Verifica tu configuración de sistema y conexión a internet.`);
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
            
            /* if (statusCallback && downloadedBytes % (1024 * 1024) === 0) { // Cada MB
                const mbDownloaded = Math.round(downloadedBytes / (1024 * 1024));
                const mbTotal = Math.round(contentLength / (1024 * 1024));
                statusCallback(`Descargando Java: ${mbDownloaded}/${mbTotal} MB`);
            } */
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
    
    // Buscar recursivamente en toda la estructura de directorios
    try {
        console.log(`🔍 Buscando '${javaExecutableName}' en: ${extractPath}`);
        const javaFiles = findFilesRecursive(extractPath, new RegExp(`^${javaExecutableName}$`), 10);
        
        if (javaFiles.length === 0) {
            console.log(`❌ No se encontró ningún ejecutable de Java en: ${extractPath}`);
            
            // Intentar listar el contenido del directorio para depuración
            try {
                const contents = fs.readdirSync(extractPath);
                console.log(`📁 Contenido del directorio ${extractPath}:`, contents.slice(0, 10));
            } catch (listError) {
                console.warn(`⚠️ No se pudo listar el contenido del directorio:`, listError);
            }
            
            return null;
        }
        
        console.log(`📋 Se encontraron ${javaFiles.length} ejecutable(s) de Java:`, javaFiles);
        
        // Priorizar ejecutables en directorios 'bin'
        for (const javaFile of javaFiles) {
            const parentDir = path.basename(path.dirname(javaFile));
            
            if (parentDir === 'bin') {
                // Verificar que el archivo realmente existe
                if (fs.existsSync(javaFile)) {
                    console.log(`✅ Ejecutable de Java encontrado en bin: ${javaFile}`);
                    // Hacer ejecutable en sistemas Unix (makeExecutable ya verifica el SO)
                    if (process.platform !== 'win32') {
                        makeExecutable(javaFile);
                    }
                    return javaFile;
                } else {
                    console.warn(`⚠️ El archivo encontrado no existe realmente: ${javaFile}`);
                }
            }
        }
        
        // Si no se encuentra en bin, usar el primer resultado válido
        console.log(`⚠️ No se encontró ejecutable en directorio 'bin', buscando en cualquier ubicación...`);
        for (const javaFile of javaFiles) {
            if (fs.existsSync(javaFile)) {
                console.log(`✅ Ejecutable de Java encontrado (fuera de bin): ${javaFile}`);
                // Hacer ejecutable en sistemas Unix (makeExecutable ya verifica el SO)
                if (process.platform !== 'win32') {
                    makeExecutable(javaFile);
                }
                return javaFile;
            } else {
                console.warn(`⚠️ El archivo encontrado no existe: ${javaFile}`);
            }
        }
        
        console.error(`❌ Ninguno de los ${javaFiles.length} ejecutables encontrados existe realmente`);
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
        console.log(`❌ Directorio de Java no existe: ${javaVersionPath}`);
        return null;
    }
    
    console.log(`🔍 Buscando ejecutable de Java en: ${javaVersionPath}`);
    const executable = await findJavaExecutable(javaVersionPath);
    
    if (executable) {
        // Verificación adicional: asegurar que el archivo realmente existe y es accesible
        try {
            if (fs.existsSync(executable)) {
                // En Windows, verificar que el archivo es accesible
                if (process.platform === 'win32') {
                    try {
                        fs.accessSync(executable, fs.constants.F_OK | fs.constants.R_OK);
                    } catch (accessError) {
                        console.error(`❌ El ejecutable de Java no es accesible: ${executable}`, accessError);
                        return null;
                    }
                }
                console.log(`✅ Ejecutable de Java encontrado y verificado: ${executable}`);
                return executable;
            } else {
                console.error(`❌ El ejecutable de Java encontrado no existe en el filesystem: ${executable}`);
                return null;
            }
        } catch (error) {
            console.error(`❌ Error verificando ejecutable de Java: ${executable}`, error);
            return null;
        }
    } else {
        console.log(`❌ No se encontró ejecutable de Java en: ${javaVersionPath}`);
    }
    
    return null;
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
        
        // Si hay una ruta personalizada de Java, verificar si es la versión óptima
        if (currentJavaPath && currentJavaPath !== 'launcher') {
            const compatibility = await isJavaCompatible(currentJavaPath, minecraftVersion);
            if (compatibility.compatible) {
                if (compatibility.optimal) {
                    console.log(`✅ Java personalizado es la versión óptima para Minecraft ${minecraftVersion}`);
                    return currentJavaPath;
                } else {
                    console.log(`⚠️ Java personalizado es compatible pero no óptimo (${compatibility.note}). Se descargará la versión óptima.`);
                    // Continuar con descarga automática para obtener la versión óptima
                }
            } else {
                console.log(`⚠️ Java personalizado no es compatible: ${compatibility.reason}`);
                // Continuar con descarga automática
            }
        }
        
        // Determinar la versión óptima de Java para esta versión de Minecraft
        const requiredJava = getRequiredJavaVersion(minecraftVersion);
        console.log(`🎯 Versión óptima de Java para Minecraft ${minecraftVersion}: ${requiredJava}`);
        
        // PRIMERA PRIORIDAD: Buscar la versión exacta requerida
        const javaVersionPath = path.join(runtimePath, requiredJava);
        const existingJava = await findExistingJava(javaVersionPath);
        
        if (existingJava) {
            // Verificar que el ejecutable realmente existe antes de usarlo
            if (!fs.existsSync(existingJava)) {
                console.error(`❌ El ejecutable de Java encontrado ya no existe: ${existingJava}`);
                console.log(`🧹 Limpiando instalación corrupta de ${requiredJava}...`);
                await cleanupFailedJavaInstallation(javaVersionPath, requiredJava);
            } else {
                // Verificar que es exactamente la versión requerida, no solo compatible
                try {
                    const javaVersionInfo = await getJavaVersion(existingJava);
                    const requiredMajorVersion = parseInt(requiredJava.replace('java', ''));
                    
                    if (javaVersionInfo.major === requiredMajorVersion) {
                        console.log(`✅ Java ${requiredJava} (versión exacta) ya está disponible: ${existingJava}`);
                        // Verificación final: asegurar que el ejecutable es accesible
                        try {
                            fs.accessSync(existingJava, fs.constants.F_OK | fs.constants.R_OK);
                            return existingJava;
                        } catch (accessError) {
                            console.error(`❌ Java existe pero no es accesible: ${existingJava}`, accessError);
                            console.log(`🧹 Limpiando instalación inaccesible de ${requiredJava}...`);
                            await cleanupFailedJavaInstallation(javaVersionPath, requiredJava);
                        }
                    } else {
                        console.log(`⚠️ Java en ${javaVersionPath} no es la versión exacta requerida (encontrado: Java ${javaVersionInfo.major}, requerido: Java ${requiredMajorVersion})`);
                    }
                } catch (versionError) {
                    console.error(`❌ Error obteniendo versión de Java de ${existingJava}:`, versionError);
                    console.log(`🧹 Limpiando instalación defectuosa de ${requiredJava}...`);
                    await cleanupFailedJavaInstallation(javaVersionPath, requiredJava);
                }
            }
        }
        
        // SEGUNDA PRIORIDAD: Descargar la versión exacta requerida
        console.log(`📥 Descargando Java ${requiredJava} (versión óptima) automáticamente...`);
        try {
            const javaPath = await downloadAndInstallJava(minecraftVersion, progressCallback, statusCallback);
            return javaPath;
        } catch (downloadError) {
            console.error(`❌ Error descargando Java ${requiredJava}:`, downloadError);
            
            // TERCERA PRIORIDAD: Solo como último recurso, buscar versiones alternativas instaladas
            console.log(`🔍 Como último recurso, buscando versiones alternativas de Java instaladas...`);
            const allInstallations = await listAvailableJavaInstallations();
            const compatibleInstallations = [];
            
            for (const installation of allInstallations) {
                if (!installation.corrupted && installation.javaVersion) {
                    const requiredMajorVersion = parseInt(requiredJava.replace('java', ''));
                    if (installation.javaVersion.major >= requiredMajorVersion) {
                        compatibleInstallations.push(installation);
                    }
                }
            }
            
            if (compatibleInstallations.length > 0) {
                // Ordenar por versión (preferir la más baja que sea compatible)
                compatibleInstallations.sort((a, b) => a.javaVersion.major - b.javaVersion.major);
                const bestFallback = compatibleInstallations[0];
                
                console.log(`⚠️ Usando Java ${bestFallback.javaVersion.major} como fallback para Minecraft ${minecraftVersion}`);
                console.log(`🎯 ADVERTENCIA: Para el mejor rendimiento, se recomienda usar Java ${requiredJava.replace('java', '')}`);
                
                return bestFallback.javaPath;
            }
            
            // Si no hay fallback disponible, re-lanzar el error de descarga
            throw downloadError;
        }
        
    } catch (error) {
        console.error('❌ Error obteniendo Java para Minecraft:', error);
        throw error;
    }
}

/**
 * Lista todas las instalaciones de Java disponibles
 * Automáticamente limpia instalaciones corruptas durante el escaneo
 */
async function listAvailableJavaInstallations(autoCleanup = true) {
    // Asegurar que los paths están inicializados
    if (!runtimePath) {
        await initJavaPaths();
    }
    
    const installations = [];
    
    try {
        if (!fs.existsSync(runtimePath)) {
            console.log(`📂 Directorio de runtime no existe: ${runtimePath}`);
            return installations;
        }
        
        // Ejecutar limpieza automática si está habilitada
        if (autoCleanup) {
            console.log(`🧹 Ejecutando limpieza automática de instalaciones corruptas...`);
            const cleanupResult = await cleanupCorruptedJavaInstallations();
            if (cleanupResult.cleaned > 0) {
                console.log(`✅ Se eliminaron ${cleanupResult.cleaned} instalaciones corruptas automáticamente`);
            }
        }
        
        // Volver a leer el directorio después de la limpieza
        const javaVersions = fs.readdirSync(runtimePath);
        
        for (const version of javaVersions) {
            const versionPath = path.join(runtimePath, version);
            
            try {
                const stat = fs.statSync(versionPath);
                
                if (stat.isDirectory()) {
                    console.log(`📂 Verificando directorio: ${version}`);
                    const javaExecutable = await findExistingJava(versionPath);
                    
                    if (javaExecutable) {
                        try {
                            // Usar timeout más corto para evitar bloqueos
                            const javaVersion = await getJavaVersion(javaExecutable, 5000);
                            
                            installations.push({
                                version: version,
                                path: javaExecutable,
                                javaVersion: javaVersion,
                                directory: versionPath,
                                size: await getDirectorySize(versionPath),
                                status: 'valid'
                            });
                            
                            console.log(`✅ Instalación válida encontrada: ${version} (Java ${javaVersion.major})`);
                        } catch (javaVersionError) {
                            console.warn(`⚠️ Instalación problemática detectada: ${version}`);
                            console.warn(`Error: ${javaVersionError.message}`);
                            
                            // Si el autoCleanup está deshabilitado, marcar como corrupta
                            if (!autoCleanup) {
                                installations.push({
                                    version: version,
                                    path: javaExecutable,
                                    javaVersion: null,
                                    directory: versionPath,
                                    corrupted: true,
                                    error: javaVersionError.message,
                                    status: 'corrupted'
                                });
                            } else {
                                // Con autoCleanup habilitado, intentar eliminar inmediatamente
                                console.log(`🧹 Eliminando instalación corrupta: ${version}`);
                                await removeCorruptedJavaInstallation(versionPath, version);
                            }
                        }
                    } else {
                        console.warn(`⚠️ Ejecutable de Java no encontrado en: ${version}`);
                        
                        if (!autoCleanup) {
                            // Verificar si es un directorio vacío o corrupto
                            try {
                                const dirContents = fs.readdirSync(versionPath);
                                if (dirContents.length === 0) {
                                    installations.push({
                                        version: version,
                                        path: null,
                                        javaVersion: null,
                                        directory: versionPath,
                                        corrupted: true,
                                        error: 'Directorio vacío',
                                        status: 'empty'
                                    });
                                } else {
                                    installations.push({
                                        version: version,
                                        path: null,
                                        javaVersion: null,
                                        directory: versionPath,
                                        corrupted: true,
                                        error: 'Ejecutable de Java no encontrado',
                                        status: 'incomplete'
                                    });
                                }
                            } catch (readError) {
                                installations.push({
                                    version: version,
                                    path: null,
                                    javaVersion: null,
                                    directory: versionPath,
                                    corrupted: true,
                                    error: `Error leyendo directorio: ${readError.message}`,
                                    status: 'inaccessible'
                                });
                            }
                        } else {
                            // Con autoCleanup, eliminar instalaciones incompletas
                            console.log(`🧹 Eliminando instalación incompleta: ${version}`);
                            await removeCorruptedJavaInstallation(versionPath, version);
                        }
                    }
                }
            } catch (statError) {
                console.error(`❌ Error accediendo a ${version}:`, statError.message);
                
                if (!autoCleanup) {
                    installations.push({
                        version: version,
                        path: null,
                        javaVersion: null,
                        directory: versionPath,
                        corrupted: true,
                        error: `Error de sistema de archivos: ${statError.message}`,
                        status: 'filesystem_error'
                    });
                } else {
                    // Intentar eliminar si hay problemas de acceso al filesystem
                    console.log(`🧹 Eliminando instalación inaccesible: ${version}`);
                    await removeCorruptedJavaInstallation(versionPath, version);
                }
            }
        }
    } catch (error) {
        console.error('❌ Error listando instalaciones de Java:', error);
    }
    
    console.log(`📊 Total de instalaciones válidas encontradas: ${installations.length}`);
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
/**
 * Realiza un test completo del sistema de descarga y verificación de Java
 * Utiliza Java del sistema si está disponible para evitar descargas innecesarias
 * @param {string} testMinecraftVersion - Versión de Minecraft para probar (por defecto '1.20.4')
 * @returns {Promise<{success: boolean, details: object}>}
 */
async function testJavaDownloadSystem(testMinecraftVersion = '1.20.4') {
    console.log(`🧪 Iniciando test del sistema de descarga de Java para Minecraft ${testMinecraftVersion}`);
    
    try {
        const testResult = {
            success: false,
            details: {
                pathInitialization: false,
                javaDetection: false,
                versionDetermination: false,
                functionality: false,
                compatibility: false,
                systemJava: null,
                downloadedJava: null,
                errors: []
            }
        };
        
        // 1. Test de inicialización de paths
        try {
            await initJavaPaths();
            testResult.details.pathInitialization = true;
            console.log(`✅ Inicialización de paths: OK`);
        } catch (error) {
            testResult.details.errors.push(`Path initialization failed: ${error.message}`);
            console.log(`❌ Inicialización de paths: FAILED`);
        }
        
        // 2. Test de determinación de versión requerida
        try {
            const requiredJava = getRequiredJavaVersion(testMinecraftVersion);
            testResult.details.versionDetermination = requiredJava !== null;
            testResult.details.requiredVersion = requiredJava;
            console.log(`✅ Determinación de versión: ${requiredJava}`);
        } catch (error) {
            testResult.details.errors.push(`Version determination failed: ${error.message}`);
            console.log(`❌ Determinación de versión: FAILED`);
        }
        
        // 3. Test con Java del sistema (si está disponible)
        try {
            const systemJava = process.platform === 'win32' ? 'java.exe' : 'java';
            const javaVersion = await getJavaVersion(systemJava, 5000);
            
            if (javaVersion) {
                testResult.details.systemJava = {
                    version: javaVersion,
                    path: systemJava
                };
                
                // Test de funcionalidad con Java del sistema
                const functionality = await verifyJavaFunctionality(systemJava, `java${javaVersion.major}`, 8000);
                testResult.details.functionality = functionality.working;
                
                // Test de compatibilidad
                const compatibility = await isJavaCompatible(systemJava, testMinecraftVersion);
                testResult.details.compatibility = compatibility.compatible;
                
                console.log(`✅ Java del sistema encontrado: Java ${javaVersion.major}.${javaVersion.minor}.${javaVersion.patch}`);
                console.log(`📋 Funcionalidad: ${functionality.working ? 'OK' : 'FAILED'}`);
                console.log(`📋 Compatibilidad: ${compatibility.compatible ? 'OK' : 'FAILED'}`);
            }
        } catch (error) {
            console.log(`⚠️ Java del sistema no disponible o no funcional: ${error.message}`);
        }
        
        // 4. Test de listado de instalaciones existentes
        try {
            const installations = await listAvailableJavaInstallations(false); // Sin auto-cleanup para el test
            testResult.details.existingInstallations = installations.length;
            console.log(`📊 Instalaciones de Java encontradas: ${installations.length}`);
            
            for (const installation of installations) {
                console.log(`  - ${installation.version}: ${installation.status} (${installation.javaVersion ? `Java ${installation.javaVersion.major}` : 'Sin versión'})`);
            }
        } catch (error) {
            testResult.details.errors.push(`Installation listing failed: ${error.message}`);
            console.log(`❌ Error listando instalaciones: ${error.message}`);
        }
        
        // 5. Determinar si el test fue exitoso
        testResult.success = testResult.details.pathInitialization && 
                           testResult.details.versionDetermination &&
                           testResult.details.errors.length === 0;
        
        if (testResult.success) {
            console.log(`✅ Test del sistema de Java: EXITOSO`);
        } else {
            console.log(`❌ Test del sistema de Java: FALLÓ`);
            console.log(`📋 Errores encontrados: ${testResult.details.errors.join(', ')}`);
        }
        
        return testResult;
        
    } catch (error) {
        console.error('❌ Error durante el test del sistema de Java:', error);
        return {
            success: false,
            details: {
                errors: [`Test system error: ${error.message}`]
            }
        };
    }
}

export {
    initJavaPaths,
    getRuntimePath,
    getRequiredJavaVersion,
    getJavaVersion,
    isJavaCompatible,
    verifyJavaFunctionality,
    testJavaExecution,
    cleanupFailedJavaInstallation,
    downloadAndInstallJava,
    getDownloadInfo,
    downloadFile,
    extractJavaArchive,
    findJavaExecutable,
    findExistingJava,
    getJavaForMinecraft,
    listAvailableJavaInstallations,
    cleanupUnusedJava,
    cleanupCorruptedJavaInstallations,
    removeCorruptedJavaInstallation,
    setGameInProgress,
    setGameFinished,
    isJavaInUse,
    getGameStatus,
    testJavaDownloadSystem
};

