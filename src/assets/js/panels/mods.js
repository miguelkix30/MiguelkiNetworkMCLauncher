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
                document.querySelector('.dropdown-instance-select button a').innerHTML = instance.name;
                dropdown.style.maxHeight = null;
            });
            dropdown.appendChild(dropdownItem);
        });

        const dropdownButton = document.querySelector('.dropdown-instance-select button');
        const dropdownSpan = dropdownButton.querySelector('span');
        dropdownSpan.textContent = '\u25BC';

        document.querySelector('.back-btn').addEventListener('click', e => {
            document.querySelector('.mods-list').innerHTML = '';
            document.querySelector('.dropdown-instance-select button a').innerHTML = 'Seleccionar cliente...';
            changePanel('home')
        })
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
    
                const modImg = document.createElement('img'); // Crea un nuevo elemento img para la imagen del mod
                modImg.src = mod.img; // Establece el atributo 'src' de la imagen en 'mod.img'
                modItem.appendChild(modImg); // Agrega la imagen del mod al div
    
                const modName = document.createElement('span'); // Crea un nuevo elemento span para el nombre del mod
                modName.textContent = mod.name; // Accede a la propiedad 'name' del mod
                modItem.appendChild(modName); // Agrega el nombre del mod al div
    
                const modSwitch = document.createElement('input');
                modSwitch.type = 'checkbox';
                modSwitch.className = 'checkbox';
    
                const modId = `${instance.name}-${mod.name}`;
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
                    if (!configClient.mods_enabled) {
                        configClient.mods_enabled = [];
                    }
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
    
                    await this.db.updateData('configClient', configClient);
    
                    configClient = await this.db.readData('configClient');
                });

                modItem.appendChild(modSwitchStyled);
    
                modsPanel.appendChild(modItem);
            });
        } else {
            modsPanel.textContent = 'No hay mods opcionales disponibles para este cliente.';
        }
    }
}
export default Mods;