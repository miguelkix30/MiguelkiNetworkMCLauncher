/**
 * @author Luuxis
 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0
 */
import { config, database, logger, changePanel, appdata, setStatus, setInstanceBackground, pkg, popup, clickHead, getClickeableHead, toggleModsForInstance, discordAccount, toggleMusic, fadeOutAudio, initializeMusic } from '../utils.js'
import { getHWID, checkHWID, getFetchError, sendPlayingMessage, sendStoppedPlayingMessage } from '../MKLib.js';

const clientId = '857169541708775445';
const DiscordRPC = require('discord-rpc');
const RPC = new DiscordRPC.Client({ transport: 'ipc' });
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
        smallImageKey: 'verificado',
        largeImageText: `Miguelki Network`,
        instance: true,
        buttons: [
            {
                label: `Discord`,
                url: `https://discord.gg/7kPGjgJND7`,
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
        this.news()
        this.showstore()
        this.notification()
        this.startNotificationCheck()
        this.socialLick()
        this.instancesSelect()
        this.startButtonManager()
        document.querySelector('.settings-btn').addEventListener('click', e => discordAccount() && changePanel('settings'))
        document.querySelector('.player-options').addEventListener('click', e => clickHead())
    }

    async showstore() {
        let storebutton = document.querySelector('.storebutton')
        try {
            const response = await fetch(pkg.store_url).catch(err => console.error('Parece que la tienda no se encuentra online. Ocultando sección de tienda.'));
            if (response.ok) {
                /* document.querySelector('.storebutton').setAttribute('href', pkg.store_url); */
                document.querySelector('.news-blockshop').style.display = 'block';

            } else {
                console.error('Parece que la tienda no se encuentra online. Ocultando sección de tienda.');
                document.querySelector('.news-blockshop').style.display = 'none';
            }
        } catch (error) {
            console.error('Parece que la tienda no se encuentra online. Ocultando sección de tienda.');
            document.querySelector('.news-blockshop').style.display = 'none';
        }
        storebutton.addEventListener('click', e => {
            ipcRenderer.send('create-store-window');
        })
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
                notificationContent.innerHTML = "No se ha podido conectar con el Anticheat de Miguelki Network y por lo tanto no se podrá jugar a ninguna instancia.";
                notification.style.background = colorRed;
                notificationIcon.src = 'assets/images/notification/error.png';
                await this.showNotification();
            }
            
        } else if (process.env.NODE_ENV === 'dev') {
            notificationTitle.innerHTML = '¡Atención!';
                notificationContent.innerHTML = "Estas ejecutando el launcher desde la consola, recuerda que si utilizas el código de este launcher deberás cumplir con las condiciones de uso disponibles en el Github.";
                notification.style.background = colorRed;
                notificationIcon.src = 'assets/images/notification/exclamation2.png';
                await this.showNotification();
        } else if (res.notification.enabled) {
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
        let res = await config.GetConfig();
        if ((res.modsBeta && res.musicBeta) || dev) {
            document.querySelector('.play-elements').style.marginLeft = "100px";
        } else if (res.modsBeta || res.musicBeta) {
            document.querySelector('.play-elements').style.marginLeft = "40px";
        } else {
            document.querySelector('.play-elements').style.marginLeft = "0px";
        }
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
            document.querySelector('.music-btn').addEventListener('click', e => toggleMusic())   
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
        titlechangelog.innerHTML = `Miguelki Network MC Launcher ${version}${subversion ? `-${subversion}` : ''}`;

        let newsElement = document.querySelector('.news-list');
        let news = await config.getNews().then(res => res).catch(err => false);
        if (news) {
            if (!news.length) {
                let blockNews = document.createElement('div');
                blockNews.classList.add('news-block');
                blockNews.innerHTML = `
                    <div class="news-header">
                        <img class="server-status-icon" src="assets/images/icon.png">
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
                        <img class="server-status-icon" src="assets/images/icon.png">
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
            blockNews.innerHTML = `
                <div class="news-header">
                        <img class="server-status-icon" src="assets/images/icon.png">
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
        let configClient = await this.db.readData('configClient')
        let auth = await this.db.readData('accounts', configClient.account_selected)
        let instancesList = await config.getInstanceList()
        let instanceSelect = instancesList.find(i => i.name == configClient?.instance_selct) ? configClient?.instance_selct : null

        let instanceBTN = document.querySelector('.play-instance')
        let instancePopup = document.querySelector('.instance-popup')
        let instancesListPopup = document.querySelector('.instances-List')
        let instanceCloseBTN = document.querySelector('.close-popup')

        if (instancesList.length === 1) {
            document.querySelector('.instance-select').style.display = 'none'
            instanceBTN.style.paddingRight = '0'
        }

        if (!instanceSelect) {
            let newInstanceSelect = instancesList.find(i => i.whitelistActive == false)
            let configClient = await this.db.readData('configClient')
            configClient.instance_selct = newInstanceSelect.name
            instanceSelect = newInstanceSelect.name
            await this.db.updateData('configClient', configClient)
        }

        for (let instance of instancesList) {
            if (instance.whitelistActive) {
                let whitelist = instance.whitelist.find(whitelist => whitelist == auth?.name)
                if (whitelist !== auth?.name) {
                    if (instance.name == instanceSelect) {
                        let newInstanceSelect = instancesList.find(i => i.whitelistActive == false)
                        let configClient = await this.db.readData('configClient')
                        configClient.instance_selct = newInstanceSelect.name
                        instanceSelect = newInstanceSelect.name
                        setStatus(newInstanceSelect.status)
                        setInstanceBackground(newInstanceSelect.background)
                        await this.db.updateData('configClient', configClient)
                    }
                }
            } else console.log(`Configurando instancia ${instance.name}...`)
            if (instance.name == instanceSelect) setStatus(instance.status)
            if (instance.name == instanceSelect) setInstanceBackground(instance.background)
            this.notification()
        }

        instancePopup.addEventListener('click', async e => {
            let configClient = await this.db.readData('configClient')

            if (e.target.classList.contains('instance-elements')) {
                let newInstanceSelect = e.target.id
                let activeInstanceSelect = document.querySelector('.active-instance')

                if (activeInstanceSelect) activeInstanceSelect.classList.toggle('active-instance');
                e.target.classList.add('active-instance');

                configClient.instance_selct = newInstanceSelect
                await this.db.updateData('configClient', configClient)
                instanceSelect = instancesList.filter(i => i.name == newInstanceSelect)
                instancePopup.classList.remove('show');
                this.notification()
                let instance = await config.getInstanceList()
                let options = instance.find(i => i.name == configClient.instance_selct)
                await setStatus(options.status)
                await setInstanceBackground(options.background)
            }
        })

        instanceBTN.addEventListener('click', async e => {
            let configClient = await this.db.readData('configClient')
            let instanceSelect = configClient.instance_selct
            let auth = await this.db.readData('accounts', configClient.account_selected)

            if (e.target.classList.contains('instance-select')) {
                instancesListPopup.innerHTML = ''
                for (let instance of instancesList) {
                    let color = instance.mkid ? 'green' : 'red';
                    if (instance.whitelistActive) {
                        instance.whitelist.map(whitelist => {
                            if (whitelist == auth?.name) {
                                if (instance.name == instanceSelect) {
                                    instancesListPopup.innerHTML += `<div id="${instance.name}" class="instance-elements active-instance">${instance.name}&#160;<span style="color:${color}; text-shadow: -1px 0 white, 0 1px white, 1px 0 white, 0 -1px white; float: right;">MKNetID&#160;</span></div>`
                                } else {
                                    instancesListPopup.innerHTML += `<div id="${instance.name}" class="instance-elements">${instance.name}&#160;<span style="color:${color}; text-shadow: -1px 0 white, 0 1px white, 1px 0 white, 0 -1px white; float: right;">MKNetID&#160;</span></div>`
                                }
                            }
                        })
                    } else {
                        if (instance.name == instanceSelect) {
                            instancesListPopup.innerHTML += `<div id="${instance.name}" class="instance-elements active-instance">${instance.name}&#160;<span style="color:${color}; text-shadow: -1px 0 white, 0 1px white, 1px 0 white, 0 -1px white; float: right;">MKNetID&#160;</span></div>`
                        } else {
                            instancesListPopup.innerHTML += `<div id="${instance.name}" class="instance-elements">${instance.name}&#160;<span style="color:${color}; text-shadow: -1px 0 white, 0 1px white, 1px 0 white, 0 -1px white; float: right;">MKNetID&#160;</span></div>`
                        }
                    }
                }
                instancePopup.classList.add('show');

            }

            if (!e.target.classList.contains('instance-select')) this.startGame()
        })

        instanceCloseBTN.addEventListener('click', () => {
            instancePopup.classList.remove('show');
            this.notification();
        })
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
        let infoStarting = document.querySelector(".info-starting-game-text")
        let progressBar = document.querySelector('.progress-bar')

        if (check) {
            if (fetchError == false) {
                let popupError = new popup()
            popupError.openPopup({
                title: 'Error',
                content: 'No puedes iniciar ninguna instancia debido al bloqueo de dispositivo presente.<br><br>Si crees que esto es un error, abre ticket en el discord de Miguelki Network.',
                color: 'red',
                options: true
            })
            return;
             } else {
                let popupError = new popup()
                popupError.openPopup({
                    title: 'Error',
                    content: 'No se ha podido conectar con el Anticheat de Miguelki Network y por lo tanto no se podrá jugar a ninguna instancia.',
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
            
        } else {
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
            console.log('iniciando minecraftjavacore intance')
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
                    enable: options.loadder.loadder_type == 'none' ? false : true
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
            console.log('lanzado')
            console.log(opt)
            launch.Launch(opt);
            console.log('lanzado2')

        playInstanceBTN.style.display = "none"
        infoStartingBOX.style.display = "block"
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
            console.log(`${hours}h ${minutes}m ${seconds}s`);
        })

        launch.on('speed', (speed) => {
            console.log(`${(speed / 1067008).toFixed(2)} Mb/s`)
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
                    smallImageKey: 'verificado',
                    largeImageText: `Miguelki Network`,
                    instance: true,
                    buttons: [
                        {
                            label: `Discord`,
                            url: `https://discord.gg/7kPGjgJND7`,
                        }
                    ]
                })
            }
            if(!playing) {
                playing = true;
                sendPlayingMessage(configClient.instance_selct);
            }
// ARREGLAR LOGGER O SI NO NO FUNCA
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
                initializeMusic();
            }
            infoStartingBOX.style.display = "none"
            playInstanceBTN.style.display = "flex"
            infoStarting.innerHTML = `Cerrando...`
            new logger(pkg.name, '#7289da');
            console.log('Close');
            if (rpcActive) {
            RPC.setActivity({
                state: `En el launcher`,
                startTimestamp: startingTime,
                largeImageKey: 'icon',
                smallImageKey: 'verificado',
                largeImageText: `Miguelki Network`,
                instance: true,
                buttons: [
                    {
                        label: `Discord`,
                        url: `https://discord.gg/7kPGjgJND7`,
                    }
                ]
            }).catch();
            sendStoppedPlayingMessage(configClient.instance_selct);
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
                    smallImageKey: 'verificado',
                    largeImageText: `Miguelki Network`,
                    instance: true,
                    buttons: [
                        {
                            label: `Discord`,
                            url: `https://discord.gg/7kPGjgJND7`,
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
                    fadeInAudio();
                }
                infoStartingBOX.style.display = "none"
                playInstanceBTN.style.display = "flex"
                infoStarting.innerHTML = `Verificando...`
                new logger(pkg.name, '#7289da');
                console.log(err);
                this.notification()
                if (rpcActive) {
                RPC.setActivity({
                    state: `En el launcher`,
                    largeImageKey: 'icon',
                    smallImageKey: 'verificado',
                    largeImageText: `Miguelki Network`,
                    instance: true,
                    buttons: [
                        {
                            label: `Discord`,
                            url: `https://discord.gg/7kPGjgJND7`,
                        }
                    ]
                }).catch();
            }
            }
            
        });
        }
        
    }

    getdate(e) {
        let date = new Date(e)
        let year = date.getFullYear()
        let month = date.getMonth() + 1
        let day = date.getDate()
        let allMonth = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
        return { year: year, month: allMonth[month - 1], day: day }
    }
}
export default Home;