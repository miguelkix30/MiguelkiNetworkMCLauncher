/**
 * @author Luuxis
 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0
 */

const { ipcRenderer } = require('electron')
const { Status } = require('minecraft-java-core')
const fs = require('fs');
const pkg = require('../package.json');

import config from './utils/config.js';
import database from './utils/database.js';
import logger from './utils/logger.js';
import popup from './utils/popup.js';
import { skin2D } from './utils/skin.js';
import slider from './utils/slider.js';

async function setBackground(theme) {
    theme = "dark";
    let background
    let body = document.body;
    body.className = theme ? 'dark global' : 'light global';
    let backgrounds = fs.readdirSync(`${__dirname}/assets/images/background/dark`);
        let Background = backgrounds[Math.floor(Math.random() * backgrounds.length)];
        background = `linear-gradient(#00000080, #00000080), url(./assets/images/background/dark/${Background})`;
    body.style.backgroundImage = background ? background : theme ? '#000' : '#fff';
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
                    source = './assets/images/background/winter.mp4'; // establecer un valor predeterminado
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
    nextVideo.style.opacity = '1'; // iniciar la transición

    // cuando la transición termina, intercambiar los videos actuales y siguientes
    nextVideo.ontransitionend = (event) => {
        if (event.propertyName === 'opacity') {
            let temp = currentVideo;
            currentVideo = nextVideo;
            nextVideo = temp;

            // eliminar el manejador de eventos antes de establecer la opacidad a 0
            nextVideo.ontransitionend = null;
            nextVideo.style.opacity = '0'; // ocultar el siguiente video para la próxima transición
        }
    };
} else {
    console.error('No se pudo establecer la fuente del video: source está indefinida');
}
}

function getSeason() {
    const now = new Date();
    const month = now.getMonth() + 1; // January is 0
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
    if (data.meta.type == 'Xbox') skin = await new skin2D().creatHeadTexture(data.profile.skins[0].base64);
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
    account.classList.add('account-select');
    if (data.meta.type == 'Xbox') headplayer(data.profile.skins[0].base64);
}

async function headplayer(skinBase64) {
    let skin = await new skin2D().creatHeadTexture(skinBase64);
    document.querySelector(".player-head").style.backgroundImage = `url(${skin})`;
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
    //Si instancebackground es una URL entonces se establece como fondo. Si no, se establece el fondo por defecto
    if (instancebackground.match(/^(http|https):\/\/[^ "]+$/)) {
        setVideoSource(instancebackground)
    } else {
        setVideoSource()
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
    setInstanceBackground as setInstanceBackground
}
window.setVideoSource = setVideoSource;