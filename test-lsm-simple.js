/**
 * Script de prueba simple para verificar el Live Session Monitor
 */

console.log('🧪 Iniciando prueba del Live Session Monitor...');

// Test de importación del archivo frontend
try {
    const LiveSessionMonitorFrontend = require('./src/assets/js/utils/live-session-monitor-frontend.js');
    console.log('✅ Archivo frontend importado correctamente');
    
    // Test de creación de instancia
    try {
        const monitor = new LiveSessionMonitorFrontend.LiveSessionMonitorFrontend();
        console.log('✅ Instancia frontend creada correctamente');
        
        // Test de función estática
        const testInstance = { live_session_monitor: true };
        const isEnabled = LiveSessionMonitorFrontend.LiveSessionMonitorFrontend.isLiveSessionEnabled(testInstance);
        console.log(`✅ Función estática funciona: ${isEnabled}`);
        
    } catch (constructorError) {
        console.warn('⚠️ Error creando instancia (esperado si no hay IPC):', constructorError.message);
    }
    
} catch (importError) {
    console.error('❌ Error importando archivo frontend:', importError);
}

// Test de verificación de contexto
console.log('\n📊 Información del contexto:');
console.log(`- Node.js: ${typeof process !== 'undefined' ? process.version : 'No disponible'}`);
console.log(`- Electron: ${typeof process !== 'undefined' && process.versions ? process.versions.electron || 'No' : 'Desconocido'}`);
console.log(`- Window: ${typeof window !== 'undefined' ? 'Disponible' : 'No disponible'}`);
console.log(`- Require: ${typeof require !== 'undefined' ? 'Disponible' : 'No disponible'}`);

console.log('\n🎉 Prueba completada');
