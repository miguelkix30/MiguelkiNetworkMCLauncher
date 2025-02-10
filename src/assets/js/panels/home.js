/**
 * @author Luuxis
 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0
 */
import { config, database, logger, changePanel, appdata, setStatus, setInstanceBackground, pkg, popup, clickHead, getClickeableHead, toggleModsForInstance, discordAccount, toggleMusic, fadeOutAudio, setBackgroundMusic, getUsername } from '../utils.js'
import { getHWID, checkHWID, getFetchError, playMSG, playquitMSG, addInstanceMSG } from '../MKLib.js';

const clientId = '1332842776261300418';
const DiscordRPC = require('discord-rpc');
const RPC = new DiscordRPC.Client({ transport: 'ipc' });
const fs = require('fs');
const path = require('path');
let dev = process.env.NODE_ENV === 'dev';
let rpcActive = true;
let startingTime = Date.now();
let LogBan = false;
let playing = false;
DiscordRPC.register(clientId);

async function setActivity() {
    if (!RPC) return;
};
RPC.on('ready', async () => {
    setActivity();
    RPC.setActivity({
        state: `En el launcher`,
        startTimestamp: startingTime,
        largeImageKey: 'icon',
        largeImageText: `Volty Studio`,
        instance: true,
        buttons: [
            {
                label: `Discord`,
                url: pkg.discord_url,
            }
        ]
    }).catch();
    setInterval(() => {
        setActivity();
    }, 86400 * 1000);
});
RPC.login({ clientId }).catch(err => {
    console.error('Servidor de Discord no detectado. Tranquilo, esto no es una crisis.')
    rpcActive = false;
});

const { Launch } = require('minecraft-java-core')
const { shell, ipcRenderer } = require('electron')
class Home {
    static id = "home";
    intervalId = null;
    async init(config) {
        this.config = config;
        this.db = new database();
        this.news();
        this.showstore();
        this.notification();
        this.startNotificationCheck();
        this.socialLick();
        this.instancesSelect();
        this.startButtonManager();
        await this.loadRecentInstances();
        document.querySelector('.settings-btn').addEventListener('click', e => discordAccount() && changePanel('settings'));
        document.querySelector('.player-options').addEventListener('click', e => clickHead());
        this.addInstanceButton();
        this.addPlayerTooltip();
    }

    async showstore() {
        let storebutton = document.querySelector('.storebutton')
        let res = await config.GetConfig();
        if (res.store_enabled) {
        try {
            const response = await fetch(pkg.store_url).catch(err => console.error('Parece que la tienda no se encuentra online. Ocultando sección de tienda.'));
            if (response.ok) {
                /* document.querySelector('.storebutton').setAttribute('href', pkg.store_url); */
                document.querySelector('.news-blockshop').style.display = 'block';

            } else {
                console.error('Parece que la tienda no se encuentra online. Ocultando sección de tienda...');
                document.querySelector('.news-blockshop').style.display = 'none';
            }
        } catch (error) {
            console.error('Parece que la tienda no se encuentra online. Ocultando sección de tienda...');
            document.querySelector('.news-blockshop').style.display = 'none';
        }
        storebutton.addEventListener('click', e => {
            ipcRenderer.send('create-store-window');
        })
    } else {
        document.querySelector('.news-blockshop').style.display = 'none';
        console.log('La tienda se encuentra desactivada. Ocultando sección de tienda...');
    }
    }

    async notification() { 
        let res = await config.GetConfig();
        let hwid = await getHWID();
        let check = await checkHWID(hwid);
        let fetchError = await getFetchError();

        let notification = document.querySelector('.message-container');
        let notificationIcon = document.querySelector('.message-icon');
        let notificationTitle = document.querySelector('.message-title');
        let notificationContent = document.querySelector('.message-content');

        let colorRed = getComputedStyle(document.documentElement).getPropertyValue('--notification-red');
        let colorGreen = getComputedStyle(document.documentElement).getPropertyValue('--notification-green');
        let colorBlue = getComputedStyle(document.documentElement).getPropertyValue('--notification-blue');
        let colorYellow = getComputedStyle(document.documentElement).getPropertyValue('--notification-yellow');

        if (check) {
            if (fetchError == false) {
                if (LogBan == false) {
                    console.error('Se ha detectado un bloqueo de HWID. No se puede iniciar ninguna instancia.');
                    LogBan = true;
                }
                notificationTitle.innerHTML = '¡Atención!';
                notificationContent.innerHTML = "Se ha detectado un bloqueo de dispositivo. No podrá iniciar ninguna instancia hasta que su dispositivo sea desbloqueado.";
                notification.style.background = colorRed;
                notificationIcon.src = 'assets/images/notification/error.png';
                await this.showNotification();
            } else {
                if (LogBan == false) {
                    console.error('El anticheat no ha podido verificar la integridad de tu dispositivo y por lo tanto no se podrá jugar a ninguna instancia.');
                    LogBan = true;
                }
                notificationTitle.innerHTML = '¡Atención!';
                notificationContent.innerHTML = "No se ha podido conectar con el Anticheat de Volty Studio y por lo tanto no se podrá jugar a ninguna instancia.";
                notification.style.background = colorRed;
                notificationIcon.src = 'assets/images/notification/error.png';
                await this.showNotification();
            }
            
        } /* else if (process.env.NODE_ENV === 'dev') {
            notificationTitle.innerHTML = '¡Atención!';
                notificationContent.innerHTML = "Estas ejecutando el launcher desde la consola, recuerda que si utilizas el código de este launcher deberás cumplir con las condiciones de uso disponibles en el Github.";
                notification.style.background = colorRed;
                notificationIcon.src = 'assets/images/notification/exclamation2.png';
                await this.showNotification();
        } */ else if (res.notification.enabled) {
            notificationTitle.innerHTML = res.notification.title;
            notificationContent.innerHTML = res.notification.content;
            if (notificationContent.innerHTML.length > 160) {
                notificationContent.style.fontSize = '0.75rem';
                notificationTitle.style.fontSize = '1.0rem';
            }

            if (res.notification.color == 'red') notification.style.background = colorRed; else if (res.notification.color == 'green') notification.style.background = colorGreen; else if (res.notification.color == 'blue') notification.style.background = colorBlue; else if (res.notification.color == 'yellow') notification.style.background = colorYellow; else notification.style.background = res.notification.color;
            if (res.notification.icon.match(/^(http|https):\/\/[^ "]+$/)) notificationIcon.src = res.notification.icon; else if (res.notification.icon == 'info') notificationIcon.src = 'assets/images/notification/info.png'; else if (res.notification.icon == 'warning') notificationIcon.src = 'assets/images/notification/exclamation2.png'; else if (res.notification.icon == 'error') notificationIcon.src = 'assets/images/notification/error.png'; else if (res.notification.icon == 'exclamation') notificationIcon.src = 'assets/images/notification/exclamation.png'; else notificationIcon.style.display = 'none';
            await this.showNotification();
            
        } else {
            await this.hideNotification();
        }
    }

    async showNotification() {
        let notification = document.querySelector('.message-container');
        notification.style.display = 'flex';
        notification.style.visibility = 'visible';
        requestAnimationFrame(function() {
            requestAnimationFrame(function() {
                notification.style.opacity = '1';
            });
        });

    }
    
    async hideNotification() {
        let notification = document.querySelector('.message-container');
        notification.style.opacity = '0';
        await new Promise(resolve => setTimeout(resolve, 1000));
        notification.style.visibility = 'hidden';
        notification.style.display = 'none';
    }

    startNotificationCheck() {
        this.intervalId = setInterval(() => {
            this.notification();
        }, 60000);
        console.log('Comprobación de notificación programada iniciada.');
    }

    stopNotificationCheck() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        console.log('Se ha detenido la comprobación programada de notificaciones.');
    }

    async startButtonManager() {
        this.startModsButton()
        this.startMusicButton()
    }

    async startModsButton() {
        let res = await config.GetConfig();
        if (res.modsBeta || dev) {
            document.querySelector('.mods-btn').style.display = 'block';
            document.querySelector('.mods-btn').addEventListener('click', e => changePanel('mods'))
        } else {
            document.querySelector('.mods-btn').style.display = 'none';
        }
    }

    async startMusicButton() {
        let res = await config.GetConfig();
        if (res.musicBeta || dev) {
            const db = new database();
            let configClient = await this.db.readData('configClient')
            document.querySelector('.music-btn').style.display = 'block';
            document.querySelector('.music-btn').addEventListener('click', function() {if (!playing) toggleMusic();});
            if (configClient.launcher_config.music_muted) {
                document.querySelector('.music-btn').classList.remove('icon-speaker-on');
                document.querySelector('.music-btn').classList.add('icon-speaker-off');
            } else {
                document.querySelector('.music-btn').classList.remove('icon-speaker-off');
                document.querySelector('.music-btn').classList.add('icon-speaker-on');
            }
        } else {
            document.querySelector('.music-btn').style.display = 'none';
        }
    }
    
    async news() {

        let version = pkg.version
        let subversion = pkg.sub_version
        let changelog = pkg.changelog
        let titlechangelog = document.querySelector('.titlechangelog')
        let changelogcontent = document.querySelector('.bbWrapper')
        changelogcontent.innerHTML = `<p>${changelog}</p>`
        titlechangelog.innerHTML = `Volty Studio Launcher ${version}${subversion ? `-${subversion}` : ''}`;

        let newsElement = document.querySelector('.news-list');
        let news = await config.getNews().then(res => res).catch(err => false);
        if (news) {
            if (!news.length) {
                let blockNews = document.createElement('div');
                blockNews.classList.add('news-block');
                blockNews.innerHTML = `
                    <div class="news-header">
                        <div class="header-text">
                            <div class="title">Actualmente no hay noticias disponibles.</div>
                        </div>
                        <div class="date">
                            <div class="day">1</div>
                            <div class="month">Enero</div>
                        </div>
                    </div>
                    <div class="news-content">
                        <div class="bbWrapper">
                            <p>Puede seguir todas las noticias sobre el servidor aquí.</p>
                        </div>
                    </div>`
                newsElement.appendChild(blockNews);
            } else {
                for (let News of news) {
                    let date = this.getdate(News.publish_date)
                    let blockNews = document.createElement('div');
                    blockNews.classList.add('news-block');
                    blockNews.innerHTML = `
                        <div class="news-header">
                            <div class="header-text">
                                <div class="title">${News.title}</div>
                            </div>
                            <div class="date">
                                <div class="day">${date.day}</div>
                                <div class="month">${date.month}</div>
                            </div>
                        </div>
                        <div class="news-content">
                            <div class="bbWrapper">
                                <p>${News.content.replace(/\n/g, '</br>')}</p>
                                <p class="news-author">Autor - <span>${News.author}</span></p>
                            </div>
                        </div>`
                    newsElement.appendChild(blockNews);
                }
            }
        } else {
            let blockNews = document.createElement('div');
            blockNews.classList.add('news-block');
            // eliminado debajo de news-header: <img class="server-status-icon" src="assets/images/icon.png">
            blockNews.innerHTML = `
                <div class="news-header">
                        <div class="header-text">
                            <div class="title">Error.</div>
                        </div>
                        <div class="date">
                            <div class="day">1</div>
                            <div class="month">Enero</div>
                        </div>
                    </div>
                    <div class="news-content">
                        <div class="bbWrapper">
                            <p>No se puede contactar con el servidor de noticias, probablemente la rata de dixo se ha comido los cables de conexión.</p>
                        </div>
                    </div>`
            newsElement.appendChild(blockNews);
        }
    }

    socialLick() {
        let socials = document.querySelectorAll('.social-block')

        socials.forEach(social => {
            social.addEventListener('click', e => {
                shell.openExternal(e.target.dataset.url)
            })
        });
    }

    async instancesSelect() {
        let configClient = await this.db.readData('configClient');
        let auth = await this.db.readData('accounts', configClient.account_selected);
        let username = await getUsername();
        let instancesList = await config.getInstanceList();
        let instanceSelect = instancesList.find(i => i.name == configClient?.instance_selct) ? configClient?.instance_selct : null;

        let instanceBTN = document.querySelector('.play-instance');
        let instancePopup = document.querySelector('.instance-popup');
        let instancesGrid = document.querySelector('.instances-grid');
        let instanceSelectBTN = document.querySelector('.instance-select');
        let instanceCloseBTN = document.querySelector('.close-popup');

        /* if (instancesList.length === 1) {
            instanceSelectBTN.style.display = 'none';
        } */

        if (!instanceSelect) {
            let newInstanceSelect = instancesList.find(i => i.whitelistActive == false);
            configClient.instance_selct = newInstanceSelect.name;
            instanceSelect = newInstanceSelect.name;
            await this.db.updateData('configClient', configClient);
        }

        for (let instance of instancesList) {
            if (instance.whitelistActive) {
                let whitelist = instance.whitelist.find(whitelist => whitelist == username);
                if (whitelist !== username) {
                    if (instance.name == instanceSelect) {
                        let newInstanceSelect = instancesList.find(i => i.whitelistActive == false);
                        configClient.instance_selct = newInstanceSelect.name;
                        instanceSelect = newInstanceSelect.name;
                        setStatus(newInstanceSelect);
                        setBackgroundMusic(newInstanceSelect.backgroundMusic);
                        setInstanceBackground(newInstanceSelect.background);
                        await this.db.updateData('configClient', configClient);
                    }
                }
            } else {
                console.log(`Configurando instancia ${instance.name}...`);
            }
            if (instance.name == instanceSelect) setStatus(instance);
            if (instance.name == instanceSelect) setBackgroundMusic(instance.backgroundMusic);
            if (instance.name == instanceSelect) setInstanceBackground(instance.background);
            if (instance.name == instanceSelect) this.updateSelectedInstanceStyle(instanceSelect);
            this.notification();
        }

        instanceSelectBTN.removeEventListener('click', this.instanceSelectClickHandler);
        this.instanceSelectClickHandler = async () => {
            if (instanceSelectBTN.disabled) return;
            let username = await getUsername();
            instancesGrid.innerHTML = '';
            for (let instance of instancesList) {
                let color = instance.maintenance ? 'red' : 'green';
                let whitelist = instance.whitelistActive && instance.whitelist.includes(username);
                let imageUrl = instance.thumbnail || 'assets/images/default/placeholder.jpg';
                if (!instance.whitelistActive || whitelist) {
                    instancesGrid.innerHTML += `
                        <div id="${instance.name}" class="instance-element ${instance.name === instanceSelect ? 'active-instance' : ''}">
                            <div class="instance-image" style="background-image: url('${imageUrl}');"></div>
                            <div class="instance-name">${instance.name}<div class="instance-mkid" style="background-color: ${color};"></div></div>
                        </div>`;
                }
            }
            instancePopup.classList.add('show');
        };
        instanceSelectBTN.addEventListener('click', this.instanceSelectClickHandler);

        instancePopup.addEventListener('click', async e => {
            let configClient = await this.db.readData('configClient');

            if (e.target.closest('.instance-element')) {
                let newInstanceSelect = e.target.closest('.instance-element').id;
                let activeInstanceSelect = document.querySelector('.active-instance');

                if (activeInstanceSelect) activeInstanceSelect.classList.remove('active-instance');
                e.target.closest('.instance-element').classList.add('active-instance');

                configClient.instance_selct = newInstanceSelect;
                await this.db.updateData('configClient', configClient);
                instanceSelect = newInstanceSelect;
                instancePopup.classList.remove('show');
                this.notification();
                let instance = await config.getInstanceList();
                let options = instance.find(i => i.name == configClient.instance_selct);
                setStatus(options);
                setBackgroundMusic(options.backgroundMusic);
                setInstanceBackground(options.background);
                this.updateSelectedInstanceStyle(newInstanceSelect);
            }
        });

        instanceBTN.addEventListener('click', async () => {
            this.startGame();
        });

        instanceCloseBTN.addEventListener('click', () => {
            instancePopup.classList.remove('show');
            this.notification();
        });
    }

    async startGame() {
        let launch = new Launch()
        let configClient = await this.db.readData('configClient')
        let instance = await config.getInstanceList()
        let authenticator = await this.db.readData('accounts', configClient.account_selected)
        let options = instance.find(i => i.name == configClient.instance_selct)

        let hwid = await getHWID();
        let check = await checkHWID(hwid);
        let fetchError = await getFetchError();

        let playInstanceBTN = document.querySelector('.play-instance')
        let infoStartingBOX = document.querySelector('.info-starting-game')
        let instanceSelectBTN = document.querySelector('.instance-select')
        let infoStarting = document.querySelector(".info-starting-game-text")
        let progressBar = document.querySelector('.progress-bar')

        if (check) {
            if (fetchError == false) {
                let popupError = new popup()
                popupError.openPopup({
                    title: 'Error',
                    content: 'No puedes iniciar ninguna instancia debido al bloqueo de dispositivo presente.<br><br>Si crees que esto es un error, abre ticket en el discord de Volty Studio.',
                    color: 'red',
                    options: true
                })
                return;
            } else {
                let popupError = new popup()
                popupError.openPopup({
                    title: 'Error',
                    content: 'No se ha podido conectar con el Anticheat de Volty Studio y por lo tanto no se podrá jugar a ninguna instancia.',
                    color: 'red',
                    options: true
                })
                return;
            }
        }
        if (options.maintenance) {
            let popupError = new popup()
            if (options.maintenancemsg == '') {
                popupError.openPopup({
                    title: 'Error al iniciar el cliente',
                    content: 'El cliente no se encuentra disponible.',
                    color: 'red',
                    options: true
                })
            } else {
                popupError.openPopup({
                    title: 'Error al iniciar el cliente',
                    content: options.maintenancemsg,
                    color: 'red',
                    options: true
                })
            }
            return;
        }

        let username = await getUsername();
        if (options.whitelistActive && !options.whitelist.includes(username)) {
            let popupError = new popup();
            popupError.openPopup({
                title: 'Error',
                content: 'No tienes permiso para iniciar esta instancia.',
                color: 'red',
                options: true
            });
            return;
        }

        let clickHead = await getClickeableHead();
        if (!options.mkid && clickHead) {
            let popupInstance = new popup();
            let dialogResult = await new Promise(resolve => {
                popupInstance.openDialog({
                    title: 'Instancia no compatible con MKNetworkID',
                    content: 'Se ha detectado que estás intentando iniciar una instancia que no es compatible con MKNetworkID. ¿Deseas continuar?',
                    options: true,
                    callback: resolve
                });
            });
            if (dialogResult === 'cancel') {
                return;
            }
        }

        let recentInstances = configClient.recent_instances || [];
        recentInstances = recentInstances.filter(name => name !== options.name);
        recentInstances.unshift(options.name);
        if (recentInstances.length > 3) recentInstances.pop();
        configClient.recent_instances = recentInstances;
        await this.db.updateData('configClient', configClient);
        await this.loadRecentInstances();
        await this.loadRecentInstances();

        let opt = {
            url: options.url,
            authenticator: authenticator,
            timeout: 10000,
            path: `${await appdata()}/${process.platform == 'darwin' ? this.config.dataDirectory : `.${this.config.dataDirectory}`}`,
            instance: options.name,
            version: options.loadder.minecraft_version,
            detached: configClient.launcher_config.closeLauncher == "close-all" ? false : true,
            downloadFileMultiple: configClient.launcher_config.download_multi,
            intelEnabledMac: configClient.launcher_config.intelEnabledMac,

            loader: {
                type: options.loadder.loadder_type,
                build: options.loadder.loadder_version,
                enable: options.loadder_type == 'none' ? false : true
            },

            verify: options.verify,

            ignored: [...options.ignored],

            javaPath: configClient.java_config.java_path,

            screen: {
                width: configClient.game_config.screen_size.width,
                height: configClient.game_config.screen_size.height
            },

            memory: {
                min: `${configClient.java_config.java_memory.min * 1024}M`,
                max: `${configClient.java_config.java_memory.max * 1024}M`
            }
        }
        let musicMuted = configClient.launcher_config.music_muted;
        let musicPlaying = true;
        launch.Launch(opt);

        playInstanceBTN.style.display = "none"
        infoStartingBOX.style.display = "block"
        instanceSelectBTN.disabled = true;
        instanceSelectBTN.classList.add('disabled');
        progressBar.style.display = "";
        ipcRenderer.send('main-window-progress-load')

        launch.on('extract', extract => {
            ipcRenderer.send('main-window-progress-load')
            console.log(extract);
        });

        launch.on('progress', (progress, size) => {
            infoStarting.innerHTML = `Descargando... ${((progress / size) * 100).toFixed(0)}%`
            ipcRenderer.send('main-window-progress', { progress, size })
            progressBar.value = progress;
            progressBar.max = size;
        });

        launch.on('check', (progress, size) => {
            infoStarting.innerHTML = `Verificando... ${((progress / size) * 100).toFixed(0)}%`
            ipcRenderer.send('main-window-progress', { progress, size })
            progressBar.value = progress;
            progressBar.max = size;
            toggleModsForInstance(options.name);
        });

        launch.on('estimated', (time) => {
            let hours = Math.floor(time / 3600);
            let minutes = Math.floor((time - hours * 3600) / 60);
            let seconds = Math.floor(time - hours * 3600 - minutes * 60);
            console.log(`Tiempo de descarga estimado: ${hours}h ${minutes}m ${seconds}s`);
        })

        launch.on('speed', (speed) => {
            console.log(`Velocidad de descarga: ${(speed / 1067008).toFixed(2)} Mb/s`)
        })

        launch.on('patch', patch => {
            console.log(patch);
            ipcRenderer.send('main-window-progress-load')
            infoStarting.innerHTML = `Parcheando...`
        });

        launch.on('data', (e) => {
            if (!musicMuted && musicPlaying) {
                musicPlaying = false;
                fadeOutAudio();
            }
            progressBar.style.display = "none"
            if (configClient.launcher_config.closeLauncher == 'close-launcher') {
                ipcRenderer.send("main-window-hide")
            };
            if (rpcActive) {
                RPC.setActivity({
                    state: `Jugando a ${configClient.instance_selct}`,
                    startTimestamp: startingTime,
                    largeImageKey: 'icon',
                    largeImageText: `Volty Studio`,
                    instance: true,
                    buttons: [
                        {
                            label: `Discord`,
                            url: pkg.discord_url,
                        }
                    ]
                })
            }
            if(!playing) {
                playing = true;
                playMSG(configClient.instance_selct);
            }
            new logger('Minecraft', '#36b030');
            console.log(e);

            ipcRenderer.send('main-window-progress-load')
            infoStarting.innerHTML = `Iniciando...`
        })

        launch.on('close', code => {
            if (configClient.launcher_config.closeLauncher == 'close-launcher') {
                ipcRenderer.send("main-window-show")
            };
            ipcRenderer.send('main-window-progress-reset')
            this.notification()
            if (!musicMuted && !musicPlaying) {
                musicPlaying = true;
                setBackgroundMusic(options.backgroundMusic);
            }
            infoStartingBOX.style.display = "none"
            playInstanceBTN.style.display = "flex"
            instanceSelectBTN.disabled = false;
            instanceSelectBTN.classList.remove('disabled');
            infoStarting.innerHTML = `Cerrando...`
            new logger(pkg.name, '#7289da');
            console.log('Close');
            console.log(options.cleaning);
            if (options.cleaning.enabled) {
                for (let file of options.cleaning.files) {
                    const filePath = path.join(opt.path, "instances", options.name, file);
                    console.log(filePath);
                    if (fs.existsSync(filePath)) {
                        try {
                            if (fs.lstatSync(filePath).isDirectory()) {
                                fs.rmSync(filePath, { recursive: true, force: true });
                            } else {
                                fs.unlinkSync(filePath);
                            }
                        } catch (err) {
                            console.error(`Error removing ${filePath}:`, err);
                        }
                    }
                }
            }
            if (rpcActive) {
                RPC.setActivity({
                    state: `En el launcher`,
                    startTimestamp: startingTime,
                    largeImageKey: 'icon',
                    largeImageText: `Volty Studio`,
                    instance: true,
                    buttons: [
                        {
                            label: `Discord`,
                            url: pkg.discord_url,
                        }
                    ]
                }).catch();
                playquitMSG(configClient.instance_selct);
                playing = false;
            }
        });

        launch.on('error', err => {
            let popupError = new popup()
            if (typeof err.error === 'undefined') {
                new logger(pkg.name, '#7289da');
                console.warn('Ha occurrido un error en la descarga de algún archivo. Si el juego no inicia correctamente esto puede ser la causa.');
                if (configClient.launcher_config.closeLauncher == 'close-launcher') {
                    ipcRenderer.send("main-window-show")
                };
                if (rpcActive) {
                    RPC.setActivity({
                        state: `En el launcher`,
                        startTimestamp: startingTime,
                        largeImageKey: 'icon',
                        largeImageText: `Volty Studio`,
                        instance: true,
                        buttons: [
                            {
                                label: `Discord`,
                                url: pkg.discord_url,
                            }
                        ]
                    }).catch();
                }
            } else {
                popupError.openPopup({
                    title: 'Error',
                    content: err.error,
                    color: 'red',
                    options: true
                })

                if (configClient.launcher_config.closeLauncher == 'close-launcher') {
                    ipcRenderer.send("main-window-show")
                };
                ipcRenderer.send('main-window-progress-reset')
                if (!musicMuted && !musicPlaying) {
                    musicPlaying = true;
                    setBackgroundMusic(options.backgroundMusic);
                }
                infoStartingBOX.style.display = "none"
                playInstanceBTN.style.display = "flex"
                instanceSelectBTN.disabled = false;
                instanceSelectBTN.classList.remove('disabled');
                infoStarting.innerHTML = `Verificando...`
                new logger(pkg.name, '#7289da');
                console.log(err);
                this.notification()
                if (rpcActive) {
                    RPC.setActivity({
                        state: `En el launcher`,
                        largeImageKey: 'icon',
                        largeImageText: `Volty Studio`,
                        instance: true,
                        buttons: [
                            {
                                label: `Discord`,
                                url: pkg.discord_url,
                            }
                        ]
                    }).catch();
                }
            }
        });
    }

    async loadRecentInstances() {
        let configClient = await this.db.readData('configClient');
        let recentInstances = configClient.recent_instances || [];
        let recentInstancesContainer = document.querySelector('.recent-instances');

        recentInstancesContainer.innerHTML = '';

        for (let instanceName of recentInstances) {
            let instance = await config.getInstanceList().then(instances => instances.find(i => i.name === instanceName));
            if (instance) {
                let button = document.createElement('div');
                button.classList.add('recent-instance-button');
                button.style.backgroundImage = `url(${instance.icon || instance.thumbnail || 'assets/images/default/placeholder.jpg'})`;
                button.dataset.instanceName = instanceName;
                if (instanceName === configClient.instance_selct) {
                    button.classList.add('selected-instance');
                }
                button.addEventListener('click', async (e) => {
                    let username = await getUsername();
                    if (instance.whitelistActive && !instance.whitelist.includes(username)) {
                        let popupError = new popup();
                        popupError.openPopup({
                            title: 'Error',
                            content: 'No tienes permiso para seleccionar esta instancia.',
                            color: 'red',
                            options: true
                        });
                    } else {
                        await this.selectInstance(instanceName);
                    }
                });

                button.addEventListener('mouseenter', (e) => {
                    let tooltip = document.createElement('div');
                    tooltip.classList.add('tooltip');
                    tooltip.innerHTML = instanceName;
                    document.body.appendChild(tooltip);
                    let rect = button.getBoundingClientRect();
                    tooltip.style.left = `${rect.right + window.scrollX + 10}px`;
                    tooltip.style.top = `${rect.top + window.scrollY + rect.height / 2 - tooltip.offsetHeight / 2}px`;
                    button.tooltip = tooltip;
                    requestAnimationFrame(() => {
                        tooltip.style.opacity = '1';
                    });
                });

                button.addEventListener('mouseleave', (e) => {
                    if (button.tooltip) {
                        button.tooltip.style.opacity = '0';
                        setTimeout(() => {
                            if (button.tooltip) {
                                document.body.removeChild(button.tooltip);
                                button.tooltip = null;
                            }
                        }, 200);
                    }
                });

                recentInstancesContainer.appendChild(button);
            } else {
                recentInstances = recentInstances.filter(name => name !== instanceName);
                configClient.recent_instances = recentInstances;
                await this.db.updateData('configClient', configClient);
            }
        }
    }

    async selectInstance(instanceName) {
        let selectInstanceBTN = document.querySelector('.instance-select');
        if (selectInstanceBTN.disabled) return;
        let configClient = await this.db.readData('configClient');
        configClient.instance_selct = instanceName;
        await this.db.updateData('configClient', configClient);
        let instance = await config.getInstanceList().then(instances => instances.find(i => i.name === instanceName));
        this.notification();
        setStatus(instance);
        setBackgroundMusic(instance.backgroundMusic);
        setInstanceBackground(instance.background);
        this.updateSelectedInstanceStyle(instanceName);
    }

    updateSelectedInstanceStyle(instanceName) {
        let recentInstancesContainer = document.querySelector('.recent-instances');
        let buttons = recentInstancesContainer.querySelectorAll('.recent-instance-button');
        buttons.forEach(button => {
            if (button.dataset.instanceName === instanceName) {
                button.classList.add('selected-instance');
            } else {
                button.classList.remove('selected-instance');
            }
        });
    }

    getdate(e) {
        let date = new Date(e)
        let year = date.getFullYear()
        let month = date.getMonth() + 1
        let day = date.getDate()
        let allMonth = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
        return { year: year, month: allMonth[month - 1], day: day }
    }

    addInstanceButton() {
        const addInstanceButton = document.querySelector('.add-instance');
        const instancePopup = document.querySelector('.instance-popup');
        const addInstancePopup = document.querySelector('.add-instance-popup');
        const addInstanceInput = document.querySelector('.add-instance-input');
        const addInstanceConfirm = document.querySelector('.add-instance-confirm');
        const addInstanceCancel = document.querySelector('.add-instance-cancel');

        addInstanceButton.addEventListener('click', () => {
            addInstancePopup.classList.add('show');
        });

        addInstanceConfirm.addEventListener('click', async () => {
            const code = addInstanceInput.value;
            if (code) {
                try {
                    const username = await getUsername();
                    const response = await fetch(`${pkg.url}/api/instance-code.php?code=${code}&user=${username}`);
                    const result = await response.json();

                    const popupMessage = new popup();
                    popupMessage.openPopup({
                        title: result.success ? 'Éxito' : 'Error',
                        content: result.message,
                        color: result.success ? 'green' : 'red',
                        options: true
                    });
                    if (result.success) {
                        await this.instancesSelect();
                    }
                    addInstanceMSG(result.success, code);
                    addInstancePopup.classList.remove('show');
                    addInstanceInput.value = '';
                } catch (error) {
                    addInstanceMSG(false, code);
                    const popupMessage = new popup();
                    popupMessage.openPopup({
                        title: 'Error',
                        content: 'Ha ocurrido un error al intentar agregar el código.',
                        color: 'red',
                        options: true
                    });
                }
            }
        });

        addInstanceCancel.addEventListener('click', () => {
            addInstancePopup.classList.remove('show');
            addInstanceInput.value = '';
        });
    }

    addPlayerTooltip() {
        const playerOptions = document.querySelector('.player-options');
        const playerHead = document.querySelector('.player-head');

        const showTooltip = async (element) => {
            const username = await getUsername();
            let tooltip = document.createElement('div');
            tooltip.classList.add('tooltip');
            tooltip.innerHTML = username;
            document.body.appendChild(tooltip);
            let rect = element.getBoundingClientRect();
            tooltip.style.left = `${rect.right + window.scrollX + 10}px`;
            tooltip.style.top = `${rect.top + window.scrollY + rect.height / 2 - tooltip.offsetHeight / 2}px`;
            element.tooltip = tooltip;
            requestAnimationFrame(() => {
                tooltip.style.opacity = '1';
            });
        };

        const hideTooltip = (element) => {
            if (element.tooltip) {
                element.tooltip.style.opacity = '0';
                setTimeout(() => {
                    if (element.tooltip) {
                        document.body.removeChild(element.tooltip);
                        element.tooltip = null;
                    }
                }, 200);
            }
        };

        playerOptions.addEventListener('mouseenter', () => showTooltip(playerOptions));
        playerOptions.addEventListener('mouseleave', () => hideTooltip(playerOptions));
        playerHead.addEventListener('mouseenter', () => showTooltip(playerHead));
        playerHead.addEventListener('mouseleave', () => hideTooltip(playerHead));
    }
}
export default Home;