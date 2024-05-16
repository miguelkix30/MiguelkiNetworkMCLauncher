import { config, database, logger, changePanel, setInstanceBackground, pkg, popup } from '../utils.js'
const { ipcRenderer } = require('electron');


class Mods {
    static id = "mods";
    async init(config) {
        this.config = config;
        this.db = new database();
        const dropdown = document.querySelector('.dropdown-instance-select-content');
        const modsPanel = document.querySelector('.mods-panel .mods-list');


        const instances = await this.getInstancesWithOptionalMods();
        


        instances.forEach(instance => {
            const dropdownItem = document.createElement('a');
            dropdownItem.textContent = instance.name;
            dropdownItem.addEventListener('click', () => {
                this.selectInstance(instance, modsPanel);
                dropdown.style.maxHeight = null;
            });
            dropdown.appendChild(dropdownItem);
        });

        const dropdownButton = document.querySelector('.dropdown-instance-select button');
        const dropdownSpan = dropdownButton.querySelector('span');
        dropdownSpan.textContent = '\u25BC';

        document.querySelector('.back-btn').addEventListener('click', e => changePanel('home'))
        dropdownButton.addEventListener('click', function() {

            var content = this.nextElementSibling;
            if (content.style.maxHeight){
                content.style.maxHeight = null;
                dropdownSpan.style.transform = 'rotate(0deg)';
            } else {
                content.style.maxHeight = content.scrollHeight + "px";
                dropdownSpan.style.transform = 'rotate(180deg)';
            } 
        });
        
    }

    async getInstancesWithOptionalMods() {
        const instances = await config.getInstanceList()
        let configClient = await this.db.readData('configClient')
        let auth = await this.db.readData('accounts', configClient.account_selected);

        const filteredInstances = instances.filter(instance => {
            if (instance.whitelistActive) {
                // Si whitelistActive es verdadero, verifica si el usuario está en la lista blanca
                return instance.whitelist.includes(auth?.name);
            } else {
                // Si whitelistActive es falso, incluye la instancia
                return true;
            }
        });
    
        return filteredInstances;
    }

    async selectInstance(instance, modsPanel) {
        modsPanel.innerHTML = '';
        let configClient = await this.db.readData('configClient')
    
        if (instance.optionalMods && instance.optionalMods.length > 0) {
            instance.optionalMods.forEach(async mod => {
                const modItem = document.createElement('div');
                modItem.className = 'mod-item'; 
    
                const modName = document.createElement('span'); // Crea un nuevo elemento span para el nombre del mod
                modName.textContent = mod;
                modItem.appendChild(modName); // Agrega el nombre del mod al span, no al div
    
                const modSwitch = document.createElement('input');
                modSwitch.type = 'checkbox';
                modSwitch.className = 'checkbox';
    
                const modId = `${instance.name}-${mod}`;
                modSwitch.id = modId;
    
                const modSwitchStyled = document.createElement('label');
                modSwitchStyled.htmlFor = modId;
                modSwitchStyled.className = 'switch';
    
                if (configClient && configClient.mods_enabled && configClient.mods_enabled.includes(modId)) {
                    modSwitch.checked = true;
                } else {
                    modSwitch.checked = false;
                }
    
                modItem.appendChild(modSwitch);

                modSwitch.addEventListener('change', async () => {
                    console.log("Mods activos antes del cambio: ", configClient.mods_enabled);
                    if (modSwitch.checked) {
                        if (!configClient.mods_enabled.includes(modId)) {
                            configClient.mods_enabled.push(modId);
                        }
                    } else {
                        const index = configClient.mods_enabled.indexOf(modId);
                        if (index > -1) {
                            configClient.mods_enabled.splice(index, 1);
                        }
                    }
    
                    const updatedConfigClient = { ...configClient, mods_enabled: configClient.mods_enabled };
                    await this.db.updateData('configClient', configClient);
    
                    configClient = await this.db.readData('configClient');
                });

                modItem.appendChild(modSwitchStyled);
    
                modsPanel.appendChild(modItem);
            });
        } else {
            modsPanel.textContent = 'No optional mods for this instance.';
        }
    }
}
export default Mods;