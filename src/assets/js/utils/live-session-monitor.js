/**
 * @author Miguel
 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0
 * 
 * Live Session Monitor
 * Sistema de monitoreo en tiempo real de sesiones de juego
 */

const { desktopCapturer, ipcRenderer } = require('electron');
const localtunnel = require('localtunnel');
const path = require('path');
const fs = require('fs');

// Importar utilidades y configuraciones
import LiveSessionUtils from './live-session-utils.js';
import { getInstanceConfig, validateConfig } from './live-session-config.js';

class LiveSessionMonitor {
    constructor(instanceName = null) {
        // Estado del monitoreo
        this.isMonitoring = false;
        this.instanceName = instanceName;
        this.sessionId = null;
        this.startTime = null;
        
        // Configuración específica de instancia (se cargará de forma lazy)
        this.config = null;
        this.configLoaded = false;
        
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
        
        // Configuración de captura por defecto
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
        
        LiveSessionUtils.log('info', 'LiveSessionMonitor inicializado', { 
            instanceName
        });
    }

    /**
     * Carga la configuración de forma asíncrona
     */
    async loadConfig() {
        if (this.configLoaded) return;
        
        try {
            if (this.instanceName) {
                this.config = getInstanceConfig(this.instanceName);
            } else {
                const configModule = await import('./live-session-config.js');
                this.config = configModule.LiveSessionConfig;
            }
            
            // Validar configuración
            const validation = validateConfig(this.config);
            if (!validation.isValid) {
                LiveSessionUtils.log('warn', 'Configuración inválida detectada', { errors: validation.errors });
            }
            
            // Aplicar configuración de captura
            this.frameRate = this.config.capture.frameRate;
            this.quality = this.config.capture.quality;
            this.captureTimeout = this.config.capture.timeout;
            
            // Throttled functions para optimización
            this.throttledUpdateMetrics = LiveSessionUtils.throttle(
                () => this.updateMetrics(), 
                5000 // Actualizar métricas cada 5 segundos
            );
            
            this.configLoaded = true;
            
        } catch (error) {
            LiveSessionUtils.log('error', 'Error cargando configuración', { error: error.message });
            // Usar configuración por defecto
            this.config = {
                capture: {
                    frameRate: 30,
                    quality: 0.7,
                    timeout: 5000
                }
            };
            this.configLoaded = true;
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
     * Muestra el diálogo de consentimiento para live session monitor
     * @returns {Promise<boolean>} - true si el usuario acepta, false si rechaza
     */
    async showConsentDialog() {
        return new Promise((resolve) => {
            const { popup } = require('../utils.js');
            const popupDialog = new popup();
            
            popupDialog.openDialog({
                title: 'Live Session Monitor',
                content: `
                    <div style="text-align: left; padding: 10px;">
                        <h3>⚠️ Transmisión de Contenido Requerida</h3>
                        <p>Esta instancia requiere la activación del <strong>Live Session Monitor</strong>.</p>
                        
                        <div style="margin: 15px 0; padding: 10px; background: rgba(255, 193, 7, 0.1); border-left: 4px solid #ffc107; border-radius: 4px;">
                            <h4>📺 ¿Qué significa esto?</h4>
                            <ul style="margin: 8px 0; padding-left: 20px;">
                                <li>Se capturará video de tu ventana de juego</li>
                                <li>La transmisión será visible para los administradores</li>
                                <li>El monitoreo comenzará al iniciar el juego</li>
                                <li>Puedes detenerlo cerrando el juego</li>
                            </ul>
                        </div>
                        
                        <div style="margin: 15px 0; padding: 10px; background: rgba(23, 162, 184, 0.1); border-left: 4px solid #17a2b8; border-radius: 4px;">
                            <h4>🔒 Privacidad y Seguridad</h4>
                            <ul style="margin: 8px 0; padding-left: 20px;">
                                <li>Solo se captura la ventana del juego</li>
                                <li>No se graba audio</li>
                                <li>La transmisión es temporal (solo durante el juego)</li>
                                <li>Acceso restringido a administradores autorizados</li>
                            </ul>
                        </div>
                        
                        <p><strong>¿Deseas continuar y activar la transmisión?</strong></p>
                    </div>
                `,
                options: true,
                acceptText: 'Aceptar y Continuar',
                cancelText: 'Cancelar',
                callback: (result) => {
                    resolve(result !== 'cancel');
                }
            });
        });
    }

    /**
     * Inicia el servidor HTTP local para servir el video stream
     * @returns {Promise<number>} - Puerto del servidor
     */
    async startLocalServer() {
        return new Promise((resolve, reject) => {
            const express = require('express');
            const http = require('http');
            const WebSocket = require('ws');
            
            const app = express();
            this.server = http.createServer(app);
            
            // Configurar WebSocket server
            this.wsServer = new WebSocket.Server({ server: this.server });
            
            // Middleware para redirigir HTTPS a HTTP
            app.use((req, res, next) => {
                // Detectar si la request viene a través de HTTPS
                const isHttps = req.headers['x-forwarded-proto'] === 'https' || 
                               req.headers['x-forwarded-ssl'] === 'on' ||
                               req.connection.encrypted;
                
                if (isHttps && req.get('host')) {
                    const httpUrl = `http://${req.get('host')}${req.originalUrl}`;
                    console.log(`[LSM] Redirigiendo de HTTPS a HTTP: ${httpUrl}`);
                    return res.redirect(301, httpUrl);
                }
                
                next();
            });
            
            // Servir página de visualización del stream completa
            app.get('/', (req, res) => {
                res.send(`
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
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <h1>🎮 Live Session Monitor</h1>
                            <div class="info">
                                <h3>Instancia: ${this.instanceName || 'Minecraft'}</h3>
                                <p>Monitoreo en tiempo real de la sesión de juego</p>
                            </div>
                            
                            <div id="status" class="status disconnected">
                                🔴 Desconectado - Esperando stream...
                            </div>
                            
                            <div class="video-container">
                                <img id="gameVideo" alt="Stream del juego" />
                                <p id="videoInfo">Esperando feed de video...</p>
                            </div>
                        </div>
                        
                        <script>
                            const ws = new WebSocket('ws://' + window.location.host);
                            const statusDiv = document.getElementById('status');
                            const gameVideo = document.getElementById('gameVideo');
                            const videoInfo = document.getElementById('videoInfo');
                            
                            let frameCount = 0;
                            let lastFrameTime = Date.now();
                            
                            ws.onopen = function() {
                                statusDiv.className = 'status connected';
                                statusDiv.innerHTML = '🟢 Conectado - Recibiendo stream';
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
                                        videoInfo.innerHTML = \`Recibiendo feed - \${fps} FPS\`;
                                        frameCount = 0;
                                        lastFrameTime = now;
                                    }
                                    
                                    // Limpiar URL anterior para evitar memory leaks
                                    setTimeout(() => URL.revokeObjectURL(url), 100);
                                }
                            };
                            
                            ws.onclose = function() {
                                statusDiv.className = 'status disconnected';
                                statusDiv.innerHTML = '🔴 Desconectado';
                                videoInfo.innerHTML = 'Conexión perdida';
                            };
                            
                            ws.onerror = function(error) {
                                console.error('WebSocket error:', error);
                                statusDiv.className = 'status disconnected';
                                statusDiv.innerHTML = '❌ Error de conexión';
                            };
                        </script>
                    </body>
                    </html>
                `);
            });
            
            // Endpoint dedicado solo para el feed de video
            app.get('/video', (req, res) => {
                res.send(`
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <title>Video Feed</title>
                        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css">
                        <style>
                            body {
                                margin: 0;
                                padding: 0;
                                background: #3a3a3a;
                                display: flex;
                                justify-content: center;
                                align-items: center;
                                min-height: 100vh;
                                overflow: hidden;
                            }
                            .video-container {
                                position: relative;
                                width: 100%;
                                height: 100vh;
                                display: flex;
                                justify-content: center;
                                align-items: center;
                                background: #3a3a3a;
                            }
                            #gameVideo {
                                max-width: 100%;
                                max-height: 100%;
                                display: none;
                                object-fit: contain;
                            }
                            .disconnected-overlay {
                                display: flex;
                                justify-content: center;
                                align-items: center;
                                color: #666;
                            }
                            .status-icon {
                                font-size: 120px;
                                opacity: 0.5;
                            }
                            .fa-spinner {
                                animation: spin 1s linear infinite;
                            }
                            @keyframes spin {
                                0% { transform: rotate(0deg); }
                                100% { transform: rotate(360deg); }
                            }
                        </style>
                    </head>
                    <body>
                        <div class="video-container">
                            <img id="gameVideo" alt="Video feed" />
                            <div id="disconnectedOverlay" class="disconnected-overlay">
                                <i id="statusIcon" class="fas fa-spinner status-icon"></i>
                            </div>
                        </div>
                        
                        <script>
                            const ws = new WebSocket('ws://' + window.location.host);
                            const gameVideo = document.getElementById('gameVideo');
                            const disconnectedOverlay = document.getElementById('disconnectedOverlay');
                            const statusIcon = document.getElementById('statusIcon');
                            
                            let isConnected = false;
                            let hasReceivedFrame = false;
                            
                            function showDisconnectedState(isError = false) {
                                gameVideo.style.display = 'none';
                                disconnectedOverlay.style.display = 'flex';
                                
                                if (isError) {
                                    statusIcon.className = 'fas fa-video-slash status-icon';
                                } else if (!isConnected) {
                                    statusIcon.className = 'fas fa-spinner status-icon';
                                } else {
                                    statusIcon.className = 'fas fa-plug-circle-xmark status-icon';
                                }
                            }
                            
                            function showVideoState() {
                                gameVideo.style.display = 'block';
                                disconnectedOverlay.style.display = 'none';
                                hasReceivedFrame = true;
                            }
                            
                            ws.onopen = function() {
                                isConnected = true;
                                if (!hasReceivedFrame) {
                                    showDisconnectedState();
                                }
                            };
                            
                            ws.onmessage = function(event) {
                                if (event.data instanceof Blob) {
                                    const url = URL.createObjectURL(event.data);
                                    gameVideo.src = url;
                                    showVideoState();
                                    setTimeout(() => URL.revokeObjectURL(url), 100);
                                } else if (event.data instanceof ArrayBuffer) {
                                    const blob = new Blob([event.data], { type: 'image/jpeg' });
                                    const url = URL.createObjectURL(blob);
                                    gameVideo.src = url;
                                    showVideoState();
                                    setTimeout(() => URL.revokeObjectURL(url), 100);
                                }
                            };
                            
                            ws.onclose = function() {
                                isConnected = false;
                                showDisconnectedState();
                            };
                            
                            ws.onerror = function(error) {
                                isConnected = false;
                                showDisconnectedState(true);
                            };
                            
                            showDisconnectedState();
                        </script>
                    </body>
                    </html>
                `);
            });
            
            // Manejar conexiones WebSocket
            this.wsServer.on('connection', (ws) => {
                console.log('Cliente conectado al Live Session Monitor');
                this.clients.push(ws);
                
                ws.on('close', () => {
                    console.log('Cliente desconectado del Live Session Monitor');
                    this.clients = this.clients.filter(client => client !== ws);
                });
                
                ws.on('error', (error) => {
                    console.error('Error en WebSocket client:', error);
                    this.clients = this.clients.filter(client => client !== ws);
                });
            });
            
            // Encontrar puerto disponible
            this.server.listen(0, 'localhost', () => {
                this.serverPort = this.server.address().port;
                console.log(`Live Session Monitor server iniciado en puerto ${this.serverPort}`);
                resolve(this.serverPort);
            });
            
            this.server.on('error', (error) => {
                console.error('Error iniciando servidor Live Session Monitor:', error);
                reject(error);
            });
        });
    }

    /**
     * Crea un túnel público usando localtunnel
     * @returns {Promise<string>} - URL pública del túnel
     */
    async createPublicTunnel() {
        try {
            console.log(`Creando túnel público para puerto ${this.serverPort}...`);
            
            this.tunnel = await localtunnel({
                port: this.serverPort,
                subdomain: `lsm-${Date.now()}` // Subdomain único
            });
            
            this.publicUrl = this.tunnel.url;
            console.log(`Túnel público creado: ${this.publicUrl}`);
            
            // Manejar eventos del túnel
            this.tunnel.on('close', () => {
                console.log('Túnel público cerrado');
                this.publicUrl = null;
            });
            
            this.tunnel.on('error', (error) => {
                console.error('Error en túnel público:', error);
            });
            
            return this.publicUrl;
            
        } catch (error) {
            console.error('Error creando túnel público:', error);
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
            const checkInterval = 1000; // Verificar cada segundo
            
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
                        console.log(`Ventana del juego encontrada: ${gameWindow.name} (ID: ${gameWindow.id})`);
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
     * Inicia la captura de video de la ventana del juego
     * @param {string} sourceId - ID de la fuente de captura
     */
    async startVideoCapture(sourceId) {
        try {
            // Obtener stream de la ventana del juego
            this.videoStream = await navigator.mediaDevices.getUserMedia({
                audio: false, // No capturar audio por privacidad
                video: {
                    mandatory: {
                        chromeMediaSource: 'desktop',
                        chromeMediaSourceId: sourceId,
                        minWidth: 640,
                        maxWidth: 1920,
                        minHeight: 480,
                        maxHeight: 1080,
                        minFrameRate: 10,
                        maxFrameRate: this.frameRate
                    }
                }
            });
            
            console.log('Stream de video iniciado correctamente');
            
            // Crear elemento video para procesar frames
            const video = document.createElement('video');
            video.srcObject = this.videoStream;
            video.play();
            
            // Crear canvas para capturar frames
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            // Configurar dimensiones del canvas cuando el video esté listo
            video.addEventListener('loadedmetadata', () => {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                console.log(`Dimensiones de captura: ${canvas.width}x${canvas.height}`);
            });
            
            // Iniciar captura de frames con métricas mejoradas
            const captureFrame = () => {
                if (!this.isMonitoring) return;
                
                try {
                    if (video.readyState === video.HAVE_ENOUGH_DATA) {
                        // Dibujar frame actual en el canvas
                        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                        
                        // Convertir a blob JPEG
                        canvas.toBlob((blob) => {
                            if (blob && this.clients.length > 0) {
                                // Actualizar métricas
                                this.metrics.framesSent++;
                                this.metrics.bytesTransferred += blob.size;
                                
                                // Enviar frame a todos los clientes conectados
                                let successfulSends = 0;
                                this.clients.forEach(client => {
                                    if (client.readyState === client.OPEN) {
                                        try {
                                            client.send(blob);
                                            successfulSends++;
                                        } catch (error) {
                                            LiveSessionUtils.log('warn', 'Error enviando frame a cliente', { 
                                                error: error.message 
                                            });
                                            this.metrics.framesDropped++;
                                        }
                                    }
                                });
                                
                                // Actualizar métricas de clientes activos
                                this.metrics.clientsConnected = successfulSends;
                                
                                // Actualizar métricas throttled
                                this.throttledUpdateMetrics();
                            } else if (blob) {
                                // Frame generado pero no hay clientes conectados
                                this.metrics.framesSent++;
                            }
                        }, 'image/jpeg', this.quality);
                    }
                } catch (error) {
                    LiveSessionUtils.log('error', 'Error capturando frame', { 
                        error: error.message 
                    });
                    this.metrics.errors++;
                    this.metrics.framesDropped++;
                }
                
                // Programar siguiente frame
                setTimeout(captureFrame, 1000 / this.frameRate);
            };
            
            // Iniciar captura cuando el video esté listo
            video.addEventListener('canplay', () => {
                console.log('Iniciando captura de frames...');
                captureFrame();
            });
            
        } catch (error) {
            console.error('Error iniciando captura de video:', error);
            throw error;
        }
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
            
            // Cargar configuración antes de continuar
            await this.loadConfig();
            
            LiveSessionUtils.log('info', 'Iniciando Live Session Monitor', { instanceName });
            
            // Generar ID de sesión único
            this.sessionId = LiveSessionUtils.generateSessionId(instanceName);
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
            
            // 1. Iniciar servidor local con retry automático
            await LiveSessionUtils.retry(async () => {
                await this.startLocalServer();
            }, this.config.server?.maxRetries || 3, 2000);
            
            // 2. Crear túnel público con retry
            const publicUrl = await LiveSessionUtils.retry(async () => {
                return await this.createPublicTunnel();
            }, this.config.tunnel?.retryAttempts || 3, this.config.tunnel?.retryDelay || 5000);
            
            // 3. Buscar ventana del juego (con retraso para que se abra)
            LiveSessionUtils.log('info', 'Esperando a que se abra la ventana del juego...');
            setTimeout(async () => {
                try {
                    const gameWindow = await this.findGameWindow(instanceName);
                    this.gameWindowId = gameWindow.id;
                    
                    // 4. Iniciar captura de video
                    await this.startVideoCapture(gameWindow.id);
                    
                    LiveSessionUtils.log('info', 'Live Session Monitor completamente activo', { 
                        publicUrl, 
                        sessionId: this.sessionId 
                    });
                    
                } catch (error) {
                    LiveSessionUtils.log('error', 'Error configurando captura de video', { 
                        error: error.message 
                    });
                    this.metrics.errors++;
                }
            }, 3000); // Esperar 3 segundos para que se abra el juego
            
            return publicUrl;
            
        } catch (error) {
            LiveSessionUtils.log('error', 'Error iniciando Live Session Monitor', { 
                error: error.message 
            });
            this.metrics.errors++;
            await this.stopMonitoring();
            throw error;
        }
    }

    /**
     * Actualiza las métricas de rendimiento
     */
    updateMetrics() {
        if (!this.isMonitoring) return;
        
        const duration = Date.now() - this.startTime;
        const quality = LiveSessionUtils.calculateStreamQuality({
            framesSent: this.metrics.framesSent,
            framesDropped: this.metrics.framesDropped,
            bytesTransferred: this.metrics.bytesTransferred,
            duration: duration,
            clientsConnected: this.clients.length
        });
        
        LiveSessionUtils.log('debug', 'Métricas actualizadas', {
            sessionId: this.sessionId,
            duration: LiveSessionUtils.formatDuration(duration),
            quality: quality,
            clients: this.clients.length
        });
        
        // Enviar métricas a la interfaz web si hay clientes conectados
        if (this.clients.length > 0) {
            const metricsData = JSON.stringify({
                type: 'metrics',
                data: {
                    ...quality,
                    duration: LiveSessionUtils.formatDuration(duration),
                    clients: this.clients.length,
                    sessionId: this.sessionId
                }
            });
            
            this.clients.forEach(client => {
                if (client.readyState === client.OPEN) {
                    client.send(metricsData);
                }
            });
        }
    }

    /**
     * Obtiene métricas detalladas del monitoreo
     * @returns {Object} - Métricas completas
     */
    getDetailedMetrics() {
        const duration = this.startTime ? Date.now() - this.startTime : 0;
        const quality = LiveSessionUtils.calculateStreamQuality({
            framesSent: this.metrics.framesSent,
            framesDropped: this.metrics.framesDropped,
            bytesTransferred: this.metrics.bytesTransferred,
            duration: duration,
            clientsConnected: this.clients.length
        });
        
        return {
            sessionInfo: {
                sessionId: this.sessionId,
                instanceName: this.instanceName,
                startTime: this.startTime,
                duration: duration,
                durationFormatted: LiveSessionUtils.formatDuration(duration)
            },
            streamInfo: {
                isActive: this.isMonitoring,
                publicUrl: this.publicUrl,
                serverPort: this.serverPort,
                gameWindowId: this.gameWindowId
            },
            clients: {
                connected: this.clients.length,
                maxAllowed: this.config.server.maxClients
            },
            performance: quality,
            metrics: {
                ...this.metrics,
                bytesTransferredFormatted: LiveSessionUtils.formatDataSize(this.metrics.bytesTransferred)
            },
            systemInfo: LiveSessionUtils.getSystemInfo()
        };
    }

    /**
     * Detiene el monitoreo de la sesión
     */
    async stopMonitoring() {
        console.log('Deteniendo Live Session Monitor...');
        
        this.isMonitoring = false;
        
        // Detener stream de video
        if (this.videoStream) {
            this.videoStream.getTracks().forEach(track => track.stop());
            this.videoStream = null;
        }
        
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
        
        console.log('Live Session Monitor detenido');
    }

    /**
     * Obtiene el estado actual del monitoreo
     * @returns {Object} - Estado del monitoreo
     */
    getStatus() {
        return {
            isMonitoring: this.isMonitoring,
            publicUrl: this.publicUrl,
            serverPort: this.serverPort,
            clientsConnected: this.clients.length,
            instanceName: this.instanceName,
            gameWindowId: this.gameWindowId
        };
    }

    /**
     * Notifica la URL del stream a los administradores
     * @param {string} publicUrl - URL pública del stream
     * @param {string} instanceName - Nombre de la instancia
     */
    async notifyAdministrators(publicUrl, instanceName) {
        try {
            // Enviar notificación al servidor principal
            const { config } = require('../utils.js');
            const serverConfig = await config.GetConfig();
            
            if (serverConfig.live_session_webhook) {
                const payload = {
                    instance: instanceName,
                    stream_url: publicUrl,
                    timestamp: new Date().toISOString(),
                    status: 'started'
                };
                
                // Enviar webhook notification
                fetch(serverConfig.live_session_webhook, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(payload)
                }).catch(error => {
                    console.warn('Error enviando notificación de Live Session Monitor:', error);
                });
            }
            
        } catch (error) {
            console.warn('Error notificando administradores:', error);
        }
    }
}

// Instancia global del monitor
let globalMonitor = null;

/**
 * Obtiene la instancia global del monitor
 * @param {string} instanceName - Nombre de la instancia (opcional)
 * @returns {LiveSessionMonitor}
 */
function getGlobalMonitor(instanceName = null) {
    if (!globalMonitor || (instanceName && globalMonitor.instanceName !== instanceName)) {
        globalMonitor = new LiveSessionMonitor(instanceName);
    }
    return globalMonitor;
}

/**
 * Inicia el Live Session Monitor para una instancia si está habilitado
 * @param {Object} instance - Configuración de la instancia
 * @returns {Promise<string|null>} - URL del stream o null si no está habilitado
 */
async function startLiveSessionMonitorIfEnabled(instance) {
    try {
        // Validar instancia
        const validation = LiveSessionUtils.validateInstanceForLSM(instance);
        if (!validation.isValid) {
            throw new Error(`Instancia inválida: ${validation.errors.join(', ')}`);
        }
        
        if (validation.warnings.length > 0) {
            LiveSessionUtils.log('warn', 'Advertencias de instancia', { warnings: validation.warnings });
        }
        
        if (!LiveSessionMonitor.isLiveSessionEnabled(instance)) {
            LiveSessionUtils.log('debug', 'Live Session Monitor no habilitado para esta instancia', { 
                instanceName: instance.name 
            });
            return null;
        }
        
        const monitor = getGlobalMonitor(instance.name);
        
        // Mostrar diálogo de consentimiento
        LiveSessionUtils.log('info', 'Solicitando consentimiento del usuario', { 
            instanceName: instance.name 
        });
        
        const userConsent = await monitor.showConsentDialog();
        if (!userConsent) {
            LiveSessionUtils.log('warn', 'Usuario rechazó el consentimiento para monitoreo', { 
                instanceName: instance.name 
            });
            throw new Error('El usuario no aceptó el monitoreo en vivo');
        }
        
        LiveSessionUtils.log('info', 'Usuario aceptó el consentimiento, iniciando monitoreo', { 
            instanceName: instance.name 
        });
        
        // Iniciar monitoreo
        const streamUrl = await monitor.startMonitoring(instance.name);
        
        // Notificar a administradores
        await monitor.notifyAdministrators(streamUrl, instance.name);
        
        LiveSessionUtils.log('info', 'Live Session Monitor iniciado exitosamente', { 
            instanceName: instance.name,
            streamUrl,
            sessionId: monitor.sessionId
        });
        
        return streamUrl;
        
    } catch (error) {
        LiveSessionUtils.log('error', 'Error iniciando Live Session Monitor', { 
            instanceName: instance?.name,
            error: error.message 
        });
        throw error;
    }
}

/**
 * Detiene el Live Session Monitor global
 */
async function stopLiveSessionMonitor() {
    if (globalMonitor) {
        const sessionInfo = {
            instanceName: globalMonitor.instanceName,
            sessionId: globalMonitor.sessionId,
            duration: globalMonitor.startTime ? Date.now() - globalMonitor.startTime : 0
        };
        
        LiveSessionUtils.log('info', 'Deteniendo Live Session Monitor', sessionInfo);
        
        await globalMonitor.stopMonitoring();
        
        // Generar reporte final de sesión
        if (sessionInfo.duration > 0) {
            const finalMetrics = globalMonitor.getDetailedMetrics();
            LiveSessionUtils.log('info', 'Sesión finalizada', {
                ...sessionInfo,
                durationFormatted: LiveSessionUtils.formatDuration(sessionInfo.duration),
                finalMetrics: finalMetrics.performance
            });
        }
    }
}

/**
 * Obtiene el estado del Live Session Monitor
 * @returns {Object} - Estado del monitoreo
 */
function getLiveSessionMonitorStatus() {
    if (!globalMonitor) {
        return { 
            isMonitoring: false,
            error: 'Monitor no inicializado'
        };
    }
    
    const basicStatus = globalMonitor.getStatus();
    const detailedMetrics = globalMonitor.getDetailedMetrics();
    
    return {
        ...basicStatus,
        ...detailedMetrics,
        lastUpdated: new Date().toISOString()
    };
}

// Exportar con ES modules
export {
    LiveSessionMonitor,
    getGlobalMonitor,
    startLiveSessionMonitorIfEnabled,
    stopLiveSessionMonitor,
    getLiveSessionMonitorStatus
};
