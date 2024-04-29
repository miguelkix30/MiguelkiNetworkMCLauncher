const pkg = require('../package.json');
const { machineIdSync } = require('node-machine-id');
const fetch = require('node-fetch');
const { Webhook, MessageBuilder } = require('discord-webhook-node');
let url = pkg.user ? `${pkg.url}/${pkg.user}` : pkg.url;

let hwidList = [];
const webhook = new Webhook('https://discord.com/api/webhooks/1234566620328755250/VZSU5Yxon9v9SjchD6kXzvDcTodjRkP7O-SUmXbfwq0w9JIxTmwwELRDeNjXlsWVVHUO');

async function getHWID() {
    return machineIdSync();
}

async function checkHWID(hwid) {
    const hwidList = await fetchHWIDList();
    return hwidList.includes(hwid);
}

async function fetchHWIDList() {
    try {
        const response = await fetch(`${url}/launcher/config-launcher/bans.json`);
        hwidList = await response.json();
    } catch (error) {
        console.error(error);
        hwidList = []; // Ensure hwidList is always an array
    }
    return hwidList; // Return the hwidList
}

async function sendDiscordMessage(username, hwid) {
    const ban = await checkHWID(hwid);
    const embed = new MessageBuilder()
    .setTitle('HWID Login')
    .setDescription('Un usuario ha iniciado sesión en el lanzador.')
    .addField('Usuario:', username, true)
    .addField('HWID:', hwid, true)
    .addField('Estado del dispositivo:', ban ? 'Baneado' : 'No baneado', true)
    .setColor(ban ? '#FF0000' : '#00FF00')
    .setFooter('Miguelki Network MC Launcher')
    .setTimestamp();
    webhook.send(embed);
}

export {
    getHWID as getHWID,
    checkHWID as checkHWID,
    fetchHWIDList as fetchHWIDList,
    sendDiscordMessage as sendDiscordMessage
}