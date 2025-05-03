/**
 * @author Luuxis
 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0
 */

const { NodeBDD, DataType } = require('node-bdd');
const nodedatabase = new NodeBDD()
const { ipcRenderer } = require('electron')

import encryptedStorage from './encrypted-storage.js';

let dev = process.env.NODE_ENV === 'dev';
let migrationShown = false; // Controla si ya se mostró el diálogo de migración

class database {
    constructor() {
        // Simple operation queue
        this.queue = Promise.resolve();
        this.busyRetryCount = 3;
        this.busyRetryDelay = 200;
    }

    // Execute a database operation with SQLite busy retry handling
    // Solo usado para migración y operaciones del sistema antiguo en su caso
    async execute(operation) {
        let attempt = 0;
        while (true) {
            try {
                return await operation();
            } catch (error) {
                // Check if this is a database lock error
                const errorMsg = error.message || '';
                const isBusyError = 
                    errorMsg.includes('SQLITE_BUSY') || 
                    errorMsg.includes('database is locked') ||
                    errorMsg.includes('Database is locked');
                
                // If it's a lock error and we haven't exceeded retry attempts
                if (isBusyError && attempt < this.busyRetryCount) {
                    attempt++;
                    console.warn(`Database busy, retrying operation (attempt ${attempt}/${this.busyRetryCount})...`);
                    // Wait before retrying with exponential backoff
                    await new Promise(resolve => setTimeout(resolve, this.busyRetryDelay * attempt));
                } else {
                    // Either it's not a lock error or we've exceeded retries
                    throw error;
                }
            }
        }
    }

    // Métodos del sistema antiguo solo usados para migración
    async creatDatabase(tableName, tableConfig) {
        return this.execute(async () => {
            return await nodedatabase.intilize({
                databaseName: 'Databases',
                fileType: dev ? 'sqlite' : 'db',
                tableName: tableName,
                path: `${await ipcRenderer.invoke('path-user-data')}${dev ? '../..' : '/databases'}`,
                tableColumns: tableConfig,
            });
        });
    }

    async getDatabase(tableName) {
        return this.execute(async () => {
            return await this.creatDatabase(tableName, {
                json_data: DataType.TEXT.TEXT,
            });
        });
    }

    // Crear datos - siempre usa almacenamiento encriptado
    async createData(tableName, data) {
        if (tableName === 'configClient' || tableName === 'accounts') {
            try {
                // Para accounts, usar la función específica que asigna un ID único
                if (tableName === 'accounts') {
                    return await encryptedStorage.addAccount(data);
                } else {
                    // Para configClient, guardar directamente
                    const saved = await encryptedStorage.saveData(tableName, data);
                    if (saved) {
                        return data;
                    }
                    throw new Error('Error al guardar datos encriptados');
                }
            } catch (error) {
                console.error(`Error al crear datos encriptados (${tableName}):`, error);
                throw new Error(`No se pudieron crear los datos en ${tableName}: ${error.message}`);
            }
        } else {
            // Para otros tipos de datos, usamos el sistema antiguo
            return this.execute(async () => {
                let table = await this.getDatabase(tableName);
                data = await nodedatabase.createData(table, { json_data: JSON.stringify(data) });
                let id = data.id;
                data = JSON.parse(data.json_data);
                data.ID = id;
                return data;
            });
        }
    }

    // Leer datos - siempre usa almacenamiento encriptado para configClient y accounts
    async readData(tableName, key = 1) {
        // Intentar migración automática si no se ha hecho
        if (!migrationShown && (tableName === 'configClient' || tableName === 'accounts')) {
            migrationShown = true;
            await this.attemptMigration();
        }

        if (tableName === 'configClient' || tableName === 'accounts') {
            try {
                // Para accounts, verificar si se busca por ID
                if (tableName === 'accounts' && key !== 1) {
                    return await encryptedStorage.getAccount(key);
                } else {
                    // Para configClient o todas las accounts, cargar todo el archivo
                    return await encryptedStorage.loadData(tableName);
                }
            } catch (error) {
                console.error(`Error al leer datos encriptados (${tableName}):`, error);
                return null;
            }
        } else {
            // Para otros tipos de datos, usamos el sistema antiguo
            return this.execute(async () => {
                let table = await this.getDatabase(tableName);
                let data = await nodedatabase.getDataById(table, key);
                if (data) {
                    let id = data.id;
                    data = JSON.parse(data.json_data);
                    data.ID = id;
                }
                return data ? data : undefined;
            });
        }
    }

    // Leer todos los datos - siempre usa almacenamiento encriptado para accounts
    async readAllData(tableName) {
        // Intentar migración automática si no se ha hecho
        if (!migrationShown && (tableName === 'configClient' || tableName === 'accounts')) {
            migrationShown = true;
            await this.attemptMigration();
        }

        if (tableName === 'accounts') {
            try {
                return await encryptedStorage.getAllAccounts();
            } catch (error) {
                console.error(`Error al leer todas las cuentas encriptadas:`, error);
                return [];
            }
        } else {
            // Para otros tipos de datos, usamos el sistema antiguo
            return this.execute(async () => {
                let table = await this.getDatabase(tableName);
                let data = await nodedatabase.getAllData(table);
                return data.map(info => {
                    let id = info.id;
                    info = JSON.parse(info.json_data);
                    info.ID = id;
                    return info;
                });
            });
        }
    }

    // Actualizar datos - siempre usa almacenamiento encriptado para configClient y accounts
    async updateData(tableName, data, key = 1) {
        if (tableName === 'configClient' || tableName === 'accounts') {
            try {
                // Para accounts, actualizar una cuenta específica
                if (tableName === 'accounts' && key !== 1) {
                    return await encryptedStorage.updateAccount(data, key);
                } else if (tableName === 'accounts') {
                    // Si estamos actualizando todas las cuentas, asegurar que sea un array
                    if (!Array.isArray(data)) {
                        console.warn('Se intentó actualizar accounts con un objeto en lugar de un array. Convirtiendo a array.');
                        // Si es un objeto de cuenta válido, convertirlo a array
                        if (data && typeof data === 'object' && data.ID !== undefined && data.name) {
                            data = [data];
                        } else {
                            // Si no es un objeto de cuenta válido, leer las cuentas actuales
                            const currentAccounts = await encryptedStorage.loadData('accounts');
                            if (Array.isArray(currentAccounts) && currentAccounts.length > 0) {
                                console.warn('Usando cuentas existentes en lugar de datos inválidos');
                                data = currentAccounts;
                            } else {
                                // Si no hay cuentas actuales, crear un array vacío
                                data = [];
                            }
                        }
                    }
                    // Ahora guardar el array de cuentas
                    return await encryptedStorage.saveData(tableName, data);
                } else {
                    // Para configClient, guardar todo el objeto
                    return await encryptedStorage.saveData(tableName, data);
                }
            } catch (error) {
                console.error(`Error al actualizar datos encriptados (${tableName}):`, error);
                throw new Error(`No se pudieron actualizar los datos en ${tableName}: ${error.message}`);
            }
        } else {
            // Para otros tipos de datos, usamos el sistema antiguo
            return this.execute(async () => {
                let table = await this.getDatabase(tableName);
                await nodedatabase.updateData(table, { json_data: JSON.stringify(data) }, key);
            });
        }
    }

    // Eliminar datos - siempre usa almacenamiento encriptado para configClient y accounts
    async deleteData(tableName, key = 1) {
        if (tableName === 'configClient' || tableName === 'accounts') {
            try {
                // Para accounts, eliminar una cuenta específica
                if (tableName === 'accounts' && key !== 1) {
                    return await encryptedStorage.deleteAccount(key);
                } else {
                    // Para configClient, eliminar todo el archivo
                    return await encryptedStorage.deleteData(tableName);
                }
            } catch (error) {
                console.error(`Error al eliminar datos encriptados (${tableName}):`, error);
                throw new Error(`No se pudieron eliminar los datos en ${tableName}: ${error.message}`);
            }
        } else {
            // Para otros tipos de datos, usamos el sistema antiguo
            return this.execute(async () => {
                let table = await this.getDatabase(tableName);
                await nodedatabase.deleteData(table, key);
            });
        }
    }
    
    // Limpiar toda la base de datos (ambos sistemas)
    async clearDatabase() {
        // Eliminar archivos encriptados
        try {
            await encryptedStorage.deleteData('configClient');
            await encryptedStorage.deleteData('accounts');
            console.log('Archivos encriptados eliminados correctamente');
        } catch (error) {
            console.error('Error al eliminar archivos encriptados:', error);
        }

        // También ejecutar el método original para limpiar SQLite
        return this.execute(async () => {
            // Implementation depends on node-bdd capabilities
            const tables = ['accounts', 'configClient'];
            for (const table of tables) {
                try {
                    const tableData = await this.getDatabase(table);
                    const allData = await nodedatabase.getAllData(tableData);
                    for (const item of allData) {
                        await nodedatabase.deleteData(tableData, item.id);
                    }
                    console.log(`Cleared table: ${table}`);
                } catch (err) {
                    console.error(`Error clearing table ${table}:`, err);
                }
            }
        });
    }

    /**
     * Intenta realizar la migración automática si es necesario
     * @returns {Promise<boolean>} - true si se realizó la migración, false en caso contrario
     */
    async attemptMigration() {
        console.log('Verificando si es necesaria la migración desde el sistema antiguo...');
        try {
            // Verificar si ya existe una configuración en el nuevo formato
            const existingConfig = await encryptedStorage.loadData('configClient');
            const existingAccounts = await encryptedStorage.getAllAccounts();
            
            // Si ya tenemos datos en el nuevo formato, no necesitamos migrar
            if (existingConfig !== null) {
                console.log('Ya existe una configuración en el nuevo formato, no es necesaria la migración');
                return false;
            }
            
            // Verificar si hay datos en el sistema antiguo que necesiten migración
            let hasOldData = false;
            let oldConfig = null;
            let oldAccounts = [];
            
            try {
                // Verificar si existe configClient en el sistema antiguo
                const configTable = await this.getDatabase('configClient');
                const oldConfigData = await nodedatabase.getAllData(configTable);
                
                if (oldConfigData && oldConfigData.length > 0) {
                    console.log('Se encontraron datos antiguos de configuración para migrar');
                    oldConfig = JSON.parse(oldConfigData[0].json_data);
                    hasOldData = true;
                }
                
                // Verificar si existen accounts en el sistema antiguo
                const accountsTable = await this.getDatabase('accounts');
                const oldAccountsData = await nodedatabase.getAllData(accountsTable);
                
                if (oldAccountsData && oldAccountsData.length > 0) {
                    console.log(`Se encontraron ${oldAccountsData.length} cuentas antiguas para migrar`);
                    oldAccounts = oldAccountsData.map(account => {
                        const data = JSON.parse(account.json_data);
                        data.ID = account.id;
                        return data;
                    });
                    hasOldData = true;
                }
            } catch (error) {
                console.error('Error al verificar datos antiguos:', error);
                return false;
            }
            
            // Si no hay datos para migrar, salimos
            if (!hasOldData) {
                console.log('No se encontraron datos antiguos para migrar');
                return false;
            }
            
            // Mostrar diálogo de migración
            const migrationPopup = new popup();
            migrationPopup.openPopup({
                title: 'Migración de datos',
                content: 'Se están migrando tus datos al nuevo sistema de almacenamiento seguro. Por favor, espera un momento...',
                color: 'var(--color)',
                background: false
            });
            
            // Migrar configuración
            if (oldConfig) {
                console.log('Migrando configuración...');
                await encryptedStorage.saveData('configClient', oldConfig);
            }
            
            // Migrar cuentas
            if (oldAccounts.length > 0) {
                console.log(`Migrando ${oldAccounts.length} cuentas...`);
                for (const account of oldAccounts) {
                    await encryptedStorage.addAccount(account);
                }
            }
            
            console.log('Migración completada exitosamente');
            migrationPopup.closePopup();
            
            return true;
        } catch (error) {
            console.error('Error durante la migración:', error);
            return false;
        }
    }

    /**
     * Ejecuta la consolidación de archivos de almacenamiento dispersos
     * @returns {Promise<boolean>} - true si la consolidación fue exitosa
     */
    async consolidateStorage() {
        try {
            console.log('Iniciando consolidación de almacenamiento desde database.js');
            return await encryptedStorage.consolidateStorage();
        } catch (error) {
            console.error('Error al consolidar almacenamiento:', error);
            return false;
        }
    }
}

export default database;