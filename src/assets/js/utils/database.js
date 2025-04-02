/**
 * @author Luuxis
 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0
 */

const { NodeBDD, DataType } = require('node-bdd');
const nodedatabase = new NodeBDD()
const { ipcRenderer } = require('electron')

let dev = process.env.NODE_ENV === 'dev';

class database {
    constructor() {
        // Simple operation queue
        this.queue = Promise.resolve();
        this.busyRetryCount = 3;
        this.busyRetryDelay = 200;
    }

    // Execute a database operation with SQLite busy retry handling
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

    async createData(tableName, data) {
        return this.execute(async () => {
            let table = await this.getDatabase(tableName);
            data = await nodedatabase.createData(table, { json_data: JSON.stringify(data) });
            let id = data.id;
            data = JSON.parse(data.json_data);
            data.ID = id;
            return data;
        });
    }

    async readData(tableName, key = 1) {
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

    async readAllData(tableName) {
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

    async updateData(tableName, data, key = 1) {
        return this.execute(async () => {
            let table = await this.getDatabase(tableName);
            await nodedatabase.updateData(table, { json_data: JSON.stringify(data) }, key);
        });
    }

    async deleteData(tableName, key = 1) {
        return this.execute(async () => {
            let table = await this.getDatabase(tableName);
            await nodedatabase.deleteData(table, key);
        });
    }
    
    async clearDatabase() {
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
}

export default database;