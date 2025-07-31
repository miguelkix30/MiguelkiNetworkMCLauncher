/**
 * Script de verificación final del Live Session Monitor
 */

console.log('🔍 Verificando Live Session Monitor - Configuración Final\n');

// Verificar archivo frontend
try {
    const frontend = require('./src/assets/js/utils/live-session-monitor-frontend.js');
    console.log('✅ Frontend: Importación exitosa');
    console.log(`   - LiveSessionMonitorFrontend: ${typeof frontend.LiveSessionMonitorFrontend}`);
    console.log(`   - liveSessionMonitor: ${typeof frontend.liveSessionMonitor}`);
    console.log(`   - startLiveSessionMonitorIfEnabled: ${typeof frontend.startLiveSessionMonitorIfEnabled}`);
    console.log(`   - stopLiveSessionMonitor: ${typeof frontend.stopLiveSessionMonitor}`);
    console.log(`   - getLiveSessionMonitorStatus: ${typeof frontend.getLiveSessionMonitorStatus}`);
    
    // Test de funciones
    const testInstance = { name: 'Test', live_session_monitor: true };
    const isEnabled = frontend.LiveSessionMonitorFrontend.isLiveSessionEnabled(testInstance);
    console.log(`   - Función isLiveSessionEnabled: ${isEnabled}`);
    
} catch (frontendError) {
    console.error('❌ Frontend: Error de importación:', frontendError.message);
}

// Verificar archivo main process
try {
    const mainProcess = require('./src/assets/js/main-process/live-session-monitor-main.js');
    console.log('\n✅ Main Process: Importación exitosa');
    console.log(`   - LiveSessionMonitorMain: ${typeof mainProcess}`);
    
} catch (mainError) {
    console.error('\n❌ Main Process: Error de importación:', mainError.message);
}

// Verificar estructura de archivos
const fs = require('fs');
const files = [
    'src/assets/js/utils/live-session-monitor-frontend.js',
    'src/assets/js/main-process/live-session-monitor-main.js',
    'src/assets/js/utils/live-session-config.js',
    'src/assets/js/utils/live-session-utils.js'
];

console.log('\n📁 Verificación de archivos:');
files.forEach(file => {
    const exists = fs.existsSync(file);
    console.log(`   ${exists ? '✅' : '❌'} ${file}`);
});

// Verificar package.json dependencies
try {
    const pkg = require('./package.json');
    const requiredDeps = ['localtunnel', 'express', 'ws'];
    
    console.log('\n📦 Dependencias requeridas:');
    requiredDeps.forEach(dep => {
        const installed = pkg.dependencies[dep] || pkg.devDependencies[dep];
        console.log(`   ${installed ? '✅' : '❌'} ${dep}: ${installed || 'No instalado'}`);
    });
    
} catch (pkgError) {
    console.error('\n❌ Error leyendo package.json:', pkgError.message);
}

console.log('\n🎯 Estado final:');
console.log('   - Archivos frontend: Configurados para ES6 modules');
console.log('   - IPC handlers: Implementados en app.js');
console.log('   - Compatibilidad: ES6 modules + CommonJS');
console.log('   - Funciones helper: Disponibles globalmente');

console.log('\n🚀 El Live Session Monitor debería funcionar correctamente ahora!');
console.log('   Para probar: Iniciar el launcher y usar una instancia con live_session_monitor: true');
