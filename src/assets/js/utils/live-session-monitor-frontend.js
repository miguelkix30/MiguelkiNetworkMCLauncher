/**
 * @author Miguel
 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0
 * 
 * Live Session Monitor - Frontend
 * Interfaz frontend que se comunica con el main process via IPC
 */

/**
 * Función helper para obtener ipcRenderer de manera compatible
 */
function getIpcRenderer() {
    try {
        // Verificar si estamos en un entorno Node.js con Electron
        if (typeof process !== 'undefined' && process.versions && process.versions.electron) {
            // Primer intento: require directo (funciona en contexto de Node.js)
            const { ipcRenderer } = require('electron');
            return ipcRenderer;
        }
        
        // Segundo intento: desde window global con require
        if (typeof window !== 'undefined' && window.require) {
            const { ipcRenderer } = window.require('electron');
            return ipcRenderer;
        }
        
        // Tercer intento: desde preload script
        if (typeof window !== 'undefined' && window.ipcRenderer) {
            return window.ipcRenderer;
        }
        
        // Cuarto intento: desde electron global
        if (typeof window !== 'undefined' && window.electron && window.electron.ipcRenderer) {
            return window.electron.ipcRenderer;
        }
        
    } catch (error) {
        console.warn('[LSM Frontend] Error accediendo a ipcRenderer:', error.message);
    }
    
    console.error('[LSM Frontend] No se pudo obtener ipcRenderer. Asegúrate de que el código se ejecute en un contexto de Electron.');
    return null;
}

/**
 * Clase para gestionar Live Session Monitor desde el frontend
 */
class LiveSessionMonitorFrontend {
    constructor() {
        this.ipcRenderer = null;
        this.isInitialized = false;
        this.currentStatus = null;
        this.initializationRetries = 0;
        this.maxRetries = 3;
        
        // Intentar inicializar inmediatamente
        this.initialize();
        
        console.log('[LSM Frontend] LiveSessionMonitorFrontend creado');
    }
    
    /**
     * Inicializa la conexión IPC con reintentos
     */
    async initialize() {
        try {
            this.ipcRenderer = getIpcRenderer();
            
            if (this.ipcRenderer) {
                this.initializeIPC();
                console.log('[LSM Frontend] Inicialización exitosa');
            } else if (this.initializationRetries < this.maxRetries) {
                this.initializationRetries++;
                console.warn(`[LSM Frontend] Reintentando inicialización (${this.initializationRetries}/${this.maxRetries})`);
                
                // Esperar un poco antes de reintentar
                setTimeout(() => this.initialize(), 1000);
            } else {
                console.error('[LSM Frontend] No se pudo inicializar después de múltiples intentos');
            }
        } catch (error) {
            console.error('[LSM Frontend] Error durante inicialización:', error);
        }
    }

    /**
     * Inicializa los listeners IPC
     */
    initializeIPC() {
        if (!this.ipcRenderer) {
            console.warn('[LSM Frontend] No se puede inicializar IPC - ipcRenderer no disponible');
            return;
        }

        try {
            // Escuchar actualizaciones de estado del main process
            this.ipcRenderer.on('live-session-monitor-status-update', (event, status) => {
                this.currentStatus = status;
                this.onStatusUpdate(status);
            });

            // Escuchar notificaciones del main process
            this.ipcRenderer.on('live-session-monitor-notification', (event, notification) => {
                this.onNotification(notification);
            });

            this.isInitialized = true;
            console.log('[LSM Frontend] IPC listeners configurados correctamente');
            
        } catch (error) {
            console.error('[LSM Frontend] Error configurando listeners IPC:', error);
        }
    }

    /**
     * Verifica si una instancia tiene live session monitor habilitado
     * @param {Object} instance - Configuración de la instancia
     * @returns {boolean}
     */
    static isLiveSessionEnabled(instance) {
        return instance && instance.live_session_monitor === true;
    }

    /**
     * Inicia el monitoreo de una sesión
     * @param {string} instanceName - Nombre de la instancia
     * @returns {Promise<string>} - URL pública del stream
     */
    async startMonitoring(instanceName) {
        console.log(`[LSM Frontend] Intentando iniciar monitoreo para: ${instanceName}`);
        
        // Asegurar que IPC esté disponible
        await this.ensureIPCAvailable();

        try {
            console.log(`[LSM Frontend] Solicitando inicio de monitoreo para: ${instanceName}`);
            
            // Verificar que el main process esté listo para recibir este mensaje
            let isReady = false;
            try {
                isReady = await this.ipcRenderer.invoke('live-session-monitor-ready-check');
            } catch (readyError) {
                console.warn('[LSM Frontend] No se pudo verificar ready state:', readyError.message);
            }
            
            if (!isReady) {
                console.warn('[LSM Frontend] Main process no está listo, continuando de todas formas...');
            }
            
            const result = await this.ipcRenderer.invoke('live-session-monitor-start', instanceName);
            
            if (result && result.success) {
                console.log(`[LSM Frontend] Monitoreo iniciado exitosamente: ${result.publicUrl}`);
                return result.publicUrl;
            } else {
                const errorMsg = result?.error || 'Error desconocido iniciando monitoreo';
                throw new Error(errorMsg);
            }
            
        } catch (error) {
            console.error('[LSM Frontend] Error iniciando monitoreo:', error);
            
            // Proporcionar información más específica del error
            if (error.message.includes('invoke')) {
                throw new Error('Error de comunicación IPC. El main process puede no estar respondiendo.');
            } else if (error.message.includes('ready')) {
                throw new Error('El sistema Live Session Monitor no está listo en el main process.');
            } else {
                throw error;
            }
        }
    }
    
    /**
     * Asegura que IPC esté disponible con reintentos
     */
    async ensureIPCAvailable() {
        let retries = 0;
        const maxRetries = 5;
        
        while (!this.ipcRenderer && retries < maxRetries) {
            console.log(`[LSM Frontend] Reintentando obtener IPC (${retries + 1}/${maxRetries})`);
            
            await new Promise(resolve => setTimeout(resolve, 500));
            this.ipcRenderer = getIpcRenderer();
            
            if (this.ipcRenderer) {
                this.initializeIPC();
                break;
            }
            
            retries++;
        }
        
        if (!this.ipcRenderer) {
            throw new Error(`IPC no está disponible después de ${maxRetries} intentos. Verifica que el launcher esté ejecutándose correctamente con Electron.`);
        }
    }

    /**
     * Detiene el monitoreo actual
     * @returns {Promise<boolean>} - True si se detuvo exitosamente
     */
    async stopMonitoring() {
        if (!this.ipcRenderer) {
            throw new Error('IPC no está disponible');
        }

        try {
            console.log('[LSM Frontend] Solicitando detener monitoreo');
            
            const result = await this.ipcRenderer.invoke('live-session-monitor-stop');
            
            if (result.success) {
                console.log('[LSM Frontend] Monitoreo detenido exitosamente');
                return true;
            } else {
                throw new Error(result.error || 'Error desconocido deteniendo monitoreo');
            }
            
        } catch (error) {
            console.error('[LSM Frontend] Error deteniendo monitoreo:', error);
            throw error;
        }
    }

    /**
     * Obtiene el estado actual del monitoreo
     * @returns {Promise<Object>} - Estado actual
     */
    async getStatus() {
        if (!this.ipcRenderer) {
            return { isMonitoring: false, error: 'IPC no disponible' };
        }

        try {
            const status = await this.ipcRenderer.invoke('live-session-monitor-status');
            this.currentStatus = status;
            return status;
            
        } catch (error) {
            console.error('[LSM Frontend] Error obteniendo estado:', error);
            return { isMonitoring: false, error: error.message };
        }
    }

    /**
     * Abre la URL del stream en el navegador
     * @param {string} url - URL del stream
     */
    openStreamInBrowser(url) {
        if (!url) return;
        
        try {
            if (this.ipcRenderer) {
                // Usar IPC para abrir en el navegador del sistema
                this.ipcRenderer.send('open-external-url', url);
            } else {
                // Fallback para desarrollo
                window.open(url, '_blank');
            }
            
        } catch (error) {
            console.error('[LSM Frontend] Error abriendo stream en navegador:', error);
        }
    }

    /**
     * Callback para actualizaciones de estado
     * @param {Object} status - Nuevo estado
     */
    onStatusUpdate(status) {
        console.log('[LSM Frontend] Estado actualizado:', status);
        
        // Emitir evento personalizado para que otras partes del código puedan escuchar
        const event = new CustomEvent('liveSessionMonitorStatusUpdate', {
            detail: status
        });
        document.dispatchEvent(event);
    }

    /**
     * Callback para notificaciones
     * @param {Object} notification - Notificación recibida
     */
    onNotification(notification) {
        console.log('[LSM Frontend] Notificación recibida:', notification);
        
        // Emitir evento personalizado
        const event = new CustomEvent('liveSessionMonitorNotification', {
            detail: notification
        });
        document.dispatchEvent(event);
    }

    /**
     * Muestra el estado del monitoreo en la UI
     * @param {Object} status - Estado a mostrar
     */
    displayStatus(status) {
        if (!status) return;

        const statusText = status.isMonitoring 
            ? `🟢 Activo - Instancia: ${status.instanceName}` 
            : '🔴 Inactivo';
            
        console.log(`[LSM Frontend] Estado: ${statusText}`);
        
        if (status.publicUrl) {
            console.log(`[LSM Frontend] URL pública: ${status.publicUrl}`);
        }
        
        if (status.clientsConnected !== undefined) {
            console.log(`[LSM Frontend] Clientes conectados: ${status.clientsConnected}`);
        }
    }

    /**
     * Muestra notificación visual al usuario
     * @param {string} message - Mensaje a mostrar
     * @param {string} type - Tipo de notificación ('success', 'error', 'info')
     */
    showNotification(message, type = 'info') {
        console.log(`[LSM Frontend] ${type.toUpperCase()}: ${message}`);
        
        // Aquí podrías integrar con el sistema de notificaciones de tu launcher
        // Por ejemplo, usando el sistema de alertas existente
        
        // Emitir evento para que el sistema de UI principal lo maneje
        const event = new CustomEvent('showUserNotification', {
            detail: { message, type, source: 'liveSessionMonitor' }
        });
        document.dispatchEvent(event);
    }

    /**
     * Formatea la duración en formato legible
     * @param {number} duration - Duración en milisegundos
     * @returns {string} - Duración formateada
     */
    formatDuration(duration) {
        if (!duration) return '0s';
        
        const seconds = Math.floor(duration / 1000);
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
     * Obtiene métricas de rendimiento formateadas
     * @returns {Promise<Object>} - Métricas formateadas
     */
    async getFormattedMetrics() {
        const status = await this.getStatus();
        
        if (!status.metrics) {
            return null;
        }
        
        return {
            duration: this.formatDuration(status.duration),
            framesSent: status.metrics.framesSent.toLocaleString(),
            clientsConnected: status.clientsConnected,
            bytesTransferred: this.formatBytes(status.metrics.bytesTransferred),
            errors: status.metrics.errors
        };
    }

    /**
     * Formatea bytes en formato legible
     * @param {number} bytes - Cantidad de bytes
     * @returns {string} - Bytes formateados
     */
    formatBytes(bytes) {
        if (!bytes) return '0 B';
        
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

// Crear instancia global
const liveSessionMonitor = new LiveSessionMonitorFrontend();

// Funciones de conveniencia para compatibilidad con la API anterior
function startLiveSessionMonitorIfEnabled(instance) {
    if (!LiveSessionMonitorFrontend.isLiveSessionEnabled(instance)) {
        return Promise.resolve(null);
    }
    return liveSessionMonitor.startMonitoring(instance.name);
}

function stopLiveSessionMonitor() {
    return liveSessionMonitor.stopMonitoring();
}

function getLiveSessionMonitorStatus() {
    return liveSessionMonitor.getStatus();
}

// Exportaciones compatibles con ES6 modules y CommonJS
if (typeof module !== 'undefined' && module.exports) {
    // CommonJS (Node.js)
    module.exports = {
        LiveSessionMonitorFrontend,
        liveSessionMonitor,
        startLiveSessionMonitorIfEnabled,
        stopLiveSessionMonitor,
        getLiveSessionMonitorStatus
    };
}

// Browser/Electron renderer - hacer disponible globalmente
if (typeof window !== 'undefined') {
    window.LiveSessionMonitorFrontend = LiveSessionMonitorFrontend;
    window.liveSessionMonitor = liveSessionMonitor;
    window.startLiveSessionMonitorIfEnabled = startLiveSessionMonitorIfEnabled;
    window.stopLiveSessionMonitor = stopLiveSessionMonitor;
    window.getLiveSessionMonitorStatus = getLiveSessionMonitorStatus;
}

// Para uso directo en scripts
if (typeof global !== 'undefined') {
    global.LiveSessionMonitorFrontend = LiveSessionMonitorFrontend;
    global.liveSessionMonitor = liveSessionMonitor;
    global.startLiveSessionMonitorIfEnabled = startLiveSessionMonitorIfEnabled;
    global.stopLiveSessionMonitor = stopLiveSessionMonitor;
    global.getLiveSessionMonitorStatus = getLiveSessionMonitorStatus;
}

// Exportaciones ES6 para modules
export {
    LiveSessionMonitorFrontend,
    liveSessionMonitor,
    startLiveSessionMonitorIfEnabled,
    stopLiveSessionMonitor,
    getLiveSessionMonitorStatus
};
