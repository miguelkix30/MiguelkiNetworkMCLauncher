/**
 * Utilidades adicionales para Live Session Monitor
 * Funciones de ayuda y mejoras para el sistema de monitoreo
 */

const { ipcRenderer } = require('electron');
const os = require('os');

class LiveSessionUtils {
    
    /**
     * Obtiene información del sistema para debugging
     * @returns {Object} - Información del sistema
     */
    static getSystemInfo() {
        return {
            platform: process.platform,
            arch: process.arch,
            nodeVersion: process.version,
            electronVersion: process.versions.electron,
            chromeVersion: process.versions.chrome,
            memory: {
                total: Math.round(os.totalmem() / 1024 / 1024 / 1024 * 100) / 100, // GB
                free: Math.round(os.freemem() / 1024 / 1024 / 1024 * 100) / 100    // GB
            },
            cpu: {
                model: os.cpus()[0]?.model || 'Unknown',
                cores: os.cpus().length
            },
            hostname: os.hostname(),
            uptime: Math.round(os.uptime() / 60) // minutos
        };
    }
    
    /**
     * Genera un ID único para la sesión de monitoreo
     * @param {string} instanceName - Nombre de la instancia
     * @returns {string} - ID único de sesión
     */
    static generateSessionId(instanceName) {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substr(2, 9);
        const cleanInstanceName = instanceName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        return `${cleanInstanceName}-${timestamp}-${random}`;
    }
    
    /**
     * Valida si una URL es válida
     * @param {string} url - URL a validar
     * @returns {boolean} - true si es válida
     */
    static isValidUrl(url) {
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    }
    
    /**
     * Formatea el tamaño de datos en formato legible
     * @param {number} bytes - Tamaño en bytes
     * @returns {string} - Tamaño formateado
     */
    static formatDataSize(bytes) {
        if (bytes === 0) return '0 B';
        
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    /**
     * Formatea la duración en formato legible
     * @param {number} milliseconds - Duración en milisegundos
     * @returns {string} - Duración formateada
     */
    static formatDuration(milliseconds) {
        const seconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        
        if (hours > 0) {
            return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    }
    
    /**
     * Detecta el tipo de conexión de red
     * @returns {Promise<string>} - Tipo de conexión
     */
    static async getNetworkType() {
        try {
            if (navigator.connection) {
                return navigator.connection.effectiveType || 'unknown';
            }
            return 'unknown';
        } catch {
            return 'unknown';
        }
    }
    
    /**
     * Verifica si el puerto está disponible
     * @param {number} port - Puerto a verificar
     * @returns {Promise<boolean>} - true si está disponible
     */
    static async isPortAvailable(port) {
        return new Promise((resolve) => {
            const net = require('net');
            const server = net.createServer();
            
            server.listen(port, () => {
                server.once('close', () => resolve(true));
                server.close();
            });
            
            server.on('error', () => resolve(false));
        });
    }
    
    /**
     * Encuentra un puerto disponible en un rango
     * @param {number} min - Puerto mínimo
     * @param {number} max - Puerto máximo
     * @returns {Promise<number|null>} - Puerto disponible o null
     */
    static async findAvailablePort(min = 3000, max = 9999) {
        for (let port = min; port <= max; port++) {
            if (await this.isPortAvailable(port)) {
                return port;
            }
        }
        return null;
    }
    
    /**
     * Crea un debouncer para funciones
     * @param {Function} func - Función a debounce
     * @param {number} wait - Tiempo de espera en ms
     * @returns {Function} - Función con debounce
     */
    static debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
    
    /**
     * Crea un throttle para funciones
     * @param {Function} func - Función a throttle
     * @param {number} limit - Límite de tiempo en ms
     * @returns {Function} - Función con throttle
     */
    static throttle(func, limit) {
        let inThrottle;
        return function executedFunction(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }
    
    /**
     * Monitorea el rendimiento del sistema
     * @returns {Object} - Métricas de rendimiento
     */
    static getPerformanceMetrics() {
        const now = performance.now();
        const memory = performance.memory ? {
            used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024 * 100) / 100,
            total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024 * 100) / 100,
            limit: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024 * 100) / 100
        } : null;
        
        return {
            timestamp: now,
            memory: memory,
            timing: performance.timing ? {
                domComplete: performance.timing.domComplete - performance.timing.navigationStart,
                loadComplete: performance.timing.loadEventEnd - performance.timing.navigationStart
            } : null
        };
    }
    
    /**
     * Valida la configuración de una instancia para Live Session Monitor
     * @param {Object} instance - Configuración de la instancia
     * @returns {Object} - Resultado de validación
     */
    static validateInstanceForLSM(instance) {
        const errors = [];
        const warnings = [];
        
        if (!instance) {
            errors.push('Instancia no definida');
            return { isValid: false, errors, warnings };
        }
        
        if (!instance.name || typeof instance.name !== 'string') {
            errors.push('Nombre de instancia inválido');
        }
        
        if (instance.live_session_monitor !== true) {
            warnings.push('Live Session Monitor no está habilitado para esta instancia');
        }
        
        if (instance.maintenance === true) {
            warnings.push('La instancia está en mantenimiento');
        }
        
        if (instance.whitelistActive && (!instance.whitelist || !Array.isArray(instance.whitelist))) {
            warnings.push('Whitelist activa pero no configurada correctamente');
        }
        
        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }
    
    /**
     * Genera métricas de calidad del stream
     * @param {Object} streamData - Datos del stream
     * @returns {Object} - Métricas de calidad
     */
    static calculateStreamQuality(streamData) {
        const {
            framesSent = 0,
            framesDropped = 0,
            bytesTransferred = 0,
            duration = 0,
            clientsConnected = 0
        } = streamData;
        
        const dropRate = framesSent > 0 ? (framesDropped / framesSent) * 100 : 0;
        const avgBitrate = duration > 0 ? (bytesTransferred * 8) / (duration / 1000) : 0; // bits per second
        const avgFPS = duration > 0 ? (framesSent / (duration / 1000)) : 0;
        
        let qualityScore = 100;
        
        // Penalizar por frames perdidos
        if (dropRate > 10) qualityScore -= 20;
        else if (dropRate > 5) qualityScore -= 10;
        else if (dropRate > 1) qualityScore -= 5;
        
        // Penalizar por FPS bajo
        if (avgFPS < 15) qualityScore -= 20;
        else if (avgFPS < 24) qualityScore -= 10;
        
        // Bonificar por múltiples clientes
        if (clientsConnected > 1) qualityScore += 5;
        
        qualityScore = Math.max(0, Math.min(100, qualityScore));
        
        return {
            dropRate: Math.round(dropRate * 100) / 100,
            avgBitrate: Math.round(avgBitrate),
            avgFPS: Math.round(avgFPS * 100) / 100,
            qualityScore: Math.round(qualityScore),
            rating: qualityScore >= 80 ? 'Excelente' : 
                   qualityScore >= 60 ? 'Buena' : 
                   qualityScore >= 40 ? 'Regular' : 'Pobre'
        };
    }
    
    /**
     * Logs estructurados para el sistema
     * @param {string} level - Nivel del log
     * @param {string} message - Mensaje
     * @param {Object} data - Datos adicionales
     */
    static log(level, message, data = {}) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level: level.toUpperCase(),
            component: 'LiveSessionMonitor',
            message,
            ...data
        };
        
        // Console logging con colores
        const colors = {
            ERROR: '\x1b[31m',   // Rojo
            WARN: '\x1b[33m',    // Amarillo
            INFO: '\x1b[36m',    // Cian
            DEBUG: '\x1b[35m',   // Magenta
            RESET: '\x1b[0m'     // Reset
        };
        
        const color = colors[level.toUpperCase()] || colors.INFO;
        console.log(`${color}[LSM] ${message}${colors.RESET}`, data);
        
        // Enviar a archivo de log si está configurado
        try {
            ipcRenderer.send('log-message', {
                level: level.toLowerCase(),
                args: [message, data],
                timestamp: new Date(),
                identifier: 'LiveSessionMonitor'
            });
        } catch (error) {
            console.warn('Error enviando log a archivo:', error);
        }
    }
    
    /**
     * Sanitiza el nombre de instancia para uso en URLs
     * @param {string} instanceName - Nombre original
     * @returns {string} - Nombre sanitizado
     */
    static sanitizeInstanceName(instanceName) {
        return instanceName
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '')
            .substring(0, 20); // Limitar longitud
    }
    
    /**
     * Crea un retry automático para funciones async
     * @param {Function} fn - Función a ejecutar
     * @param {number} maxRetries - Número máximo de reintentos
     * @param {number} delay - Delay entre reintentos
     * @returns {Promise} - Resultado de la función
     */
    static async retry(fn, maxRetries = 3, delay = 1000) {
        let lastError;
        
        for (let i = 0; i <= maxRetries; i++) {
            try {
                return await fn();
            } catch (error) {
                lastError = error;
                
                if (i === maxRetries) {
                    throw lastError;
                }
                
                this.log('warn', `Intento ${i + 1} falló, reintentando en ${delay}ms`, {
                    error: error.message,
                    attempt: i + 1,
                    maxRetries
                });
                
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 2; // Exponential backoff
            }
        }
        
        throw lastError;
    }
}

// Exportar con ES modules
export default LiveSessionUtils;
