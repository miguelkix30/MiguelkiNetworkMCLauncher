# Guía de Uso - Live Session Monitor

## 🚀 Inicio Rápido

### 1. Configurar una Instancia con Monitoreo

Para habilitar Live Session Monitor en una instancia, simplemente agregar `live_session_monitor: true` en la configuración:

```json
{
    "name": "Survival Monitoreado",
    "minecraft_version": "1.20.1",
    "loadder": {
        "loadder_type": "forge",
        "loadder_version": "latest",
        "minecraft_version": "1.20.1"
    },
    "live_session_monitor": true,
    "description": "Servidor survival con monitoreo activo"
}
```

### 2. Flujo de Usuario

1. **Selección de Instancia**: El usuario selecciona una instancia con LSM habilitado
2. **Diálogo de Consentimiento**: Aparece automáticamente un diálogo explicando el monitoreo
3. **Aceptación**: Si acepta, el sistema inicia la configuración del monitoreo
4. **Inicio del Juego**: El juego se inicia normalmente
5. **Monitoreo Activo**: El sistema detecta la ventana del juego y comienza la transmisión
6. **URL Pública**: Se genera una URL temporal para que los administradores accedan al stream

## 🛠️ Configuración Avanzada

### Personalización por Instancia

Crear configuraciones específicas editando `live-session-config.js`:

```javascript
instanceOverrides: {
    'PvP Competitivo': {
        capture: {
            frameRate: 60,          // FPS más alto para PvP
            quality: 0.9,           // Calidad más alta
            maxWidth: 1920,
            maxHeight: 1080
        },
        notifications: {
            includeSystemInfo: true  // Info adicional para competencias
        }
    },
    'Survival Casual': {
        capture: {
            frameRate: 24,          // FPS más bajo para ahorrar ancho de banda
            quality: 0.6,           // Calidad media
            maxWidth: 1280,
            maxHeight: 720
        }
    }
}
```

### Configuración de Notificaciones

Para recibir notificaciones cuando se inicie un monitoreo:

```json
{
    "live_session_config": {
        "webhook_url": "https://discord.com/api/webhooks/YOUR_WEBHOOK_ID/YOUR_WEBHOOK_TOKEN",
        "notification_settings": {
            "notify_on_start": true,
            "notify_on_stop": true,
            "notify_on_error": true
        }
    }
}
```

## 📊 Monitoreo y Métricas

### Acceder a Métricas en Tiempo Real

```javascript
// Obtener estado básico
const status = getLiveSessionMonitorStatus();
console.log(status);

// Ejemplo de respuesta:
{
    isMonitoring: true,
    publicUrl: "https://lsm-1234567890.loca.lt",
    serverPort: 3000,
    clientsConnected: 2,
    instanceName: "Survival Monitoreado",
    sessionId: "survival-1698765432-abc123def",
    performance: {
        dropRate: 0.5,
        avgBitrate: 2048000,
        avgFPS: 29.8,
        qualityScore: 95,
        rating: "Excelente"
    },
    systemInfo: {
        platform: "win32",
        memory: { total: 16, free: 8 },
        cpu: { cores: 8 }
    }
}
```

### Dashboard Web

Al acceder a la URL pública, los administradores verán:

- **Video en tiempo real** de la sesión de juego
- **Métricas de rendimiento** (FPS, calidad, conexión)
- **Información de la sesión** (duración, instancia, usuario)
- **Estado de conexión** y número de espectadores

## 🔧 Solución de Problemas

### Problema: "No se pudo encontrar la ventana del juego"

**Posibles causas:**
- El juego no se ha abierto completamente
- El juego tiene un título de ventana inesperado
- Java está ejecutándose con un nombre diferente

**Soluciones:**
1. Esperar a que el juego se abra completamente
2. Verificar que Minecraft esté ejecutándose
3. Reintentar el monitoreo

```javascript
// Configurar términos de búsqueda personalizados
windowDetection: {
    searchTerms: [
        'minecraft',
        'java',
        'javaw',
        'mc',
        'forge',           // Agregar términos específicos
        'fabric'
    ],
    pollInterval: 2000,    // Aumentar intervalo de búsqueda
    prioritizeMinecraft: true
}
```

### Problema: "Error creando túnel público"

**Posibles causas:**
- Problemas de conectividad a internet
- Firewall bloqueando conexiones
- Servicio localtunnel temporalmente no disponible

**Soluciones:**
1. Verificar conexión a internet
2. Configurar firewall para permitir el launcher
3. Reintentar después de unos minutos

### Problema: "Calidad de video baja"

**Soluciones:**
1. Ajustar configuración de calidad:

```javascript
capture: {
    frameRate: 30,      // Reducir si hay lag
    quality: 0.8,       // Aumentar para mejor calidad
    maxWidth: 1920,     // Reducir si hay problemas de ancho de banda
    maxHeight: 1080
}
```

2. Verificar ancho de banda disponible
3. Cerrar otras aplicaciones que usen red

## 📝 Ejemplos de Uso

### Ejemplo 1: Servidor Competitivo

```json
{
    "name": "Arena PvP",
    "live_session_monitor": true,
    "description": "Arena competitiva con monitoreo obligatorio",
    "whitelistActive": true,
    "whitelist": ["player1", "player2", "player3"]
}
```

### Ejemplo 2: Servidor de Eventos

```json
{
    "name": "Evento Especial",
    "live_session_monitor": true,
    "description": "Servidor temporal para eventos con transmisión",
    "maintenance": false
}
```

### Ejemplo 3: Servidor de Soporte

```json
{
    "name": "Mesa de Ayuda",
    "live_session_monitor": true,
    "description": "Servidor para ayudar a usuarios con problemas"
}
```

## 🔒 Consideraciones de Privacidad

### Lo que SE captura:
- ✅ Solo la ventana del juego de Minecraft
- ✅ Video de la pantalla (sin audio)
- ✅ Duración de la sesión
- ✅ Métricas básicas de rendimiento

### Lo que NO se captura:
- ❌ Audio del micrófono o sistema
- ❌ Otras ventanas o aplicaciones
- ❌ Archivos del sistema
- ❌ Información personal fuera del juego

### Transparencia:
- El usuario debe **aceptar explícitamente** el monitoreo
- Se muestra **notificación visible** cuando está activo
- El monitoreo se **detiene automáticamente** al cerrar el juego
- **No se almacenan grabaciones** en el servidor

## 📞 Soporte y Contacto

### Logs de Debug

Para habilitar logs detallados:

```javascript
// En live-session-config.js
logging: {
    enableConsoleLogging: true,
    logLevel: 'debug',           // debug, info, warn, error
    logTimestamps: true
}
```

### Reportar Problemas

1. **Recopilar información**:
   - Versión del launcher
   - Sistema operativo
   - Instancia afectada
   - Logs de error

2. **Contactar soporte**:
   - Discord: https://dsc.gg/miguelkinetwork
   - Website: https://minecraft.miguelkinetwork.info/

### Archivos de Log

Los logs se guardan en:
- `logs/live-session/` - Logs específicos del sistema
- Consola del launcher - Logs generales

---

**¡El Live Session Monitor está listo para usar!** 🎉

Para más información técnica, consultar `docs/LIVE_SESSION_MONITOR.md`
