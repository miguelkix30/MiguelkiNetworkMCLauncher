/**
 * @author Luuxis
 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0
 */
const { ipcRenderer } = require('electron');
const os = require('os');
import { config, database } from './utils.js';

let dev = process.env.NODE_ENV === 'dev';


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
            let theme = configClient?.launcher_config?.theme || "auto"
            let isDarkTheme = await ipcRenderer.invoke('is-dark-theme', theme).then(res => res)
            document.body.className = isDarkTheme ? 'dark global' : 'light global';
            if (process.platform == 'win32') ipcRenderer.send('update-window-progress-load')
            this.startAnimation()
        });
    }

    async startAnimation() {
        let splashes = [
            { "message": "Miguelki Network", "author": "Miguelki" },
            { "message": "Das Leben ist nicht Schwäche verzeihen", "author": "Adolf Hitler" },
            { "message": "1 de cada 2 personas son gays.", "author": "Miguelki" },
            { "message": "Zzz", "author": "Miguelki" },
            { "message": "Messi", "author": "Messi" },
            { "message": "Aún va sin h miguel", "author": "Carmen" },
            { "message": "Vaporeon puede tener relaciones con humanos", "author": " " },
            { "message": "Tienes menos luces que una lampara", "author": "Miguelki" },
            { "message": "Te llama tu madre", "author": "Miguelki" },
            { "message": "Argentina ganó 🏳‍🌈. Ups bandera erronea", "author": "Miguelki" },
            { "message": "Perdon por besar a tu madre", "author": "Miguelki" },
            { "message": "Bese a tu novia. Ah perdon que no tienes", "author": "Miguelki" },
            { "message": "Entrando en tu cerebro.", "author": "Miguelki" },
            { "message": "13, cuanto más me la mamas más me crece.", "author": "Dixo" },
            { "message": "🕸️🕷️🤘", "author": "Chiquicas" },
            { "message": "Dixo es super maricón 🏳‍🌈👨🏿‍❤️‍💋‍👨🏿", "author": "Chiquicas" },
            { "message": "Va llorah, Mateo?", "author": "Dixo" },
            { "message": "Ayuda.... Foack. Ayuda.... Foack. Ayuda.... Foack.", "author": "Miguelki" },
            { "message": "Milleurista???", "author": "Joako Puto" },
            { "message": "Me aburro", "author": "Miguelki" }
        ];
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
        if (dev) return this.startLauncher();
        this.setStatus(`Buscando actualizaciones...`);

        ipcRenderer.invoke('update-app').then().catch(err => {
            return this.shutdown(`Error al buscar actualizaciones:<br>${err.message}`);
        });

        ipcRenderer.on('updateAvailable', () => {
            this.setStatus(`Actualización disponible`);
            ipcRenderer.send('start-update');
        })

        ipcRenderer.on('error', (event, err) => {
            if (err) return this.shutdown(`${err.message}`);
        })

        ipcRenderer.on('download-progress', (event, progress) => {
            this.toggleProgress();
            ipcRenderer.send('update-window-progress', { progress: progress.transferred, size: progress.total })
            this.setProgress(progress.transferred, progress.total);
        })

        ipcRenderer.on('update-not-available', () => {
            console.error("Actualización no disponible");
            this.maintenanceCheck();
        })
    }

    async maintenanceCheck() {
        config.GetConfig().then(res => {
            if (res.maintenance) return this.shutdown(res.maintenance_message);
            this.startLauncher();
        }).catch(e => {
            console.error(e);
            return this.shutdown("No se ha podido conectar al servidor.<br>Por favor, inténtalo más tarde.");
        })
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
        ipcRenderer.send("update-window-dev-tools");
    }
})
new Splash();