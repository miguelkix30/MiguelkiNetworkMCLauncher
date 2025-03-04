/**
 * @author Luuxis
 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0
 */

const { ipcRenderer, shell } = require('electron')
const { Status } = require('minecraft-java-core')
const fs = require('fs');
const path = require('path');
const pkg = require('../package.json');
const fetch = require('node-fetch');
const { marked } = require('marked');

import config from './utils/config.js';
import database from './utils/database.js';
import logger from './utils/logger.js';
import popup from './utils/popup.js';
import { skin2D } from './utils/skin.js';
import slider from './utils/slider.js';
let username = '';
let DiscordUsername = '';
let DiscordPFP = '';
let headButton = false;
let musicAudio = new Audio();
let musicSource = '';
let isMusicPlaying = false;
let videoBusy = false;
const fadeDuration = 1000;

async function setBackground(theme) {
    theme = "dark";
    let background
    let body = document.body;
    body.className = 'dark global';
    let backgrounds = fs.readdirSync(`${__dirname}/assets/images/background/easterEgg`);
        let Background = backgrounds[Math.floor(Math.random() * backgrounds.length)];
        background = `linear-gradient(#00000080, #00000080), url(./assets/images/background/easterEgg/${Background})`;
    body.style.backgroundImage = background ? background : '#000';
    body.style.backgroundSize = 'cover';
}

let currentVideo = document.querySelector('.background-video.current');
let nextVideo = document.querySelector('.background-video.next');
async function setVideoSource(game = '') {
    if (videoBusy) return;
    videoBusy = true;
    let source;
    let sourcePromise = new Promise(async (resolve) => {
    if (game) {
        source = `${game}`;
        resolve();
    } else {
        let res = await config.GetConfig();
        if (res.custom_background.match(/^(http|https):\/\/[^ "]+$/)) {
            source = res.custom_background;
        } else {
            const season = getSeason();
            switch (season) {
                case 'spring':
                    source = './assets/images/background/spring.mp4';
                    break;
                case 'summer':
                    source = './assets/images/background/summer.mp4';
                    break;
                case 'autumn':
                    source = './assets/images/background/autumn.mp4';
                    break;
                case 'winter':
                    source = './assets/images/background/winter.mp4';
                    break;
                default:
                    source = './assets/images/background/winter.mp4';
                    break;
            }
        }
        resolve();
    }
});
    let timeoutPromise = new Promise(resolve => setTimeout(resolve, 1000));
    await Promise.all([sourcePromise, timeoutPromise]);

    if (source) {
    nextVideo.src = source;
    try {
        await nextVideo.play();
    } catch (err) {
        console.error('No se pudo iniciar la reproducción de un video');
    }
    nextVideo.style.opacity = '1'; 

    
    nextVideo.ontransitionend = (event) => {
        if (event.propertyName === 'opacity') {
            let temp = currentVideo;
            currentVideo = nextVideo;
            nextVideo = temp;

            
            nextVideo.ontransitionend = null;
            nextVideo.style.opacity = '0'; 
        }
    };
} else {
    console.error('No se pudo establecer la fuente del video: source está indefinida');
}
videoBusy = false;
}

function getSeason() {
    const now = new Date();
    const month = now.getMonth() + 1; 
    let season;

    switch (month) {
        case 3:
        case 4:
        case 5:
            season = 'spring';
            break;
        case 6:
        case 7:
        case 8:
            season = 'summer';
            break;
        case 9:
        case 10:
        case 11:
            season = 'autumn';
            break;
        case 12:
        case 1:
        case 2:
            season = 'winter';
            break;
        default:
            season = 'winter';
            break;
    }

    return season;
}

function changePanel(id) {
    let panel = document.querySelector(`.${id}`);
    let active = document.querySelector(`.active`);
    if (active) {
        active.classList.remove("active");
    }
    panel.classList.add("active");
}

async function appdata() {
    return await ipcRenderer.invoke('appData').then(path => path)
}

async function addAccount(data) {
    let skin = false
    if (data?.profile?.skins[0]?.base64) skin = await new skin2D().creatHeadTexture(data.profile.skins[0].base64);
    else {
        try {
            if (data?.name) {
                let response = await fetch(`https://mineskin.eu/helm/${data.name}`);
                if (response.ok) skin = `https://mineskin.eu/helm/${data.name}`;
                else skin = false;
            }
        } catch (error) {
            skin = false;
        }
    }
    let div = document.createElement("div");
    div.classList.add("account");
    div.id = data.ID;
    div.innerHTML = `
        <div class="profile-image" ${skin ? 'style="background-image: url(' + skin + ');"' : ''}></div>
        <div class="profile-infos">
            <div class="profile-pseudo">${data.name}</div>
            <div class="profile-uuid">${data.uuid}</div>
        </div>
        <div class="delete-profile" id="${data.ID}">
            <div class="icon-account-delete delete-profile-icon"></div>
        </div>
    `
    return document.querySelector('.accounts-list').appendChild(div);
}

async function accountSelect(data) {
    let account = document.getElementById(`${data.ID}`);
    let activeAccount = document.querySelector('.account-select')

    if (activeAccount) activeAccount.classList.toggle('account-select');
    if (account) account.classList.add('account-select');
    if (data?.profile?.skins[0]?.base64) headplayer(data.profile.skins[0].base64); 
    else if (data?.name) {
        let img = new Image();
        img.onerror = function() {
            console.warn("Error al cargar la imagen de la cabeza del jugador, se cargará la imagen por defecto");
            document.querySelector(".player-head").style.backgroundImage = 'url("assets/images/default/setve.png")';
        }
        img.onload = function() {
            document.querySelector(".player-head").style.backgroundImage = `url(${img.src})`;
        }
        img.src = `https://mineskin.eu/helm/${data.name}`;
    }
    setUsername(data.name);
    /* if (data.name) document.querySelector('.player-name').innerHTML = data.name; */
}


async function headplayer(skinBase64) {
    let skin = await new skin2D().creatHeadTexture(skinBase64);
    document.querySelector(".player-head").style.backgroundImage = `url(${skin})`;
}

async function clickableHead(condition) {
    let playerHead = document.querySelector('.player-options');
    let playerHeadFrame = document.querySelector('.head-frame');
    if (condition) {
        playerHead.style.cursor = 'pointer';
        playerHead.classList.add('hoverenabled');
        playerHeadFrame.classList.add('border-animation');
        headButton = true;
    } else {
        playerHead.style.cursor = 'default';
        playerHead.classList.remove('hoverenabled');
        playerHeadFrame.classList.remove('border-animation');
        headButton = false;
    }
}

async function getClickeableHead() {
    return headButton;
}

async function clickHead() {
    if (headButton) {
        ipcRenderer.send('create-skin-window');
    }
}

async function setStatus(opt) {
    let instanceIcon = document.querySelector('.server-status-icon')
    let nameServerElement = document.querySelector('.server-status-name')
    let statusServerElement = document.querySelector('.server-status-text')
    let playersOnline = document.querySelector('.status-player-count .player-count')

    if (!opt) {
        instanceIcon.src = './assets/images/icon.png'
        statusServerElement.classList.add('red')
        statusServerElement.innerHTML = `Offline - 0 ms`
        document.querySelector('.status-player-count').classList.add('red')
        playersOnline.innerHTML = '0'
        return
    }
    instanceIcon.src = opt.icon || opt.thumbnail || './assets/images/icon.png'
    let { ip, port, nameServer } = opt.status
    nameServerElement.innerHTML = nameServer
    let status = new Status(ip, port);
    let statusServer = await status.getStatus().then(res => res).catch(err => err);
    

    if (!statusServer.error) {
        statusServerElement.classList.remove('red')
        document.querySelector('.status-player-count').classList.remove('red')
        statusServerElement.innerHTML = `Online - ${statusServer.ms} ms`
        playersOnline.innerHTML = statusServer.playersConnect
    } else {
        statusServerElement.classList.add('red')
        statusServerElement.innerHTML = `Offline - 0 ms`
        document.querySelector('.status-player-count').classList.add('red')
        playersOnline.innerHTML = '0'
    }
}

async function setInstanceBackground(opt) {
    let instancebackground = opt
    if (instancebackground.match(/^(http|https):\/\/[^ "]+$/)) {
        setVideoSource(instancebackground)
    } else {
        setVideoSource()
    }
}

async function setBackgroundMusic(opt) {
    let music = opt
    if (music === undefined) {
        setMusicSource()
    } else if (music.match(/^(http|https):\/\/[^ "]+$/)) {
        setMusicSource(music)
    } else {
        setMusicSource()
    }
}

async function getUsername() {
    return username;
}
async function setUsername(name) {
    username = name;
}

async function getDiscordUsername() {
    return DiscordUsername;
}
async function setDiscordUsername(name) {
    DiscordUsername = name;
}

async function getDiscordPFP() {
    return DiscordPFP;
}

async function setDiscordPFP(pfp) {
    DiscordPFP = pfp;
}

async function toggleModsForInstance(instanceName) {
    const instances = await config.getInstanceList();
    const instance = instances.find(i => i.name === instanceName);
    const db = new database();

    if (instance) {
        for (const mod of instance.optionalMods) {
            let configClient = await db.readData('configClient')
            const activeModsForInstance = configClient.mods_enabled.filter(modId => {
                const [modIdInstanceName, modIdModName] = modId.split('-');
                return modIdInstanceName === instanceName;
            }).map(modId => {
                const [, modIdModName] = modId.split('-');
                return modIdModName;
            });

            const modFile = instance.optionalMods.find(m => m.name === mod.name).file;
            const modIsActiveInConfig = activeModsForInstance.includes(mod.name);
            await toggleMod(modFile, instanceName, modIsActiveInConfig);
        }
    } else {
        console.error(`Instance with name ${instanceName} not found`);
    }
}

async function toggleMod(modFile, instanceName, isActive) {
    if (isActive) {
        console.log(`Activando mod opcional, Mod: ${modFile} Instancia: ${instanceName}`);
    } else {
        console.log(`Desactivando mod opcional, Mod: ${modFile} Instancia: ${instanceName}`);
    }
    let res = await config.GetConfig();
    const appdataPath = await appdata();
    const modPath = path.join(
        appdataPath,
        process.platform == 'darwin' ? await res.dataDirectory : `.${await res.dataDirectory}`,
        'instances',
        instanceName,
        'mods',
        modFile
    );
    console.log(modPath);
    const activeModPath = `${modPath}.jar`;
    const disabledModPath = `${modPath}.disabled`;
    

    if (!fs.existsSync(activeModPath) && !fs.existsSync(disabledModPath)) {
        console.warn(`No se ha encontrado el mod opcional a modificar, Saltando... Mod: ${modFile}`);
        return;
    }
    

    if (isActive && fs.existsSync(disabledModPath)) {
        fs.renameSync(disabledModPath, activeModPath);
    }

    else if (!isActive && fs.existsSync(activeModPath)) {
        fs.renameSync(activeModPath, disabledModPath);
    }
}

async function discordAccount() {
    let discordLogoutBtn = document.querySelector('.discord-logout-btn');
    let discordAccountManagerTitle = document.querySelector('#discord-account-manager-title');
    let discordAccountManagerPanel = document.querySelector('#discord-account-manager');
    let discordUsername = await getDiscordUsername();
    let discordUsernameText = document.querySelector('.profile-username');
    let discordPFP = await getDiscordPFP();
    let discordPFPElement = document.querySelector('.discord-profile-image');

    if (discordUsername !== '') {
        discordUsernameText.textContent = discordUsername;
        discordPFPElement.src = discordPFP;
        discordLogoutBtn.addEventListener('click', async () => {
            discordLogoutBtn.style.display = 'none';
            logOutDiscord();
        });
    } else {
        discordAccountManagerTitle.style.display = 'none';
        discordAccountManagerPanel.style.display = 'none';
    }
}

async function logOutDiscord() {
    const db = new database();
    let configClient = await db.readData('configClient')
    await setDiscordUsername('');
    configClient.discord_token = null;
    await db.updateData('configClient', configClient);
    ipcRenderer.send('app-restart');

}

async function getTermsAndConditions() {
    try {
        console.log('Iniciando descarga de términos y condiciones...');
        const termsResponse = await fetch(`${pkg.url}launcher/config-launcher/terms.txt`);
        const metaResponse = await fetch(`${pkg.url}launcher/config-launcher/terms-meta.json`);
        

        if (!termsResponse.ok) {
            console.error('Error al obtener términos:', termsResponse.statusText);
            throw new Error(`Error al obtener términos: ${termsResponse.statusText}`);
        }

        if (!metaResponse.ok) {
            console.error('Error al obtener meta información:', metaResponse.statusText);
            throw new Error(`Error al obtener meta información: ${metaResponse.statusText}`);
        }

        const termsContent = await termsResponse.text();
        const metaInfo = await metaResponse.json();

        const htmlContent = marked(termsContent);
        const lastModified = metaInfo.lastModified || 'desconocida';

        return { htmlContent, lastModified };
    } catch (error) {
        console.error('Error al inicializar los términos y condiciones:', error.message);
        throw error;
    }
}

async function showTermsAndConditions() {
    try {
        const result = await getTermsAndConditions();
        const db = new database();
        let configClient = await db.readData('configClient');
        const lastModified = new Date(result.lastModified);

        let isNewUser = false;

        if (!configClient.terms_accepted || !configClient.termsAcceptedDate) {
            console.log("No se han aceptado los términos anteriormente. Usuario nuevo.");
            isNewUser = true;
        } else {
            const termsAcceptedDate = new Date(configClient.termsAcceptedDate);

            if (termsAcceptedDate < lastModified) {
                console.log("Términos modificados, solicitando aceptación nuevamente.");
            } else {
                console.log("Términos ya aceptados y no han sido modificados.");
                return true;
            }
        }

        return new Promise((resolve, reject) => {
            const termsContainer = document.querySelector('.terms-container');
            const acceptButton = document.querySelector('.accept-terms-btn');
            const declineButton = document.querySelector('.decline-terms-btn');
            const messageText = document.querySelector('.terms-message');

            if (isNewUser) {
                messageText.innerText = "Bienvenido. Antes de continuar, acepta los términos y condiciones para poder utilizar el software. De lo contrario, el launcher se cerrará y no podrás utilizarlo hasta que los aceptes.";
            } else {
                messageText.innerText = "Los términos y condiciones han sido modificados y debes aceptarlos para seguir usando el lanzador.";
            }

            termsContainer.innerHTML = result.htmlContent;
            termsContainer.querySelectorAll('a').forEach(link => {
                link.addEventListener('click', (event) => {
                    event.preventDefault();
                    const url = event.target.href;
                    shell.openExternal(url);
                });
            });

            acceptButton.disabled = true;

            document.querySelector('.terms-modal').style.display = 'flex';

            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        acceptButton.disabled = false;
                        observer.disconnect();
                    }
                });
            }, { threshold: 1.0 });

            const lastElement = termsContainer.lastElementChild;
            if (lastElement) {
                observer.observe(lastElement);
            }

            acceptButton.addEventListener('click', async () => {
                document.querySelector('.terms-modal').style.display = 'none';

                configClient.terms_accepted = true;
                configClient.termsAcceptedDate = new Date().toISOString();
                await db.updateData('configClient', configClient);

                resolve(true);  
            });

            declineButton.addEventListener('click', () => {
                ipcRenderer.send('main-window-close');
                reject(false);
            });
        });
    } catch (error) {
        console.error('Error al cargar los términos y condiciones:', error);
        throw error;
    }
}

async function setMusicSource(source) {
    let res = await config.GetConfig();
    let dev = process.env.NODE_ENV === 'dev';
    if (!res.musicBeta && !dev) return;
    if (source === undefined || source === '' || source === 'none') {
        if (res.custom_music.match(/^(http|https):\/\/[^ "]+$/)) {
            source = res.custom_music;
        } else {
        source = './assets/sounds/music/default-music.mp3';
        }
    }
    if (musicSource === source) return;
    musicSource = source;

    const db = new database();
    const configClient = await db.readData('configClient');

    if (isMusicPlaying) await fadeOutAudio();

    musicAudio.muted = configClient.launcher_config.music_muted;
    musicAudio.src = source;
    musicAudio.loop = true;
    musicAudio.volume = 0;
    musicAudio.disableRemotePlayback = true;

    navigator.mediaSession.setActionHandler('play', null);
    navigator.mediaSession.setActionHandler('pause', null);
    navigator.mediaSession.setActionHandler('seekbackward', null);
    navigator.mediaSession.setActionHandler('seekforward', null);
    navigator.mediaSession.setActionHandler('previoustrack', null);
    navigator.mediaSession.setActionHandler('nexttrack', null);

    if (musicAudio.muted) {
        musicAudio.play();
    } else {
        musicAudio.play().then(() => fadeInAudio());
    }

    isMusicPlaying = true;
}


function fadeInAudio() {
    let volume = 0;
    const maxVolume = 0.008;
    const interval = setInterval(() => {
        volume += 0.0005;
        if (volume >= maxVolume) {
            musicAudio.volume = maxVolume;
            clearInterval(interval);
        } else {
            musicAudio.volume = volume;
        }
    }, fadeDuration / 25);
}

function fadeOutAudio() {
    return new Promise((resolve) => {
        let volume = musicAudio.volume;
        const interval = setInterval(() => {
            volume -= 0.0005;
            if (volume <= 0) {
                musicAudio.volume = 0;
                musicAudio.pause();
                clearInterval(interval);
                resolve();
            } else {
                musicAudio.volume = volume;
            }
        }, fadeDuration / 25);
    });
}

async function toggleMusic() {
    const db = new database();
    let configClient = await db.readData('configClient');

    if (configClient.launcher_config.music_muted) {
        document.querySelector('.music-btn').classList.remove('icon-speaker-off');
        document.querySelector('.music-btn').classList.add('icon-speaker-on');
        configClient.launcher_config.music_muted = false;
        musicAudio.muted = false;
        await db.updateData('configClient', configClient);
        await fadeInAudio();
        
        if (!isMusicPlaying) {
            await musicAudio.play();
            isMusicPlaying = true;
        }
    } else {
        document.querySelector('.music-btn').classList.remove('icon-speaker-on');
        document.querySelector('.music-btn').classList.add('icon-speaker-off');
        configClient.launcher_config.music_muted = true;
        await db.updateData('configClient', configClient);
        await fadeOutAudio();
        isMusicPlaying = false;
    }
}





export {
    appdata as appdata,
    changePanel as changePanel,
    config as config,
    database as database,
    logger as logger,
    popup as popup,
    setBackground as setBackground,
    setVideoSource as setVideoSource,
    skin2D as skin2D,
    addAccount as addAccount,
    accountSelect as accountSelect,
    slider as Slider,
    pkg as pkg,
    setStatus as setStatus,
    setInstanceBackground as setInstanceBackground,
    getUsername as getUsername,
    setUsername as setUsername,
    clickableHead as clickableHead,
    clickHead as clickHead,
    getClickeableHead as getClickeableHead,
    toggleModsForInstance as toggleModsForInstance,
    getDiscordUsername as getDiscordUsername,
    setDiscordUsername as setDiscordUsername,
    discordAccount as discordAccount,
    logOutDiscord as logOutDiscord,
    getDiscordPFP as getDiscordPFP,
    setDiscordPFP as setDiscordPFP,
    getTermsAndConditions as getTermsAndConditions,
    showTermsAndConditions as showTermsAndConditions,
    toggleMusic as toggleMusic,
    fadeOutAudio as fadeOutAudio,
    fadeInAudio as fadeInAudio,
    setBackgroundMusic as setBackgroundMusic
}
window.setVideoSource = setVideoSource;