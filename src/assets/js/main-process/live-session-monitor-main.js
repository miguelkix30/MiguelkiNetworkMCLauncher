/**
 * @author Miguel
 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0
 * 
 * Live Session Monitor - Main Process
 * Sistema de monitoreo en tiempo real de sesiones de juego (Main Process)
 */

const { desktopCapturer, BrowserWindow, shell, dialog } = require('electron');
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { pinggy } = require('@pinggy/pinggy');

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
        this.frameRate = 20; // 20 FPS para mejor rendimiento
        this.quality = 0.7;
        this.captureTimeout = 30000; // Aumentado a 30 segundos
        this.primaryScreenId = null; // ID de la pantalla principal
        
        // Sistema de bitrate adaptativo
        this.bitrateController = {
            targetBitrate: 1000, // kbps objetivo inicial
            currentQuality: 0.7, // Calidad JPEG actual
            currentResolution: { width: 1280, height: 720 }, // Resolución actual
            adaptiveEnabled: true, // Habilitar adaptación automática
            maxBitrate: 2000, // kbps máximo
            minBitrate: 200, // kbps mínimo
            maxQuality: 0.9, // Calidad máxima
            minQuality: 0.3, // Calidad mínima
            resolutionLevels: [ // Niveles de resolución disponibles
                { width: 1920, height: 1080, name: '1080p' },
                { width: 1280, height: 720, name: '720p' },
                { width: 854, height: 480, name: '480p' },
                { width: 640, height: 360, name: '360p' }
            ],
            adaptationHistory: [], // Historial de adaptaciones
            lastAdaptation: 0 // Timestamp de última adaptación
        };
        
        // Sistema de optimización avanzada
        this.optimizationEngine = {
            // Compresión diferencial
            differentialCompression: {
                enabled: true,
                previousFrame: null,
                changeThreshold: 0.15, // 15% de cambio para enviar frame completo
                regionSize: 64, // Tamaño de regiones para análisis (64x64)
                skipFrameCount: 0, // Frames consecutivos saltados
                maxSkipFrames: 5 // Máximo frames que se pueden saltar
            },
            
            // Detección de movimiento
            motionDetection: {
                enabled: true,
                sensitivity: 0.1, // Sensibilidad de detección (10%)
                motionLevel: 0, // Nivel actual de movimiento (0-1)
                historicalMotion: [], // Historial de niveles de movimiento
                staticFrameCount: 0, // Frames consecutivos sin movimiento
                maxStaticFrames: 60 // Reducir FPS después de 60 frames estáticos (3s)
            },
            
            // Análisis de contenido
            contentAnalysis: {
                enabled: true,
                complexity: 0, // Complejidad visual actual (0-1)
                textRegions: [], // Regiones con texto detectado
                lastAnalysis: 0, // Timestamp del último análisis
                analysisInterval: 5000 // Analizar cada 5 segundos
            },
            
            // Buffer adaptativo por cliente
            clientBuffering: {
                enabled: true,
                bufferSizes: new Map(), // Tamaño de buffer por cliente
                maxBufferSize: 5, // Máximo 5 frames buffereados
                dropThreshold: 3, // Empezar a dropear frames si buffer > 3
                adaptiveClients: new Map() // Configuración adaptativa por cliente
            }
        };
        
        // Métricas de rendimiento extendidas
        this.metrics = {
            framesSent: 0,
            framesDropped: 0,
            framesDifferential: 0, // Frames enviados como diferencial
            framesSkipped: 0, // Frames completamente saltados
            bytesTransferred: 0,
            bytesSaved: 0, // Bytes ahorrados por optimizaciones
            clientsConnected: 0,
            errors: 0,
            averageFrameSize: 0,
            currentBitrate: 0,
            targetBitrate: 1000,
            compressionRatio: 0,
            networkLatency: 0,
            adaptationEvents: 0,
            motionEvents: 0, // Eventos de movimiento detectados
            staticPeriods: 0, // Períodos estáticos detectados
            compressionEfficiency: 0 // Eficiencia de compresión (%)
        };
        
        // Buffer de análisis de rendimiento
        this.performanceBuffer = {
            frameSizes: [], // Últimos 30 frames
            sendTimes: [], // Tiempos de envío
            networkStats: [], // Estadísticas de red
            motionHistory: [], // Historial de movimiento
            compressionStats: [], // Estadísticas de compresión
            maxBufferSize: 30
        };
        
        console.log('[LSM] LiveSessionMonitorMain inicializado');
    }

    /**
     * Detecta y configura la pantalla principal para captura
     */
    async detectPrimaryScreen() {
        try {
            console.log('[LSM] 🖥️ Detectando pantalla principal...');
            
            const sources = await desktopCapturer.getSources({
                types: ['screen'],
                thumbnailSize: { width: 1280, height: 720 }
            });
            
            if (sources.length === 0) {
                throw new Error('No se encontraron pantallas disponibles');
            }
            
            // Buscar pantalla principal (normalmente la primera o que contenga "screen 1")
            let primaryScreen = sources.find(source => 
                source.name.toLowerCase().includes('screen 1') ||
                source.name.toLowerCase().includes('principal') ||
                source.name.toLowerCase().includes('primary') ||
                source.name.toLowerCase().includes('entire screen')
            );
            
            // Si no se encuentra, usar la primera pantalla
            if (!primaryScreen) {
                primaryScreen = sources[0];
            }
            
            this.primaryScreenId = primaryScreen.id;
            console.log(`[LSM] ✅ Pantalla principal detectada: "${primaryScreen.name}" (ID: ${primaryScreen.id})`);
            
            if (sources.length > 1) {
                console.log(`[LSM] 🖥️ Se encontraron ${sources.length} pantallas, usando la principal`);
                sources.forEach((screen, index) => {
                    console.log(`[LSM]    ${index + 1}. "${screen.name}"${screen.id === this.primaryScreenId ? ' ← Principal' : ''}`);
                });
            }
            
            return primaryScreen;
            
        } catch (error) {
            console.error('[LSM] ❌ Error detectando pantalla principal:', error);
            throw error;
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
     * Sistema de bitrate adaptativo - Analiza el rendimiento y ajusta la calidad
     */
    async adaptBitrate() {
        if (!this.bitrateController.adaptiveEnabled || 
            Date.now() - this.bitrateController.lastAdaptation < 5000) {
            return; // No adaptar muy frecuentemente
        }

        try {
            // Calcular métricas actuales
            const avgFrameSize = this.performanceBuffer.frameSizes.length > 0 ? 
                this.performanceBuffer.frameSizes.reduce((a, b) => a + b, 0) / this.performanceBuffer.frameSizes.length : 0;
            
            const currentBitrate = (avgFrameSize * this.frameRate * 8) / 1000; // kbps
            const targetBitrate = this.bitrateController.targetBitrate;
            
            // Calcular métricas de red
            const droppedFrameRatio = this.metrics.framesDropped / (this.metrics.framesSent + this.metrics.framesDropped);
            const networkCongestion = droppedFrameRatio > 0.05; // 5% de frames perdidos indica congestión
            
            let needsAdjustment = false;
            let adjustmentReason = '';
            
            // Lógica de adaptación
            if (currentBitrate > targetBitrate * 1.3 && networkCongestion) {
                // Reducir calidad si excede el target y hay congestión
                await this.reduceQuality();
                needsAdjustment = true;
                adjustmentReason = 'Alta congestión de red';
            } else if (currentBitrate < targetBitrate * 0.7 && !networkCongestion && droppedFrameRatio < 0.01) {
                // Aumentar calidad si hay margen y red estable
                await this.increaseQuality();
                needsAdjustment = true;
                adjustmentReason = 'Red estable, mejorando calidad';
            } else if (this.clients.length > 5) {
                // Reducir calidad con muchos clientes
                await this.reduceQuality();
                needsAdjustment = true;
                adjustmentReason = `Múltiples clientes (${this.clients.length})`;
            }
            
            if (needsAdjustment) {
                this.bitrateController.lastAdaptation = Date.now();
                this.metrics.adaptationEvents++;
                
                // Registrar adaptación
                this.bitrateController.adaptationHistory.push({
                    timestamp: Date.now(),
                    previousBitrate: currentBitrate,
                    newTargetBitrate: this.bitrateController.targetBitrate,
                    quality: this.bitrateController.currentQuality,
                    resolution: `${this.bitrateController.currentResolution.width}x${this.bitrateController.currentResolution.height}`,
                    reason: adjustmentReason,
                    clientsConnected: this.clients.length,
                    droppedFrameRatio: droppedFrameRatio
                });
                
                console.log(`[LSM] 🎯 Bitrate adaptado: ${adjustmentReason}`);
                console.log(`[LSM] 📊 Calidad: ${Math.round(this.bitrateController.currentQuality * 100)}%, Resolución: ${this.bitrateController.currentResolution.width}x${this.bitrateController.currentResolution.height}`);
            }
            
            // Actualizar métricas
            this.metrics.currentBitrate = currentBitrate;
            this.metrics.targetBitrate = this.bitrateController.targetBitrate;
            this.metrics.averageFrameSize = avgFrameSize;
            this.metrics.compressionRatio = avgFrameSize > 0 ? 
                (this.bitrateController.currentResolution.width * this.bitrateController.currentResolution.height * 3) / avgFrameSize : 0;
            
        } catch (error) {
            console.error('[LSM] Error en adaptación de bitrate:', error);
        }
    }

    /**
     * Reduce la calidad de transmisión
     */
    async reduceQuality() {
        const controller = this.bitrateController;
        
        // Primero intentar reducir calidad JPEG
        if (controller.currentQuality > controller.minQuality + 0.1) {
            controller.currentQuality = Math.max(controller.currentQuality - 0.1, controller.minQuality);
            console.log(`[LSM] 📉 Calidad JPEG reducida a ${Math.round(controller.currentQuality * 100)}%`);
            return;
        }
        
        // Si la calidad ya es mínima, reducir resolución
        const currentResIndex = controller.resolutionLevels.findIndex(level => 
            level.width === controller.currentResolution.width && 
            level.height === controller.currentResolution.height
        );
        
        if (currentResIndex < controller.resolutionLevels.length - 1) {
            const newResolution = controller.resolutionLevels[currentResIndex + 1];
            controller.currentResolution = newResolution;
            controller.currentQuality = Math.min(controller.currentQuality + 0.1, controller.maxQuality); // Compensar con más calidad
            console.log(`[LSM] 📉 Resolución reducida a ${newResolution.name} (${newResolution.width}x${newResolution.height})`);
        }
    }

    /**
     * Aumenta la calidad de transmisión
     */
    async increaseQuality() {
        const controller = this.bitrateController;
        
        // Primero intentar aumentar resolución si no está al máximo
        const currentResIndex = controller.resolutionLevels.findIndex(level => 
            level.width === controller.currentResolution.width && 
            level.height === controller.currentResolution.height
        );
        
        if (currentResIndex > 0) {
            const newResolution = controller.resolutionLevels[currentResIndex - 1];
            controller.currentResolution = newResolution;
            console.log(`[LSM] 📈 Resolución aumentada a ${newResolution.name} (${newResolution.width}x${newResolution.height})`);
            return;
        }
        
        // Si la resolución ya es máxima, aumentar calidad JPEG
        if (controller.currentQuality < controller.maxQuality - 0.05) {
            controller.currentQuality = Math.min(controller.currentQuality + 0.05, controller.maxQuality);
            console.log(`[LSM] 📈 Calidad JPEG aumentada a ${Math.round(controller.currentQuality * 100)}%`);
        }
    }

    /**
     * Optimiza el frame antes de enviarlo con técnicas avanzadas
     * @param {Buffer} jpegData - Datos JPEG del frame
     * @param {Object} thumbnail - Thumbnail de Electron para análisis
     * @returns {Object} - Frame optimizado con metadatos
     */
    async optimizeFrame(jpegData, thumbnail) {
        try {
            const startTime = Date.now();
            let optimizedData = jpegData;
            let frameType = 'full'; // 'full', 'differential', 'skip'
            let bytesSaved = 0;
            
            // 1. Detección de movimiento
            const motionResult = await this.detectMotion(thumbnail);
            this.optimizationEngine.motionDetection.motionLevel = motionResult.motionLevel;
            
            // 2. Análisis de contenido (cada 5 segundos)
            if (Date.now() - this.optimizationEngine.contentAnalysis.lastAnalysis > 
                this.optimizationEngine.contentAnalysis.analysisInterval) {
                await this.analyzeContent(thumbnail);
            }
            
            // 3. Compresión diferencial si está habilitada
            if (this.optimizationEngine.differentialCompression.enabled) {
                const diffResult = await this.applyDifferentialCompression(jpegData, thumbnail, motionResult);
                if (diffResult.shouldSkip) {
                    // FIX: Nunca saltar frames para debugging
                    console.log('[LSM] 🔧 Frame skip deshabilitado para debugging');
                    frameType = 'full';
                    // this.metrics.framesSkipped++;
                    // return { data: null, type: frameType, bytesSaved: jpegData.length, processingTime: Date.now() - startTime };
                } else if (diffResult.optimizedData) {
                    optimizedData = diffResult.optimizedData;
                    frameType = 'differential';
                    bytesSaved = jpegData.length - optimizedData.length;
                    this.metrics.framesDifferential++;
                }
            }
            
            // 4. Registro de estadísticas
            this.performanceBuffer.frameSizes.push(optimizedData.length);
            this.performanceBuffer.compressionStats.push({
                original: jpegData.length,
                compressed: optimizedData.length,
                ratio: optimizedData.length / jpegData.length,
                type: frameType,
                motion: motionResult.motionLevel
            });
            
            // Mantener buffer limitado
            if (this.performanceBuffer.frameSizes.length > this.performanceBuffer.maxBufferSize) {
                this.performanceBuffer.frameSizes.shift();
                this.performanceBuffer.compressionStats.shift();
            }
            
            // 5. Actualizar métricas
            this.metrics.bytesSaved += bytesSaved;
            const avgCompression = this.performanceBuffer.compressionStats.reduce((sum, stat) => sum + stat.ratio, 0) / 
                                   this.performanceBuffer.compressionStats.length;
            this.metrics.compressionEfficiency = Math.round((1 - avgCompression) * 100);
            
            const processingTime = Date.now() - startTime;
            
            return {
                data: optimizedData,
                type: frameType,
                bytesSaved: bytesSaved,
                processingTime: processingTime,
                motionLevel: motionResult.motionLevel,
                quality: this.bitrateController.currentQuality
            };
            
        } catch (error) {
            console.error('[LSM] Error optimizando frame:', error);
            return {
                data: jpegData,
                type: 'full',
                bytesSaved: 0,
                processingTime: 0,
                motionLevel: 0,
                quality: this.bitrateController.currentQuality
            };
        }
    }

    /**
     * Detecta movimiento comparando el frame actual con el anterior
     * @param {Object} thumbnail - Thumbnail actual
     * @returns {Object} - Resultado de detección de movimiento
     */
    async detectMotion(thumbnail) {
        try {
            const motionEngine = this.optimizationEngine.motionDetection;
            
            if (!motionEngine.enabled || !thumbnail) {
                return { motionLevel: 0.5, hasMotion: true }; // Asumir movimiento si no se puede detectar
            }
            
            // Convertir thumbnail a datos binarios para comparación
            const currentData = thumbnail.toBitmap();
            let motionLevel = 0;
            
            if (motionEngine.previousFrameData) {
                // Comparar con frame anterior usando muestreo
                const samplePoints = 100; // Puntos de muestreo
                const stride = Math.floor(currentData.length / samplePoints);
                let differences = 0;
                
                for (let i = 0; i < currentData.length; i += stride) {
                    if (i < motionEngine.previousFrameData.length) {
                        const diff = Math.abs(currentData[i] - motionEngine.previousFrameData[i]);
                        if (diff > 30) { // Threshold para considerar cambio significativo
                            differences++;
                        }
                    }
                }
                
                motionLevel = differences / samplePoints;
            }
            
            // Actualizar datos del frame anterior
            motionEngine.previousFrameData = currentData;
            
            // Actualizar historial
            motionEngine.historicalMotion.push(motionLevel);
            if (motionEngine.historicalMotion.length > 10) {
                motionEngine.historicalMotion.shift();
            }
            
            // Determinar si hay movimiento significativo
            const hasMotion = motionLevel > motionEngine.sensitivity;
            
            if (hasMotion) {
                motionEngine.staticFrameCount = 0;
                this.metrics.motionEvents++;
            } else {
                motionEngine.staticFrameCount++;
                if (motionEngine.staticFrameCount >= motionEngine.maxStaticFrames) {
                    this.metrics.staticPeriods++;
                }
            }
            
            return {
                motionLevel: motionLevel,
                hasMotion: hasMotion,
                staticFrameCount: motionEngine.staticFrameCount,
                avgMotion: motionEngine.historicalMotion.reduce((sum, val) => sum + val, 0) / motionEngine.historicalMotion.length
            };
            
        } catch (error) {
            console.error('[LSM] Error detectando movimiento:', error);
            return { motionLevel: 0.5, hasMotion: true };
        }
    }

    /**
     * Aplica compresión diferencial basada en cambios entre frames
     * @param {Buffer} jpegData - Datos del frame actual
     * @param {Object} thumbnail - Thumbnail actual
     * @param {Object} motionResult - Resultado de detección de movimiento
     * @returns {Object} - Resultado de compresión diferencial
     */
    async applyDifferentialCompression(jpegData, thumbnail, motionResult) {
        try {
            const diffEngine = this.optimizationEngine.differentialCompression;
            
            // Si no hay frame anterior, enviar completo
            if (!diffEngine.previousFrame) {
                diffEngine.previousFrame = jpegData;
                return { shouldSkip: false, optimizedData: jpegData };
            }
            
            // Si hay muy poco movimiento, considerar saltear frame
            if (motionResult.motionLevel < diffEngine.changeThreshold) {
                diffEngine.skipFrameCount++;
                
                // Forzar envío después de cierto número de frames saltados
                if (diffEngine.skipFrameCount >= diffEngine.maxSkipFrames) {
                    diffEngine.skipFrameCount = 0;
                    diffEngine.previousFrame = jpegData;
                    return { shouldSkip: false, optimizedData: jpegData };
                }
                
                return { shouldSkip: true };
            }
            
            // Resetear contador de frames saltados
            diffEngine.skipFrameCount = 0;
            
            // Para frames con movimiento, usar compresión normal pero adaptativa
            const motionMultiplier = Math.max(0.5, 1 - motionResult.motionLevel);
            const adaptiveQuality = this.bitrateController.currentQuality * motionMultiplier;
            
            // Recomprimir con calidad adaptativa basada en movimiento
            const recompressedData = thumbnail.toJPEG(Math.round(adaptiveQuality * 100));
            
            // Actualizar frame anterior
            diffEngine.previousFrame = jpegData;
            
            return {
                shouldSkip: false,
                optimizedData: recompressedData,
                qualityUsed: adaptiveQuality
            };
            
        } catch (error) {
            console.error('[LSM] Error en compresión diferencial:', error);
            return { shouldSkip: false, optimizedData: jpegData };
        }
    }

    /**
     * Analiza el contenido del frame para optimizaciones específicas
     * @param {Object} thumbnail - Thumbnail para análisis
     */
    async analyzeContent(thumbnail) {
        try {
            const contentEngine = this.optimizationEngine.contentAnalysis;
            
            if (!contentEngine.enabled || !thumbnail) {
                return;
            }
            
            // Análisis básico de complejidad visual
            const bitmapData = thumbnail.toBitmap();
            let complexity = 0;
            
            // Calcular variación en el contenido (simplicidad vs complejidad)
            const sampleSize = Math.min(1000, bitmapData.length / 4);
            const stride = Math.floor(bitmapData.length / sampleSize);
            let variations = 0;
            
            for (let i = stride; i < bitmapData.length; i += stride) {
                const diff = Math.abs(bitmapData[i] - bitmapData[i - stride]);
                if (diff > 20) variations++;
            }
            
            complexity = variations / sampleSize;
            contentEngine.complexity = complexity;
            
            // Ajustar calidad base basada en complejidad
            if (complexity > 0.7) {
                // Contenido complejo - mantener alta calidad
                this.bitrateController.currentQuality = Math.min(
                    this.bitrateController.currentQuality * 1.1,
                    this.bitrateController.maxQuality
                );
            } else if (complexity < 0.3) {
                // Contenido simple - puede usar menor calidad
                this.bitrateController.currentQuality = Math.max(
                    this.bitrateController.currentQuality * 0.9,
                    this.bitrateController.minQuality
                );
            }
            
            contentEngine.lastAnalysis = Date.now();
            
        } catch (error) {
            console.error('[LSM] Error analizando contenido:', error);
        }
    }

    /**
     * Gestiona buffering adaptativo por cliente
     * @param {Object} client - Cliente WebSocket
     * @param {Buffer} frameData - Datos del frame
     * @param {Object} frameInfo - Información del frame
     */
    async manageClientBuffering(client, frameData, frameInfo) {
        try {
            const bufferEngine = this.optimizationEngine.clientBuffering;
            
            if (!bufferEngine.enabled) {
                return this.sendToClient(client, frameData, frameInfo);
            }
            
            const clientId = client._socket?.remoteAddress + ':' + client._socket?.remotePort || 'unknown';
            
            // Inicializar buffer para cliente si no existe
            if (!bufferEngine.bufferSizes.has(clientId)) {
                bufferEngine.bufferSizes.set(clientId, 0);
                bufferEngine.adaptiveClients.set(clientId, {
                    droppedFrames: 0,
                    sentFrames: 0,
                    lastSend: Date.now(),
                    adaptiveQuality: 1.0,
                    priority: frameInfo.type === 'full' ? 1 : (frameInfo.type === 'differential' ? 0.8 : 0.5)
                });
            }
            
            const clientStats = bufferEngine.adaptiveClients.get(clientId);
            const currentBuffer = bufferEngine.bufferSizes.get(clientId);
            
            // Decidir si enviar o dropear frame basado en buffer y prioridad
            if (currentBuffer >= bufferEngine.dropThreshold) {
                if (frameInfo.type === 'skip' || (frameInfo.type === 'differential' && currentBuffer >= bufferEngine.maxBufferSize)) {
                    // Dropear frame de baja prioridad
                    clientStats.droppedFrames++;
                    return false;
                }
            }
            
            // Enviar frame y actualizar buffer
            const sent = await this.sendToClient(client, frameData, frameInfo);
            
            if (sent) {
                bufferEngine.bufferSizes.set(clientId, currentBuffer + 1);
                clientStats.sentFrames++;
                clientStats.lastSend = Date.now();
                
                // Simular reducción de buffer (en implementación real sería basado en ACKs)
                setTimeout(() => {
                    const newBuffer = Math.max(0, bufferEngine.bufferSizes.get(clientId) - 1);
                    bufferEngine.bufferSizes.set(clientId, newBuffer);
                }, 100); // Asumir 100ms de procesamiento por frame
            }
            
            return sent;
            
        } catch (error) {
            console.error('[LSM] Error gestionando buffer de cliente:', error);
            return this.sendToClient(client, frameData, frameInfo);
        }
    }

    /**
     * Envía frame a un cliente específico
     * @param {Object} client - Cliente WebSocket
     * @param {Buffer} frameData - Datos del frame
     * @param {Object} frameInfo - Información del frame
     * @returns {boolean} - true si se envió exitosamente
     */
    async sendToClient(client, frameData, frameInfo) {
        try {
            if (client.readyState !== WebSocket.OPEN) {
                return false;
            }
            
            // Validar frameInfo y proporcionar valores por defecto
            const safeFrameInfo = {
                type: frameInfo?.type || 'full',
                quality: frameInfo?.quality || this.bitrateController.currentQuality,
                motionLevel: frameInfo?.motionLevel || 0,
                bytesSaved: frameInfo?.bytesSaved || 0
            };
            
            // Enviar datos binarios directamente (más eficiente)
            // El frontend ya está preparado para manejar ArrayBuffer
            client.send(frameData);
            
            // Opcional: Enviar metadatos por separado si es necesario
            if (this.metrics.framesSent % 30 === 0) { // Cada 30 frames (~1.5s a 20fps)
                const metadataMessage = {
                    type: 'frame-metadata',
                    frameType: safeFrameInfo.type,
                    timestamp: Date.now(),
                    quality: Math.round(safeFrameInfo.quality * 100),
                    motionLevel: Math.round(safeFrameInfo.motionLevel * 100),
                    bytesSaved: safeFrameInfo.bytesSaved,
                    frameSize: frameData.length
                };
                
                try {
                    client.send(JSON.stringify(metadataMessage));
                } catch (metaError) {
                    // Si falla el envío de metadatos, no es crítico
                    console.warn('[LSM] Error enviando metadatos:', metaError.message);
                }
            }
            
            return true;
            
        } catch (error) {
            console.warn('[LSM] Error enviando a cliente:', error.message);
            return false;
        }
    }

    /**
     * Obtiene estadísticas detalladas de rendimiento
     * @returns {Object} - Estadísticas completas
     */
    getBitrateStats() {
        const avgFrameSize = this.performanceBuffer.frameSizes.length > 0 ? 
            this.performanceBuffer.frameSizes.reduce((a, b) => a + b, 0) / this.performanceBuffer.frameSizes.length : 0;
        
        const currentBitrate = (avgFrameSize * this.frameRate * 8) / 1000; // kbps
        
        return {
            bitrate: {
                current: Math.round(currentBitrate),
                target: this.bitrateController.targetBitrate,
                deviation: Math.round(((currentBitrate - this.bitrateController.targetBitrate) / this.bitrateController.targetBitrate) * 100)
            },
            quality: {
                jpeg: Math.round(this.bitrateController.currentQuality * 100),
                resolution: `${this.bitrateController.currentResolution.width}x${this.bitrateController.currentResolution.height}`,
                resolutionName: this.bitrateController.resolutionLevels.find(level => 
                    level.width === this.bitrateController.currentResolution.width
                )?.name || 'Custom'
            },
            performance: {
                averageFrameSize: Math.round(avgFrameSize / 1024), // KB
                compressionRatio: Math.round(this.metrics.compressionRatio * 100) / 100,
                droppedFrameRatio: Math.round((this.metrics.framesDropped / (this.metrics.framesSent + this.metrics.framesDropped)) * 100) || 0,
                adaptationEvents: this.metrics.adaptationEvents
            },
            network: {
                clientsConnected: this.clients.length,
                totalBytesTransferred: Math.round(this.metrics.bytesTransferred / 1024 / 1024 * 100) / 100, // MB
                avgBytesPerSecond: Math.round((this.metrics.bytesTransferred / ((Date.now() - this.startTime) / 1000)) / 1024) || 0 // KB/s
            }
        };
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
                        <p>Captura de pantalla principal en tiempo real - 20 FPS</p>
                        <p>Sesión ID: ${this.sessionId || 'N/A'}</p>
                    </div>
                    
                    <div id="status" class="status disconnected">
                        🔴 Desconectado - Esperando stream...
                    </div>
                    
                    <div class="video-container">
                        <img id="gameVideo" alt="Stream de pantalla" />
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
                        <div class="metric-card">
                            <div class="metric-value" id="bitrateCounter">0</div>
                            <div>Bitrate (kbps)</div>
                        </div>
                        <div class="metric-card">
                            <div class="metric-value" id="resolutionIndicator">-</div>
                            <div>Resolución</div>
                        </div>
                        <div class="metric-card">
                            <div class="metric-value" id="frameSizeIndicator">0</div>
                            <div>Tamaño Frame (KB)</div>
                        </div>
                        <div class="metric-card">
                            <div class="metric-value" id="droppedFrames">0</div>
                            <div>Frames Perdidos (%)</div>
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
                    const bitrateCounter = document.getElementById('bitrateCounter');
                    const resolutionIndicator = document.getElementById('resolutionIndicator');
                    const frameSizeIndicator = document.getElementById('frameSizeIndicator');
                    const droppedFrames = document.getElementById('droppedFrames');
                    
                    let frameCount = 0;
                    let lastFrameTime = Date.now();
                    let startTime = Date.now();
                    let lastMetrics = null;
                    
                    // Actualizar duración cada segundo
                    setInterval(() => {
                        const duration = Math.floor((Date.now() - startTime) / 1000);
                        const minutes = Math.floor(duration / 60);
                        const seconds = duration % 60;
                        durationCounter.textContent = minutes > 0 ? 
                            \`\${minutes}m \${seconds}s\` : \`\${seconds}s\`;
                    }, 1000);
                    
                    // Función para actualizar indicadores de calidad
                    function updateQualityIndicators(fps, bitrate, droppedRatio) {
                        // Indicador de calidad general basado en múltiples factores
                        let qualityScore = 0;
                        
                        // Factor FPS (40% del score)
                        if (fps >= 18) qualityScore += 40;
                        else if (fps >= 15) qualityScore += 30;
                        else if (fps >= 10) qualityScore += 20;
                        else qualityScore += 10;
                        
                        // Factor bitrate (30% del score) 
                        if (bitrate >= 800) qualityScore += 30;
                        else if (bitrate >= 500) qualityScore += 25;
                        else if (bitrate >= 300) qualityScore += 20;
                        else qualityScore += 10;
                        
                        // Factor frames perdidos (30% del score)
                        if (droppedRatio <= 1) qualityScore += 30;
                        else if (droppedRatio <= 3) qualityScore += 25;
                        else if (droppedRatio <= 5) qualityScore += 20;
                        else qualityScore += 10;
                        
                        // Determinar calidad final
                        if (qualityScore >= 90) {
                            qualityIndicator.textContent = 'Excelente';
                            qualityIndicator.style.color = '#4CAF50';
                        } else if (qualityScore >= 75) {
                            qualityIndicator.textContent = 'Buena';
                            qualityIndicator.style.color = '#FFC107';
                        } else if (qualityScore >= 60) {
                            qualityIndicator.textContent = 'Regular';
                            qualityIndicator.style.color = '#FF9800';
                        } else {
                            qualityIndicator.textContent = 'Pobre';
                            qualityIndicator.style.color = '#F44336';
                        }
                    }
                    
                    ws.onopen = function() {
                        statusDiv.className = 'status connected';
                        statusDiv.innerHTML = '🟢 Conectado - Recibiendo stream de pantalla';
                        startTime = Date.now();
                    };
                    
                    ws.onmessage = function(event) {
                        if (event.data instanceof Blob) {
                            // Crear URL para el blob JPEG
                            const url = URL.createObjectURL(event.data);
                            gameVideo.src = url;
                            
                            // Calcular FPS aproximado
                            frameCount++;
                            const now = Date.now();
                            if (now - lastFrameTime >= 1000) {
                                const fps = Math.round(frameCount * 1000 / (now - lastFrameTime));
                                fpsCounter.textContent = fps;
                                
                                // Actualizar tamaño del frame (estimado)
                                frameSizeIndicator.textContent = Math.round(event.data.size / 1024);
                                
                                // Usar métricas mejoradas si están disponibles
                                const bitrate = lastMetrics?.bitrate?.current || 0;
                                const droppedRatio = lastMetrics?.performance?.droppedFrameRatio || 0;
                                
                                updateQualityIndicators(fps, bitrate, droppedRatio);
                                
                                videoInfo.innerHTML = \`Recibiendo pantalla principal - \${fps} FPS, \${Math.round(event.data.size / 1024)}KB\`;
                                frameCount = 0;
                                lastFrameTime = now;
                            }
                            
                            // Limpiar URL anterior para evitar memory leaks
                            setTimeout(() => URL.revokeObjectURL(url), 100);
                            
                        } else if (event.data instanceof ArrayBuffer) {
                            // Manejar datos binarios directos (JPEG)
                            const blob = new Blob([event.data], { type: 'image/jpeg' });
                            const url = URL.createObjectURL(blob);
                            gameVideo.src = url;
                            
                            // Calcular FPS y tamaño
                            frameCount++;
                            const now = Date.now();
                            if (now - lastFrameTime >= 1000) {
                                const fps = Math.round(frameCount * 1000 / (now - lastFrameTime));
                                fpsCounter.textContent = fps;
                                
                                frameSizeIndicator.textContent = Math.round(event.data.byteLength / 1024);
                                
                                const bitrate = lastMetrics?.bitrate?.current || 0;
                                const droppedRatio = lastMetrics?.performance?.droppedFrameRatio || 0;
                                
                                updateQualityIndicators(fps, bitrate, droppedRatio);
                                
                                videoInfo.innerHTML = \`Recibiendo pantalla principal - \${fps} FPS, \${Math.round(event.data.byteLength / 1024)}KB\`;
                                frameCount = 0;
                                lastFrameTime = now;
                            }
                            
                            setTimeout(() => URL.revokeObjectURL(url), 100);
                            
                        } else if (typeof event.data === 'string') {
                            try {
                                const data = JSON.parse(event.data);
                                if (data.type === 'metrics') {
                                    lastMetrics = data.data;
                                    
                                    // Actualizar métricas básicas
                                    clientsCounter.textContent = data.data.clients || 0;
                                    
                                    // Actualizar métricas de bitrate si están disponibles
                                    if (data.data.bitrate) {
                                        bitrateCounter.textContent = data.data.bitrate.current || 0;
                                        bitrateCounter.style.color = data.data.bitrate.deviation > 20 ? '#FF9800' : 
                                                                   data.data.bitrate.deviation < -20 ? '#4CAF50' : '#17a2b8';
                                    }
                                    
                                    if (data.data.quality) {
                                        resolutionIndicator.textContent = data.data.quality.resolutionName || data.data.quality.resolution;
                                    }
                                    
                                    if (data.data.performance) {
                                        droppedFrames.textContent = data.data.performance.droppedFrameRatio || 0;
                                        droppedFrames.style.color = data.data.performance.droppedFrameRatio > 5 ? '#F44336' : 
                                                                   data.data.performance.droppedFrameRatio > 2 ? '#FF9800' : '#4CAF50';
                                        
                                        if (data.data.performance.averageFrameSize) {
                                            frameSizeIndicator.textContent = data.data.performance.averageFrameSize;
                                        }
                                    }
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
     * Crea un túnel público usando el SDK oficial de Pinggy.io
     * @returns {Promise<string>} - URL pública del túnel
     */
    async createPublicTunnel() {
        try {
            console.log(`[LSM] Creando túnel público con Pinggy.io SDK para puerto ${this.serverPort}...`);
            
            // Crear el túnel usando el SDK oficial
            this.tunnel = pinggy.createTunnel({ 
                forwardTo: `localhost:${this.serverPort}`,
                type: 'http',
                debug: false
            });
            
            // Iniciar el túnel
            const urls = await this.tunnel.start();
            
            if (!urls || urls.length === 0) {
                throw new Error('No se pudieron obtener URLs del túnel');
            }
            
            // Buscar específicamente la URL HTTP (no HTTPS)
            let httpUrl = urls.find(url => url.startsWith('http://'));
            if (!httpUrl) {
                // Si no hay HTTP directo, buscar cualquier URL y convertirla
                const anyUrl = urls[0];
                if (anyUrl.startsWith('https://')) {
                    httpUrl = anyUrl.replace('https://', 'http://');
                    console.log(`[LSM] Convertido de HTTPS a HTTP: ${httpUrl}`);
                } else {
                    httpUrl = anyUrl;
                }
            }
            
            this.publicUrl = httpUrl;
            
            return this.publicUrl;
            
        } catch (error) {
            console.error('[LSM] Error creando túnel público:', error);
            throw new Error(`No se pudo crear el túnel público: ${error.message}`);
        }
    }

    /**
     * Inicia la captura de video de la pantalla principal
     */
    async startVideoCapture() {
        try {
            console.log(`[LSM] 🎬 Iniciando captura de pantalla principal...`);
            
            // Detectar pantalla principal
            await this.detectPrimaryScreen();
            
            // Test inmediato de captura
            console.log(`[LSM] 🧪 Probando captura inmediata de pantalla...`);
            await this.captureAndSendFrame();
            
            // Configurar captura continua a 20 FPS
            console.log(`[LSM] ⏰ Configurando captura continua a ${this.frameRate} FPS`);
            this.captureInterval = setInterval(async () => {
                if (!this.isMonitoring) {
                    clearInterval(this.captureInterval);
                    return;
                }
                
                await this.captureAndSendFrame();
            }, 1000 / this.frameRate);
            
            console.log(`[LSM] ✅ Sistema de captura de pantalla iniciado a ${this.frameRate} FPS`);
            
        } catch (error) {
            console.error('[LSM] ❌ Error iniciando captura de pantalla:', error.message);
            throw error;
        }
    }

    /**
     * Captura un frame de la pantalla principal y lo envía a los clientes
     */
    /**
     * Captura un frame de la pantalla principal y lo envía a los clientes con optimizaciones avanzadas
     */
    async captureAndSendFrame() {
        const frameStartTime = Date.now();
        
        try {
            // Verificar que tenemos configurada la pantalla principal
            if (!this.primaryScreenId) {
                console.warn('[LSM] ID de pantalla principal no configurado, redetectando...');
                await this.detectPrimaryScreen();
                return;
            }
            
            // Usar resolución adaptativa del controlador de bitrate
            const targetRes = this.bitrateController.currentResolution;
            
            // Obtener fuentes de pantalla con resolución adaptativa
            const sources = await desktopCapturer.getSources({
                types: ['screen'],
                thumbnailSize: { 
                    width: targetRes.width, 
                    height: targetRes.height 
                }
            });
            
            // Buscar la pantalla principal configurada
            const primaryScreen = sources.find(source => source.id === this.primaryScreenId);
            
            if (!primaryScreen) {
                console.warn('[LSM] Pantalla principal no encontrada, usando la primera pantalla disponible');
                if (sources.length === 0) {
                    console.error('[LSM] No hay pantallas disponibles');
                    this.metrics.framesDropped++;
                    return;
                }
                
                // Usar la primera pantalla disponible y actualizar la configuración
                const fallbackScreen = sources[0];
                this.primaryScreenId = fallbackScreen.id;
                console.log(`[LSM] Cambiando a pantalla: "${fallbackScreen.name}"`);
            }
            
            // Obtener thumbnail de la pantalla
            const thumbnail = primaryScreen ? primaryScreen.thumbnail : sources[0].thumbnail;
            
            if (!thumbnail || thumbnail.isEmpty()) {
                console.warn('[LSM] Thumbnail de pantalla vacío');
                this.metrics.framesDropped++;
                return;
            }
            
            // Convertir a JPEG con calidad adaptativa
            const jpegQuality = Math.round(this.bitrateController.currentQuality * 100);
            let jpegData = thumbnail.toJPEG(jpegQuality);
            
            if (jpegData.length === 0) {
                console.warn('[LSM] Frame JPEG vacío generado');
                this.metrics.framesDropped++;
                return;
            }
            
            // Aplicar optimizaciones avanzadas
            const optimizationResult = await this.optimizeFrame(jpegData, thumbnail);
            
            // FIX: Nunca saltar frames - SIEMPRE enviar algo
            if (!optimizationResult || !optimizationResult.data) {
                console.log('[LSM] 🔧 Optimización falló, usando JPEG original para garantizar transmisión');
                // Crear resultado de fallback para garantizar que siempre hay datos para enviar
                const fallbackResult = {
                    data: jpegData,
                    type: 'fallback-forced',
                    bytesSaved: 0,
                    processingTime: 0,
                    motionLevel: 0.5,
                    quality: this.bitrateController.currentQuality
                };
                // Usar el fallback en lugar de saltar el frame
                optimizationResult = fallbackResult;
            }
            
            // Validar que tenemos datos válidos para enviar
            if (!optimizationResult.data || optimizationResult.data.length === 0) {
                console.warn(`[LSM] ⚠️ Frame ${this.metrics.framesSent} con datos vacíos, usando JPEG original`);
                optimizationResult.data = jpegData;
                optimizationResult.type = 'fallback';
            }
            
            // Adaptar bitrate cada 5 segundos
            if (this.metrics.framesSent > 0 && this.metrics.framesSent % (this.frameRate * 5) === 0) {
                await this.adaptBitrate();
            }
            
            // Log de progreso mejorado cada 60 frames (cada 3 segundos a 20fps)
            if (this.metrics.framesSent % 60 === 0) {
                const screenName = primaryScreen ? primaryScreen.name : sources[0].name;
                const frameKB = Math.round(optimizationResult.data.length / 1024);
                const originalKB = Math.round(jpegData.length / 1024);
                const savedKB = originalKB - frameKB;
                const bitrateStats = this.getBitrateStats();
            }
            
            // Enviar a clientes conectados con buffering inteligente
            if (this.clients.length > 0) {
                let successfulSends = 0;
                const sendStartTime = Date.now();
                
                // Limpiar clientes desconectados primero
                this.clients = this.clients.filter(client => 
                    client.readyState === WebSocket.OPEN || client.readyState === WebSocket.CONNECTING
                );
                
                // Enviar a cada cliente con buffering adaptativo
                for (const client of this.clients) {
                    if (client.readyState === WebSocket.OPEN) {
                        const sent = await this.manageClientBuffering(client, optimizationResult.data, optimizationResult);
                        if (sent) {
                            successfulSends++;
                        }
                    }
                }
                
                // Registrar tiempo de envío para análisis de red
                const sendTime = Date.now() - sendStartTime;
                this.performanceBuffer.sendTimes.push(sendTime);
                if (this.performanceBuffer.sendTimes.length > this.performanceBuffer.maxBufferSize) {
                    this.performanceBuffer.sendTimes.shift();
                }
                
                if (successfulSends > 0) {
                    this.metrics.framesSent++;
                    this.metrics.bytesTransferred += optimizationResult.data.length;
                    
                    // Log cada 60 frames exitosos (cada 3 segundos)
                    if (this.metrics.framesSent % 60 === 0) {
                        const avgSendTime = this.performanceBuffer.sendTimes.reduce((sum, t) => sum + t, 0) / 
                                           this.performanceBuffer.sendTimes.length;
                        this.broadcastEnhancedMetrics();
                    }
                } else {
                    this.metrics.framesDropped++;
                }
                
                this.metrics.clientsConnected = this.clients.length;
            } else {
                // Sin clientes, pero contar frame
                this.metrics.framesSent++;
                
                if (this.metrics.framesSent % 100 === 0) {
                    const bitrateStats = this.getBitrateStats();
                    console.log(`[LSM] 📸 Capturando pantalla sin clientes (${this.metrics.framesSent} frames, ${bitrateStats.quality.resolution})`);
                }
            }
            
            // Calcular tiempo total del frame para métricas
            const totalFrameTime = Date.now() - frameStartTime;
            if (totalFrameTime > 100) { // Advertir si el frame tarda más de 100ms
            }
            
        } catch (error) {
            console.error('[LSM] Error en captureAndSendFrame:', error.message);
            this.metrics.errors++;
            this.metrics.framesDropped++;
            
            // Fallback a captura simple si hay error
            if (this.clients.length > 0) {
                console.log('[LSM] 🔄 Intentando captura simple como fallback...');
                await this.captureAndSendFrameSimple();
            }
        }
    }

    /**
     * Método simplificado de captura como fallback cuando fallan las optimizaciones
     */
    async captureAndSendFrameSimple() {
        try {
            const sources = await desktopCapturer.getSources({
                types: ['screen'],
                thumbnailSize: { width: 1280, height: 720 }
            });
            
            if (sources.length === 0) return;
            
            const thumbnail = sources[0].thumbnail;
            if (!thumbnail || thumbnail.isEmpty()) return;
            
            const jpegData = thumbnail.toJPEG(70); // Calidad fija para simplicidad
            if (jpegData.length === 0) return;
            
            // Envío directo sin optimizaciones
            this.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    try {
                        client.send(jpegData);
                    } catch (sendError) {
                        console.warn('[LSM] Error en envío simple:', sendError.message);
                    }
                }
            });
            
            this.metrics.framesSent++;
            
        } catch (error) {
            console.error('[LSM] Error en captura simple:', error.message);
        }
    }

    /**
     * Envía métricas mejoradas a todos los clientes conectados
     */
    broadcastEnhancedMetrics() {
        const bitrateStats = this.getBitrateStats();
        
        const metricsData = {
            type: 'metrics',
            data: {
                // Métricas básicas
                clients: this.clients.length,
                framesSent: this.metrics.framesSent,
                framesDropped: this.metrics.framesDropped,
                bytesTransferred: this.metrics.bytesTransferred,
                uptime: this.startTime ? Date.now() - this.startTime : 0,
                
                // Métricas de bitrate y calidad
                bitrate: bitrateStats.bitrate,
                quality: bitrateStats.quality,
                performance: bitrateStats.performance,
                network: bitrateStats.network,
                
                // Información adicional
                adaptiveEnabled: this.bitrateController.adaptiveEnabled,
                frameRate: this.frameRate,
                timestamp: Date.now()
            }
        };

        this.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                try {
                    client.send(JSON.stringify(metricsData));
                } catch (error) {
                    console.warn('[LSM] Error enviando métricas mejoradas:', error);
                }
            }
        });
    }

    /**
     * Envía métricas básicas a todos los clientes conectados (compatibility)
     */
    broadcastMetrics() {
        const metricsData = {
            type: 'metrics',
            data: {
                clients: this.clients.length,
                framesSent: this.metrics.framesSent,
                framesDropped: this.metrics.framesDropped,
                bytesTransferred: this.metrics.bytesTransferred,
                uptime: this.startTime ? Date.now() - this.startTime : 0
            }
        };

        this.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                try {
                    client.send(JSON.stringify(metricsData));
                } catch (error) {
                    console.warn('[LSM] Error enviando métricas:', error);
                }
            }
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
            
            console.log(`[LSM] Consentimiento aceptado, iniciando Live Session Monitor para instancia: ${instanceName}`);
            
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
            
            // 2. Iniciar servidor local
            await this.startLocalServer();
            
            // 3. Crear túnel público
            const publicUrl = await this.createPublicTunnel();
            
            // 4. Iniciar captura de pantalla principal inmediatamente
            console.log('[LSM] Iniciando captura de pantalla principal...');
            
            try {
                await this.startVideoCapture();
                console.log(`[LSM] ✅ Live Session Monitor completamente activo - URL: ${publicUrl}`);
                
            } catch (captureError) {
                console.error(`[LSM] ❌ Error crítico iniciando captura: ${captureError.message}`);
                throw captureError;
            }
            
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
        
        // Detener captura de video
        if (this.captureInterval) {
            clearInterval(this.captureInterval);
            this.captureInterval = null;
            console.log('[LSM] Interval de captura de video detenido');
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
        
        // Cerrar túnel Pinggy
        if (this.tunnel) {
            try {
                if (typeof this.tunnel.stop === 'function') {
                    // Usando SDK de Pinggy
                    this.tunnel.stop();
                    console.log('[LSM] Túnel Pinggy cerrado usando SDK');
                } else if (this.tunnel.kill) {
                    // Fallback para procesos SSH
                    this.tunnel.kill('SIGTERM');
                    console.log('[LSM] Proceso Pinggy terminado');
                }
                this.tunnel = null;
            } catch (error) {
                console.warn('[LSM] Error cerrando túnel Pinggy:', error);
            }
        }
        
        this.publicUrl = null;
        this.serverPort = null;
        this.gameWindowId = null;
        this.instanceName = null;
        this.sessionId = null;
        this.startTime = null;
        this.primaryScreenId = null;
        
        console.log('[LSM] Live Session Monitor detenido');
    }

    /**
     * Método de debugging para probar captura de pantalla
     * @returns {Promise<Object>} - Resultado del test
     */
    async debugScreenCapture() {
        console.log('[LSM] 🧪 Iniciando debug de captura de pantalla...');
        
        try {
            const sources = await desktopCapturer.getSources({
                types: ['screen'],
                thumbnailSize: { width: 320, height: 240 }
            });
            
            console.log(`[LSM] ${sources.length} pantallas disponibles:`);
            const screenInfo = [];
            
            sources.forEach((source, index) => {
                console.log(`[LSM]   ${index + 1}. "${source.name}" (ID: ${source.id})`);
                
                // Test de captura para cada pantalla
                try {
                    const thumbnail = source.thumbnail;
                    if (thumbnail && !thumbnail.isEmpty()) {
                        const jpegData = thumbnail.toJPEG(70);
                        console.log(`[LSM]      📸 Captura exitosa: ${jpegData.length} bytes`);
                        screenInfo.push({
                            name: source.name,
                            id: source.id,
                            captureSize: jpegData.length,
                            success: true
                        });
                    } else {
                        console.log(`[LSM]      ❌ Thumbnail vacío`);
                        screenInfo.push({
                            name: source.name,
                            id: source.id,
                            success: false,
                            error: 'Thumbnail vacío'
                        });
                    }
                } catch (captureError) {
                    console.log(`[LSM]      ❌ Error captura: ${captureError.message}`);
                    screenInfo.push({
                        name: source.name,
                        id: source.id,
                        success: false,
                        error: captureError.message
                    });
                }
            });
            
            return {
                totalScreens: sources.length,
                screens: screenInfo,
                primaryScreenDetected: this.primaryScreenId,
                success: true
            };
            
        } catch (error) {
            console.error('[LSM] Error en debug de captura:', error);
            return {
                error: error.message,
                success: false
            };
        }
    }

    /**
     * Obtiene el estado actual del monitoreo con métricas completas
     * @returns {Object} - Estado del monitoreo
     */
    getStatus() {
        const duration = this.startTime ? Date.now() - this.startTime : 0;
        const bitrateStats = this.getBitrateStats();
        
        return {
            // Estado básico
            isMonitoring: this.isMonitoring,
            publicUrl: this.publicUrl,
            serverPort: this.serverPort,
            clientsConnected: this.clients.length,
            instanceName: this.instanceName,
            primaryScreenId: this.primaryScreenId,
            sessionId: this.sessionId,
            startTime: this.startTime,
            duration: duration,
            frameRate: this.frameRate,
            
            // Métricas básicas
            metrics: this.metrics,
            
            // Estadísticas de bitrate y optimización
            bitrate: bitrateStats.bitrate,
            quality: bitrateStats.quality,
            performance: bitrateStats.performance,
            network: bitrateStats.network,
            
            // Configuración del controlador de bitrate
            bitrateController: {
                enabled: this.bitrateController.adaptiveEnabled,
                targetBitrate: this.bitrateController.targetBitrate,
                currentQuality: this.bitrateController.currentQuality,
                currentResolution: this.bitrateController.currentResolution,
                adaptationHistory: this.bitrateController.adaptationHistory.slice(-5), // Últimas 5 adaptaciones
                lastAdaptation: this.bitrateController.lastAdaptation
            },
            
            // Estadísticas de rendimiento del buffer
            performanceBuffer: {
                avgFrameSize: this.performanceBuffer.frameSizes.length > 0 ? 
                    Math.round(this.performanceBuffer.frameSizes.reduce((a, b) => a + b, 0) / this.performanceBuffer.frameSizes.length / 1024) : 0, // KB
                avgSendTime: this.performanceBuffer.sendTimes.length > 0 ? 
                    Math.round(this.performanceBuffer.sendTimes.reduce((a, b) => a + b, 0) / this.performanceBuffer.sendTimes.length) : 0, // ms
                bufferUtilization: Math.round((this.performanceBuffer.frameSizes.length / this.performanceBuffer.maxBufferSize) * 100) // %
            }
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
