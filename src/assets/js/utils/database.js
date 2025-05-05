/**
 * @author MiguelkiNetwork (based on work by Luuxis)
 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0
 */

import encryptedStorage from './encrypted-storage.js';
const { ipcRenderer } = require('electron');

class database {
    constructor() {
        // Queue to handle operations sequentially
        this.queue = Promise.resolve();
        this.busyRetryCount = 3;
        this.busyRetryDelay = 200;
        
        // Initialize database on creation
        this.init();
    }

    // Initialize database and verify storage
    async init() {
        try {
            // Consolidate storage to fix any issues on startup
            await this.consolidateStorage();
            console.log('Database initialized successfully');
        } catch (error) {
            console.error('Error initializing database:', error);
            // Continue even if initialization fails
        }
    }

    // Execute operations in sequence with retry logic
    async execute(operation) {
        return new Promise((resolve, reject) => {
            this.queue = this.queue.then(async () => {
                let attempt = 0;
                while (true) {
                    try {
                        const result = await operation();
                        resolve(result);
                        return result;
                    } catch (error) {
                        // Check if this is a database lock/busy error
                        const errorMsg = error.message || '';
                        const isBusyError = 
                            errorMsg.includes('busy') || 
                            errorMsg.includes('locked') ||
                            errorMsg.includes('timeout');
                        
                        // If it's a lock error and we haven't exceeded retry attempts
                        if (isBusyError && attempt < this.busyRetryCount) {
                            attempt++;
                            console.warn(`Database busy, retrying operation (attempt ${attempt}/${this.busyRetryCount})...`);
                            // Wait before retrying with exponential backoff
                            await new Promise(r => setTimeout(r, this.busyRetryDelay * attempt));
                        } else {
                            reject(error);
                            throw error;
                        }
                    }
                }
            }).catch(error => {
                reject(error);
                return Promise.resolve(); // Keep the queue going
            });
        });
    }

    // Create data with compatibility with the original implementation
    async createData(tableName, data) {
        return this.execute(async () => {
            if (!data) {
                throw new Error('Cannot create null or undefined data');
            }

            // Handle different table types
            if (tableName === 'accounts') {
                // Keep a copy without modifications
                const cleanData = JSON.parse(JSON.stringify(data));
                
                // Add to storage with ID handling
                const result = await encryptedStorage.addAccount(cleanData);
                
                if (!result) {
                    throw new Error('Failed to add account');
                }
                
                // Ensure the original ID format is maintained for compatibility
                // This is crucial for the Minecraft-java-core library
                if (result.ID !== undefined) {
                    // Convert ID to number for better compatibility with original system
                    result.ID = Number(result.ID);
                }
                
                return result;
            } else {
                // For configClient and other data, save directly
                const saved = await encryptedStorage.saveData(tableName, data);
                if (!saved) {
                    throw new Error('Failed to save encrypted data');
                }
                return data;
            }
        });
    }

    // Read data with compatibility with the original implementation
    async readData(tableName, key = 1) {
        return this.execute(async () => {
            // Ensure key is treated as a number for compatibility
            key = Number(key);
            
            // For accounts, check if searching by ID
            if (tableName === 'accounts' && key !== 1) {
                const account = await encryptedStorage.getAccount(key);
                
                if (!account) {
                    console.warn(`Account with ID ${key} not found`);
                    return undefined; // Return undefined to match original behavior
                }
                
                // Ensure ID is a number for compatibility
                if (account.ID !== undefined) {
                    account.ID = Number(account.ID);
                }
                
                return account;
            } else {
                // For configClient or all accounts, load the entire file
                const data = await encryptedStorage.loadData(tableName);
                
                // Handle empty data
                if (!data) return undefined;
                
                // Ensure accounts is always an array
                if (tableName === 'accounts') {
                    if (!Array.isArray(data)) {
                        console.warn(`Read non-array account data, fixing...`);
                        if (typeof data === 'object' && data.ID !== undefined && data.name) {
                            // Convert single account object to array with numeric ID
                            data.ID = Number(data.ID);
                            return [data];
                        }
                        return [];
                    } else {
                        // Ensure all IDs are numbers for compatibility
                        return data.map(account => {
                            if (account && account.ID !== undefined) {
                                account.ID = Number(account.ID);
                            }
                            return account;
                        });
                    }
                }
                
                return data;
            }
        }).catch(error => {
            console.error(`Error reading encrypted data (${tableName}):`, error);
            if (tableName === 'accounts') {
                return [];
            }
            return undefined;
        });
    }

    // Read all data with compatibility with the original implementation
    async readAllData(tableName) {
        return this.execute(async () => {
            if (tableName === 'accounts') {
                const accounts = await encryptedStorage.getAllAccounts();
                
                if (!Array.isArray(accounts) || accounts.length === 0) {
                    return [];
                }
                
                // Ensure all IDs are numbers for compatibility
                return accounts.map(account => {
                    if (account && account.ID !== undefined) {
                        account.ID = Number(account.ID);
                    }
                    return account;
                });
            } else {
                // For other data types
                const data = await encryptedStorage.loadData(tableName);
                return data || [];
            }
        }).catch(error => {
            console.error(`Error reading all data (${tableName}):`, error);
            return [];
        });
    }

    // Update data with compatibility with the original implementation
    async updateData(tableName, data, key = 1) {
        return this.execute(async () => {
            // Ensure key is treated as a number for compatibility
            key = Number(key);
            
            // Create deep copy to avoid modifying original data
            let dataCopy = JSON.parse(JSON.stringify(data));
            
            // For accounts, update a specific account
            if (tableName === 'accounts' && key !== 1) {
                if (!dataCopy) {
                    throw new Error('Cannot update with null or undefined data');
                }

                // Ensure ID is a number for compatibility
                if (dataCopy.ID !== undefined) {
                    dataCopy.ID = Number(dataCopy.ID);
                }

                const updated = await encryptedStorage.updateAccount(dataCopy, key);
                if (!updated) {
                    console.warn(`Failed to update account with ID: ${key}`);
                }
                return updated;
            } else if (tableName === 'accounts') {
                // If we're updating all accounts, ensure it's an array
                if (!Array.isArray(dataCopy)) {
                    console.warn('[updateData] Received an object instead of an array for accounts');
                    
                    // If it's a valid account object, convert it to an array
                    if (dataCopy && typeof dataCopy === 'object' && dataCopy.ID !== undefined && dataCopy.name) {
                        console.log('[updateData] Converting individual account to array for storage');
                        
                        // Ensure ID is a number for compatibility
                        dataCopy.ID = Number(dataCopy.ID);
                        dataCopy = [dataCopy];
                    } else {
                        console.error('[updateData] Invalid data received to update accounts');
                        // Get current accounts as backup
                        const currentAccounts = await encryptedStorage.loadData('accounts') || [];
                        
                        if (Array.isArray(currentAccounts) && currentAccounts.length > 0) {
                            console.warn('[updateData] Using existing accounts instead of invalid data');
                            dataCopy = currentAccounts;
                        } else {
                            console.warn('[updateData] No existing accounts, using empty array');
                            dataCopy = [];
                        }
                    }
                } else {
                    // Ensure all IDs in the array are numbers
                    dataCopy.forEach(account => {
                        if (account && account.ID !== undefined) {
                            account.ID = Number(account.ID);
                        }
                    });
                }
                
                console.log(`[updateData] Saving array of ${dataCopy.length} accounts`);
                return await encryptedStorage.saveData(tableName, dataCopy);
            } else {
                // For configClient, save the entire object
                if (!dataCopy) {
                    throw new Error('Cannot update with null or undefined data');
                }
                return await encryptedStorage.saveData(tableName, dataCopy);
            }
        }).catch(error => {
            console.error(`Error updating encrypted data (${tableName}):`, error);
            throw error;
        });
    }

    // Delete data with compatibility with the original implementation
    async deleteData(tableName, key = 1) {
        return this.execute(async () => {
            // Ensure key is treated as a number for compatibility
            key = Number(key);
            
            // For accounts, delete a specific account
            if (tableName === 'accounts' && key !== 1) {
                const deleted = await encryptedStorage.deleteAccount(key);
                if (!deleted) {
                    console.warn(`Failed to delete account with ID: ${key}`);
                }
                return deleted;
            } else {
                // For configClient, delete the entire file
                return await encryptedStorage.deleteData(tableName);
            }
        }).catch(error => {
            console.error(`Error deleting encrypted data (${tableName}):`, error);
            throw new Error(`Could not delete data in ${tableName}: ${error.message}`);
        });
    }
    
    // Clear the entire database
    async clearDatabase() {
        return this.execute(async () => {
            // Delete encrypted files
            try {
                await encryptedStorage.deleteData('configClient');
                await encryptedStorage.deleteData('accounts');
                console.log('Encrypted files deleted successfully');
                return true;
            } catch (error) {
                console.error('Error deleting encrypted files:', error);
                throw error;
            }
        });
    }

    /**
     * Run storage consolidation of scattered storage files
     * @returns {Promise<boolean>} - true if consolidation was successful
     */
    async consolidateStorage() {
        try {
            console.log('Starting storage consolidation from database.js');
            return await encryptedStorage.consolidateStorage();
        } catch (error) {
            console.error('Error consolidating storage:', error);
            return false;
        }
    }
    
    /**
     * Verify if an account exists by its credentials (username and type)
     * @param {string} username - Username to check
     * @param {string} accountType - Account type (microsoft, mojang, azauth, etc.)
     * @returns {Promise<Object|null>} - Account data if found, null otherwise
     */
    async accountExists(username, accountType) {
        try {
            if (!username || !accountType) {
                return null;
            }
            
            const accounts = await this.readAllData('accounts');
            if (!Array.isArray(accounts) || accounts.length === 0) {
                return null;
            }
            
            // Find account with matching name and type
            const account = accounts.find(acc => 
                acc && 
                acc.name === username &&
                acc.meta && 
                acc.meta.type === accountType
            );
            
            return account || null;
        } catch (error) {
            console.error('Error checking if account exists:', error);
            return null;
        }
    }
    
    /**
     * Get the currently selected account
     * @returns {Promise<Object|null>} - Selected account data or null if none is selected
     */
    async getSelectedAccount() {
        try {
            // Read config to get selected account ID
            const config = await this.readData('configClient');
            if (!config || !config.account_selected) {
                return null;
            }
            
            // Get account with that ID
            const account = await this.readData('accounts', config.account_selected);
            
            // Ensure ID is a number for compatibility
            if (account && account.ID !== undefined) {
                account.ID = Number(account.ID);
            }
            
            return account;
        } catch (error) {
            console.error('Error getting selected account:', error);
            return null;
        }
    }
    
    /**
     * Set an account as selected
     * @param {string|number} accountId - ID of the account to select
     * @returns {Promise<boolean>} - true if successful
     */
    async setSelectedAccount(accountId) {
        try {
            if (!accountId) {
                throw new Error('Account ID is required');
            }
            
            // Ensure accountId is a number
            accountId = Number(accountId);
            
            // Check if account exists
            const account = await this.readData('accounts', accountId);
            if (!account) {
                console.warn(`Cannot select non-existent account with ID: ${accountId}`);
                return false;
            }
            
            // Get current config
            let config = await this.readData('configClient');
            if (!config || typeof config !== 'object') {
                // Initialize config if it doesn't exist
                config = {
                    account_selected: null,
                    instance_selct: null
                };
            }
            
            // Update selected account
            config.account_selected = accountId;
            
            // Save updated config
            return await this.updateData('configClient', config);
        } catch (error) {
            console.error('Error setting selected account:', error);
            return false;
        }
    }
}

export default database;