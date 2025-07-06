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
            
            // Try to get detailed server info directly
            this.getDetailedStatus().then(detailedInfo => {
                const ms = Date.now() - startTime;
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
                console.log('Failed to get detailed info:', err.message);
                resolve({
                    error: true,
                    message: err.message,
                    online: false,
                    ms: 0,
                    playersConnect: 0,
                    playersMax: 0
                });
            });
        });
    }

    async getDetailedStatus() {
        return new Promise((resolve, reject) => {
            const socket = new net.Socket();
            socket.setTimeout(5000);
            
            let hasResponded = false;
            
            socket.on('connect', () => {
                console.log(`Connected to ${this.host}:${this.port} for detailed status`);
                
                // Send handshake packet
                const handshake = this.createHandshakePacket();
                socket.write(handshake);
                
                // Send status request
                const statusRequest = this.createStatusRequestPacket();
                socket.write(statusRequest);
            });
            
            socket.on('data', (data) => {
                if (hasResponded) return;
                hasResponded = true;
                
                try {
                    const response = this.parseStatusResponse(data);
                    
                    // Send ping request to complete the handshake
                    const pingRequest = this.createPingRequestPacket();
                    socket.write(pingRequest);
                    
                    // Close socket after a brief delay
                    setTimeout(() => {
                        socket.destroy();
                    }, 100);
                    
                    resolve(response);
                } catch (err) {
                    console.error('Error parsing status response:', err);
                    socket.destroy();
                    reject(err);
                }
            });
            
            socket.on('error', (err) => {
                console.error('Socket error in detailed status:', err);
                if (!hasResponded) {
                    reject(err);
                }
            });
            
            socket.on('timeout', () => {
                console.log('Socket timeout in detailed status');
                socket.destroy();
                if (!hasResponded) {
                    reject(new Error('Timeout'));
                }
            });
            
            socket.connect(this.port, this.host);
        });
    }

    createHandshakePacket() {
        const hostname = Buffer.from(this.host, 'utf8');
        const port = Buffer.allocUnsafe(2);
        port.writeUInt16BE(this.port, 0);
        
        const packetData = Buffer.concat([
            Buffer.from([0x00]), // Packet ID (Handshake)
            this.writeVarInt(770), // Protocol version (1.21.4 - updated to current version)
            this.writeVarInt(hostname.length), // Hostname length
            hostname, // Hostname
            port, // Port
            this.writeVarInt(1) // Next state (1 for status)
        ]);
        
        const length = this.writeVarInt(packetData.length);
        return Buffer.concat([length, packetData]);
    }

    createStatusRequestPacket() {
        // Status Request packet: packet length (1) + packet ID (0x00)
        return Buffer.from([0x01, 0x00]);
    }

    createPingRequestPacket() {
        // Ping Request packet with current timestamp
        const timestamp = Buffer.allocUnsafe(8);
        timestamp.writeBigInt64BE(BigInt(Date.now()), 0);
        
        const packetData = Buffer.concat([
            Buffer.from([0x01]), // Packet ID (Ping Request)
            timestamp // Timestamp
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
            let offset = 0;
            
            // Read packet length
            const { value: packetLength, offset: newOffset } = this.readVarInt(data, offset);
            offset = newOffset;
            
            console.log('Packet length:', packetLength);
            
            // Read packet ID
            const { value: packetId, offset: newOffset2 } = this.readVarInt(data, offset);
            offset = newOffset2;
            
            console.log('Packet ID:', packetId);
            
            if (packetId !== 0x00) {
                throw new Error(`Expected packet ID 0x00, got 0x${packetId.toString(16)}`);
            }
            
            // Read JSON length
            const { value: jsonLength, offset: newOffset3 } = this.readVarInt(data, offset);
            offset = newOffset3;
            
            console.log('JSON length:', jsonLength);
            
            // Read JSON data
            const jsonData = data.slice(offset, offset + jsonLength).toString('utf8');
            console.log('JSON data:', jsonData);
            
            const status = JSON.parse(jsonData);
            
            // Extract MOTD - handle both string and object formats
            let motd = 'Minecraft Server';
            if (status.description) {
                if (typeof status.description === 'string') {
                    motd = status.description;
                } else if (status.description.text) {
                    motd = status.description.text;
                } else if (status.description.extra) {
                    motd = status.description.extra.map(part => part.text || '').join('');
                }
            }
            
            return {
                players: status.players?.online || 0,
                maxPlayers: status.players?.max || 0,
                version: status.version?.name || 'Unknown',
                motd: motd
            };
        } catch (err) {
            console.error('Error parsing status response:', err);
            console.error('Raw data:', data.toString('hex'));
            throw new Error('Failed to parse status response: ' + err.message);
        }
    }

    readVarInt(buffer, offset) {
        let value = 0;
        let position = 0;
        let currentByte;
        
        while (offset < buffer.length) {
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
