/**
 * @author Luuxis
 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0
 */
const { AZauth, Mojang } = require('minecraft-java-core');
const { ipcRenderer } = require('electron');

import { popup, database, changePanel, accountSelect, addAccount, config, setStatus, setUsername, clickableHead, getDiscordUsername } from '../utils.js';
import { getHWID, loginMSG } from '../MKLib.js';

class Login {
    static id = "login";
    async init(config) {
        this.config = config;
        this.db = new database();

        if (typeof this.config.online == 'boolean') {
            this.config.online ? this.getMicrosoft() : this.getCrack()
        } else if (typeof this.config.online == 'string') {
            if (this.config.online.match(/^(http|https):\/\/[^ "]+$/)) {
                this.getAZauth();
            }
        }
        
        document.querySelector('.cancel-home').addEventListener('click', () => {
            document.querySelector('.cancel-home').style.display = 'none'
            changePanel('settings')
        })
        document.querySelector('.cancel-AZauth').addEventListener('click', () => {
            document.querySelector('.cancel-AZauth').style.display = 'none'
            changePanel('settings')
        })
        document.querySelector('.cancel-offline').addEventListener('click', () => {
            document.querySelector('.cancel-offline').style.display = 'none'
            changePanel('settings')
        })
        document.querySelector('.register-azauth').addEventListener('click', () => {
            ipcRenderer.send('create-register-window');
        });
    }

    async getMicrosoft() {
        console.log('Inicializando inicio de sesión a través de Microsoft...');
        let popupLogin = new popup();
        let loginHome = document.querySelector('.login-home');
        let microsoftBtn = document.querySelector('.connect-home');
        loginHome.style.display = 'block';

        microsoftBtn.addEventListener("click", () => {
            popupLogin.openPopup({
                title: 'Iniciar sesión',
                content: 'Por favor continua en la ventana de inicio de sesión de Microsoft......',
                color: 'var(--color)'
            });

            ipcRenderer.invoke('Microsoft-window', this.config.client_id).then(async account_connect => {
                if (account_connect == 'cancel' || !account_connect) {
                    popupLogin.closePopup();
                    return;
                } else {
                    await this.saveData(account_connect)
                    clickableHead(false);
                    popupLogin.closePopup();
                }

            }).catch(err => {
                popupLogin.openPopup({
                    title: 'Error',
                    content: err,
                    options: true
                });
            });
        })
    }

    async getCrack() {
        console.log('Inicializando inicio de sesión a través de nombre de usuario...');
        let popupLogin = new popup();
        let loginOffline = document.querySelector('.login-offline');

        let microsoftcracked = document.querySelector('.connect-microsoftcracked');

        let emailOffline = document.querySelector('.email-offline');
        let connectOffline = document.querySelector('.connect-offline');
        loginOffline.style.display = 'block';

        microsoftcracked.addEventListener('click', () => {
            popupLogin.openPopup({
                title: 'Iniciar sesión',
                content: 'Por favor continua en la ventana de inicio de sesión de Microsoft......',
                color: 'var(--color)'
            });

            ipcRenderer.invoke('Microsoft-window', this.config.client_id).then(async account_connect => {
                if (account_connect == 'cancel' || !account_connect) {
                    popupLogin.closePopup();
                    return;
                } else {
                    await this.saveData(account_connect)
                    clickableHead(false);
                    popupLogin.closePopup();
                }

            }).catch(err => {
                popupLogin.openPopup({
                    title: 'Error',
                    content: err,
                    options: true
                });
            });
        });

        connectOffline.addEventListener('click', async () => {
            connectOffline.disabled = true;
            if (emailOffline.value.length < 3) {
                popupLogin.openPopup({
                    title: 'Error',
                    content: 'Tu nombre de usuario debe tener al menos 3 caracteres.',
                    options: true
                });
                connectOffline.disabled = false;
                return;
            }

            if (emailOffline.value.match(/ /g)) {
                popupLogin.openPopup({
                    title: 'Error',
                    content: 'Su nombre de usuario no debe contener d\'espacios.',
                    options: true
                });
                connectOffline.disabled = false;
                return;
            }

            let MojangConnect = await Mojang.login(emailOffline.value);

            if (MojangConnect.error) {
                popupLogin.openPopup({
                    title: 'Error',
                    content: MojangConnect.message,
                    options: true
                });
                connectOffline.disabled = false;
                return;
            }
            await this.saveData(MojangConnect)
            popupLogin.closePopup();
            connectOffline.disabled = false;
        });
    }

    async getAZauth() {
        console.log('Inicializando inicio de sesión a través de MKNetworkID...');
        let AZauthClient = new AZauth(this.config.online);
        let PopupLogin = new popup();
        let loginAZauth = document.querySelector('.login-AZauth');
        let loginAZauthA2F = document.querySelector('.login-AZauth-A2F');
        let loginMicrosoftAzauth = document.querySelector('.connect-microsoftazauth');
        let registerBtn = document.querySelector('.register-azauth');

        let AZauthEmail = document.querySelector('.email-AZauth');
        let AZauthPassword = document.querySelector('.password-AZauth');
        let AZauthA2F = document.querySelector('.A2F-AZauth');
        let connectAZauthA2F = document.querySelector('.connect-AZauth-A2F');
        let AZauthConnectBTN = document.querySelector('.connect-AZauth');
        let AZauthCancelA2F = document.querySelector('.cancel-AZauth-A2F');

        loginAZauth.style.display = 'block';
        registerBtn.style.display = 'inline';

        loginMicrosoftAzauth.addEventListener('click', () => {
            PopupLogin.openPopup({
                title: 'Iniciar sesión',
                content: 'Por favor continua en la ventana de inicio de sesión de Microsoft...',
                color: 'var(--color)'
            });

            ipcRenderer.invoke('Microsoft-window', this.config.client_id).then(async account_connect => {
                if (account_connect == 'cancel' || !account_connect) {
                    PopupLogin.closePopup();
                    return;
                } else {
                    await this.saveData(account_connect)
                    clickableHead(false);
                    PopupLogin.closePopup();
                }

            }).catch(err => {
                PopupLogin.openPopup({
                    title: 'Error',
                    content: err,
                    options: true
                });
            });
        });

        AZauthConnectBTN.addEventListener('click', async () => {
            PopupLogin.openPopup({
                title: 'Conexión en curso...',
                content: 'Espere, por favor...',
                color: 'var(--color)'
            });

            if (AZauthEmail.value == '' || AZauthPassword.value == '') {
                PopupLogin.openPopup({
                    title: 'Error',
                    content: 'Rellene todos los campos.',
                    options: true
                });
                return;
            }

            let AZauthConnect = await AZauthClient.login(AZauthEmail.value, AZauthPassword.value);

            if (AZauthConnect.error) {
                PopupLogin.openPopup({
                    title: 'Error',
                    content: AZauthConnect.message,
                    options: true
                });
                return;
            } else if (AZauthConnect.A2F) {
                loginAZauthA2F.style.display = 'block';
                loginAZauth.style.display = 'none';
                PopupLogin.closePopup();

                AZauthCancelA2F.addEventListener('click', () => {
                    loginAZauthA2F.style.display = 'none';
                    loginAZauth.style.display = 'block';
                });

                connectAZauthA2F.addEventListener('click', async () => {
                    PopupLogin.openPopup({
                        title: 'Conexión en curso...',
                        content: 'Espere, por favor...',
                        color: 'var(--color)'
                    });

                    if (AZauthA2F.value == '') {
                        PopupLogin.openPopup({
                            title: 'Error',
                            content: 'Introduzca el código A2F.',
                            options: true
                        });
                        return;
                    }

                    AZauthConnect = await AZauthClient.login(AZauthEmail.value, AZauthPassword.value, AZauthA2F.value);

                    if (AZauthConnect.error) {
                        PopupLogin.openPopup({
                            title: 'Error',
                            content: AZauthConnect.message,
                            options: true
                        });
                        return;
                    }

                    await this.saveData(AZauthConnect)
                    clickableHead(true);
                    PopupLogin.closePopup();
                });
            } else if (!AZauthConnect.A2F) {
                await this.saveData(AZauthConnect)
                clickableHead(true);
                PopupLogin.closePopup();
            }
        });
    }

    async saveData(connectionData) {
        let configClient = await this.db.readData('configClient');
        let account = await this.db.createData('accounts', connectionData)
        let instanceSelect = configClient.instance_selct
        let instancesList = await config.getInstanceList()
        configClient.account_selected = account.ID;

        for (let instance of instancesList) {
            if (instance.whitelistActive) {
                let whitelist = instance.whitelist.find(whitelist => whitelist == account.name)
                if (whitelist !== account.name) {
                    if (instance.name == instanceSelect) {
                        let newInstanceSelect = instancesList.find(i => i.whitelistActive == false)
                        configClient.instance_selct = newInstanceSelect.name
                        await setStatus(newInstanceSelect)
                    }
                }
            }
        }

        await this.db.updateData('configClient', configClient);
        await addAccount(account);
        await accountSelect(account);
        await setUsername(account.name);
        await loginMSG();
        changePanel('home');
    }
}
export default Login;