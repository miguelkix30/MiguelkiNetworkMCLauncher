/**
 * @author Luuxis
 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0
 */
// import panel
import Login from "./panels/login.js";
import Home from "./panels/home.js";
import Settings from "./panels/settings.js";
import Mods from "./panels/mods.js";
import Logger2 from "./loggerprod.js";

// import modules
import {
  logger,
  config,
  changePanel,
  database,
  popup,
  setBackground,
  setVideoSource,
  accountSelect,
  addAccount,
  pkg,
  setUsername,
  getUsername,
  clickableHead,
  setDiscordUsername,
  getDiscordUsername,
  setDiscordPFP,
  showTermsAndConditions
} from "./utils.js";
import {
  sendDiscordMessage,
  sendLogoutDiscordMessage,
  sendVerificationErrorMessage
} from "./HWIDSystem.js";
const { AZauth, Microsoft, Mojang } = require("minecraft-java-core");

// libs
const { ipcRenderer } = require("electron");
const fs = require("fs");
const path = require("path");
let dev = process.env.NODE_ENV === "dev";
let name = await getUsername();
let dname = await getDiscordUsername();

class Launcher {
  async init() {
    if (dev) this.initLog();
    else this.initWindow();

    console.log("Iniciando Launcher...");
    await setVideoSource();
    this.shortcut();
    await setBackground();
    if (process.platform == "win32") this.initFrame();
    this.config = await config
      .GetConfig()
      .then((res) => res)
      .catch((err) => err);
    if (await this.config.error) return this.errorConnect();
    this.db = new database();
    await this.initConfigClient();
    this.createPanels(Login, Home, Settings, Mods);
    let res = await config.GetConfig();
    if (res.discordVerification) {
      await this.verifyDiscordAccount();
    } else if (res.termsDialog) {
      await showTermsAndConditions();
      await this.startLauncher();
     } else {
      await this.startLauncher();
    }
  }

  initWindow() {
    window.logger2 = {
      launcher: new Logger2("Launcher", "#FF7F18"),
      minecraft: new Logger2("Minecraft", "#43B581"),
    };

    this.initLogs();

    window.console = window.logger2.launcher;

    window.onerror = (message, source, lineno, colno, error) => {
      console.error(error);
      source = source.replace(`${window.location.origin}/app/`, "");
      let stack = error.stack
        .replace(
          new RegExp(
            `${window.location.origin}/app/`.replace(/\//g, "\\/"),
            "g"
          ),
          ""
        )
        .replace(/\n/g, "<br>")
        .replace(/\x20/g, "&nbsp;");
      popup.showPopup(
        "Une erreur est survenue",
        `
            <b>Erreur:</b> ${error.message}<br>
            <b>Fichier:</b> ${source}:${lineno}:${colno}<br>
            <b>Stacktrace:</b> ${stack}`,
        "warning",
        {
          value: "Relancer",
          func: () => {
            document.body.classList.add("hide");
            win.reload();
          },
        }
      );
      document.body.classList.remove("hide");
      return true;
    };

    window.onclose = () => {
      localStorage.removeItem("distribution");
    };
  }

  initLog() {
    document.addEventListener("keydown", (e) => {
      if ((e.ctrlKey && e.shiftKey && e.keyCode == 73) || e.keyCode == 123) {
        ipcRenderer.send("main-window-dev-tools-close");
        ipcRenderer.send("main-window-dev-tools");
      }
      if (e.keyCode == 119) {
        const db = new database();
        let configClient = db.readData("configClient");
        configClient.discord_token = null;
        this.db.updateData("configClient", configClient);
      }
    });
    new logger(pkg.name, "#7289da");
  }

  shortcut() {
    document.addEventListener("keydown", async (e) => {
      if (e.ctrlKey && e.keyCode == 87) {
          sendLogoutDiscordMessage();
      }
    });
    window.addEventListener("keydown", async (e) => {
      const { key, altKey } = e;
      if (key === "F4" && altKey) {
        e.preventDefault();
          sendLogoutDiscordMessage();
      }
    });
  }

  errorConnect() {
    new popup().openPopup({
      title: this.config.error.code,
      content: this.config.error.message,
      color: "red",
      exit: true,
      options: true,
    });
  }

  initFrame() {
    console.log("Iniciando Interfaz...");
    document.querySelector(".frame").classList.toggle("hide");
    document.querySelector(".dragbar").classList.toggle("hide");

    document.querySelector("#minimize").addEventListener("click", () => {
      ipcRenderer.send("main-window-minimize");
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

    document.querySelector("#close").addEventListener("click", async () => {
        sendLogoutDiscordMessage();
      /* ipcRenderer.send('main-window-close'); */
    });
  }

  async initConfigClient() {
    console.log("Inicializando Config Client...");
    let configClient = await this.db.readData("configClient");

    if (!configClient) {
      await this.db.createData("configClient", {
        account_selected: null,
        instance_selct: null,
        mods_enabled: [],
        terms_accepted: false,
        discord_token: null,
        java_config: {
          java_path: null,
          java_memory: {
            min: 2,
            max: 4,
          },
        },
        game_config: {
          screen_size: {
            width: 854,
            height: 480,
          },
        },
        launcher_config: {
          download_multi: 5,
          theme: "auto",
          closeLauncher: "close-launcher",
          intelEnabledMac: true,
        },
      });
    }
/*     if (!configClient.mods_enabled) {
      configClient.mods_enabled = [];
      await this.db.updateData("configClient", configClient);
    }
    if (!configClient.discord_token) {
      configClient.discord_token = null;
      await this.db.updateData("configClient", configClient);
    } */
  }

  createPanels(...panels) {
    let panelsElem = document.querySelector(".panels");
    for (let panel of panels) {
      console.log(`Iniciando panel ${panel.name}...`);
      let div = document.createElement("div");
      div.classList.add("panel", panel.id);
      div.innerHTML = fs.readFileSync(
        `${__dirname}/panels/${panel.id}.html`,
        "utf8"
      );
      panelsElem.appendChild(div);
      new panel().init(this.config);
    }
  }

  async verifyDiscordAccount() {
    let configClient = await this.db.readData("configClient");
    let token;
    let isMember;
    let isTokenValid;

    try {
      console.log("Verificando token de discord...");
      isTokenValid = await this.checkTokenValidity();
    } catch (error) {
      let discorderrdialog = new popup();

      let dialogResult = await new Promise((resolve) => {
        discorderrdialog.openDialog({
          title: "Error de autenticación",
          content:
            "No se ha podido verificar la sesión de Discord. <br><br>Quieres volver a intentarlo?",
          options: true,
          callback: resolve,
        });
      });

      if (dialogResult === "cancel") {
        configClient.discord_token = null;
        await this.db.updateData("configClient", configClient);
        await this.verifyDiscordAccount();
        return;
      } else {
        await this.verifyDiscordAccount();
        return;
      }
    }

    if (!isTokenValid) {
      let discorderrdialog = new popup();
      console.error("Token de discord no válido");
      let dialogResult = await new Promise((resolve) => {
        discorderrdialog.openDialog({
          title: "Verificación de Discord",
          content:
            "Para poder acceder al launcher debes iniciar sesión con tu cuenta de Discord y estar en el servidor de Miguelki Network. <br><br>Quieres iniciar sesión ahora?",
          options: true,
          callback: resolve,
        });
      });

      if (dialogResult === "cancel") {
        sendLogoutDiscordMessage();
      } else {
        let retry = true;

        while (retry) {
          let connectingPopup = new popup();
          try {
            connectingPopup.openPopup({
              title: 'Verificación de Discord',
              content: 'Esperando a la autorización...',
              color: 'var(--color)'
          });
            token = await ipcRenderer.invoke("open-discord-auth");
            connectingPopup.closePopup();
            retry = false;
          } catch (error) {
            connectingPopup.closePopup();
            console.error("Error al obtener el token de Discord");
            let discorderrdialog = new popup();

            let dialogResult = await new Promise((resolve) => {
              discorderrdialog.openDialog({
                title: "Error al verificar la cuenta de Discord",
                content:
                  "No se ha podido verificar la cuenta de Discord. <br><br>Quieres intentarlo de nuevo?",
                options: true,
                callback: resolve,
              });
            });

            if (dialogResult === "cancel") {
              sendLogoutDiscordMessage();
              retry = false;
            }
          }
        }

        if (token) {
          configClient.discord_token = token;
          await this.db.updateData("configClient", configClient);
        }
      }
    } else {
      token = configClient.discord_token;
    }
    let verifypopup = new popup();
    verifypopup.openPopup({
      title: "Verificando cuenta de Discord...",
      content: "Por favor, espera un momento...",
      color: "var(--color)",
      background: false,
    });
    isMember = (await this.isUserInGuild(token, pkg.discord_server_id))
      .isInGuild;
      verifypopup.closePopup();
    if (!isMember) {
      let discorderrdialog = new popup();

      let dialogResult = await new Promise((resolve) => {
        discorderrdialog.openDialog({
          title: "Error al verificar la cuenta de Discord",
          content:
            "No se ha detectado que seas miembro del servidor de Discord. Para poder utilizar el launcher debes ser miembro del servidor. <br><br>Quieres unirte ahora? Se abrirá una ventana en tu navegador.",
          options: true,
          callback: resolve,
        });
      });

      if (dialogResult === "cancel") {
        configClient.discord_token = null;
        await this.db.updateData("configClient", configClient);
        await this.verifyDiscordAccount();
        return;
      } else {
        ipcRenderer.send("open-discord-url");
        configClient.discord_token = null;
        await this.db.updateData("configClient", configClient);
        await this.verifyDiscordAccount();
        return;
      }
    } else {
      await this.startLauncher();
    }
  }

  async checkTokenValidity() {
    let configClient = await this.db.readData("configClient");
    let token = configClient.discord_token;
    if (!token || token == "" || token == null) return false;
    try {
      const response = await fetch("https://discord.com/api/users/@me", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        return true;
      } else {
        return false;
      }
    } catch (error) {
      return false;
    }
  }

  async isUserInGuild(accessToken, guildId) {
    let username;
    let userpfp;
    try {
      const response = await fetch("https://discord.com/api/users/@me/guilds", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch guilds");
      }
      const userResponse = await fetch("https://discord.com/api/users/@me", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      username = "Desconocido";
      userpfp = "https://cdn.discordapp.com/embed/avatars/0.png?size=1024";
      if (!userResponse.ok) {
        throw new Error("Failed to fetch user info");
      } else {
        const user = await userResponse.json();
        username = user.username;
        userpfp = `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}?size=1024`;
      }
      setDiscordPFP(userpfp);
      setDiscordUsername(username);

      const guilds = await response.json();

      const isInGuild = guilds.some((guild) => guild.id === guildId);
      if (!isInGuild) {
        sendVerificationErrorMessage(username);
      }
      return { isInGuild };
    } catch (error) {
      await sendVerificationErrorMessage(username);
      console.error("Error al verificar la pertenencia al servidor:", error);
      return { isInGuild: false, error: error.message };
    }
  }

  async startLauncher() {
    let accounts = await this.db.readAllData("accounts");
    let configClient = await this.db.readData("configClient");
    let account_selected = configClient ? configClient.account_selected : null;
    let popupRefresh = new popup();

    if (accounts?.length) {
      for (let account of accounts) {
        let account_ID = account.ID;
        if (account.error) {
          await this.db.deleteData("accounts", account_ID);
          continue;
        }
        if (account.meta.type === "Xbox") {
          console.log(
            `Plataforma: ${account.meta.type} | Usuario: ${account.name}`
          );
          popupRefresh.openPopup({
            title: "Conectando...",
            content: `Plataforma: ${account.meta.type} | Usuario: ${account.name}`,
            color: "var(--color)",
            background: false,
          });

          let refresh_accounts = await new Microsoft(
            this.config.client_id
          ).refresh(account);

          if (refresh_accounts.error) {
            await this.db.deleteData("accounts", account_ID);
            if (account_ID == account_selected) {
              configClient.account_selected = null;
              await this.db.updateData("configClient", configClient);
            }
            console.error(
              `[Account] ${account.name}: ${refresh_accounts.errorMessage}`
            );
            continue;
          }

          refresh_accounts.ID = account_ID;
          await this.db.updateData("accounts", refresh_accounts, account_ID);
          await addAccount(refresh_accounts);
          if (account_ID == account_selected) {
            accountSelect(refresh_accounts);
            clickableHead(false);
              await setUsername(account.name);
              await sendDiscordMessage();
          }
        } else if (account.meta.type == "AZauth") {
          console.log(
            `Plataforma: MKNetworkID | Usuario: ${account.name}`
          );
          popupRefresh.openPopup({
            title: "Conectando...",
            content: `Plataforma: MKNetworkID | Usuario: ${account.name}`,
            color: "var(--color)",
            background: false,
          });
          if (typeof this.config.online !== "string") {
            console.error(`Invalid URL: ${this.config.online}`);
            this.db.deleteData("accounts", account_ID);
            if (account_ID == account_selected) {
              configClient.account_selected = null;
              this.db.updateData("configClient", configClient);
            }
            console.error(`[Account] ${account.name}`);
            continue;
          }

          if (
            !this.config.online.startsWith("http://") &&
            !this.config.online.startsWith("https://")
          ) {
            console.error(`Invalid URL: ${this.config.online}`);
            this.db.deleteData("accounts", account_ID);
            if (account_ID == account_selected) {
              configClient.account_selected = null;
              this.db.updateData("configClient", configClient);
            }
            console.error(`[Account] ${account.name}`);
            continue;
          }

          let refresh_accounts = await new AZauth(this.config.online).verify(
            account
          );

          if (refresh_accounts.error) {
            this.db.deleteData("accounts", account_ID);
            if (account_ID == account_selected) {
              configClient.account_selected = null;
              this.db.updateData("configClient", configClient);
            }
            console.error(
              `[Account] ${account.name}: ${refresh_accounts.message}`
            );
            continue;
          }

          refresh_accounts.ID = account_ID;
          this.db.updateData("accounts", refresh_accounts, account_ID);
          await addAccount(refresh_accounts);
          if (account_ID == account_selected) {
            accountSelect(refresh_accounts);
            clickableHead(true);
              await setUsername(account.name);
              await sendDiscordMessage();
          }
        } else if (account.meta.type == "Mojang") {
          console.log(
            `Plataforma: ${account.meta.type} | Usuario: ${account.name}`
          );
          popupRefresh.openPopup({
            title: "Connectando...",
            content: `Plataforma: ${account.meta.type} | Usuario: ${account.name}`,
            color: "var(--color)",
            background: false,
          });
          if (account.meta.online == false) {
            let refresh_accounts = await Mojang.login(account.name);

            refresh_accounts.ID = account_ID;
            await addAccount(refresh_accounts);
            this.db.updateData("accounts", refresh_accounts, account_ID);
            if (account_ID == account_selected) {
              accountSelect(refresh_accounts);
              clickableHead(false);
              await setUsername(account.name);
              await sendDiscordMessage();
            }
            continue;
          }

          let refresh_accounts = await Mojang.refresh(account);

          if (refresh_accounts.error) {
            this.db.deleteData("accounts", account_ID);
            if (account_ID == account_selected) {
              configClient.account_selected = null;
              this.db.updateData("configClient", configClient);
            }
            console.error(
              `[Account] ${account.name}: ${refresh_accounts.errorMessage}`
            );
            continue;
          }

          refresh_accounts.ID = account_ID;
          this.db.updateData("accounts", refresh_accounts, account_ID);
          await addAccount(refresh_accounts);
          if (account_ID == account_selected) accountSelect(refresh_accounts);
        } else {
          console.error(`[Account] ${account.name}: No se ha encontrado la plataforma de la cuenta.`);
          this.db.deleteData("accounts", account_ID);
          if (account_ID == account_selected) {
            configClient.account_selected = null;
            this.db.updateData("configClient", configClient);
          }
        }
      }

      accounts = await this.db.readAllData("accounts");
      configClient = await this.db.readData("configClient");
      account_selected = configClient ? configClient.account_selected : null;

      if (!account_selected) {
        let uuid = accounts[0].ID;
        if (uuid) {
          configClient.account_selected = uuid;
          await this.db.updateData("configClient", configClient);
          accountSelect(uuid);
        }
      }

      if (!accounts.length) {
        config.account_selected = null;
        await this.db.updateData("configClient", config);
        popupRefresh.closePopup();
        return changePanel("login");
      }

      popupRefresh.closePopup();
      changePanel("home");
    } else {
      popupRefresh.closePopup();
      changePanel("login");
    }
  }

  initLogs() {
    let logs = document.querySelector(".log-bg");

let block = false;
document.addEventListener("keydown", (e) => {
  if (
    ((e.ctrlKey && e.shiftKey && e.keyCode == 73) ||
      event.keyCode == 123) &&
    !block
  ) {
    logs.classList.toggle("show");
    block = true;
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === 'Escape' && logs.classList.contains('show')) {
    logs.classList.toggle("show");
  }
});

document.addEventListener("keyup", (e) => {
  if ((e.ctrlKey && e.shiftKey && e.keyCode == 73) || event.keyCode == 123)
    block = false;
});

let close = document.querySelector(".log-close");

close.addEventListener("click", () => {
  logs.classList.toggle("show");
});

/* launcher logs */

let launcher = document.querySelector("#launcher.logger");

launcher.querySelector(".header").addEventListener("click", () => {
  launcher.classList.toggle("open");
});

    let lcontent = launcher.querySelector(".content");

    logger2.launcher.on("info", (...args) => {
      addLog(lcontent, "info", args);
    });

    logger2.launcher.on("warn", (...args) => {
      addLog(lcontent, "warn", args);
    });

    logger2.launcher.on("debug", (...args) => {
      addLog(lcontent, "debug", args);
    });

    logger2.launcher.on("error", (...args) => {
      addLog(lcontent, "error", args);
    });

    /* minecraft logs */

    let minecraft = document.querySelector("#minecraft.logger");

    minecraft.querySelector(".header").addEventListener("click", () => {
      minecraft.classList.toggle("open");
    });

    let mcontent = minecraft.querySelector(".content");

    logger2.minecraft.on("info", (...args) => {
      addLog(mcontent, "info", args);
    });

    logger2.minecraft.on("warn", (...args) => {
      addLog(mcontent, "warn", args);
    });

    logger2.minecraft.on("debug", (...args) => {
      addLog(mcontent, "debug", args);
    });

    logger2.minecraft.on("error", (...args) => {
      addLog(mcontent, "error", args);
    });

    /* add log */

    function addLog(content, type, args) {
      let final = [];
      for (let arg of args) {
        if (typeof arg == "string") {
          final.push(arg);
        } else if (arg instanceof Error) {
          final.push(stack);
        } else if (typeof arg == "object") {
          final.push(JSON.stringify(arg));
        } else {
          final.push(arg);
        }
      }
      let span = document.createElement("span");
      span.classList.add(type);
      span.innerHTML = `${final.join(" ")}<br>`
        .replace(/\x20/g, "&nbsp;")
        .replace(/\n/g, "<br>");

      content.appendChild(span);
    }
  }
}

new Launcher().init();
