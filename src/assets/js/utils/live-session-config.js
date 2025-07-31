/**
 * Configuraciones avanzadas para Live Session Monitor
 * Este archivo permite personalizar el comportamiento del monitoreo
 */

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
        provider: 'localtunnel',    // Proveedor de túnel
        subdomain: {
            prefix: 'lsm',          // Prefijo para subdomain
            includeTimestamp: true,  // Incluir timestamp en subdomain
            includeInstance: false   // Incluir nombre de instancia
        },
        retryAttempts: 3,           // Intentos de creación de túnel
        retryDelay: 5000,           // Delay entre intentos (ms)
        maxTunnelAge: 3600000      // Edad máxima del túnel (1 hora)
    },
    
    // Configuración de detección de ventanas
    windowDetection: {
        searchTerms: [              // Términos de búsqueda para ventanas
            'minecraft',
            'java',
            'javaw',
            'mc'
        ],
        caseSensitive: false,       // Búsqueda sensible a mayúsculas
        exactMatch: false,          // Requiere coincidencia exacta
        pollInterval: 1000,         // Intervalo de búsqueda (ms)
        prioritizeMinecraft: true   // Priorizar ventanas con "minecraft"
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
    
    // Configuración de logging
    logging: {
        enableConsoleLogging: true,     // Logging en consola
        enableFileLogging: false,       // Logging en archivo (no implementado)
        logLevel: 'info',               // Nivel de log (debug/info/warn/error)
        logTimestamps: true,            // Incluir timestamps en logs
        logToServer: false              // Enviar logs al servidor (no implementado)
    },
    
    // Configuración específica por instancia
    instanceOverrides: {
        // Ejemplo de configuración específica para instancia
        'PvP Competitivo': {
            capture: {
                frameRate: 60,          // FPS más alto para PvP
                quality: 0.9            // Calidad más alta
            },
            notifications: {
                includeSystemInfo: true  // Incluir info del sistema para competencias
            }
        },
        'Survival Monitoreado': {
            capture: {
                frameRate: 24,          // FPS más bajo para survival
                quality: 0.6            // Calidad media
            }
        }
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
    },
    
    // Configuración de desarrollo/debug
    development: {
        enableDebugMode: false,         // Modo debug
        simulateGameWindow: false,      // Simular ventana de juego
        skipConsentDialog: false,       // Saltar diálogo de consentimiento
        useLocalTunnel: true,           // Usar túnel local vs externo
        mockStreamData: false           // Usar datos de stream simulados
    }
};

// Función para obtener configuración específica de instancia
function getInstanceConfig(instanceName) {
    const baseConfig = { ...LiveSessionConfig };
    const instanceOverride = LiveSessionConfig.instanceOverrides[instanceName];
    
    if (instanceOverride) {
        // Hacer merge profundo de configuraciones
        return mergeDeep(baseConfig, instanceOverride);
    }
    
    return baseConfig;
}

// Función helper para merge profundo de objetos
function mergeDeep(target, source) {
    const result = { ...target };
    
    for (const key in source) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
            result[key] = mergeDeep(target[key] || {}, source[key]);
        } else {
            result[key] = source[key];
        }
    }
    
    return result;
}

// Función para validar configuración
function validateConfig(config) {
    const errors = [];
    
    // Validar frameRate
    if (config.capture.frameRate < 1 || config.capture.frameRate > 60) {
        errors.push('frameRate debe estar entre 1 y 60');
    }
    
    // Validar quality
    if (config.capture.quality < 0.1 || config.capture.quality > 1.0) {
        errors.push('quality debe estar entre 0.1 y 1.0');
    }
    
    // Validar dimensiones
    if (config.capture.minWidth > config.capture.maxWidth) {
        errors.push('minWidth no puede ser mayor que maxWidth');
    }
    
    if (config.capture.minHeight > config.capture.maxHeight) {
        errors.push('minHeight no puede ser mayor que maxHeight');
    }
    
    // Validar puertos
    if (config.server.portRange.min > config.server.portRange.max) {
        errors.push('Rango de puertos inválido');
    }
    
    return {
        isValid: errors.length === 0,
        errors: errors
    };
}

// Exportar con ES modules
export {
    LiveSessionConfig,
    getInstanceConfig,
    validateConfig
    mergeDeep
};
