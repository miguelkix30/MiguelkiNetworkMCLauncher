/**
 * @author Luuxis
 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0
 */

import { changePanel, accountSelect, database, Slider, config, setStatus, popup, appdata, clickableHead, getTermsAndConditions, setPerformanceMode, isPerformanceModeEnabled } from '../utils.js'
const os = require('os');
const { shell, ipcRenderer, dialog } = require('electron');
const { marked } = require('marked');
const fs = require('fs');
const path = require('path');

class Settings {
    static id = "settings";
    async init(config) {
        this.config = config;
        this.db = new database();
        this.navBTN()
        this.accounts()
        this.ram()
        this.javaPath()
        this.resolution()
        this.launcher()
        this.socials()
        this.terms()
        
        this.applyPerfModeOverridesIfNeeded();
    }

    applyPerfModeOverridesIfNeeded() {
        if (isPerformanceModeEnabled()) {
            console.log("Applying performance mode overrides for settings panel");
            
            const containers = document.querySelectorAll('.container-settings');
            containers.forEach(container => {
                container.style.transition = 'none';
                container.style.transitionProperty = 'none';
                container.style.transitionDuration = '0s';
                
                if (container.classList.contains('active-container-settings')) {
                    container.style.transform = 'translateX(0)';
                    container.style.opacity = '1';
                    container.style.visibility = 'visible';
                } else {
                    container.style.transform = 'translateX(100%)';
                    container.style.opacity = '0';
                    container.style.visibility = 'hidden';
                }
            });
            
            document.querySelectorAll('.settings-elements-box, .titre-tab').forEach(el => {
                el.style.transition = 'none';
                el.style.animation = 'none';
            });
        }
    }

    navBTN() {
        document.querySelector('.nav-box').addEventListener('click', e => {
            if (e.target.classList.contains('nav-settings-btn')) {
                let id = e.target.id;
                let activeSettingsBTN = document.querySelector('.active-settings-BTN');
                let activeContainerSettings = document.querySelector('.active-container-settings');
                const performanceMode = isPerformanceModeEnabled();

                if (id == 'save') {
                    if (activeSettingsBTN) activeSettingsBTN.classList.toggle('active-settings-BTN');
                    document.querySelector('#account').classList.add('active-settings-BTN');

                    if (activeContainerSettings) {
                        if (performanceMode) {
                            activeContainerSettings.classList.remove('active-container-settings');
                            activeContainerSettings.style.opacity = '0';
                            activeContainerSettings.style.transform = 'translateX(100%)';
                            activeContainerSettings.style.visibility = 'hidden';
                        } else {
                            activeContainerSettings.classList.toggle('active-container-settings');
                        }
                    }

                    if (performanceMode) {
                        const accountTab = document.querySelector(`#account-tab`);
                        accountTab.classList.add('active-container-settings');
                        accountTab.style.opacity = '1';
                        accountTab.style.transform = 'translateX(0)';
                        accountTab.style.visibility = 'visible';
                    } else {
                        document.querySelector(`#account-tab`).classList.add('active-container-settings');
                    }
                    
                    return changePanel('home');
                }

                if (activeSettingsBTN) activeSettingsBTN.classList.toggle('active-settings-BTN');
                e.target.classList.add('active-settings-BTN');

                if (activeContainerSettings) {
                    if (performanceMode) {
                        activeContainerSettings.classList.remove('active-container-settings');
                        activeContainerSettings.style.opacity = '0';
                        activeContainerSettings.style.transform = 'translateX(100%)';
                        activeContainerSettings.style.visibility = 'hidden';
                        
                        void activeContainerSettings.offsetWidth;
                    } else {
                        activeContainerSettings.classList.toggle('active-container-settings');
                    }
                }

                if (performanceMode) {
                    const newTab = document.querySelector(`#${id}-tab`);
                    
                    newTab.style.transition = 'none';
                    newTab.style.transitionProperty = 'none';
                    newTab.style.animation = 'none';
                    
                    void newTab.offsetWidth;
                    
                    newTab.classList.add('active-container-settings');
                    newTab.style.opacity = '1';
                    newTab.style.transform = 'translateX(0)';
                    newTab.style.visibility = 'visible';
                } else {
                    document.querySelector(`#${id}-tab`).classList.add('active-container-settings');
                }
            }
        })
    }

    accounts() {
        document.querySelector('.accounts-list').addEventListener('click', async e => {
            let popupAccount = new popup()
            try {
                let id = e.target.id
                if (e.target.classList.contains('account')) {
                    popupAccount.openPopup({
                        title: 'Iniciar sesión',
                        content: 'Espere, por favor...',
                        color: 'var(--color)'
                    })

                    if (id == 'add') {
                        document.querySelector('.cancel-home').style.display = 'inline'
                        document.querySelector('.cancel-AZauth').style.display = 'inline'
                        document.querySelector('.cancel-offline').style.display = 'inline'
                        return changePanel('login')
                    }

                    let account = await this.db.readData('accounts', id);
                    let configClient = await this.setInstance(account);
                    await accountSelect(account);
                    if (account.meta.type == 'AZauth') clickableHead(true); else clickableHead(false);
                    configClient.account_selected = account.ID;
                    return await this.db.updateData('configClient', configClient);
                }

                if (e.target.classList.contains("delete-profile")) {
                    popupAccount.openPopup({
                        title: 'Iniciar sesión',
                        content: 'Espere, por favor...',
                        color: 'var(--color)'
                    })
                    await this.db.deleteData('accounts', id);
                    let deleteProfile = document.getElementById(`${id}`);
                    let accountListElement = document.querySelector('.accounts-list');
                    accountListElement.removeChild(deleteProfile);

                    if (accountListElement.children.length == 1) return changePanel('login');

                    let configClient = await this.db.readData('configClient');

                    if (configClient.account_selected == id) {
                        let allAccounts = await this.db.readAllData('accounts');
                        configClient.account_selected = allAccounts[0].ID
                        accountSelect(allAccounts[0]);
                        let newInstanceSelect = await this.setInstance(allAccounts[0]);
                        configClient.instance_selct = newInstanceSelect.instance_selct
                        return await this.db.updateData('configClient', configClient);
                    }
                }
            } catch (err) {
                console.error(err)
            } finally {
                popupAccount.closePopup();
            }
        })
    }

    async setInstance(auth) {
        let configClient = await this.db.readData('configClient')
        let instanceSelect = configClient.instance_selct
        let instancesList = await config.getInstanceList()

        for (let instance of instancesList) {
            if (instance.whitelistActive) {
                let whitelist = instance.whitelist.find(whitelist => whitelist == auth.name)
                if (whitelist !== auth.name) {
                    if (instance.name == instanceSelect) {
                        let newInstanceSelect = instancesList.find(i => i.whitelistActive == false)
                        configClient.instance_selct = newInstanceSelect.name
                        await setStatus(newInstanceSelect)
                    }
                }
            }
        }
        return configClient
    }

    async ram() {
        let config = await this.db.readData('configClient');
        let totalMem = Math.trunc(os.totalmem() / 1073741824 * 10) / 10;
        let freeMem = Math.trunc(os.freemem() / 1073741824 * 10) / 10;

        document.getElementById("total-ram").textContent = `${totalMem} GB`;
        document.getElementById("free-ram").textContent = `${freeMem} GB`;

        let sliderDiv = document.querySelector(".memory-slider");
        sliderDiv.setAttribute("max", Math.trunc((80 * totalMem) / 100));

        let ram = config?.java_config?.java_memory ? {
            ramMin: config.java_config.java_memory.min,
            ramMax: config.java_config.java_memory.max
        } : { ramMin: "1", ramMax: "2" };

        if (totalMem < ram.ramMin) {
            config.java_config.java_memory = { min: 1, max: 2 };
            this.db.updateData('configClient', config);
            ram = { ramMin: "1", ramMax: "2" }
        };

        class SettingsSlider {
            constructor(element, minValue, maxValue) {
                this.element = document.querySelector(element);
                this.min = Math.max(0.5, parseFloat(this.element.getAttribute('min')) || 0.5);
                this.max = parseFloat(this.element.getAttribute('max')) || 8;
                this.step = parseFloat(this.element.getAttribute('step')) || 0.5;
                this.normalizeFact = 18;
                
                this.touchLeft = this.element.querySelector('.slider-touch-left');
                this.touchRight = this.element.querySelector('.slider-touch-right');
                this.lineSpan = this.element.querySelector('.slider-line span');
                
                this.callbacks = [];
                
                this.init();
                
                minValue = Math.max(this.min, minValue);
                maxValue = Math.max(minValue + 2, maxValue);
                
                const minRatio = (minValue - this.min) / (this.max - this.min);
                const minPosition = Math.ceil(minRatio * (this.element.offsetWidth - (this.normalizeFact * 2)));
                this.touchLeft.style.left = `${minPosition}px`;
                
                const maxRatio = (maxValue - this.min) / (this.max - this.min);
                const maxPosition = Math.ceil(maxRatio * (this.element.offsetWidth - (this.normalizeFact * 2))) + this.normalizeFact;
                this.touchRight.style.left = `${maxPosition}px`;
                
                this.lineSpan.style.marginLeft = `${minPosition}px`;
                this.lineSpan.style.width = `${maxPosition - minPosition}px`;
                
                this.updateDisplayValues(minValue, maxValue);
            }
            
            init() {
                this.touchLeft.addEventListener('mousedown', this.onStart.bind(this, 'left'));
                this.touchRight.addEventListener('mousedown', this.onStart.bind(this, 'right'));
                
                document.addEventListener('mousemove', this.onMove.bind(this));
                document.addEventListener('mouseup', this.onEnd.bind(this));
            }
            
            onStart(direction, e) {
                e.preventDefault();
                e.stopPropagation();
                this.direction = direction;
                this.startX = e.clientX;
                if (direction === 'left') {
                    this.currentX = this.touchLeft.offsetLeft;
                } else {
                    this.currentX = this.touchRight.offsetLeft;
                }
                this.active = true;
            }
            
            onMove(e) {
                if (!this.active) return;
                e.preventDefault();
                
                let newX = this.currentX + e.clientX - this.startX;
                newX = Math.max(0, Math.min(newX, this.element.offsetWidth - this.normalizeFact));
                
                if (this.direction === 'left') {
                    // Ensure the left handle doesn't move beyond the right handle minus necessary gap
                    // Calculate position that would create a 2GB gap
                    const minGapInGB = 2; // Minimum gap in GB
                    const gapRatio = minGapInGB / (this.max - this.min);
                    const gapPixels = gapRatio * (this.element.offsetWidth - (this.normalizeFact * 2));
                    
                    const rightHandlePosition = this.touchRight.offsetLeft;
                    newX = Math.min(newX, rightHandlePosition - gapPixels);
                    
                    this.touchLeft.style.left = `${newX}px`;
                    this.lineSpan.style.marginLeft = `${newX}px`;
                } else {
                    // Ensure the right handle doesn't move before the left handle plus necessary gap
                    // Calculate position that would create a 2GB gap
                    const minGapInGB = 2; // Minimum gap in GB
                    const gapRatio = minGapInGB / (this.max - this.min);
                    const gapPixels = gapRatio * (this.element.offsetWidth - (this.normalizeFact * 2));
                    
                    const leftHandlePosition = this.touchLeft.offsetLeft;
                    newX = Math.max(newX, leftHandlePosition + gapPixels);
                    
                    this.touchRight.style.left = `${newX}px`;
                }
                
                this.lineSpan.style.width = `${this.touchRight.offsetLeft - this.touchLeft.offsetLeft}px`;
                
                let minValue = this.getMinValue();
                let maxValue = this.getMaxValue();
                
                // Additional check to ensure min is never larger than max - minGapInGB
                if (maxValue - minValue < 2) {
                    if (this.direction === 'left') {
                        minValue = maxValue - 2;
                    } else {
                        maxValue = minValue + 2;
                    }
                }
                
                this.updateDisplayValues(minValue, maxValue);
                
                this.callbacks.forEach(callback => {
                    callback(minValue, maxValue);
                });
            }
            
            onEnd() {
                this.active = false;
            }
            
            getMinValue() {
                const ratio = this.touchLeft.offsetLeft / (this.element.offsetWidth - (this.normalizeFact * 2));
                const rawValue = this.min + ratio * (this.max - this.min);
                return Math.max(this.min, Math.round(rawValue / this.step) * this.step);
            }
            
            getMaxValue() {
                const ratio = (this.touchRight.offsetLeft - this.normalizeFact) / (this.element.offsetWidth - (this.normalizeFact * 2));
                const rawValue = this.min + ratio * (this.max - this.min);
                return Math.min(this.max, Math.round(rawValue / this.step) * this.step);
            }
            
            updateDisplayValues(min, max) {
                const leftSpan = this.touchLeft.querySelector('span');
                leftSpan.setAttribute('value', `${min} GB`);
                
                const rightSpan = this.touchRight.querySelector('span');
                rightSpan.setAttribute('value', `${max} GB`);
            }
            
            on(event, callback) {
                if (event === 'change') {
                    this.callbacks.push(callback);
                }
            }
        }

        // Initialize the new slider with the existing values
        const settingsSlider = new SettingsSlider(".memory-slider", parseFloat(ram.ramMin), parseFloat(ram.ramMax));
        
        // Set up the slider callback to update the config
        settingsSlider.on('change', async (min, max) => {
            let config = await this.db.readData('configClient');
            config.java_config.java_memory = { min: min, max: max };
            this.db.updateData('configClient', config);
        });
    }

    async javaPath() {
        let javaPathText = document.querySelector(".java-path-txt")
        javaPathText.textContent = `${await appdata()}/${process.platform == 'darwin' ? this.config.dataDirectory : `.${this.config.dataDirectory}`}/runtime`;

        let configClient = await this.db.readData('configClient')
        let javaPath = configClient?.java_config?.java_path || 'Utilice la versión de java suministrada con el launcher';
        let javaPathInputTxt = document.querySelector(".java-path-input-text");
        let javaPathInputFile = document.querySelector(".java-path-input-file");
        javaPathInputTxt.value = javaPath;

        document.querySelector(".java-path-set").addEventListener("click", async () => {
            javaPathInputFile.value = '';
            javaPathInputFile.click();
            await new Promise((resolve) => {
                let interval;
                interval = setInterval(() => {
                    if (javaPathInputFile.value != '') resolve(clearInterval(interval));
                }, 100);
            });

            if (javaPathInputFile.value.replace(".exe", '').endsWith("java") || javaPathInputFile.value.replace(".exe", '').endsWith("javaw")) {
                let configClient = await this.db.readData('configClient')
                let file = javaPathInputFile.files[0].path;
                javaPathInputTxt.value = file;
                configClient.java_config.java_path = file
                await this.db.updateData('configClient', configClient);
            } else alert("El nombre del archivo debe ser java o javaw");
        });

        document.querySelector(".java-path-reset").addEventListener("click", async () => {
            let configClient = await this.db.readData('configClient')
            javaPathInputTxt.value = 'Utilice la versión de java suministrada con el launcher';
            configClient.java_config.java_path = null
            await this.db.updateData('configClient', configClient);
        });
    }

    async resolution() {
        let configClient = await this.db.readData('configClient')
        let resolution = configClient?.game_config?.screen_size || { width: 1920, height: 1080 };

        let width = document.querySelector(".width-size");
        let height = document.querySelector(".height-size");
        let resolutionReset = document.querySelector(".size-reset");

        width.value = resolution.width;
        height.value = resolution.height;

        width.addEventListener("change", async () => {
            let configClient = await this.db.readData('configClient')
            configClient.game_config.screen_size.width = width.value;
            await this.db.updateData('configClient', configClient);
        })

        height.addEventListener("change", async () => {
            let configClient = await this.db.readData('configClient')
            configClient.game_config.screen_size.height = height.value;
            await this.db.updateData('configClient', configClient);
        })

        resolutionReset.addEventListener("click", async () => {
            let configClient = await this.db.readData('configClient')
            configClient.game_config.screen_size = { width: '854', height: '480' };
            width.value = '854';
            height.value = '480';
            await this.db.updateData('configClient', configClient);
        })
    }

    async launcher() {
        let configClient = await this.db.readData('configClient');

        let maxDownloadFiles = configClient?.launcher_config?.download_multi || 3;
        let maxDownloadFilesInput = document.querySelector(".max-files");
        let maxDownloadFilesReset = document.querySelector(".max-files-reset");
        maxDownloadFilesInput.value = maxDownloadFiles;

        maxDownloadFilesInput.addEventListener("change", async () => {
            let configClient = await this.db.readData('configClient')
            configClient.launcher_config.download_multi = maxDownloadFilesInput.value;
            await this.db.updateData('configClient', configClient);
        })

        maxDownloadFilesReset.addEventListener("click", async () => {
            let configClient = await this.db.readData('configClient')
            maxDownloadFilesInput.value = 3
            configClient.launcher_config.download_multi = 3;
            await this.db.updateData('configClient', configClient);
        })

        const performanceModeCheckbox = document.querySelector(".performance-mode-checkbox");
        if (performanceModeCheckbox) {
            let configClient = await this.db.readData('configClient');
            performanceModeCheckbox.checked = configClient?.launcher_config?.performance_mode || false;
            
            performanceModeCheckbox.addEventListener("change", async () => {
                let configClient = await this.db.readData('configClient');
                configClient.launcher_config.performance_mode = performanceModeCheckbox.checked;
                await this.db.updateData('configClient', configClient);
                
                let performanceModePopup = new popup();
                let dialogResult = await new Promise((resolve) => {
                    performanceModePopup.openDialog({
                      title: performanceModeCheckbox.checked ? 'Modo de rendimiento activado' : 'Modo de rendimiento desactivado',
                      content:
                        "Para aplicar completamente los cambios del modo de rendimiento, es necesario reiniciar el launcher. Esto eliminará todas las transiciones y efectos visuales para mejorar el rendimiento. <br><br>¿Desea reiniciar el launcher ahora?",
                      options: true,
                      callback: resolve,
                    });
                  });
            
                  if (dialogResult === "cancel") {
                    return;
                  } else {
                    ipcRenderer.send("app-restart");
                  }
            });
        }

        let closeLauncher = configClient?.launcher_config?.closeLauncher || "close-launcher";
        let behaviorOptions = document.querySelectorAll('.launcher-behavior-option');
        
        behaviorOptions.forEach(option => {
            if (option.dataset.value === closeLauncher) {
                option.classList.add('selected');
            }
            
            option.addEventListener('click', async () => {
                behaviorOptions.forEach(opt => opt.classList.remove('selected'));
                
                option.classList.add('selected');
                
                let configClient = await this.db.readData('configClient');
                configClient.launcher_config.closeLauncher = option.dataset.value;
                await this.db.updateData('configClient', configClient);
            });
        });

        const resetConfigBtn = document.querySelector('.reset-config-btn');
        const deleteAllBtn = document.querySelector('.delete-all-btn');

        if (resetConfigBtn) {
            resetConfigBtn.addEventListener('click', async () => {
                this.handleResetConfig();
            });
        }

        if (deleteAllBtn) {
            deleteAllBtn.addEventListener('click', async () => {
                this.handleDeleteAll();
            });
        }

        // Keep the old code commented out for reference
        /*
        let closeBox = document.querySelector(".close-box");
        
        if (closeLauncher == "close-launcher") {
            document.querySelector('.close-launcher').classList.add('active-close');
        } else if (closeLauncher == "close-all") {
            document.querySelector('.close-all').classList.add('active-close');
        } else if (closeLauncher == "close-none") {
            document.querySelector('.close-none').classList.add('active-close');
        }

        closeBox.addEventListener("click", async e => {
            if (e.target.classList.contains('close-btn')) {
                let activeClose = document.querySelector('.active-close');
                if (e.target.classList.contains('active-close')) return
                activeClose?.classList.toggle('active-close');

                let configClient = await this.db.readData('configClient')

                if (e.target.classList.contains('close-launcher')) {
                    e.target.classList.toggle('active-close');
                    configClient.launcher_config.closeLauncher = "close-launcher";
                    await this.db.updateData('configClient', configClient);
                } else if (e.target.classList.contains('close-all')) {
                    e.target.classList.toggle('active-close');
                    configClient.launcher_config.closeLauncher = "close-all";
                    await this.db.updateData('configClient', configClient);
                } else if (e.target.classList.contains('close-none')) {
                    e.target.classList.toggle('active-close');
                    configClient.launcher_config.closeLauncher = "close-none";
                    await this.db.updateData('configClient', configClient);
                }
            }
        })
        */
    }

    async handleResetConfig() {
        const resetPopup = new popup();
        const result = await new Promise(resolve => {
            resetPopup.openDialog({
                title: 'Reiniciar configuración',
                content: '¿Estás seguro de que quieres reiniciar toda la configuración del launcher? Esta acción no puede deshacerse y el launcher se reiniciará.<br><br>Los archivos del juego (assets, bibliotecas, instancias) no se eliminarán.',
                options: true,
                callback: resolve
            });
        });

        if (result === 'cancel') {
            return;
        }
        
        try {
            const processingPopup = new popup();
            processingPopup.openPopup({
                title: 'Reiniciando configuración',
                content: 'Por favor, espera mientras se reinicia la configuración...',
                color: 'var(--color)'
            });
            
            await this.db.deleteData('configClient');
            await this.db.deleteData('accounts');
        
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            processingPopup.closePopup();
            console.log('Reiniciando launcher...');
            ipcRenderer.send('app-restart');
            
        } catch (error) {
            console.error('Error resetting config:', error);
            const errorPopup = new popup();
            errorPopup.openPopup({
                title: 'Error',
                content: `Ha ocurrido un error al reiniciar la configuración: ${error.message}`,
                color: 'red',
                options: true
            });
        }
    }

    async handleDeleteAll() {
        const deletePopup = new popup();
        const result = await new Promise(resolve => {
            deletePopup.openDialog({
                title: 'Eliminar todos los datos',
                content: '⚠️ ADVERTENCIA ⚠️<br><br>¿Estás seguro de que quieres eliminar TODOS los datos del launcher? Esta acción eliminará:<br>- Todas las configuraciones<br>- Todas las instancias de juego<br>- Todos los assets y bibliotecas descargados<br><br>Esta acción no puede deshacerse y el launcher se reiniciará.',
                options: true,
                callback: resolve
            });
        });

        if (result === 'cancel') {
            return;
        }
        
        const confirmDeletePopup = new popup();
        const confirmResult = await new Promise(resolve => {
            confirmDeletePopup.openDialog({
                title: 'Confirmar eliminación total',
                content: '¿Estás ABSOLUTAMENTE seguro? Esta acción eliminará todos los datos y no podrás recuperarlos.',
                options: true,
                callback: resolve
            });
        });

        if (confirmResult === 'cancel') {
            return;
        }
        
        try {
            const processingPopup = new popup();
            processingPopup.openPopup({
                title: 'Eliminando datos',
                content: 'Por favor, espera mientras se eliminan todos los datos...',
                color: 'var(--color)'
            });
            
            const appdataPath = await appdata();
            const dataPath = path.join(
                appdataPath,
                process.platform == 'darwin' ? this.config.dataDirectory : `.${this.config.dataDirectory}`
            );
            
            if (fs.existsSync(dataPath)) {
                await this.recursiveDelete(dataPath);
                console.log('Data directory deleted successfully');
            }

            await this.db.deleteData('configClient');
            await this.db.deleteData('accounts');
            
            // Wait a moment before restarting
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Restart the launcher
            processingPopup.closePopup();
            ipcRenderer.send('app-restart');
            
        } catch (error) {
            console.error('Error deleting all data:', error);
            const errorPopup = new popup();
            errorPopup.openPopup({
                title: 'Error',
                content: `Ha ocurrido un error al eliminar los datos: ${error.message}`,
                color: 'red',
                options: true
            });
        }
    }

    async recursiveDelete(directoryPath) {
        return new Promise((resolve, reject) => {
            if (typeof fs.rm === 'function') {
                fs.rm(directoryPath, { recursive: true, force: true }, err => {
                    if (err) reject(err);
                    else resolve();
                });
            } 
            else {
                fs.rmdir(directoryPath, { recursive: true }, err => {
                    if (err) reject(err);
                    else resolve();
                });
            }
        });
    }

    async socials() {
        document.querySelectorAll('.external').forEach(link => {
            link.addEventListener('click', (event) => {
                event.preventDefault();
                const url = link.getAttribute('href');
                shell.openExternal(url);
            });
        });
    }

    async terms() {
/*         try { */
            const result = await getTermsAndConditions();
        
            const termsContainer = document.querySelector('.info-container');
            const lastModifiedText = `<strong>Última modificación:</strong> ${result.lastModified === 'desconocida' ? 'Desconocida' : new Date(result.lastModified).toLocaleString()}`;
        
            const metaInfoHTML = `
                <p>${lastModifiedText}</p>
                <hr />
            `;
        
            termsContainer.innerHTML = metaInfoHTML + result.htmlContent;
            termsContainer.querySelectorAll('a').forEach(link => {
                link.addEventListener('click', (event) => {
                    event.preventDefault();
                    const url = event.target.href;
                    shell.openExternal(url);
                });
            });
/*         } catch (error) {
            console.error('Error al inicializar los términos y condiciones:', error);
            const termsContainer = document.querySelector('.info-container');
            termsContainer.innerHTML = '<p>Ha ocurrido un error al cargar los términos y condiciones.</p>';
        } */
    }
    

}
export default Settings;