/**
 * Script de verificación e instalación de dependencias para Live Session Monitor
 * Ejecutar con: node setup-live-session-monitor.js
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

class LiveSessionSetup {
    constructor() {
        this.packageJsonPath = path.join(__dirname, '..', 'package.json');
        this.requiredDependencies = {
            '@pinggy/pinggy': '^1.1.0', // Reemplaza localtunnel para túneles más estables
            'express': '^4.19.2',
            'ws': '^8.18.3'
        };
        this.optionalDependencies = {
            'sharp': '^0.32.0',     // Para optimización de imágenes
            'ffmpeg': '^0.0.4'      // Para procesamiento de video (futuro)
        };
    }
    
    /**
     * Ejecuta el proceso completo de setup
     */
    async run() {
        console.log('🚀 Iniciando setup de Live Session Monitor...\n');
        
        try {
            await this.verifyPackageJson();
            await this.checkDependencies();
            await this.verifyFileStructure();
            await this.createDirectories();
            await this.setupPermissions();
            await this.runTests();
            
            console.log('\n✅ Setup de Live Session Monitor completado exitosamente!');
            console.log('\n📋 Próximos pasos:');
            console.log('1. Configurar instancias con live_session_monitor: true');
            console.log('2. Probar el sistema iniciando una instancia monitoreada');
            console.log('3. Verificar que el túnel público funciona correctamente');
            
        } catch (error) {
            console.error('\n❌ Error durante el setup:', error.message);
            process.exit(1);
        }
    }
    
    /**
     * Verifica que package.json existe y es válido
     */
    async verifyPackageJson() {
        console.log('📦 Verificando package.json...');
        
        if (!fs.existsSync(this.packageJsonPath)) {
            throw new Error(`package.json no encontrado en: ${this.packageJsonPath}`);
        }
        
        try {
            const packageJson = JSON.parse(fs.readFileSync(this.packageJsonPath, 'utf8'));
            console.log(`   ✓ Proyecto: ${packageJson.name} v${packageJson.version}`);
            return packageJson;
        } catch (error) {
            throw new Error(`Error leyendo package.json: ${error.message}`);
        }
    }
    
    /**
     * Verifica e instala dependencias necesarias
     */
    async checkDependencies() {
        console.log('\n🔍 Verificando dependencias...');
        
        const packageJson = JSON.parse(fs.readFileSync(this.packageJsonPath, 'utf8'));
        const installedDeps = { ...packageJson.dependencies, ...packageJson.devDependencies };
        
        const missingDeps = [];
        const outdatedDeps = [];
        
        // Verificar dependencias requeridas
        for (const [dep, version] of Object.entries(this.requiredDependencies)) {
            if (!installedDeps[dep]) {
                missingDeps.push(`${dep}@${version}`);
                console.log(`   ❌ Faltante: ${dep}`);
            } else {
                console.log(`   ✓ Instalado: ${dep}@${installedDeps[dep]}`);
            }
        }
        
        // Verificar dependencias opcionales
        console.log('\n📋 Dependencias opcionales:');
        for (const [dep, version] of Object.entries(this.optionalDependencies)) {
            if (!installedDeps[dep]) {
                console.log(`   ⚠️  Opcional: ${dep} (mejora rendimiento)`);
            } else {
                console.log(`   ✓ Instalado: ${dep}@${installedDeps[dep]}`);
            }
        }
        
        if (missingDeps.length > 0) {
            console.log(`\n📥 Instalando dependencias faltantes: ${missingDeps.join(', ')}`);
            await this.installDependencies(missingDeps);
        }
    }
    
    /**
     * Instala dependencias usando npm
     */
    async installDependencies(dependencies) {
        return new Promise((resolve, reject) => {
            const npm = spawn('npm', ['install', ...dependencies], {
                cwd: path.dirname(this.packageJsonPath),
                stdio: 'inherit'
            });
            
            npm.on('close', (code) => {
                if (code === 0) {
                    console.log('   ✓ Dependencias instaladas correctamente');
                    resolve();
                } else {
                    reject(new Error(`npm install falló con código ${code}`));
                }
            });
            
            npm.on('error', (error) => {
                reject(new Error(`Error ejecutando npm: ${error.message}`));
            });
        });
    }
    
    /**
     * Verifica que todos los archivos necesarios existen
     */
    async verifyFileStructure() {
        console.log('\n📁 Verificando estructura de archivos...');
        
        const requiredFiles = [
            'src/assets/js/main-process/live-session-monitor-main.js',
            'src/assets/js/utils/live-session-monitor-frontend.js'
        ];
        
        const optionalFiles = [
            'docs/LIVE_SESSION_MONITOR.md',
            'docs/live-session-config-example.json',
            'test/test-live-session-monitor.js'
        ];
        
        for (const file of requiredFiles) {
            const filePath = path.join(__dirname, '..', file);
            if (fs.existsSync(filePath)) {
                console.log(`   ✓ ${file}`);
            } else {
                throw new Error(`Archivo requerido no encontrado: ${file}`);
            }
        }
        
        console.log('\n📋 Archivos opcionales:');
        for (const file of optionalFiles) {
            const filePath = path.join(__dirname, '..', file);
            if (fs.existsSync(filePath)) {
                console.log(`   ✓ ${file}`);
            } else {
                console.log(`   ⚠️  ${file} (recomendado)`);
            }
        }
    }
    
    /**
     * Crea directorios necesarios
     */
    async createDirectories() {
        console.log('\n📂 Creando directorios necesarios...');
        
        const directories = [
            'logs/live-session',
            'temp/live-session',
            'data/live-session-cache'
        ];
        
        for (const dir of directories) {
            const dirPath = path.join(__dirname, '..', dir);
            if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });
                console.log(`   ✓ Creado: ${dir}`);
            } else {
                console.log(`   ✓ Existe: ${dir}`);
            }
        }
    }
    
    /**
     * Configura permisos si es necesario
     */
    async setupPermissions() {
        console.log('\n🔐 Verificando permisos...');
        
        if (process.platform !== 'win32') {
            // En sistemas Unix-like, verificar permisos de ejecución
            const scriptsDir = path.join(__dirname, '..');
            try {
                fs.accessSync(scriptsDir, fs.constants.R_OK | fs.constants.W_OK);
                console.log('   ✓ Permisos de lectura/escritura OK');
            } catch (error) {
                console.log('   ⚠️  Verificar permisos de directorio');
            }
        } else {
            console.log('   ✓ Windows detectado - permisos OK');
        }
    }
    
    /**
     * Ejecuta tests básicos
     */
    async runTests() {
        console.log('\n🧪 Ejecutando tests básicos...');
        
        try {
            // Test de importación de módulos principales
            const LiveSessionMonitorMain = require('../src/assets/js/main-process/live-session-monitor-main.js');
            console.log('   ✓ Módulo main process importado correctamente');
            
            const LiveSessionMonitorFrontend = require('../src/assets/js/utils/live-session-monitor-frontend.js');
            console.log('   ✓ Módulo frontend importado correctamente');
            
            // Test de funciones básicas
            const testInstance = { name: 'Test', live_session_monitor: true };
            const isEnabledMain = LiveSessionMonitorMain.isLiveSessionEnabled(testInstance);
            console.log(`   ✓ Detección de LSM habilitado (main): ${isEnabledMain}`);
            
            const isEnabledFrontend = LiveSessionMonitorFrontend.LiveSessionMonitorFrontend.isLiveSessionEnabled(testInstance);
            console.log(`   ✓ Detección de LSM habilitado (frontend): ${isEnabledFrontend}`);
            
            console.log('   ✓ Información del sistema disponible');
            
        } catch (error) {
            console.log(`   ❌ Error en tests: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * Genera reporte de configuración
     */
    generateConfigReport() {
        console.log('\n📊 Reporte de configuración:');
        console.log('════════════════════════════════════════');
        
        const packageJson = JSON.parse(fs.readFileSync(this.packageJsonPath, 'utf8'));
        
        console.log(`Proyecto: ${packageJson.name}`);
        console.log(`Versión: ${packageJson.version}`);
        console.log(`Node.js: ${process.version}`);
        console.log(`Plataforma: ${process.platform} ${process.arch}`);
        
        console.log('\nDependencias clave:');
        for (const [dep, version] of Object.entries(this.requiredDependencies)) {
            const installed = packageJson.dependencies[dep] || packageJson.devDependencies[dep] || 'No instalado';
            console.log(`  ${dep}: ${installed}`);
        }
        
        console.log('\nUrls importantes:');
        console.log(`  Proyecto: ${packageJson.url || 'No configurado'}`);
        console.log(`  Discord: ${packageJson.discord_url || 'No configurado'}`);
        
        console.log('════════════════════════════════════════');
    }
}

// Ejecutar setup si se ejecuta directamente
if (require.main === module) {
    const setup = new LiveSessionSetup();
    setup.run().then(() => {
        setup.generateConfigReport();
    }).catch(console.error);
}

module.exports = LiveSessionSetup;
