/**
 * @author Miguel
 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0
 * 
 * Live Session Monitor - Main Process
 * Sistema de monitoreo en tiempo real de sesiones de juego (Main Process)
 */

const { desktopCapturer, BrowserWindow, shell } = require('electron');
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const localtunnel = require('localtunnel');
const path = require('path');
const fs = require('fs');

class LiveSessionMonitorMain {
    constructor() {
        // Estado del monitoreo
        this.isMonitoring = false;
        this.instanceName = null;
        this.sessionId = null;
        this.startTime = null;
        
        // Componentes del sistema
        this.videoStream = null;
        this.serverPort = null;
        this.publicUrl = null;
        this.tunnel = null;
        this.server = null;
        this.gameWindowId = null;
        this.captureInterval = null;
        this.wsServer = null;
        this.clients = [];
        
        // Configuración de captura
        this.frameRate = 30;
        this.quality = 0.7;
        this.captureTimeout = 5000;
        
        // Métricas de rendimiento
        this.metrics = {
            framesSent: 0,
            framesDropped: 0,
            bytesTransferred: 0,
            clientsConnected: 0,
            errors: 0
        };
        
        console.log('[LSM] LiveSessionMonitorMain inicializado');
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
     * Inicia el servidor HTTP local para servir el video stream
     * @returns {Promise<number>} - Puerto del servidor
     */
    async startLocalServer() {
        return new Promise((resolve, reject) => {
            const app = express();
            this.server = http.createServer(app);
            
            // Configurar WebSocket server
            this.wsServer = new WebSocket.Server({ server: this.server });
            
            // Servir página de visualización del stream
            app.get('/', (req, res) => {
                res.send(this.getStreamViewerHTML());
            });
            
            // Manejar conexiones WebSocket
            this.wsServer.on('connection', (ws) => {
                console.log('[LSM] Cliente conectado al Live Session Monitor');
                this.clients.push(ws);
                
                ws.on('close', () => {
                    console.log('[LSM] Cliente desconectado del Live Session Monitor');
                    this.clients = this.clients.filter(client => client !== ws);
                });
                
                ws.on('error', (error) => {
                    console.error('[LSM] Error en WebSocket client:', error);
                    this.clients = this.clients.filter(client => client !== ws);
                });
            });
            
            // Encontrar puerto disponible
            this.server.listen(0, 'localhost', () => {
                this.serverPort = this.server.address().port;
                console.log(`[LSM] Live Session Monitor server iniciado en puerto ${this.serverPort}`);
                resolve(this.serverPort);
            });
            
            this.server.on('error', (error) => {
                console.error('[LSM] Error iniciando servidor Live Session Monitor:', error);
                reject(error);
            });
        });
    }

    /**
     * Genera el HTML para la interfaz de visualización del stream
     */
    getStreamViewerHTML() {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Live Session Monitor - ${this.instanceName || 'Minecraft'}</title>
                <style>
                    body {
                        margin: 0;
                        padding: 20px;
                        background: #1a1a1a;
                        color: white;
                        font-family: Arial, sans-serif;
                        text-align: center;
                    }
                    .container {
                        max-width: 1200px;
                        margin: 0 auto;
                    }
                    .video-container {
                        background: #2a2a2a;
                        border-radius: 8px;
                        padding: 20px;
                        margin: 20px 0;
                        box-shadow: 0 4px 8px rgba(0,0,0,0.3);
                    }
                    #gameVideo {
                        max-width: 100%;
                        height: auto;
                        border-radius: 4px;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.5);
                    }
                    .status {
                        padding: 10px;
                        border-radius: 4px;
                        margin: 10px 0;
                    }
                    .status.connected {
                        background: rgba(40, 167, 69, 0.2);
                        border: 1px solid #28a745;
                    }
                    .status.disconnected {
                        background: rgba(220, 53, 69, 0.2);
                        border: 1px solid #dc3545;
                    }
                    .info {
                        background: rgba(23, 162, 184, 0.1);
                        border: 1px solid #17a2b8;
                        padding: 15px;
                        border-radius: 4px;
                        margin: 20px 0;
                    }
                    .metrics {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                        gap: 15px;
                        margin: 20px 0;
                    }
                    .metric-card {
                        background: rgba(40, 44, 52, 0.8);
                        padding: 15px;
                        border-radius: 8px;
                        border: 1px solid #444;
                    }
                    .metric-value {
                        font-size: 1.5em;
                        font-weight: bold;
                        color: #17a2b8;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>🎮 Live Session Monitor</h1>
                    <div class="info">
                        <h3>Instancia: ${this.instanceName || 'Minecraft'}</h3>
                        <p>Monitoreo en tiempo real de la sesión de juego</p>
                        <p>Sesión ID: ${this.sessionId || 'N/A'}</p>
                    </div>
                    
                    <div id="status" class="status disconnected">
                        🔴 Desconectado - Esperando stream...
                    </div>
                    
                    <div class="video-container">
                        <img id="gameVideo" alt="Stream del juego" />
                        <p id="videoInfo">Esperando feed de video...</p>
                    </div>
                    
                    <div class="metrics">
                        <div class="metric-card">
                            <div class="metric-value" id="fpsCounter">0</div>
                            <div>FPS</div>
                        </div>
                        <div class="metric-card">
                            <div class="metric-value" id="clientsCounter">0</div>
                            <div>Espectadores</div>
                        </div>
                        <div class="metric-card">
                            <div class="metric-value" id="durationCounter">0s</div>
                            <div>Duración</div>
                        </div>
                        <div class="metric-card">
                            <div class="metric-value" id="qualityIndicator">-</div>
                            <div>Calidad</div>
                        </div>
                    </div>
                </div>
                
                <script>
                    const ws = new WebSocket('ws://' + window.location.host);
                    const statusDiv = document.getElementById('status');
                    const gameVideo = document.getElementById('gameVideo');
                    const videoInfo = document.getElementById('videoInfo');
                    const fpsCounter = document.getElementById('fpsCounter');
                    const clientsCounter = document.getElementById('clientsCounter');
                    const durationCounter = document.getElementById('durationCounter');
                    const qualityIndicator = document.getElementById('qualityIndicator');
                    
                    let frameCount = 0;
                    let lastFrameTime = Date.now();
                    let startTime = Date.now();
                    
                    // Actualizar duración cada segundo
                    setInterval(() => {
                        const duration = Math.floor((Date.now() - startTime) / 1000);
                        const minutes = Math.floor(duration / 60);
                        const seconds = duration % 60;
                        durationCounter.textContent = minutes > 0 ? 
                            \`\${minutes}m \${seconds}s\` : \`\${seconds}s\`;
                    }, 1000);
                    
                    ws.onopen = function() {
                        statusDiv.className = 'status connected';
                        statusDiv.innerHTML = '🟢 Conectado - Recibiendo stream';
                        startTime = Date.now();
                    };
                    
                    ws.onmessage = function(event) {
                        if (event.data instanceof Blob) {
                            const url = URL.createObjectURL(event.data);
                            gameVideo.src = url;
                            
                            // Calcular FPS aproximado
                            frameCount++;
                            const now = Date.now();
                            if (now - lastFrameTime >= 1000) {
                                const fps = Math.round(frameCount * 1000 / (now - lastFrameTime));
                                fpsCounter.textContent = fps;
                                
                                // Indicador de calidad basado en FPS
                                if (fps >= 25) qualityIndicator.textContent = 'Excelente';
                                else if (fps >= 20) qualityIndicator.textContent = 'Buena';
                                else if (fps >= 15) qualityIndicator.textContent = 'Regular';
                                else qualityIndicator.textContent = 'Pobre';
                                
                                videoInfo.innerHTML = \`Recibiendo feed - \${fps} FPS\`;
                                frameCount = 0;
                                lastFrameTime = now;
                            }
                            
                            // Limpiar URL anterior para evitar memory leaks
                            setTimeout(() => URL.revokeObjectURL(url), 100);
                        } else if (typeof event.data === 'string') {
                            try {
                                const data = JSON.parse(event.data);
                                if (data.type === 'metrics') {
                                    clientsCounter.textContent = data.data.clients || 0;
                                }
                            } catch (e) {
                                console.log('Mensaje recibido:', event.data);
                            }
                        }
                    };
                    
                    ws.onclose = function() {
                        statusDiv.className = 'status disconnected';
                        statusDiv.innerHTML = '🔴 Desconectado';
                        videoInfo.innerHTML = 'Conexión perdida';
                        fpsCounter.textContent = '0';
                        qualityIndicator.textContent = '-';
                    };
                    
                    ws.onerror = function(error) {
                        console.error('WebSocket error:', error);
                        statusDiv.className = 'status disconnected';
                        statusDiv.innerHTML = '❌ Error de conexión';
                    };
                </script>
            </body>
            </html>
        `;
    }

    /**
     * Crea un túnel público usando localtunnel
     * @returns {Promise<string>} - URL pública del túnel
     */
    async createPublicTunnel() {
        try {
            console.log(`[LSM] Creando túnel público para puerto ${this.serverPort}...`);
            
            const subdomain = `lsm-${Date.now()}`;
            this.tunnel = await localtunnel({
                port: this.serverPort,
                subdomain: subdomain
            });
            
            this.publicUrl = this.tunnel.url;
            console.log(`[LSM] Túnel público creado: ${this.publicUrl}`);
            
            // Manejar eventos del túnel
            this.tunnel.on('close', () => {
                console.log('[LSM] Túnel público cerrado');
                this.publicUrl = null;
            });
            
            this.tunnel.on('error', (error) => {
                console.error('[LSM] Error en túnel público:', error);
            });
            
            return this.publicUrl;
            
        } catch (error) {
            console.error('[LSM] Error creando túnel público:', error);
            throw new Error(`No se pudo crear el túnel público: ${error.message}`);
        }
    }

    /**
     * Encuentra la ventana del juego de Minecraft
     * @param {string} instanceName - Nombre de la instancia
     * @returns {Promise<Object>} - Información de la ventana encontrada
     */
    async findGameWindow(instanceName) {
        return new Promise(async (resolve, reject) => {
            const startTime = Date.now();
            const checkInterval = 1000;
            
            const findWindow = async () => {
                try {
                    const sources = await desktopCapturer.getSources({
                        types: ['window'],
                        thumbnailSize: { width: 320, height: 240 }
                    });
                    
                    // Buscar ventana de Minecraft
                    const gameWindow = sources.find(source => {
                        const name = source.name.toLowerCase();
                        return (
                            name.includes('minecraft') ||
                            name.includes(instanceName?.toLowerCase()) ||
                            name.includes('java') ||
                            name.includes('javaw')
                        );
                    });
                    
                    if (gameWindow) {
                        console.log(`[LSM] Ventana del juego encontrada: ${gameWindow.name} (ID: ${gameWindow.id})`);
                        resolve(gameWindow);
                        return;
                    }
                    
                    // Si no se encuentra y no ha pasado el timeout, seguir buscando
                    if (Date.now() - startTime < this.captureTimeout) {
                        setTimeout(findWindow, checkInterval);
                    } else {
                        reject(new Error(`No se pudo encontrar la ventana del juego después de ${this.captureTimeout}ms`));
                    }
                    
                } catch (error) {
                    reject(error);
                }
            };
            
            findWindow();
        });
    }

    /**
     * Genera un ID único para la sesión de monitoreo
     * @param {string} instanceName - Nombre de la instancia
     * @returns {string} - ID único de sesión
     */
    generateSessionId(instanceName) {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substr(2, 9);
        const cleanInstanceName = instanceName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        return `${cleanInstanceName}-${timestamp}-${random}`;
    }

    /**
     * Inicia el monitoreo de la sesión de juego
     * @param {string} instanceName - Nombre de la instancia
     * @returns {Promise<string>} - URL pública del stream
     */
    async startMonitoring(instanceName) {
        try {
            if (this.isMonitoring) {
                throw new Error('El monitoreo ya está activo');
            }
            
            console.log(`[LSM] Iniciando Live Session Monitor para instancia: ${instanceName}`);
            
            // Generar ID de sesión único
            this.sessionId = this.generateSessionId(instanceName);
            this.instanceName = instanceName;
            this.isMonitoring = true;
            this.startTime = Date.now();
            
            // Resetear métricas
            this.metrics = {
                framesSent: 0,
                framesDropped: 0,
                bytesTransferred: 0,
                clientsConnected: 0,
                errors: 0
            };
            
            // 1. Iniciar servidor local
            await this.startLocalServer();
            
            // 2. Crear túnel público
            const publicUrl = await this.createPublicTunnel();
            
            // 3. Buscar ventana del juego (con retraso para que se abra)
            console.log('[LSM] Esperando a que se abra la ventana del juego...');
            setTimeout(async () => {
                try {
                    const gameWindow = await this.findGameWindow(instanceName);
                    this.gameWindowId = gameWindow.id;
                    
                    console.log(`[LSM] Live Session Monitor activo - URL: ${publicUrl}`);
                    
                } catch (error) {
                    console.error('[LSM] Error configurando captura de video:', error);
                    this.metrics.errors++;
                }
            }, 3000);
            
            return publicUrl;
            
        } catch (error) {
            console.error('[LSM] Error iniciando Live Session Monitor:', error);
            this.metrics.errors++;
            await this.stopMonitoring();
            throw error;
        }
    }

    /**
     * Detiene el monitoreo de la sesión
     */
    async stopMonitoring() {
        console.log('[LSM] Deteniendo Live Session Monitor...');
        
        this.isMonitoring = false;
        
        // Cerrar conexiones WebSocket
        if (this.clients.length > 0) {
            this.clients.forEach(client => {
                if (client.readyState === client.OPEN) {
                    client.close();
                }
            });
            this.clients = [];
        }
        
        // Cerrar WebSocket server
        if (this.wsServer) {
            this.wsServer.close();
            this.wsServer = null;
        }
        
        // Cerrar servidor HTTP
        if (this.server) {
            this.server.close();
            this.server = null;
        }
        
        // Cerrar túnel público
        if (this.tunnel) {
            this.tunnel.close();
            this.tunnel = null;
        }
        
        // Limpiar timeout si existe
        if (this.captureInterval) {
            clearInterval(this.captureInterval);
            this.captureInterval = null;
        }
        
        this.publicUrl = null;
        this.serverPort = null;
        this.gameWindowId = null;
        this.instanceName = null;
        this.sessionId = null;
        this.startTime = null;
        
        console.log('[LSM] Live Session Monitor detenido');
    }

    /**
     * Obtiene el estado actual del monitoreo
     * @returns {Object} - Estado del monitoreo
     */
    getStatus() {
        const duration = this.startTime ? Date.now() - this.startTime : 0;
        
        return {
            isMonitoring: this.isMonitoring,
            publicUrl: this.publicUrl,
            serverPort: this.serverPort,
            clientsConnected: this.clients.length,
            instanceName: this.instanceName,
            gameWindowId: this.gameWindowId,
            sessionId: this.sessionId,
            startTime: this.startTime,
            duration: duration,
            metrics: this.metrics
        };
    }

    /**
     * Notifica la URL del stream a los administradores
     * @param {string} publicUrl - URL pública del stream
     * @param {string} instanceName - Nombre de la instancia
     */
    async notifyAdministrators(publicUrl, instanceName) {
        try {
            console.log(`[LSM] Notificando administradores sobre nueva sesión: ${instanceName} - ${publicUrl}`);
            
            // Aquí se podría implementar envío de webhook o notificación
            // Por ahora solo loggeamos la información
            
        } catch (error) {
            console.warn('[LSM] Error notificando administradores:', error);
        }
    }
}

module.exports = LiveSessionMonitorMain;
