# Live Session Monitor

Sistema de monitoreo en tiempo real de sesiones de juego para Miguelki Network MC Launcher.

## 📋 Descripción

El Live Session Monitor permite a los administradores supervisar las sesiones de juego de los usuarios en tiempo real mediante la transmisión de video de la ventana de juego. Es especialmente útil para:

- **Monitoreo de seguridad**: Supervisar actividades sospechosas
- **Soporte técnico**: Ayudar a usuarios con problemas
- **Moderación**: Verificar cumplimiento de reglas del servidor
- **Eventos especiales**: Transmitir competencias o eventos

## 🚀 Características

### ✅ Funcionalidades Implementadas

- **Captura de pantalla en tiempo real** usando Electron's `desktopCapturer`
- **Servidor HTTP local** con Express para servir el stream
- **WebSocket** para transmisión de frames en tiempo real
- **Túnel público** usando localtunnel para acceso externo
- **Interfaz web** para visualizar el stream
- **Diálogo de consentimiento** antes de iniciar el monitoreo
- **Detección automática** de la ventana del juego
- **Privacidad preservada** (solo captura video, no audio)

### 🎛️ Configuración

#### Para Administradores de Servidor

Para habilitar Live Session Monitor en una instancia, añadir en la configuración de la instancia:

```json
{
    "name": "Mi Instancia",
    "minecraft_version": "1.20.1",
    "live_session_monitor": true,
    // ... otras configuraciones
}
```

#### Para Desarrolladores

El sistema se activa automáticamente cuando:
1. Una instancia tiene `live_session_monitor: true`
2. El usuario acepta el diálogo de consentimiento
3. Se inicia el juego

## 🔧 Implementación Técnica

### Arquitectura

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Minecraft     │────│ Live Session     │────│ Local HTTP      │
│   Game Window   │    │ Monitor          │    │ Server          │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                                         │
                                                         ▼
                                                ┌─────────────────┐
                                                │ Localtunnel     │
                                                │ Public URL      │
                                                └─────────────────┘
                                                         │
                                                         ▼
                                                ┌─────────────────┐
                                                │ Admin Panel     │
                                                │ Web Interface   │
                                                └─────────────────┘
```

### Flujo de Funcionamiento

1. **Verificación**: Se verifica si la instancia requiere monitoreo
2. **Consentimiento**: Se muestra diálogo al usuario
3. **Servidor Local**: Se inicia servidor HTTP en puerto disponible
4. **Túnel Público**: Se crea túnel con localtunnel
5. **Detección de Ventana**: Se busca la ventana del juego
6. **Captura**: Se inicia captura de video usando desktopCapturer
7. **Transmisión**: Frames se envían via WebSocket
8. **Notificación**: Se notifica la URL a administradores

### Componentes Clave

#### `LiveSessionMonitor` Class
- **Gestión del ciclo de vida** del monitoreo
- **Configuración del servidor** HTTP/WebSocket
- **Control de la captura** de video
- **Manejo de errores** y limpieza

#### Métodos Principales
- `startMonitoring(instanceName)`: Inicia el monitoreo completo
- `stopMonitoring()`: Detiene y limpia recursos
- `showConsentDialog()`: Muestra diálogo de consentimiento
- `findGameWindow()`: Detecta ventana del juego
- `startVideoCapture()`: Inicia captura de frames

## 📡 URL del Stream

El sistema genera URLs temporales como:
```
https://lsm-1234567890.loca.lt
```

Estas URLs:
- Son **únicas** para cada sesión
- **Temporales** (solo duran mientras el juego está activo)
- **Seguras** (acceso limitado)
- **Sin instalación** (funcionan en cualquier navegador)

## 🛡️ Privacidad y Seguridad

### Medidas de Privacidad
- ✅ Solo captura la **ventana del juego**
- ✅ **No graba audio**
- ✅ **No almacena** grabaciones
- ✅ Transmisión **temporal** (solo durante el juego)
- ✅ **Diálogo de consentimiento** obligatorio

### Medidas de Seguridad
- ✅ URLs **temporales** y **únicas**
- ✅ Acceso **restringido** a administradores
- ✅ **Detección automática** de cierre del juego
- ✅ **Limpieza automática** de recursos

## 🔨 Instalación y Dependencias

### Dependencias Requeridas (Ya instaladas)
```json
{
    "localtunnel": "^2.0.2",
    "express": "^4.19.2", 
    "ws": "^8.18.3"
}
```

### Archivos del Sistema
- `src/assets/js/utils/live-session-monitor.js` - Implementación principal
- Integrado en `src/assets/js/panels/home.js` - Lógica de inicio de juego
- Exportado en `src/assets/js/utils.js` - Funciones globales

## 🐛 Troubleshooting

### Problemas Comunes

#### Error: "No se pudo encontrar la ventana del juego"
- **Causa**: El juego no se abrió o tiene un nombre de ventana inesperado
- **Solución**: Verificar que Minecraft esté ejecutándose correctamente

#### Error: "No se pudo crear el túnel público"
- **Causa**: Problemas de conectividad o firewall
- **Solución**: Verificar conexión a internet y configuración de firewall

#### Error: "El usuario no aceptó el monitoreo en vivo"
- **Causa**: Usuario canceló el diálogo de consentimiento
- **Solución**: Explicar la necesidad del monitoreo al usuario

### Logs de Debug

El sistema registra eventos importantes:
```javascript
console.log('Live Session Monitor iniciado para instancia:', instanceName);
console.log('Túnel público creado:', publicUrl);
console.log('Ventana del juego encontrada:', gameWindow.name);
```

## 📈 Métricas y Monitoreo

### Información Disponible
- **Estado del monitoreo**: Activo/Inactivo
- **URL pública**: Dirección del stream
- **Clientes conectados**: Número de administradores viendo
- **FPS del stream**: Calidad de transmisión
- **Instancia monitoreada**: Nombre de la instancia

### Acceso a Métricas
```javascript
const status = getLiveSessionMonitorStatus();
console.log(status);
// {
//   isMonitoring: true,
//   publicUrl: "https://lsm-123.loca.lt",
//   clientsConnected: 2,
//   instanceName: "Survival",
//   serverPort: 3000
// }
```

## 🔄 Integración con el Launcher

### En el Inicio del Juego (`home.js`)
```javascript
// Verificar si la instancia requiere Live Session Monitor
if (options.live_session_monitor === true) {
    try {
        const streamUrl = await startLiveSessionMonitorIfEnabled(options);
        console.log(`Live Session Monitor iniciado - URL: ${streamUrl}`);
    } catch (error) {
        // Error handling...
    }
}
```

### Al Cerrar el Juego
```javascript
// Detener Live Session Monitor si estaba activo
const monitorStatus = getLiveSessionMonitorStatus();
if (monitorStatus.isMonitoring) {
    await stopLiveSessionMonitor();
}
```

## 📞 Soporte

Para problemas relacionados con Live Session Monitor:

1. **Verificar logs** de la consola del launcher
2. **Comprobar conectividad** a internet
3. **Revisar configuración** de firewall/antivirus
4. **Contactar soporte** técnico si persisten los problemas

---

**Versión**: 1.0.0  
**Última actualización**: Julio 2025  
**Autor**: Miguel - Miguelki Network
