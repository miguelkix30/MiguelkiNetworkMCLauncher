const { ipcRenderer, shell } = require('electron');
const pkg = require('../package.json');
const os = require('os');
import { config, database } from './utils.js';
const nodeFetch = require("node-fetch");

class Splash {
    constructor() {
        this.splash = document.querySelector(".splash");
        this.splashMessage = document.querySelector(".splash-message");
        this.splashAuthor = document.querySelector(".splash-author");
        this.message = document.querySelector(".message");
        this.progress = document.querySelector(".progress");
        document.addEventListener('DOMContentLoaded', async () => {
            let databaseLauncher = new database();
            let configClient = await databaseLauncher.readData('configClient');
            // Always use dark theme with white text
            document.body.className = 'dark global';
            if (process.platform == 'win32') ipcRenderer.send('update-window-progress-load');
            this.startAnimation();
        });
    }

    async fetchSplashes() {
        try {
            const url = `${pkg.url}launcher/config-launcher/splashes.json`;
            const response = await nodeFetch(url, { timeout: 5000 });
            if (!response.ok) throw new Error('Network response was not ok');
            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Error al cagar los splashes, usando los default:', error);
            return null;
        }
    }

    async startAnimation() {
        let defaultSplashes = [
            { "message": "Miguelki Network", "author": "Miguelki" }
        ];

        let splashes = await this.fetchSplashes();

        if (splashes && Array.isArray(splashes) && splashes.length > 0) {
            console.log("Using fetched splashes");
        } else {
            console.log("Using default splashes");
            splashes = defaultSplashes;
        }

        let splash = splashes[Math.floor(Math.random() * splashes.length)];
        this.splashMessage.textContent = splash.message;
        this.splashAuthor.children[0].textContent = splash.author;
        await sleep(100);
        document.querySelector("#splash").style.display = "block";
        await sleep(500);
        this.splash.classList.add("opacity");
        await sleep(500);
        this.splash.classList.add("translate");
        this.splashMessage.classList.add("opacity");
        this.splashAuthor.classList.add("opacity");
        this.message.classList.add("opacity");
        await sleep(1000);
        this.checkUpdate();
    }

    async checkUpdate() {
        this.setStatus(`Buscando actualizaciones...`);

        ipcRenderer.invoke('update-app').then().catch(err => {
            return this.shutdown(`Error al buscar actualizaciones:<br>${err.message}`);
        });

        ipcRenderer.on('updateAvailable', () => {
            this.setStatus(`Actualización disponible`);
            if (os.platform() == 'win32') {
                this.toggleProgress();
                ipcRenderer.send('start-update');
            } else return this.dowloadUpdate();
        });

        ipcRenderer.on('error', (event, err) => {
            if (err) return this.shutdown(`${err.message}`);
        });

        ipcRenderer.on('download-progress', (event, progress) => {
            const percentage = ((progress.transferred / progress.total) * 100).toFixed(0);
            this.setStatus(`Descargando actualización... ${percentage}%`);
            ipcRenderer.send('update-window-progress', { progress: progress.transferred, size: progress.total });
            this.setProgress(progress.transferred, progress.total);
        });

        ipcRenderer.on('update-not-available', () => {
            console.error("Actualización no disponible");
            this.maintenanceCheck();
        });
    }

    getLatestReleaseForOS(os, preferredFormat, asset) {
        return asset.filter(asset => {
            const name = asset.name.toLowerCase();
            const isOSMatch = name.includes(os);
            const isFormatMatch = name.endsWith(preferredFormat);
            return isOSMatch && isFormatMatch;
        }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
    }

    async dowloadUpdate() {
        const repoURL = pkg.repository.url.replace("git+", "").replace(".git", "").replace("https://github.com/", "").split("/");
        const githubAPI = await nodeFetch('https://api.github.com').then(res => res.json()).catch(err => err);

        const githubAPIRepoURL = githubAPI.repository_url.replace("{owner}", repoURL[0]).replace("{repo}", repoURL[1]);
        const githubAPIRepo = await nodeFetch(githubAPIRepoURL).then(res => res.json()).catch(err => err);

        const releases_url = await nodeFetch(githubAPIRepo.releases_url.replace("{/id}", '')).then(res => res.json()).catch(err => err);
        const latestRelease = releases_url[0].assets;
        let latest;

        if (os.platform() == 'darwin') latest = this.getLatestReleaseForOS('mac', '.dmg', latestRelease);
        else if (os == 'linux') latest = this.getLatestReleaseForOS('linux', '.appimage', latestRelease);

        this.setStatus(`Actualización disponible<br><div class="download-update">Descargar</div>`);
        document.querySelector(".download-update").addEventListener("click", () => {
            shell.openExternal(latest.browser_download_url);
            return this.shutdown("Descargando...");
        });
    }

    async maintenanceCheck() {
        config.GetConfig().then(res => {
            if (res.maintenance) return this.shutdown(res.maintenance_message);
            this.startLauncher();
        }).catch(e => {
            console.error(e);
            return this.shutdown("No se ha podido conectar al servidor.<br>Por favor, inténtalo más tarde.");
        });
    }

    startLauncher() {
        this.setStatus(`Iniciando launcher`);
        ipcRenderer.send('main-window-open');
        ipcRenderer.send('update-window-close');
    }

    shutdown(text) {
        this.setStatus(`${text}<br>Saliendo en 5s`);
        let i = 4;
        setInterval(() => {
            this.setStatus(`${text}<br>Saliendo en ${i--}s`);
            if (i < 0) ipcRenderer.send('update-window-close');
        }, 1000);
    }

    setStatus(text) {
        this.message.innerHTML = text;
    }

    toggleProgress() {
        if (this.progress.classList.toggle("show")) this.setProgress(0, 1);
    }

    setProgress(value, max) {
        this.progress.value = value;
        this.progress.max = max;
    }
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.shiftKey && e.keyCode == 73 || e.keyCode == 123) {
        /* ipcRenderer.send("update-window-dev-tools"); */
    }
});
new Splash();
