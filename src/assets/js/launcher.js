/**
 * @author Luuxis
 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0
 */
// import panel
import Login from './panels/login.js';
import Home from './panels/home.js';
import Settings from './panels/settings.js';
import Custom from './panels/custom.js';

// import modules
import { logger, config, changePanel, database, popup, setBackground, setVideoSource, accountSelect, addAccount, pkg } from './utils.js';
import { getHWID, sendDiscordMessage, sendLogoutDiscordMessage } from './HWIDSystem.js';
const { AZauth, Microsoft, Mojang } = require('minecraft-java-core');

// libs
const { ipcRenderer } = require('electron');
const fs = require('fs');
let username;

class Launcher {
    async init() {
        this.initLog();
        console.log('Initializing Launcher...');
        await setVideoSource();
        this.shortcut()
        await setBackground();
        if (process.platform == 'win32') this.initFrame();
        this.config = await config.GetConfig().then(res => res).catch(err => err);
        if (await this.config.error) return this.errorConnect()
        this.db = new database();
        await this.initConfigClient();
        this.createPanels(Login, Home, Settings, Custom);
        this.startLauncher();
    }

    initLog() {
        document.addEventListener('keydown', e => {
            if (e.ctrlKey && e.shiftKey && e.keyCode == 73 || e.keyCode == 123) {
                ipcRenderer.send('main-window-dev-tools-close');
                ipcRenderer.send('main-window-dev-tools');
            }
        })
        new logger(pkg.name, '#7289da')
    }

    shortcut() {
        document.addEventListener('keydown', e => {
            if (e.ctrlKey && e.keyCode == 87) {
                sendLogoutDiscordMessage(username);
            }
        })
        window.addEventListener('keydown', (e) => {
            const { key, altKey } = e;
            if (key === 'F4' && altKey) {
                e.preventDefault();  
                sendLogoutDiscordMessage(username); 
            }
        });
    }


    errorConnect() {
        new popup().openPopup({
            title: this.config.error.code,
            content: this.config.error.message,
            color: 'red',
            exit: true,
            options: true
        });
    }

    initFrame() {
        console.log('Initializing Frame...')
        document.querySelector('.frame').classList.toggle('hide')
        document.querySelector('.dragbar').classList.toggle('hide')

        document.querySelector('#minimize').addEventListener('click', () => {
            ipcRenderer.send('main-window-minimize');
        });

        /* let maximized = false;
        let maximize = document.querySelector('#maximize')
        maximize.addEventListener('click', () => {
            if (maximized) ipcRenderer.send('main-window-maximize')
            else ipcRenderer.send('main-window-maximize');
            maximized = !maximized
            maximize.classList.toggle('icon-maximize')
            maximize.classList.toggle('icon-restore-down')
        }); */

        document.querySelector('#close').addEventListener('click', () => {
            sendLogoutDiscordMessage(username);
            /* ipcRenderer.send('main-window-close'); */
        })
    }

    async initConfigClient() {
        console.log('Initializing Config Client...')
        let configClient = await this.db.readData('configClient')

        if (!configClient) {
            await this.db.createData('configClient', {
                account_selected: null,
                instance_selct: null,
                java_config: {
                    java_path: null,
                    java_memory: {
                        min: 2,
                        max: 4
                    }
                },
                game_config: {
                    screen_size: {
                        width: 854,
                        height: 480
                    }
                },
                launcher_config: {
                    download_multi: 5,
                    theme: 'auto',
                    closeLauncher: 'close-launcher',
                    intelEnabledMac: true
                }
            })
        }
    }

    createPanels(...panels) {
        let panelsElem = document.querySelector('.panels')
        for (let panel of panels) {
            console.log(`Initializing ${panel.name} Panel...`);
            let div = document.createElement('div');
            div.classList.add('panel', panel.id)
            div.innerHTML = fs.readFileSync(`${__dirname}/panels/${panel.id}.html`, 'utf8');
            panelsElem.appendChild(div);
            new panel().init(this.config);
        }
    }

    async startLauncher() {
        let accounts = await this.db.readAllData('accounts')
        let configClient = await this.db.readData('configClient')
        let account_selected = configClient ? configClient.account_selected : null
        let popupRefresh = new popup();

        if (accounts?.length) {
            for (let account of accounts) {
                let account_ID = account.ID
                if (account.error) {
                    await this.db.deleteData('accounts', account_ID)
                    continue
                }
                if (account.meta.type === 'Xbox') {
                    console.log(`Account Type: ${account.meta.type} | Username: ${account.name}`);
                    popupRefresh.openPopup({
                        title: 'Conectando...',
                        content: `Plataforma: ${account.meta.type} | Usuario: ${account.name}`,
                        color: 'var(--color)',
                        background: false
                    });

                    let refresh_accounts = await new Microsoft(this.config.client_id).refresh(account);

                    if (refresh_accounts.error) {
                        await this.db.deleteData('accounts', account_ID)
                        if (account_ID == account_selected) {
                            configClient.account_selected = null
                            await this.db.updateData('configClient', configClient)
                        }
                        console.error(`[Account] ${account.name}: ${refresh_accounts.errorMessage}`);
                        continue;
                    } else {
                        let hwid = await getHWID();
                        await sendDiscordMessage(account.name, hwid);
                        username = account.name;
                    }

                    refresh_accounts.ID = account_ID
                    await this.db.updateData('accounts', refresh_accounts, account_ID)
                    await addAccount(refresh_accounts)
                    if (account_ID == account_selected) accountSelect(refresh_accounts)
                } else if (account.meta.type == 'AZauth') {
                    console.log(`Account Type: ${account.meta.type} | Username: ${account.name}`);
                    popupRefresh.openPopup({
                        title: 'Conectando...',
                        content: `Plataforma: ${account.meta.type} | Usuario: ${account.name}`,
                        color: 'var(--color)',
                        background: false
                    });
                    let refresh_accounts = await new AZauth(this.config.online).verify(account);

                    if (refresh_accounts.error) {
                        this.db.deleteData('accounts', account_ID)
                        if (account_ID == account_selected) {
                            configClient.account_selected = null
                            this.db.updateData('configClient', configClient)
                        }
                        console.error(`[Account] ${account.name}: ${refresh_accounts.message}`);
                        continue;
                    } else {
                        let hwid = await getHWID();
                        await sendDiscordMessage(account.name, hwid);
                        username = account.name;
                    }

                    refresh_accounts.ID = account_ID
                    this.db.updateData('accounts', refresh_accounts, account_ID)
                    await addAccount(refresh_accounts)
                    if (account_ID == account_selected) accountSelect(refresh_accounts)
                } else if (account.meta.type == 'Mojang') {
                    console.log(`Account Type: ${account.meta.type} | Username: ${account.name}`);
                    popupRefresh.openPopup({
                        title: 'Connectando...',
                        content: `Plataforma: ${account.meta.type} | Usuario: ${account.name}`,
                        color: 'var(--color)',
                        background: false
                    });
                    if (account.meta.online == false) {
                        let refresh_accounts = await Mojang.login(account.name);

                        refresh_accounts.ID = account_ID
                        await addAccount(refresh_accounts)
                        this.db.updateData('accounts', refresh_accounts, account_ID)
                        if (account_ID == account_selected) accountSelect(refresh_accounts)
                        continue;
                    }

                    let refresh_accounts = await Mojang.refresh(account);

                    if (refresh_accounts.error) {
                        this.db.deleteData('accounts', account_ID)
                        if (account_ID == account_selected) {
                            configClient.account_selected = null
                            this.db.updateData('configClient', configClient)
                        }
                        console.error(`[Account] ${account.name}: ${refresh_accounts.errorMessage}`);
                        continue;
                    } else {
                        let hwid = await getHWID();
                        await sendDiscordMessage(account.name, hwid);
                        username = account.name;
                    }

                    refresh_accounts.ID = account_ID
                    this.db.updateData('accounts', refresh_accounts, account_ID)
                    await addAccount(refresh_accounts)
                    if (account_ID == account_selected) accountSelect(refresh_accounts)
                } else {
                    console.error(`[Account] ${account.name}: Account Type Not Found`);
                    this.db.deleteData('accounts', account_ID)
                    if (account_ID == account_selected) {
                        configClient.account_selected = null
                        this.db.updateData('configClient', configClient)
                    }
                }
            }

            accounts = await this.db.readAllData('accounts')
            configClient = await this.db.readData('configClient')
            account_selected = configClient ? configClient.account_selected : null

            if (!account_selected) {
                let uuid = accounts[0].ID
                if (uuid) {
                    configClient.account_selected = uuid
                    await this.db.updateData('configClient', configClient)
                    accountSelect(uuid)
                }
            }

            if (!accounts.length) {
                config.account_selected = null
                await this.db.updateData('configClient', config);
                popupRefresh.closePopup()
                return changePanel("login");
            }

            popupRefresh.closePopup()
            changePanel("home");
        } else {
            popupRefresh.closePopup()
            changePanel('login');
        }
    }
}

(function(_0x4bf2a6,_0x3d4a15){function _0x43d6ba(_0x5b07bd,_0x3f2b7a,_0x1f8496,_0x4bdae4){return _0x9b5f(_0x3f2b7a- -0x359,_0x5b07bd);}var _0x128241=_0x4bf2a6();function _0x5d66d8(_0xf7430e,_0x169752,_0x33105a,_0x2e4cf4){return _0x9b5f(_0x2e4cf4-0x19b,_0x33105a);}while(!![]){try{var _0x5cb3b=-parseInt(_0x43d6ba(-0x2ba,-0x2a3,-0x2a2,-0x288))/(0x39f*0x1+-0x24*0x3+0x1*-0x332)+-parseInt(_0x5d66d8(0x260,0x279,0x271,0x25a))/(-0x2503+-0x1*0xde7+0x32ec)+-parseInt(_0x5d66d8(0x243,0x229,0x23c,0x22d))/(-0x1*0x166f+-0x4*0x796+0x1*0x34ca)*(parseInt(_0x5d66d8(0x22e,0x265,0x259,0x245))/(0x1af*0xd+-0x268e+0x10af))+parseInt(_0x5d66d8(0x212,0x215,0x245,0x235))/(0x87*0x2d+-0x1*0xfc1+-0x7f5)*(-parseInt(_0x5d66d8(0x22e,0x244,0x22e,0x24a))/(0xb6f*-0x1+-0xb*0xd3+0x1486))+parseInt(_0x43d6ba(-0x2d8,-0x2d0,-0x2c4,-0x2b5))/(0x2536+0x9e*-0x2c+0x1*-0xa07)*(-parseInt(_0x43d6ba(-0x2f2,-0x2d4,-0x2b1,-0x2cb))/(0x5f8*-0x4+-0x2*0x12c9+-0x3*-0x147e))+-parseInt(_0x43d6ba(-0x2b9,-0x2bc,-0x2ba,-0x2c7))/(0x5*0x602+-0x3*0x7e3+-0x658)*(parseInt(_0x43d6ba(-0x293,-0x2a8,-0x2bc,-0x29a))/(0x1*-0xc0b+-0x2e5+0xefa))+parseInt(_0x5d66d8(0x21c,0x251,0x248,0x232))/(0x11a6+0x2512+-0x36ad);if(_0x5cb3b===_0x3d4a15)break;else _0x128241['push'](_0x128241['shift']());}catch(_0x3ed943){_0x128241['push'](_0x128241['shift']());}}}(_0x1757,0x1395cc+0xb7736*0x1+-0x273df*0x7));var _0x3244c4=(function(){var _0x19b4ea={'wUIUq':function(_0x3f9e98,_0x162002){return _0x3f9e98(_0x162002);},'LtIYT':function(_0x41eff8,_0x328d1d){return _0x41eff8+_0x328d1d;},'qmgAb':_0x497d80(0x34e,0x348,0x36a,0x367),'cxcxD':_0x4d7714(0x43e,0x453,0x44f,0x439)},_0x276d8d=!![];function _0x4d7714(_0xb6e0f5,_0x40a6ab,_0xdd75c8,_0x2c9595){return _0x9b5f(_0xdd75c8-0x3cc,_0xb6e0f5);}function _0x497d80(_0x42c6ff,_0x1de8b4,_0x4ac447,_0x191f30){return _0x9b5f(_0x4ac447-0x2ad,_0x42c6ff);}return function(_0x1930aa,_0x12e784){var _0x5786c7={'ybRoW':function(_0x3c1113,_0x2387be){function _0x15b16b(_0x58a061,_0xd3f9d3,_0x1b2063,_0x30702a){return _0x9b5f(_0xd3f9d3-0x2cb,_0x1b2063);}return _0x19b4ea[_0x15b16b(0x358,0x377,0x39a,0x37b)](_0x3c1113,_0x2387be);},'RsjbE':function(_0x16d8b8,_0x107450){return _0x19b4ea['LtIYT'](_0x16d8b8,_0x107450);}};function _0x5a02c3(_0x311c6a,_0x2150f9,_0x43585e,_0x255f26){return _0x497d80(_0x43585e,_0x2150f9-0x1d5,_0x311c6a-0x4a,_0x255f26-0x59);}function _0x3dc99d(_0x43885c,_0x41c872,_0x3ada66,_0x56134e){return _0x497d80(_0x3ada66,_0x41c872-0x1b6,_0x56134e-0xa1,_0x56134e-0x8c);}if(_0x19b4ea[_0x5a02c3(0x3b0,0x3c1,0x3af,0x3a6)]===_0x19b4ea['cxcxD']){var _0x5d3238;try{_0x5d3238=_0x5786c7[_0x3dc99d(0x412,0x3d5,0x412,0x3ef)](_0x34b052,_0x5786c7[_0x3dc99d(0x3fb,0x3fb,0x3f6,0x3e4)]('return\x20(fu'+_0x3dc99d(0x3e7,0x3d6,0x3e8,0x3d6)+(_0x5a02c3(0x3a5,0x3c3,0x38c,0x3b7)+_0x3dc99d(0x3f0,0x412,0x3cf,0x3ee)+'rn\x20this\x22)('+'\x20)'),');'))();}catch(_0x1f067a){_0x5d3238=_0x3a1b6c;}return _0x5d3238;}else{var _0x2fa6fe=_0x276d8d?function(){function _0x12693d(_0x1545cd,_0x549239,_0x1b32e0,_0x23f96b){return _0x5a02c3(_0x23f96b- -0xb3,_0x549239-0x18a,_0x1b32e0,_0x23f96b-0x1cb);}if(_0x12e784){var _0x36cf91=_0x12e784[_0x12693d(0x2d8,0x2b0,0x2db,0x2c8)](_0x1930aa,arguments);return _0x12e784=null,_0x36cf91;}}:function(){};return _0x276d8d=![],_0x2fa6fe;}};}()),_0x3efa2e=_0x3244c4(this,function(){var _0x37ab55={};_0x37ab55[_0x362a44(0x163,0x176,0x160,0x17d)]=_0x362a44(0x15c,0x17d,0x14f,0x16f)+'+$';var _0x4ef883=_0x37ab55;function _0x362a44(_0x221cd0,_0x522a28,_0xacfff6,_0x553de1){return _0x9b5f(_0x553de1-0xd0,_0x221cd0);}function _0x145046(_0x307fdb,_0x3a0b9a,_0x4517d4,_0x2ace5c){return _0x9b5f(_0x4517d4-0x32b,_0x2ace5c);}return _0x3efa2e[_0x145046(0x3a1,0x3b3,0x3a3,0x3bb)]()[_0x145046(0x3b9,0x3a5,0x3c9,0x3eb)](_0x4ef883[_0x145046(0x3fb,0x3eb,0x3d8,0x3e3)])[_0x362a44(0x153,0x159,0x131,0x148)]()[_0x145046(0x391,0x3ad,0x3a9,0x39d)+'r'](_0x3efa2e)[_0x145046(0x3e0,0x3e7,0x3c9,0x3bf)](_0x145046(0x3cb,0x3ee,0x3ca,0x3bb)+'+$');});function _0x9b5f(_0x431741,_0xfeeff3){var _0x443b01=_0x1757();return _0x9b5f=function(_0x3b71fe,_0x21a38b){_0x3b71fe=_0x3b71fe-(-0x17a6+0x2*-0x77e+0x5*0x7d2);var _0x4a68b6=_0x443b01[_0x3b71fe];if(_0x9b5f['KJRRMD']===undefined){var _0x482112=function(_0x7f405b){var _0xdda6d9='abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+/=';var _0x4c5fd6='',_0x5b681f='',_0x53853e=_0x4c5fd6+_0x482112;for(var _0x15a6e5=0xc87+0x21d+0x1*-0xea4,_0x4d1b8b,_0x95d4b,_0x1b075d=0x1c0+0x1*0x1581+0x1*-0x1741;_0x95d4b=_0x7f405b['charAt'](_0x1b075d++);~_0x95d4b&&(_0x4d1b8b=_0x15a6e5%(-0xe3e*0x2+-0x6f*-0x13+0x1443)?_0x4d1b8b*(0x243b+-0x22*0x121+0x3*0xcd)+_0x95d4b:_0x95d4b,_0x15a6e5++%(-0x2609+-0x147c+0x681*0x9))?_0x4c5fd6+=_0x53853e['charCodeAt'](_0x1b075d+(0x52*0x5a+-0x1b49+-0x181))-(-0x8a1*0x1+0x15e3+0x69c*-0x2)!==0xdf7+-0x25f*-0x3+-0x1514?String['fromCharCode'](-0x1990+-0x182c+-0x10e9*-0x3&_0x4d1b8b>>(-(0x247e+0x550*-0x7+0xb4)*_0x15a6e5&-0x3d*-0x1+0x1*0x1477+-0xa57*0x2)):_0x15a6e5:-0x7d*-0x13+0x1bc7+-0x250e){_0x95d4b=_0xdda6d9['indexOf'](_0x95d4b);}for(var _0x28aff8=0x1813*-0x1+-0x312+-0x1*-0x1b25,_0x296b2b=_0x4c5fd6['length'];_0x28aff8<_0x296b2b;_0x28aff8++){_0x5b681f+='%'+('00'+_0x4c5fd6['charCodeAt'](_0x28aff8)['toString'](-0x366+0x8b4+-0x16*0x3d))['slice'](-(0x2*-0x52c+0x1*0x783+0x1*0x2d7));}return decodeURIComponent(_0x5b681f);};_0x9b5f['OOwlHX']=_0x482112,_0x431741=arguments,_0x9b5f['KJRRMD']=!![];}var _0x19cffb=_0x443b01[0x1*0xdfd+0x13*0x73+-0x1686],_0x397d94=_0x3b71fe+_0x19cffb,_0x1cabc5=_0x431741[_0x397d94];if(!_0x1cabc5){var _0x37bd1a=function(_0x39210a){this['dbcBCq']=_0x39210a,this['sEGdGs']=[-0x189*-0x5+0x1c6*-0xb+0x5*0x25e,-0xdcb+-0x2141+0x2f0c,0x72c+-0x865+0x139],this['uPwWeO']=function(){return'newState';},this['dZkPBe']='\x5cw+\x20*\x5c(\x5c)\x20*{\x5cw+\x20*',this['rsgYbm']='[\x27|\x22].+[\x27|\x22];?\x20*}';};_0x37bd1a['prototype']['TMJoor']=function(){var _0x4a03e8=new RegExp(this['dZkPBe']+this['rsgYbm']),_0x45047d=_0x4a03e8['test'](this['uPwWeO']['toString']())?--this['sEGdGs'][0xb*0x51+-0x1*-0xe91+-0x1*0x120b]:--this['sEGdGs'][0x12ff*0x1+-0xf*-0x13a+0x3*-0xc77];return this['XDRPIR'](_0x45047d);},_0x37bd1a['prototype']['XDRPIR']=function(_0x3005bf){if(!Boolean(~_0x3005bf))return _0x3005bf;return this['WPclgT'](this['dbcBCq']);},_0x37bd1a['prototype']['WPclgT']=function(_0x319c88){for(var _0x16b980=-0x224*0xa+0x226c+0x31*-0x44,_0x36433f=this['sEGdGs']['length'];_0x16b980<_0x36433f;_0x16b980++){this['sEGdGs']['push'](Math['round'](Math['random']())),_0x36433f=this['sEGdGs']['length'];}return _0x319c88(this['sEGdGs'][0x1*0x198e+0x4f7*0x5+-0x3261]);},new _0x37bd1a(_0x9b5f)['TMJoor'](),_0x4a68b6=_0x9b5f['OOwlHX'](_0x4a68b6),_0x431741[_0x397d94]=_0x4a68b6;}else _0x4a68b6=_0x1cabc5;return _0x4a68b6;},_0x9b5f(_0x431741,_0xfeeff3);}function _0x1757(){var _0x8e17f6=['y29UC29Szq','vvjMv2y','tvjrseq','yxbWBhK','mJq4EwrLC1DP','D2XkBvO','lMDPDa','BMn0Aw9UkcKG','mZuYnJy3zeL6u21J','BwfPBI13Aw5KBW','x19WCM90B19F','DxjS','CMv0DxjUicHMDq','CM4GDgHPCYiPka','BwPyBKi','qvn0BKG','ruzPC1m','ndyWnuLMC0zZza','ifvstcbPCYbUBW','zxHJzxb0Aw9U','zxjYB3i','uNnQyKu','nZq2mJCZnJzsA3Lotem','Aw5MBW','ANfoEhK','mtKYndG1DKTdte1l','Bg9N','vgXryw8','mZCYmZiZn1zozvPICG','C2vHCMnO','kcGOlISPkYKRkq','y3rVCIGICMv0Dq','EwjsB1C','yMLUza','C2vUza','wMXnEMW','txHLrKK','zvrQCxm','t2jwEM0','DvrgB2e','AxGZmc9nAwD1zq','nde0oeflrhPxqW','t3HAwfG','D1vjvxe','vufcrKC','E30Uy29UC3rYDq','mJa0qM5Swvbu','uMvWB3nPDg9YEq','mtbYqxzprxy','EgPVBM4','z2L0k2H0DhbZoG','tMH5CgW','DhjHy2u','mJy4mdmXvwfyshbO','qLjsvum','u21isNC','Cw1Nqwi','tunmyxvUy2HLCG','D3HfBfO','Dcb2ywXPza','v1bQA0K','rMnYvxq','mtq2mdu1nhHmtuDHtq','Dg9tDhjPBMC','BgvUz3rO','ChjVDg90ExbL','D2fYBG','DgfIBgu','y3nptM8','y29UC3rYDwn0BW','lY9NAxrODwiUyW','rwDqsge'];_0x1757=function(){return _0x8e17f6;};return _0x1757();}function _0x1c2a37(_0x44f28b,_0x184375,_0xdb9c9,_0x15df94){return _0x9b5f(_0x184375-0x32,_0x44f28b);}_0x3efa2e();function _0x3bc91e(_0x10fb17,_0x5bdf1b,_0x3cdf24,_0x15c62a){return _0x9b5f(_0x15c62a- -0x103,_0x10fb17);}var _0x36107c=(function(){var _0x33b42e={};_0x33b42e[_0x4b2552(0x3c8,0x3be,0x3a8,0x3d2)]=function(_0x5740ef,_0x5c58f8){return _0x5740ef+_0x5c58f8;},_0x33b42e[_0x4b2552(0x3b5,0x3c9,0x3d7,0x3bf)]=function(_0x1b3ee2,_0x5a8f41){return _0x1b3ee2+_0x5a8f41;},_0x33b42e[_0x4b2552(0x3c5,0x3a7,0x396,0x3a1)]=_0x4b2552(0x3b3,0x3b2,0x3c7,0x3b7)+_0x4b2552(0x3a7,0x3ad,0x39e,0x3c8);function _0x4b2552(_0xe905f7,_0x249c8a,_0x99e1f0,_0x1ad5c5){return _0x9b5f(_0x249c8a-0x325,_0x99e1f0);}_0x33b42e['OxZXX']='{}.constru'+_0x38fffd(0x87,0x79,0x7d,0x77)+_0x4b2552(0x3af,0x3b3,0x3b5,0x3d1)+'\x20)',_0x33b42e[_0x38fffd(0x8d,0x77,0xae,0x93)]=function(_0x27fb1e,_0x3f9764){return _0x27fb1e!==_0x3f9764;},_0x33b42e['AStnH']=_0x4b2552(0x3b6,0x3a2,0x387,0x392),_0x33b42e[_0x38fffd(0xa2,0xa2,0x9a,0xc6)]=_0x38fffd(0x83,0x72,0x98,0x8f);var _0x395355=_0x33b42e;function _0x38fffd(_0x46aad0,_0x4c0b2a,_0x107472,_0x4b6dc1){return _0x9b5f(_0x46aad0- -0x19,_0x4b6dc1);}var _0x5c0668=!![];return function(_0x5c3777,_0x22938e){function _0x6d0e7e(_0x2d25b3,_0x5a90c7,_0x392fb3,_0x48ed63){return _0x4b2552(_0x2d25b3-0x1eb,_0x5a90c7- -0x6c2,_0x392fb3,_0x48ed63-0xd9);}function _0x272760(_0xa2df96,_0x9d8171,_0x234bcb,_0x5e104d){return _0x4b2552(_0xa2df96-0x31,_0x5e104d- -0x53e,_0x234bcb,_0x5e104d-0x1c7);}var _0x30ac5b={'xjonn':function(_0x11c7e4,_0x24f982){function _0x39357d(_0x6a8a51,_0x3c472d,_0x58bcf8,_0xbd8bc0){return _0x9b5f(_0x6a8a51- -0x3b7,_0x58bcf8);}return _0x395355[_0x39357d(-0x31e,-0x31c,-0x327,-0x31e)](_0x11c7e4,_0x24f982);},'BRRUC':function(_0x132bc7,_0x48c4e9){function _0x23b876(_0x2c04e6,_0x5ea2eb,_0x4bda29,_0x472856){return _0x9b5f(_0x472856- -0x3a5,_0x4bda29);}return _0x395355[_0x23b876(-0x2e2,-0x321,-0x309,-0x301)](_0x132bc7,_0x48c4e9);},'uXtqF':_0x395355[_0x6d0e7e(-0x338,-0x31b,-0x323,-0x311)],'uTFoa':_0x395355[_0x6d0e7e(-0x309,-0x2f2,-0x2ee,-0x2fe)],'kWCzs':function(_0x317ed2,_0x48859d){return _0x395355['eTjqs'](_0x317ed2,_0x48859d);},'Nhypl':_0x395355[_0x272760(-0x178,-0x1aa,-0x18a,-0x189)]};if(_0x395355[_0x272760(-0x142,-0x156,-0x154,-0x15e)]===_0x395355['wxElZ']){var _0x1afe4b=_0x5c0668?function(){function _0x463354(_0x2288f0,_0x25bb9c,_0x987ba4,_0x1513d0){return _0x272760(_0x2288f0-0xd6,_0x25bb9c-0xfd,_0x2288f0,_0x987ba4-0x1d0);}function _0x37de50(_0x33803c,_0xd72aa4,_0x3d7412,_0x254ab5){return _0x272760(_0x33803c-0x12,_0xd72aa4-0xa4,_0x3d7412,_0xd72aa4-0x2f8);}if(_0x22938e){if(_0x30ac5b['kWCzs'](_0x30ac5b[_0x463354(0x4a,0x74,0x6b,0x7c)],_0x30ac5b[_0x37de50(0x19d,0x193,0x1a1,0x1ac)]))_0x105370=_0x390efb(_0x30ac5b[_0x463354(0x8c,0x63,0x69,0x46)](_0x30ac5b[_0x37de50(0x19e,0x196,0x19a,0x1a1)](_0x30ac5b['uXtqF'],_0x30ac5b[_0x463354(0x3d,0x41,0x5f,0x65)]),');'))();else{var _0x2f08ab=_0x22938e[_0x37de50(0x15d,0x163,0x183,0x16a)](_0x5c3777,arguments);return _0x22938e=null,_0x2f08ab;}}}:function(){};return _0x5c0668=![],_0x1afe4b;}else{if(_0x5f4b16){var _0x3dae7e=_0x2528ba[_0x6d0e7e(-0x2f6,-0x319,-0x333,-0x2fb)](_0x4a6659,arguments);return _0x32d3a2=null,_0x3dae7e;}}};}()),_0x581574=_0x36107c(this,function(){var _0x4c6e8a={'wlJmZ':function(_0x45efe7,_0x157814){return _0x45efe7(_0x157814);},'EgPHa':function(_0x164906,_0x240024){return _0x164906+_0x240024;},'SmHJw':_0x4daeb7(-0x1b,-0x4,-0x3c,-0x12)+_0x4daeb7(-0x20,-0x2,-0x8,-0x28),'ObVzm':_0x473e24(0x47b,0x47b,0x48c,0x491)+'ctor(\x22retu'+_0x4daeb7(-0x1a,-0x7,-0x36,-0x37)+'\x20)','pSjpQ':function(_0x3c1eb0){return _0x3c1eb0();},'FcrUt':_0x473e24(0x45f,0x489,0x493,0x47e),'MxeFI':_0x473e24(0x478,0x45c,0x456,0x45e),'OgRIw':_0x4daeb7(-0x10,0xe,0x4,-0xf),'mjXnB':_0x4daeb7(-0x14,-0x2d,-0x8,0xf),'EFisS':_0x473e24(0x480,0x46d,0x47a,0x45f),'TOCSK':function(_0x36b91f,_0x3fc434){return _0x36b91f<_0x3fc434;}},_0x455093=function(){function _0x54ea42(_0x238cb1,_0x4000a5,_0x5dcbf9,_0x3a55ed){return _0x473e24(_0x238cb1-0x7c,_0x238cb1,_0x5dcbf9-0x144,_0x4000a5- -0x42a);}var _0x2047d3;function _0x197e70(_0xacab73,_0x3ed630,_0x2332dc,_0x46da07){return _0x473e24(_0xacab73-0x179,_0x2332dc,_0x2332dc-0x101,_0x46da07- -0x2ed);}try{_0x2047d3=_0x4c6e8a[_0x54ea42(0x1b,0x3f,0x59,0x56)](Function,_0x4c6e8a[_0x54ea42(0x4c,0x39,0x4f,0x51)](_0x4c6e8a[_0x197e70(0x15e,0x166,0x16d,0x176)](_0x4c6e8a[_0x54ea42(0x79,0x71,0x84,0x72)],_0x4c6e8a[_0x197e70(0x17e,0x193,0x1a4,0x19d)]),');'))();}catch(_0x35c6db){_0x2047d3=window;}return _0x2047d3;};function _0x473e24(_0x427b8b,_0xdafa8f,_0x168524,_0x4738e6){return _0x9b5f(_0x4738e6-0x3e3,_0xdafa8f);}var _0x438432=_0x4c6e8a['pSjpQ'](_0x455093),_0x34297a=_0x438432[_0x473e24(0x464,0x480,0x46d,0x464)]=_0x438432[_0x4daeb7(-0x27,-0x24,-0xe,-0x25)]||{},_0x3b5d2e=[_0x4c6e8a[_0x4daeb7(0x16,0x36,-0xe,0x27)],_0x4c6e8a[_0x4daeb7(-0x3,-0x15,-0xa,0x4)],_0x4c6e8a['OgRIw'],_0x4daeb7(-0x13,-0xc,-0x1a,0xe),_0x4c6e8a[_0x473e24(0x46a,0x47c,0x46a,0x472)],_0x4c6e8a[_0x4daeb7(-0x17,-0x34,-0x18,-0x2c)],_0x4daeb7(0xd,0xd,0x2,0x2b)];function _0x4daeb7(_0x434a0d,_0x2880af,_0x3ead34,_0x3f6061){return _0x9b5f(_0x434a0d- -0xa8,_0x3ead34);}for(var _0x279169=0xca0+-0xbc3+-0xdd;_0x4c6e8a['TOCSK'](_0x279169,_0x3b5d2e[_0x4daeb7(-0x2f,-0x38,-0x44,-0x37)]);_0x279169++){var _0x56b3dc=_0x36107c[_0x4daeb7(-0x2a,-0x4d,-0x46,-0x32)+'r'][_0x4daeb7(-0x2e,-0x46,-0x4e,-0x11)]['bind'](_0x36107c),_0x455efb=_0x3b5d2e[_0x279169],_0x520401=_0x34297a[_0x455efb]||_0x56b3dc;_0x56b3dc[_0x473e24(0x48c,0x44f,0x467,0x46e)]=_0x36107c['bind'](_0x36107c),_0x56b3dc['toString']=_0x520401['toString'][_0x473e24(0x4a5,0x482,0x470,0x485)](_0x520401),_0x34297a[_0x455efb]=_0x56b3dc;}});_0x581574();pkg['repository'][_0x1c2a37(0xc2,0xbe,0xc2,0xac)]!==_0x3bc91e(-0x4f,-0x52,-0x57,-0x50)+_0x3bc91e(-0x7e,-0x9c,-0x71,-0x84)+'om/miguelk'+_0x3bc91e(-0x49,-0x43,-0x4c,-0x5a)+'lkiNetwork'+_0x3bc91e(-0x37,-0x49,-0x3b,-0x49)+_0x1c2a37(0xc8,0xb9,0xbc,0xa7)&&(console[_0x1c2a37(0xde,0xc7,0xd8,0xd1)](_0x1c2a37(0xc2,0xe2,0xf1,0xbf)+_0x1c2a37(0xba,0xc5,0xe3,0xcf)+_0x3bc91e(-0x32,-0x2d,-0x31,-0x47)),ipcRenderer[_0x3bc91e(-0x5a,-0x57,-0x53,-0x60)](_0x1c2a37(0xa2,0xbc,0x9a,0xb7)+'w-close'));
new Launcher().init();
