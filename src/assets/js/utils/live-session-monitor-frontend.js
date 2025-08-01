/**
 * @author Miguel
 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0
 * 
 * Live Session Monitor - Frontend & Utilities
 * Sistema completo de monitoreo en tiempo real con configuración incorporada
 */

// ============================
// CONFIGURACIÓN INCORPORADA
// ============================
const LiveSessionConfig = {
    // Configuración de captura de video
    capture: {
        frameRate: 30,              // FPS para la captura (10-60)
        quality: 0.7,               // Calidad JPEG (0.1-1.0)
        maxWidth: 1920,             // Ancho máximo de captura
        maxHeight: 1080,            // Alto máximo de captura
        minWidth: 640,              // Ancho mínimo de captura
        minHeight: 480,             // Alto mínimo de captura
        timeout: 5000,              // Timeout para encontrar ventana (ms)
        retryAttempts: 3,           // Intentos de reconexión
        retryDelay: 2000            // Delay entre intentos (ms)
    },
    
    // Configuración del servidor
    server: {
        host: 'localhost',          // Host del servidor local
        portRange: {                // Rango de puertos disponibles
            min: 3000,
            max: 9999
        },
        maxClients: 10,             // Máximo de clientes conectados
        heartbeatInterval: 30000,   // Interval de heartbeat (ms)
        connectionTimeout: 10000    // Timeout de conexión (ms)
    },
    
    // Configuración del túnel público
    tunnel: {
        provider: 'pinggy',         // Proveedor de túnel
        subdomain: {
            prefix: 'lsm',          // Prefijo para subdomain
            includeTimestamp: true,  // Incluir timestamp en subdomain
            includeInstance: false   // Incluir nombre de instancia
        },
        retryAttempts: 3,           // Intentos de creación de túnel
        retryDelay: 5000,           // Delay entre intentos (ms)
        maxTunnelAge: 3600000      // Edad máxima del túnel (1 hora)
    },
    
    // Configuración de notificaciones
    notifications: {
        showUserNotifications: true,    // Mostrar notificaciones al usuario
        showAdminNotifications: true,   // Enviar notificaciones a admins
        webhookEnabled: true,           // Usar webhooks para notificar
        includeStreamUrl: true,         // Incluir URL en notificaciones
        includeSystemInfo: false        // Incluir info del sistema
    },
    
    // Configuración de seguridad
    security: {
        requireConsent: true,           // Requerir consentimiento del usuario
        allowScreenshotCapture: true,   // Permitir capturas de pantalla
        allowVideoRecording: false,     // Permitir grabación (no implementado)
        allowAudioCapture: false,       // Permitir captura de audio
        encryptStream: false,           // Encriptar stream (no implementado)
        accessTokenRequired: false      // Requerir token de acceso
    },
    
    // Configuración de la interfaz web
    webInterface: {
        theme: 'dark',                  // Tema de la interfaz (dark/light)
        showFPS: true,                  // Mostrar contador de FPS
        showTimestamp: true,            // Mostrar timestamp
        showInstanceInfo: true,         // Mostrar info de instancia
        allowFullscreen: true,          // Permitir pantalla completa
        showControls: false,            // Mostrar controles (no implementado)
        autoReconnect: true,            // Reconexión automática
        reconnectDelay: 3000            // Delay de reconexión (ms)
    },
    
    // Mensajes personalizables
    messages: {
        consentDialog: {
            title: 'Live Session Monitor',
            subtitle: '⚠️ Transmisión de Contenido Requerida',
            description: 'Esta instancia requiere la activación del Live Session Monitor.',
            acceptText: 'Aceptar y Continuar',
            cancelText: 'Cancelar',
            showPrivacyInfo: true,
            showSecurityInfo: true
        },
        notifications: {
            monitoringStarted: '🔴 Live Session Monitor Activo',
            monitoringStopped: '⚪ Live Session Monitor Detenido',
            errorOccurred: '❌ Error en Live Session Monitor'
        }
    }
};

// ============================
// UTILIDADES INCORPORADAS
// ============================
class LiveSessionUtils {
    /**
     * Obtiene información del sistema para debugging
     */
    static getSystemInfo() {
        try {
            const os = require('os');
            return {
                platform: process.platform,
                arch: process.arch,
                nodeVersion: process.version,
                electronVersion: process.versions?.electron,
                chromeVersion: process.versions?.chrome,
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
        } catch (error) {
            return {
                platform: 'unknown',
                arch: 'unknown',
                error: error.message
            };
        }
    }
    
    /**
     * Genera un ID único para la sesión de monitoreo
     */
    static generateSessionId(instanceName) {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substr(2, 9);
        const cleanInstanceName = instanceName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        return `${cleanInstanceName}-${timestamp}-${random}`;
    }
    
    /**
     * Formatea el tamaño de datos en formato legible
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
     * Valida la configuración de una instancia para Live Session Monitor
     */
    static validateInstanceForLSM(instance) {
        const errors = [];
        const warnings = [];
        
        if (!instance) {
            errors.push('La instancia no puede ser null o undefined');
            return { isValid: false, errors, warnings };
        }
        
        if (!instance.name || typeof instance.name !== 'string') {
            errors.push('La instancia debe tener un nombre válido');
        }
        
        if (instance.live_session_monitor !== true) {
            errors.push('La instancia no tiene live_session_monitor habilitado');
        }
        
        if (instance.maintenance === true) {
            warnings.push('La instancia está en modo mantenimiento');
        }
        
        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }
    
    /**
     * Logs estructurados para el sistema
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
            ERROR: '\x1b[31m',
            WARN: '\x1b[33m',
            INFO: '\x1b[36m',
            DEBUG: '\x1b[35m',
            RESET: '\x1b[0m'
        };
        
        const color = colors[level.toUpperCase()] || colors.INFO;
        console.log(`${color}[LSM] ${message}${colors.RESET}`, data);
    }
}

/**
 * Función para obtener configuración específica de instancia
 */
function getInstanceConfig(instanceName) {
    // Por ahora retornamos la configuración base
    // En el futuro se pueden agregar overrides específicos por instancia
    return { ...LiveSessionConfig };
}

/**
 * Función para validar configuración
 */
function validateConfig(config) {
    const errors = [];
    
    // Validar frameRate
    if (config.capture?.frameRate < 1 || config.capture?.frameRate > 60) {
        errors.push('frameRate debe estar entre 1 y 60');
    }
    
    // Validar quality
    if (config.capture?.quality < 0.1 || config.capture?.quality > 1.0) {
        errors.push('quality debe estar entre 0.1 y 1.0');
    }
    
    return {
        isValid: errors.length === 0,
        errors: errors
    };
}

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
     * Muestra un diálogo de consentimiento antes de iniciar el monitoreo
     * @param {string} instanceName - Nombre de la instancia
     * @returns {Promise<boolean>} - true si acepta, false si rechaza
     */
    async showConsentDialog(instanceName) {
        return new Promise((resolve) => {
            // Crear elementos del modal
            const modalOverlay = document.createElement('div');
            modalOverlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.8);
                z-index: 10000;
                display: flex;
                align-items: center;
                justify-content: center;
                font-family: 'Poppins', Arial, sans-serif;
            `;

            const modal = document.createElement('div');
            modal.style.cssText = `
                background: #2a2a2a;
                border: 2px solid #4a4a4a;
                border-radius: 15px;
                padding: 30px;
                max-width: 600px;
                max-height: 80vh;
                overflow-y: auto;
                color: white;
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
            `;

            modal.innerHTML = `
                <div style="text-align: center; margin-bottom: 25px;">
                    <h2 style="color: #ff6b6b; margin: 0 0 10px 0; font-size: 24px;">⚠️ Live Session Monitor</h2>
                    <h3 style="color: #ffd93d; margin: 0; font-size: 18px;">Consentimiento Requerido</h3>
                </div>
                
                <div style="background: #1a1a1a; padding: 20px; border-radius: 10px; margin: 20px 0; border-left: 4px solid #ff6b6b;">
                    <p style="margin: 0 0 15px 0; font-size: 16px; font-weight: bold;">
                        La instancia "${instanceName}" requiere activar el Live Session Monitor.
                    </p>
                </div>

                <div style="background: #3a1a1a; padding: 20px; border-radius: 10px; margin: 20px 0;">
                    <h4 style="color: #ff6b6b; margin: 0 0 15px 0;">🔴 INFORMACIÓN IMPORTANTE:</h4>
                    <ul style="margin: 0; padding-left: 20px; line-height: 1.6;">
                        <li>Su sesión de juego será transmitida en tiempo real</li>
                        <li>Solo se captura la ventana del juego (no audio)</li>
                        <li>La transmisión es temporal y no se almacena</li>
                        <li>Los administradores pueden acceder al stream para:
                            <ul style="margin-top: 5px;">
                                <li>Soporte técnico</li>
                                <li>Moderación</li>
                                <li>Supervisión de seguridad</li>
                            </ul>
                        </li>
                    </ul>
                </div>

                <div style="background: #1a3a1a; padding: 20px; border-radius: 10px; margin: 20px 0;">
                    <h4 style="color: #6bff6b; margin: 0 0 15px 0;">🛡️ PRIVACIDAD Y SEGURIDAD:</h4>
                    <ul style="margin: 0; padding-left: 20px; line-height: 1.6;">
                        <li>Solo se captura la ventana de Minecraft</li>
                        <li>No se graba audio ni contenido fuera del juego</li>
                        <li>La URL de transmisión es temporal y única</li>
                        <li>El monitoreo se detiene al cerrar el juego</li>
                        <li>No se almacenan grabaciones permanentes</li>
                    </ul>
                </div>

                <div style="background: #3a3a1a; padding: 15px; border-radius: 10px; margin: 20px 0; text-align: center;">
                    <p style="margin: 0; font-weight: bold; color: #ffd93d;">
                        ⚠️ Al continuar acepta que su sesión de juego sea monitoreada según estas condiciones.
                    </p>
                </div>

                <div style="display: flex; gap: 15px; justify-content: center; margin-top: 30px;">
                    <button id="lsm-accept-btn" style="
                        background: #4CAF50;
                        color: white;
                        border: none;
                        padding: 12px 25px;
                        border-radius: 8px;
                        font-size: 16px;
                        font-weight: bold;
                        cursor: pointer;
                        transition: background 0.3s;
                    ">✅ Acepto y Continuar</button>
                    
                    <button id="lsm-cancel-btn" style="
                        background: #f44336;
                        color: white;
                        border: none;
                        padding: 12px 25px;
                        border-radius: 8px;
                        font-size: 16px;
                        font-weight: bold;
                        cursor: pointer;
                        transition: background 0.3s;
                    ">❌ Cancelar</button>
                </div>
            `;

            modalOverlay.appendChild(modal);
            document.body.appendChild(modalOverlay);

            // Agregar eventos a los botones
            const acceptBtn = modal.querySelector('#lsm-accept-btn');
            const cancelBtn = modal.querySelector('#lsm-cancel-btn');

            acceptBtn.addEventListener('mouseenter', () => {
                acceptBtn.style.background = '#45a049';
            });
            acceptBtn.addEventListener('mouseleave', () => {
                acceptBtn.style.background = '#4CAF50';
            });

            cancelBtn.addEventListener('mouseenter', () => {
                cancelBtn.style.background = '#da190b';
            });
            cancelBtn.addEventListener('mouseleave', () => {
                cancelBtn.style.background = '#f44336';
            });

            acceptBtn.addEventListener('click', () => {
                document.body.removeChild(modalOverlay);
                resolve(true);
            });

            cancelBtn.addEventListener('click', () => {
                document.body.removeChild(modalOverlay);
                resolve(false);
            });

            // Cerrar con Escape
            const handleKeyPress = (e) => {
                if (e.key === 'Escape') {
                    document.body.removeChild(modalOverlay);
                    document.removeEventListener('keydown', handleKeyPress);
                    resolve(false);
                }
            };
            document.addEventListener('keydown', handleKeyPress);
        });
    }

    /**
     * Inicia el monitoreo de una sesión
     * @param {string} instanceName - Nombre de la instancia
     * @returns {Promise<string>} - URL pública del stream
     */
    async startMonitoring(instanceName) {
        console.log(`[LSM Frontend] Intentando iniciar monitoreo para: ${instanceName}`);
        
        // Mostrar diálogo de consentimiento primero
        const userAccepted = await this.showConsentDialog(instanceName);
        
        if (!userAccepted) {
            console.log('[LSM Frontend] Usuario rechazó el consentimiento');
            this.showNotification(
                '⚠️ Monitoreo cancelado: Es necesario aceptar el consentimiento para jugar esta instancia',
                'warning'
            );
            throw new Error('Usuario no aceptó el monitoreo requerido');
        }
        
        console.log('[LSM Frontend] Usuario aceptó el consentimiento, continuando...');
        
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
                
                // Mostrar notificación de éxito
                this.showNotification(
                    `🔴 Live Session Monitor activo para ${instanceName}`, 
                    'success'
                );
                
                return result.publicUrl;
            } else {
                const errorMsg = result?.error || 'Error desconocido iniciando monitoreo';
                throw new Error(errorMsg);
            }
            
        } catch (error) {
            console.error('[LSM Frontend] Error iniciando monitoreo:', error);
            
            // Mostrar notificación de error específica
            if (error.message.includes('no aceptó el monitoreo')) {
                this.showNotification(
                    '⚠️ Monitoreo cancelado: Es necesario aceptar el consentimiento para jugar esta instancia',
                    'warning'
                );
            } else if (error.message.includes('invoke')) {
                this.showNotification(
                    '❌ Error de comunicación con el sistema de monitoreo',
                    'error'
                );
                throw new Error('Error de comunicación IPC. El main process puede no estar respondiendo.');
            } else if (error.message.includes('ready')) {
                this.showNotification(
                    '❌ Sistema de monitoreo no disponible',
                    'error'
                );
                throw new Error('El sistema Live Session Monitor no está listo en el main process.');
            } else {
                this.showNotification(
                    `❌ Error iniciando Live Session Monitor: ${error.message}`,
                    'error'
                );
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

async function requestConsentOnly(instanceName) {
    return liveSessionMonitor.showConsentDialog(instanceName);
}

async function startMonitoringOnly(instanceName) {
    // Inicia el monitoreo sin mostrar el diálogo de consentimiento
    // (asumiendo que ya se pidió anteriormente)
    console.log(`[LSM Frontend] Iniciando monitoreo para: ${instanceName} (consentimiento ya obtenido)`);
    
    // Asegurar que IPC esté disponible
    await liveSessionMonitor.ensureIPCAvailable();

    try {
        const result = await liveSessionMonitor.ipcRenderer.invoke('live-session-monitor-start', instanceName);
        
        if (result && result.success) {
            console.log(`[LSM Frontend] Monitoreo iniciado exitosamente: ${result.publicUrl}`);
            
            // Mostrar notificación de éxito
            liveSessionMonitor.showNotification(
                `🟢 Live Session Monitor activo para ${instanceName}`,
                'success'
            );
            
            // Emitir evento de estado actualizado
            liveSessionMonitor.onStatusUpdate({
                isMonitoring: true,
                instanceName: instanceName,
                publicUrl: result.publicUrl,
                sessionId: result.sessionId,
                startTime: Date.now()
            });
            
            return result.publicUrl;
        } else {
            throw new Error(result.error || 'Error desconocido al iniciar el monitoreo');
        }
        
    } catch (error) {
        console.error(`[LSM Frontend] Error iniciando monitoreo: ${error.message}`);
        liveSessionMonitor.showNotification(
            `❌ Error iniciando Live Session Monitor: ${error.message}`,
            'error'
        );
        throw error;
    }
}

// ============================
// EXPORTACIONES
// ============================

// Browser/Electron renderer - hacer disponible globalmente
if (typeof window !== 'undefined') {
    window.LiveSessionMonitorFrontend = LiveSessionMonitorFrontend;
    window.LiveSessionConfig = LiveSessionConfig;
    window.LiveSessionUtils = LiveSessionUtils;
    window.liveSessionMonitor = liveSessionMonitor;
    window.startLiveSessionMonitorIfEnabled = startLiveSessionMonitorIfEnabled;
    window.stopLiveSessionMonitor = stopLiveSessionMonitor;
    window.getLiveSessionMonitorStatus = getLiveSessionMonitorStatus;
    window.requestConsentOnly = requestConsentOnly;
    window.startMonitoringOnly = startMonitoringOnly;
}

// Exportaciones ES6 para módulos
export {
    LiveSessionMonitorFrontend,
    LiveSessionConfig,
    LiveSessionUtils,
    getInstanceConfig,
    validateConfig,
    liveSessionMonitor,
    startLiveSessionMonitorIfEnabled,
    stopLiveSessionMonitor,
    getLiveSessionMonitorStatus,
    requestConsentOnly,
    startMonitoringOnly
};


