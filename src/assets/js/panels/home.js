/**
 * @author Luuxis
 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0
 */
import { config, database, logger, changePanel, appdata, setStatus, setInstanceBackground, pkg, popup } from '../utils.js'
import { getHWID, checkHWID } from '../HWIDSystem.js';

// cambiar información de la actividad de discord en el launcher
const clientId = '857169541708775445';
const DiscordRPC = require('discord-rpc');
const RPC = new DiscordRPC.Client({ transport: 'ipc' });
var startingTime = Date.now();
var LogBan = false;
DiscordRPC.register(clientId);

var StoreAvailable = false;
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
RPC.login({ clientId }).catch(err => console.error('Servidor de Discord no detectado. Tranquilo, esto no es una crisis.'));

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
        document.querySelector('.settings-btn').addEventListener('click', e => changePanel('settings'))
        /* document.querySelector('.custom-btn').addEventListener('click', e => changePanel('custom')) */
    }

    async showstore() {
        try {
            const response = await fetch(pkg.store_url).catch(err => console.error('Parece que la tienda no se encuentra online. Ocultando sección de tienda.'));
            if (response.ok) {
                document.querySelector('.storebutton').setAttribute('href', pkg.store_url);
                document.querySelector('.news-blockshop').style.display = 'block';
                StoreAvailable = true;

            } else {
                console.error('Parece que la tienda no se encuentra online. Ocultando sección de tienda.');
                document.querySelector('.news-blockshop').style.display = 'none';
                StoreAvailable = false;
            }
        } catch (error) {
            console.error('Parece que la tienda no se encuentra online. Ocultando sección de tienda.');
            document.querySelector('.news-blockshop').style.display = 'none';
            StoreAvailable = false;
        }
    }

    async notification() { 
        let res = await config.GetConfig();
        let hwid = await getHWID();
        let check = await checkHWID(hwid);

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
                //mostrar notificación
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
            
        } else if (res.notification.enabled) {
            //mostrar notificación
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
            //ocultar notiificación
            await this.hideNotification();
        }
    }

    async showNotification() {
        let notification = document.querySelector('.message-container');
        notification.style.display = 'flex'; // Usa 'block' o cualquier otro valor que sea apropiado para tu layout
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
        // Espera a que la transición de opacidad termine antes de ocultar el elemento
        await new Promise(resolve => setTimeout(resolve, 1000)); // Ajusta el tiempo de espera al tiempo de transición de tu CSS
        notification.style.visibility = 'hidden';
        notification.style.display = 'none';
    }

    startNotificationCheck() {
        this.intervalId = setInterval(() => {
            this.notification();
        }, 60000); // Cambia este valor al intervalo de tiempo que desees
        console.log('Scheduled notification check started.');
    }

    stopNotificationCheck() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        console.log('Scheduled notification check stopped.');
    }
    
    async news() {

        //get version from package.json and set the content of titlechangelog to "Miguelki Network MC Launcher" + version
        let version = pkg.version
        let changelog = pkg.changelog
        let titlechangelog = document.querySelector('.titlechangelog')
        let changelogcontent = document.querySelector('.bbWrapper')
        changelogcontent.innerHTML = `<p>${changelog}</p>`
        titlechangelog.innerHTML = `Miguelki Network MC Launcher ${version}`

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
            } else console.log(`Initializing instance ${instance.name}...`)
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
                    if (instance.whitelistActive) {
                        instance.whitelist.map(whitelist => {
                            if (whitelist == auth?.name) {
                                if (instance.name == instanceSelect) {
                                    instancesListPopup.innerHTML += `<div id="${instance.name}" class="instance-elements active-instance">${instance.name}</div>`
                                } else {
                                    instancesListPopup.innerHTML += `<div id="${instance.name}" class="instance-elements">${instance.name}</div>`
                                }
                            }
                        })
                    } else {
                        if (instance.name == instanceSelect) {
                            instancesListPopup.innerHTML += `<div id="${instance.name}" class="instance-elements active-instance">${instance.name}</div>`
                        } else {
                            instancesListPopup.innerHTML += `<div id="${instance.name}" class="instance-elements">${instance.name}</div>`
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
const _0x303cda=_0x3242;function _0x5605(){const _0x505d3e=['account_selected','1309yIlOFl','491274TWkPlK','java_path','height','loadder','252240cIlnlP','launcher_config','.info-starting-game','.progress-bar','46743gizMFv','java_memory','width','querySelector','maintenance','minecraft_version','instance_selct','No\x20puedes\x20iniciar\x20ninguna\x20instancia\x20debido\x20al\x20bloqueo\x20de\x20dispositivo\x20presente.<br><br>Si\x20crees\x20que\x20esto\x20es\x20un\x20error,\x20abre\x20ticket\x20en\x20el\x20discord\x20de\x20Miguelki\x20Network.','96291xGmAur','darwin','.play-instance','intelEnabledMac','red','GetConfig','Launch','name','El\x20cliente\x20no\x20se\x20encuentra\x20disponible.','verify','find','openPopup','max','4449664VOBlDv','Error\x20al\x20iniciar\x20el\x20cliente','config','dataDirectory','.info-starting-game-text','getInstanceList','320CvMDoR','Error','none','12918LfApnn','accounts','maintenancemsg','java_config','min','ignored','1427925ffrKhd','readData','close-all','configClient','screen_size','128idWqqF','game_config','No\x20puedes\x20iniciar\x20ninguna\x20instancia\x20debido\x20a\x20que\x20no\x20se\x20ha\x20podido\x20conectar\x20con\x20el\x20anticheat.<br><br>Intentalo\x20de\x20nuevo\x20reiniciando\x20el\x20launcher\x20o\x20abre\x20ticket\x20en\x20el\x20discord\x20de\x20Miguelki\x20Network.'];_0x5605=function(){return _0x505d3e;};return _0x5605();}function _0x3242(_0x21872e,_0x2b8652){const _0x56053d=_0x5605();return _0x3242=function(_0x3242c7,_0xfd417d){_0x3242c7=_0x3242c7-0x7d;let _0x2e0fee=_0x56053d[_0x3242c7];return _0x2e0fee;},_0x3242(_0x21872e,_0x2b8652);}(function(_0x318017,_0x1a6a7e){const _0xcda0d6=_0x3242,_0x4470c5=_0x318017();while(!![]){try{const _0x78f947=parseInt(_0xcda0d6(0x88))/0x1+-parseInt(_0xcda0d6(0x84))/0x2+parseInt(_0xcda0d6(0x8c))/0x3*(-parseInt(_0xcda0d6(0x7f))/0x4)+parseInt(_0xcda0d6(0xb0))/0x5+-parseInt(_0xcda0d6(0xaa))/0x6*(parseInt(_0xcda0d6(0x83))/0x7)+parseInt(_0xcda0d6(0xa1))/0x8+parseInt(_0xcda0d6(0x94))/0x9*(parseInt(_0xcda0d6(0xa7))/0xa);if(_0x78f947===_0x1a6a7e)break;else _0x4470c5['push'](_0x4470c5['shift']());}catch(_0x163c17){_0x4470c5['push'](_0x4470c5['shift']());}}}(_0x5605,0x46b19));let launch=new Launch(),configClient=await this['db'][_0x303cda(0xb1)](_0x303cda(0x7d)),instance=await config[_0x303cda(0xa6)](),authenticator=await this['db']['readData'](_0x303cda(0xab),configClient[_0x303cda(0x82)]),options=instance[_0x303cda(0x9e)](_0x884bd8=>_0x884bd8[_0x303cda(0x9b)]==configClient[_0x303cda(0x92)]),res=await config[_0x303cda(0x99)](),hwid=await getHWID(),check=await checkHWID(hwid),playInstanceBTN=document[_0x303cda(0x8f)](_0x303cda(0x96)),infoStartingBOX=document[_0x303cda(0x8f)](_0x303cda(0x8a)),infoStarting=document['querySelector'](_0x303cda(0xa5)),progressBar=document['querySelector'](_0x303cda(0x8b));if(check){if(fetchError==![]){let popupError=new popup();popupError[_0x303cda(0x9f)]({'title':_0x303cda(0xa8),'content':_0x303cda(0x93),'color':'red','options':!![]});return;}else{let popupError=new popup();popupError[_0x303cda(0x9f)]({'title':_0x303cda(0xa8),'content':_0x303cda(0x81),'color':_0x303cda(0x98),'options':!![]});return;}}if(options[_0x303cda(0x90)]){let popupError=new popup();options[_0x303cda(0xac)]==''?popupError['openPopup']({'title':_0x303cda(0xa2),'content':_0x303cda(0x9c),'color':_0x303cda(0x98),'options':!![]}):popupError[_0x303cda(0x9f)]({'title':_0x303cda(0xa2),'content':options[_0x303cda(0xac)],'color':_0x303cda(0x98),'options':!![]});}else{let opt={'url':options['url'],'authenticator':authenticator,'timeout':0x2710,'path':await appdata()+'/'+(process['platform']==_0x303cda(0x95)?this[_0x303cda(0xa3)][_0x303cda(0xa4)]:'.'+this[_0x303cda(0xa3)][_0x303cda(0xa4)]),'instance':options['name'],'version':options[_0x303cda(0x87)][_0x303cda(0x91)],'detached':configClient[_0x303cda(0x89)]['closeLauncher']==_0x303cda(0xb2)?![]:!![],'downloadFileMultiple':configClient[_0x303cda(0x89)]['download_multi'],'intelEnabledMac':configClient[_0x303cda(0x89)][_0x303cda(0x97)],'loader':{'type':options[_0x303cda(0x87)]['loadder_type'],'build':options[_0x303cda(0x87)]['loadder_version'],'enable':options['loadder']['loadder_type']==_0x303cda(0xa9)?![]:!![]},'verify':options[_0x303cda(0x9d)],'ignored':[...options[_0x303cda(0xaf)]],'javaPath':configClient[_0x303cda(0xad)][_0x303cda(0x85)],'screen':{'width':configClient[_0x303cda(0x80)]['screen_size'][_0x303cda(0x8e)],'height':configClient[_0x303cda(0x80)][_0x303cda(0x7e)][_0x303cda(0x86)]},'memory':{'min':configClient[_0x303cda(0xad)][_0x303cda(0x8d)][_0x303cda(0xae)]*0x400+'M','max':configClient['java_config'][_0x303cda(0x8d)][_0x303cda(0xa0)]*0x400+'M'}};launch[_0x303cda(0x9a)](opt);
        // si StoreAvailable es true, se realizará document.querySelector('.news-blockshop').style.display = 'none';
        if (StoreAvailable) document.querySelector('.news-blockshop').style.display = 'none';

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
            progressBar.style.display = "none"
            if (configClient.launcher_config.closeLauncher == 'close-launcher') {
                ipcRenderer.send("main-window-hide")
            };
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
            new logger('Minecraft', '#36b030');
            ipcRenderer.send('main-window-progress-load')
            infoStarting.innerHTML = `Iniciando...`
            console.log(e);
        })

        launch.on('close', code => {
            if (configClient.launcher_config.closeLauncher == 'close-launcher') {
                ipcRenderer.send("main-window-show")
            };
            ipcRenderer.send('main-window-progress-reset')
            this.notification()
            infoStartingBOX.style.display = "none"
            playInstanceBTN.style.display = "flex"
            if (StoreAvailable) document.querySelector('.news-blockshop').style.display = 'block';
            infoStarting.innerHTML = `Cerrando...`
            new logger(pkg.name, '#7289da');
            console.log('Close');
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
        });

        launch.on('error', err => {
            let popupError = new popup()
            if (typeof err.error === 'undefined') {
                new logger(pkg.name, '#7289da');
                console.warn('Ha occurrido un error en la descarga de algún archivo. Si el juego no inicia correctamente esto puede ser la causa.');
                if (configClient.launcher_config.closeLauncher == 'close-launcher') {
                    ipcRenderer.send("main-window-show")
                };
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
                if (StoreAvailable) document.querySelector('.news-blockshop').style.display = 'block';
                infoStartingBOX.style.display = "none"
                playInstanceBTN.style.display = "flex"
                infoStarting.innerHTML = `Verificando...`
                new logger(pkg.name, '#7289da');
                console.log(err);
                this.notification()
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