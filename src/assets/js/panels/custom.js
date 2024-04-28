import { config, database, logger, changePanel, setInstanceBackground, pkg, popup } from '../utils.js'
const { ipcRenderer } = require('electron');
const os = require('os');

class Custom {
    static id = "custom";
    async init(config) {
        this.config = config;
    }
}


export default Custom;