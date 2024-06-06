/**
 * @author Luuxis
 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0
 */

const { ipcRenderer } = require('electron')
const { Status } = require('minecraft-java-core')
const fs = require('fs');
const path = require('path');
const pkg = require('../package.json');

import config from './utils/config.js';
import database from './utils/database.js';
import logger from './utils/logger.js';
import popup from './utils/popup.js';
import { skin2D } from './utils/skin.js';
import slider from './utils/slider.js';
let username = '';
let headButton = false;
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
        console.error('No se pudo iniciar la reproducción del video:', err);
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
    let skin = true
    if (data?.profile?.skins[0]?.base64) skin = await new skin2D().creatHeadTexture(data.profile.skins[0].base64);
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
    let nameServerElement = document.querySelector('.server-status-name')
    let statusServerElement = document.querySelector('.server-status-text')
    let playersOnline = document.querySelector('.status-player-count .player-count')

    if (!opt) {
        statusServerElement.classList.add('red')
        statusServerElement.innerHTML = `Offline - 0 ms`
        document.querySelector('.status-player-count').classList.add('red')
        playersOnline.innerHTML = '0'
        return
    }

    let { ip, port, nameServer } = opt
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

async function getUsername() {
    return username;
}
async function setUsername(name) {
    username = name;
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
    const db = new database();
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

async function verifyDiscordMembership(token) {
    const userGuildsResponse = await fetch('https://discord.com/api/users/@me/guilds', {
        headers: {
            Authorization: `Bearer ${token}`
        }
    });

    const userGuilds = await userGuildsResponse.json();

    // Cambia esto al ID de tu servidor
    const requiredGuildId = '761943171801415692';

    return userGuilds.some(guild => guild.id === requiredGuildId);
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
    verifyDiscordMembership as verifyDiscordMembership
}
window.setVideoSource = setVideoSource;