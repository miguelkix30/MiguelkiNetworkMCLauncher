# Sistema de Descarga Automática de Java

Este documento describe el nuevo sistema de descarga automática de Java implementado en MiguelkiNetwork MCLauncher.

## 🔧 Funcionalidades

### Descarga Automática
- **Detección automática**: El launcher detecta qué versión de Java es necesaria para cada versión de Minecraft
- **Descarga inteligente**: Solo descarga las versiones de Java que no están disponibles
- **Compatibilidad multiplataforma**: Funciona en Windows, macOS y Linux
- **Verificación de integridad**: Valida los archivos descargados usando hashes SHA-256

### Mapeo de Compatibilidad
- **Java 8**: Minecraft 1.7 - 1.16.5
- **Java 17**: Minecraft 1.17 - 1.20.6  
- **Java 21**: Minecraft 1.21+

### Gestión de Instalaciones
- **Reutilización**: Las versiones de Java descargadas se reutilizan automáticamente
- **Almacenamiento eficiente**: Se almacenan en `runtime/` dentro del directorio de datos del launcher
- **Interfaz de gestión**: Panel en configuraciones para ver y gestionar las instalaciones

## 📁 Estructura de Archivos

```
{dataDirectory}/
├── runtime/
│   ├── java8/
│   │   └── [archivos de Java 8]
│   ├── java17/
│   │   └── [archivos de Java 17]
│   └── java21/
│       └── [archivos de Java 21]
├── instances/
├── versions/
└── ...
```

## 🚀 Flujo de Funcionamiento

1. **Inicio del juego**: El usuario selecciona una instancia y presiona "Jugar"
2. **Verificación**: El sistema verifica si Java es compatible con la versión de Minecraft
3. **Descarga (si es necesario)**: Si no hay Java compatible, se descarga automáticamente
4. **Extracción**: El archivo descargado se extrae en el directorio runtime apropiado
5. **Configuración**: Se actualiza la configuración del launcher con la nueva ruta de Java
6. **Inicio**: El juego se inicia con la versión de Java correcta

## 🔧 Componentes Técnicos

### JavaManager (`java-manager.js`)
- Gestiona la descarga, instalación y verificación de Java
- Determina qué versión de Java es necesaria para cada versión de Minecraft
- Proporciona métodos para listar y limpiar instalaciones

### JavaUtils (`java-utils.js`)
- Utilidades para extracción de archivos TAR.GZ y ZIP
- Funciones de verificación de hashes y permisos
- Herramientas de gestión de archivos y directorios

### Integración con Home Panel
- Verificación automática antes del inicio del juego
- Indicadores de progreso durante la descarga
- Manejo de errores con mensajes informativos

### Interfaz de Configuración
- Panel dedicado en configuraciones
- Lista de instalaciones automáticas de Java
- Opciones de limpieza y gestión

## 📦 Fuentes de Descarga

### Adoptium (Eclipse Temurin)
- **Java 8**: OpenJDK 8u402 JRE
- **Java 17**: OpenJDK 17.0.9 JRE  
- **Java 21**: OpenJDK 21.0.1 JRE

### Plataformas Soportadas
- **Windows**: x64 (archivos ZIP)
- **macOS**: x64 y ARM64/Apple Silicon (archivos TAR.GZ)
- **Linux**: x64 (archivos TAR.GZ)

## 🛡️ Seguridad

### Verificación de Integridad
- Todos los archivos descargados se verifican usando hashes SHA-256
- Si la verificación falla, se vuelve a descargar automáticamente

### Permisos
- Validación de permisos de escritura antes de crear directorios
- Establecimiento correcto de permisos ejecutables en sistemas Unix

### Fuentes Confiables
- Solo se descargan archivos desde repositorios oficiales de Adoptium
- URLs hardcodeadas para evitar ataques de redirección

## 🔄 Mantenimiento

### Actualizaciones
Para actualizar las versiones de Java disponibles, modifica las URLs en `JAVA_DOWNLOAD_URLS` en `java-manager.js`.

### Limpieza
El sistema incluye funcionalidades para limpiar versiones no utilizadas de Java y liberar espacio en disco.

### Logs
Todas las operaciones se registran en la consola con niveles de log apropiados:
- `✅` Operaciones exitosas
- `⚠️` Advertencias
- `❌` Errores
- `📥` Descargas
- `☕` Operaciones de Java

## 🐛 Solución de Problemas

### Errores Comunes

1. **"No hay permisos de escritura"**
   - Ejecutar el launcher como administrador
   - Verificar permisos del directorio de datos

2. **"Error al extraer archivo"**
   - Verificar que tar está disponible en el sistema (Unix/Linux)
   - En Windows, verificar que PowerShell está disponible

3. **"No se pudo encontrar el ejecutable de Java"**
   - Verificar que la extracción fue exitosa
   - Comprobar la estructura del archivo descargado

4. **"Hash verification failed"**
   - Problema de red durante la descarga
   - Archivo corrupto en el servidor

### Modo Fallback
Si la descarga automática falla, el sistema permite al usuario:
- Configurar manualmente una ruta de Java personalizada
- Usar Java del sistema si está disponible
- Recibir instrucciones claras sobre cómo resolver el problema

## 🔮 Funcionalidades Futuras

- **Actualizaciones automáticas**: Verificar y descargar nuevas versiones de Java
- **Limpieza inteligente**: Eliminar automáticamente versiones no utilizadas
- **Caché compartido**: Compartir instalaciones entre múltiples usuarios
- **Verificación de rendimiento**: Optimizar selección de Java según hardware

## 📄 Licencia

Este sistema mantiene la misma licencia CC-BY-NC 4.0 que el resto del proyecto MiguelkiNetwork MCLauncher.
