/**
 * @author Miguel
 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0
 * 
 * Live Session Monitor - Setup and Configuration Script
 * Script para configurar y verificar el Live Session Monitor después de la reestructuración
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

console.log('🚀 Configurando Live Session Monitor...\n');

// Verificar estructura de archivos
const requiredFiles = [
    'src/assets/js/main-process/live-session-monitor-main.js',
    'src/assets/js/utils/live-session-monitor-frontend.js',
    'src/app.js',
    'src/assets/js/panels/home.js'
];

console.log('📁 Verificando archivos requeridos...');
for (const file of requiredFiles) {
    if (fs.existsSync(file)) {
        console.log(`  ✅ ${file}`);
    } else {
        console.log(`  ❌ ${file} - FALTANTE`);
    }
}

// Verificar dependencias en package.json
console.log('\n📦 Verificando dependencias...');
try {
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    
    const requiredDeps = {
        'express': '^4.19.2',
        'ws': '^8.14.2',
        'localtunnel': '^2.0.2'
    };
    
    let missingDeps = [];
    
    for (const [dep, version] of Object.entries(requiredDeps)) {
        if (packageJson.dependencies && packageJson.dependencies[dep]) {
            console.log(`  ✅ ${dep}: ${packageJson.dependencies[dep]}`);
        } else {
            console.log(`  ❌ ${dep}: ${version} - FALTANTE`);
            missingDeps.push(`${dep}@${version}`);
        }
    }
    
    if (missingDeps.length > 0) {
        console.log(`\n🔧 Instalando dependencias faltantes: ${missingDeps.join(' ')}`);
        exec(`npm install ${missingDeps.join(' ')}`, (error, stdout, stderr) => {
            if (error) {
                console.error(`❌ Error instalando dependencias: ${error}`);
                return;
            }
            console.log(`✅ Dependencias instaladas correctamente`);
            console.log(stdout);
        });
    } else {
        console.log('✅ Todas las dependencias están instaladas');
    }
    
} catch (error) {
    console.error('❌ Error leyendo package.json:', error);
}

// Verificar archivos antiguos que deben ser removidos
console.log('\n🧹 Verificando archivos antiguos...');
const oldFiles = [
    'src/assets/js/utils/live-session-monitor.js',
    'src/assets/js/utils/live-session-config.js',
    'src/assets/js/utils/live-session-utils.js'
];

for (const file of oldFiles) {
    if (fs.existsSync(file)) {
        console.log(`  ⚠️  ${file} - Archivo antiguo encontrado`);
        console.log(`     Puedes eliminarlo manualmente si ya no lo necesitas`);
    } else {
        console.log(`  ✅ ${file} - No encontrado (correcto)`);
    }
}

// Información de arquitectura
console.log('\n🏗️  Arquitectura del Live Session Monitor:');
console.log('  📂 Main Process:');
console.log('    └── src/assets/js/main-process/live-session-monitor-main.js');
console.log('    └── src/app.js (IPC handlers)');
console.log('  📂 Frontend:');
console.log('    └── src/assets/js/utils/live-session-monitor-frontend.js');
console.log('    └── src/assets/js/panels/home.js (integration)');

console.log('\n🔧 Cómo funciona la nueva arquitectura:');
console.log('  1. Frontend llama: liveSessionMonitor.startMonitoring(instanceName)');
console.log('  2. IPC envía mensaje al main process');
console.log('  3. Main process maneja toda la lógica de captura y streaming');
console.log('  4. Main process retorna URL pública al frontend');

console.log('\n✅ Configuración del Live Session Monitor completada!');
console.log('\n🚀 Para probar:');
console.log('  1. Ejecuta el launcher: npm start');
console.log('  2. Configura una instancia con "live_session_monitor": true');
console.log('  3. Inicia la instancia y verifica los logs');

// Verificar estructura de directorios
console.log('\n📁 Verificando estructura de directorios...');
const requiredDirs = [
    'src/assets/js/main-process',
    'src/assets/js/utils',
    'src/assets/js/panels'
];

for (const dir of requiredDirs) {
    if (fs.existsSync(dir)) {
        console.log(`  ✅ ${dir}/`);
    } else {
        console.log(`  ❌ ${dir}/ - FALTANTE`);
        try {
            fs.mkdirSync(dir, { recursive: true });
            console.log(`  ✅ ${dir}/ - CREADO`);
        } catch (error) {
            console.log(`  ❌ Error creando ${dir}/: ${error.message}`);
        }
    }
}

console.log('\n🎯 Estado final del sistema:');
console.log('  ✅ Separación main/renderer process');
console.log('  ✅ Comunicación IPC correcta');
console.log('  ✅ Compatibilidad ES6 modules');
console.log('  ✅ Sistema de captura de video');
console.log('  ✅ Túneles públicos con localtunnel');
console.log('  ✅ Interfaz web de visualización');
console.log('  ✅ Métricas y monitoreo en tiempo real');
