/**
 * @author Luuxis
 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0
 */

const pkg = require('../package.json');
const nodeFetch = require("node-fetch");
const { machineIdSync } = require("node-machine-id");
const convert = require('xml-js');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const hwid = machineIdSync();
import { getConfig, getLauncherKey } from '../MKLib.js';

let url = pkg.user ? `${pkg.url}/${pkg.user}` : pkg.url
let key;

let news = `${url}/launcher/news-launcher/news.json`;

// Función local getLauncherKey para compatibilidad hacia atrás con getInstanceList
async function getLocalLauncherKey() {
    if (!key) {
      const files = [
        path.join(__dirname, '../package.json'),
        ...fs.readdirSync(__dirname).filter(file => file.endsWith('.js')).map(file => path.join(__dirname, file))
      ];
  
      const hash = crypto.createHash('sha256');
      for (const file of files) {
        const data = fs.readFileSync(file);
        hash.update(data);
      }
      key = hash.digest('hex');
    }
    return key;
  };

let Launcherkey = await getLocalLauncherKey();

class Config {
    GetConfig() {
        // Use the new protected function from MKLib.js
        return getConfig();
    }

    async getInstanceList() {
        try {
            let urlInstance = `${url}/files?checksum=${Launcherkey}&id=${hwid}`;
            let response = await nodeFetch(urlInstance, {
                headers: {
                    'User-Agent': 'MiguelkiNetworkMCLauncher'
                }
            }
            );
            
            // Check if the response is OK
            if (!response.ok) {
                console.error(`Server returned status: ${response.status} ${response.statusText}`);
                return [];
            }
            
            // Verificar que la respuesta tiene contenido antes de parsear
            const responseText = await response.text();
            if (!responseText || responseText.trim() === '') {
                console.error('Empty response received from server');
                return [];
            }
            
            let instances;
            try {
                instances = JSON.parse(responseText);
            } catch (jsonError) {
                console.error('Error parsing JSON response:', jsonError.message);
                console.error('Response text:', responseText.substring(0, 200));
                return [];
            }
            
            if (!instances || typeof instances !== 'object') {
                console.error("Invalid instance data received:", instances);
                return [];
            }
            
            let instancesList = [];
            instances = Object.entries(instances);

            for (let [name, data] of instances) {
                if (data) {
                    let instance = data;
                    instance.name = name;
                    instancesList.push(instance);
                }
            }
            return instancesList;
        } catch (err) {
            console.error("Error fetching instance list:", err);
            return [];
        }
    }

    async getNews() {
        let config = await this.GetConfig() || {}

        if (config.rss) {
            return new Promise((resolve, reject) => {
                nodeFetch(config.rss).then(async config => {
                    if (config.status === 200) {
                        let news = [];
                        let response = await config.text()
                        response = (JSON.parse(convert.xml2json(response, { compact: true })))?.rss?.channel?.item;

                        if (!Array.isArray(response)) response = [response];
                        for (let item of response) {
                            news.push({
                                title: item.title._text,
                                content: item['content:encoded']._text,
                                author: item['dc:creator']._text,
                                publish_date: item.pubDate._text
                            })
                        }
                        return resolve(news);
                    }
                    else return reject({ error: { code: config.statusText, message: 'server not accessible' } });
                }).catch(error => reject({ error }))
            })
        } else {
            return new Promise((resolve, reject) => {
                nodeFetch(news).then(async config => {
                    if (config.status === 200) {
                        try {
                            const responseText = await config.text();
                            if (!responseText || responseText.trim() === '') {
                                return reject({ error: { code: 'EMPTY_RESPONSE', message: 'Empty response from server' } });
                            }
                            const jsonData = JSON.parse(responseText);
                            return resolve(jsonData);
                        } catch (jsonError) {
                            return reject({ error: { code: 'JSON_PARSE_ERROR', message: jsonError.message } });
                        }
                    }
                    else return reject({ error: { code: config.statusText, message: 'server not accessible' } });
                }).catch(error => {
                    return reject({ error });
                })
            })
        }
    }
}

export default new Config;