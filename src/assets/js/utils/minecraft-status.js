/**
 * @author MiguelkiNetwork
 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0
 * 
 * Lightweight Minecraft server status checker
 */

const net = require('net');

class MinecraftStatus {
    constructor(host, port = 25565) {
        this.host = host;
        this.port = port;
    }

    async getStatus() {
        return new Promise((resolve) => {
            const startTime = Date.now();
            const socket = new net.Socket();
            
            // Set timeout for connection
            socket.setTimeout(5000);
            
            console.log(`Attempting to connect to ${this.host}:${this.port}`);
            
            socket.on('connect', () => {
                const ms = Date.now() - startTime;
                console.log(`Connected to ${this.host}:${this.port} in ${ms}ms`);
                socket.destroy();
                
                // Try to get detailed server info
                this.getDetailedStatus().then(detailedInfo => {
                    console.log('Got detailed server info:', detailedInfo);
                    resolve({
                        online: true,
                        ms: ms,
                        playersConnect: detailedInfo.players || 0,
                        playersMax: detailedInfo.maxPlayers || 0,
                        version: detailedInfo.version || 'Unknown',
                        motd: detailedInfo.motd || 'Minecraft Server'
                    });
                }).catch((err) => {
                    console.log('Failed to get detailed info, using basic info:', err.message);
                    resolve({
                        online: true,
                        ms: ms,
                        playersConnect: 0,
                        playersMax: 0,
                        version: 'Unknown',
                        motd: 'Minecraft Server'
                    });
                });
            });
            
            socket.on('error', (err) => {
                console.log(`Connection error to ${this.host}:${this.port}:`, err.message);
                resolve({
                    error: true,
                    message: err.message,
                    online: false,
                    ms: 0,
                    playersConnect: 0,
                    playersMax: 0
                });
            });
            
            socket.on('timeout', () => {
                console.log(`Connection timeout to ${this.host}:${this.port}`);
                socket.destroy();
                resolve({
                    error: true,
                    message: 'Connection timeout',
                    online: false,
                    ms: 0,
                    playersConnect: 0,
                    playersMax: 0
                });
            });
            
            socket.connect(this.port, this.host);
        });
    }

    async getDetailedStatus() {
        return new Promise((resolve, reject) => {
            const socket = new net.Socket();
            socket.setTimeout(5000);
            
            socket.on('connect', () => {
                // Send handshake packet
                const handshake = this.createHandshakePacket();
                socket.write(handshake);
                
                // Send status request
                const statusRequest = Buffer.from([0x01, 0x00]);
                socket.write(statusRequest);
            });
            
            socket.on('data', (data) => {
                try {
                    const response = this.parseStatusResponse(data);
                    socket.destroy();
                    resolve(response);
                } catch (err) {
                    socket.destroy();
                    reject(err);
                }
            });
            
            socket.on('error', (err) => {
                reject(err);
            });
            
            socket.on('timeout', () => {
                socket.destroy();
                reject(new Error('Timeout'));
            });
            
            socket.connect(this.port, this.host);
        });
    }

    createHandshakePacket() {
        const hostname = Buffer.from(this.host, 'utf8');
        const port = Buffer.allocUnsafe(2);
        port.writeUInt16BE(this.port, 0);
        
        const packetData = Buffer.concat([
            Buffer.from([0x00]), // Packet ID
            this.writeVarInt(754), // Protocol version
            this.writeVarInt(hostname.length), // Hostname length
            hostname, // Hostname
            port, // Port
            Buffer.from([0x01]) // Next state (status)
        ]);
        
        const length = this.writeVarInt(packetData.length);
        return Buffer.concat([length, packetData]);
    }

    writeVarInt(value) {
        const buffer = [];
        while (value > 0x7F) {
            buffer.push((value & 0x7F) | 0x80);
            value >>>= 7;
        }
        buffer.push(value & 0x7F);
        return Buffer.from(buffer);
    }

    parseStatusResponse(data) {
        try {
            // Skip packet length and packet ID
            let offset = 0;
            
            // Read packet length
            const { value: packetLength, offset: newOffset } = this.readVarInt(data, offset);
            offset = newOffset;
            
            // Read packet ID
            const { value: packetId, offset: newOffset2 } = this.readVarInt(data, offset);
            offset = newOffset2;
            
            // Read JSON length
            const { value: jsonLength, offset: newOffset3 } = this.readVarInt(data, offset);
            offset = newOffset3;
            
            // Read JSON data
            const jsonData = data.slice(offset, offset + jsonLength).toString('utf8');
            const status = JSON.parse(jsonData);
            
            return {
                players: status.players?.online || 0,
                maxPlayers: status.players?.max || 0,
                version: status.version?.name || 'Unknown',
                motd: status.description?.text || status.description || 'Minecraft Server'
            };
        } catch (err) {
            throw new Error('Failed to parse status response');
        }
    }

    readVarInt(buffer, offset) {
        let value = 0;
        let position = 0;
        let currentByte;
        
        while (true) {
            currentByte = buffer[offset++];
            value |= (currentByte & 0x7F) << position;
            
            if ((currentByte & 0x80) === 0) break;
            
            position += 7;
            
            if (position >= 32) {
                throw new Error('VarInt is too big');
            }
        }
        
        return { value, offset };
    }
}

export default MinecraftStatus;
