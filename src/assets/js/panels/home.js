/**
 * @author Luuxis
 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0
 */
import {
	config,
	database,
	changePanel,
	appdata,
	setStatus,
	setInstanceBackground,
	pkg,
	popup,
	clickHead,
	getClickeableHead,
	toggleModsForInstance,
	discordAccount,
	toggleMusic,
	fadeOutAudio,
	setBackgroundMusic,
	getUsername,
	isPerformanceModeEnabled,
	removeUserFromQueue,
	captureAndSetVideoFrame,
	getExecutionKey,
} from "../utils.js";
import {
	getHWID,
	checkHWID,
	getFetchError,
	playMSG,
	playquitMSG,
	addInstanceMSG,
	installMKLibMods,
	hideFolder,
	killMinecraftProcess,
} from "../MKLib.js";
import cleanupManager from "../utils/cleanup-manager.js";
import { downloadAssets } from "../utils/instance-manager.js";

const clientId = pkg.discord_client_id;
const DiscordRPC = require("discord-rpc");
const RPC = new DiscordRPC.Client({ transport: "ipc" });
const fs = require("fs");
const path = require("path");
const startingTime = Date.now();
let dev = process.env.NODE_ENV === "dev";
let rpcActive = true;
let LogBan = false;
let playing = false;
let username;
let discordUrl = pkg.discord_url;
DiscordRPC.register(clientId);

async function setActivity() {
	if (!RPC) return;
}
RPC.on("ready", async () => {
	setActivity();
	username = await getUsername();
	RPC.setActivity({
		state: `En el launcher`,
		startTimestamp: startingTime,
		largeImageKey: "icon",
		largeImageText: pkg.preductname,
		instance: true,
	}).catch((err) => {
		console.error("Error al establecer la actividad de Discord:", err);
	});
	setInterval(() => {
		setActivity();
	}, 1000);
});
RPC.login({ clientId }).catch((err) => {
	console.error(
		"Servidor de Discord no detectado. Tranquilo, esto no es una crisis."
	);
	rpcActive = false;
});

const { Launch } = require("minecraft-java-core");
const { Client } = require("minecraft-launcher-core");
const { shell, ipcRenderer } = require("electron");
class Home {
	static id = "home";
	intervalId = null;

	async init(config) {
		this.config = config;
		this.db = new database();

		await cleanupManager.initialize();

		this.news();
		this.showstore();
		this.notification();
		this.startNotificationCheck();
		this.socialLick();
		this.instancesSelect();
		this.startButtonManager();
		await this.loadRecentInstances();
		document
			.querySelector(".action-button:nth-child(3)")
			.addEventListener(
				"click",
				(e) => discordAccount() && changePanel("settings")
			);
		document
			.querySelector(".player-options")
			.addEventListener("click", (e) => changePanel("skins"));
		this.addInstanceButton();
		this.addPlayerTooltip();
		this.addInterfaceTooltips();
		this.initializeCloseGameButton();
	}

	async showstore() {
		let storebutton = document.querySelector(".storebutton");
		let res = await config.GetConfig();
		if (res.store_enabled) {
			try {
				const response = await fetch(pkg.store_url).catch((err) =>
					console.error(
						"Parece que la tienda no se encuentra online. Ocultando sección de tienda."
					)
				);
				if (response.ok) {
					document.querySelector(".news-blockshop").style.display = "block";
				} else {
					console.error(
						"Parece que la tienda no se encuentra online. Ocultando sección de tienda..."
					);
					document.querySelector(".news-blockshop").style.display = "none";
				}
			} catch (error) {
				console.error(
					"Parece que la tienda no se encuentra online. Ocultando sección de tienda..."
				);
				document.querySelector(".news-blockshop").style.display = "none";
			}
			storebutton.addEventListener("click", (e) => {
				ipcRenderer.send("create-store-window");
			});
		} else {
			document.querySelector(".news-blockshop").style.display = "none";
			console.log(
				"La tienda se encuentra desactivada. Ocultando sección de tienda..."
			);
		}
	}

	async notification() {
		let res = await config.GetConfig();
		let hwid = await getHWID();
		let check = await checkHWID(hwid);
		let fetchError = await getFetchError();

		let notification = document.querySelector(".message-container");
		let notificationIcon = document.querySelector(".message-icon");
		let notificationTitle = document.querySelector(".message-title");
		let notificationContent = document.querySelector(".message-content");

		let colorRed = getComputedStyle(document.documentElement).getPropertyValue(
			"--notification-red"
		);
		let colorGreen = getComputedStyle(
			document.documentElement
		).getPropertyValue("--notification-green");
		let colorBlue = getComputedStyle(document.documentElement).getPropertyValue(
			"--notification-blue"
		);
		let colorYellow = getComputedStyle(
			document.documentElement
		).getPropertyValue("--notification-yellow");

		if (check) {
			if (fetchError == false) {
				if (LogBan == false) {
					console.error(
						"Se ha detectado un bloqueo de HWID. No se puede iniciar ninguna instancia."
					);
					LogBan = true;
				}
				notificationTitle.innerHTML = "¡Atención!";
				notificationContent.innerHTML =
					"Se ha detectado un bloqueo de dispositivo. No podrá iniciar ninguna instancia hasta que su dispositivo sea desbloqueado.";
				notification.style.background = colorRed;
				notificationIcon.src = "assets/images/notification/error.png";
				await this.showNotification();
			} else {
				if (LogBan == false) {
					console.error(
						"El anticheat no ha podido verificar la integridad de tu dispositivo y por lo tanto no se podrá jugar a ninguna instancia."
					);
					LogBan = true;
				}
				notificationTitle.innerHTML = "¡Atención!";
				notificationContent.innerHTML =
					"No se ha podido conectar con el Anticheat de Miguelki Network y por lo tanto no se podrá jugar a ninguna instancia.";
				notification.style.background = colorRed;
				notificationIcon.src = "assets/images/notification/error.png";
				await this.showNotification();
			}
		} else if (res.notification.enabled) {
			notificationTitle.innerHTML = res.notification.title;
			notificationContent.innerHTML = res.notification.content;
			if (notificationContent.innerHTML.length > 160) {
				notificationContent.style.fontSize = "0.75rem";
				notificationTitle.style.fontSize = "1.0rem";
			}

			if (res.notification.color == "red")
				notification.style.background = colorRed;
			else if (res.notification.color == "green")
				notification.style.background = colorGreen;
			else if (res.notification.color == "blue")
				notification.style.background = colorBlue;
			else if (res.notification.color == "yellow")
				notification.style.background = colorYellow;
			else notification.style.background = res.notification.color;
			if (res.notification.icon.match(/^(http|https):\/\/[^ "]+$/))
				notificationIcon.src = res.notification.icon;
			else if (res.notification.icon == "info")
				notificationIcon.src = "assets/images/notification/info.png";
			else if (res.notification.icon == "warning")
				notificationIcon.src = "assets/images/notification/exclamation2.png";
			else if (res.notification.icon == "error")
				notificationIcon.src = "assets/images/notification/error.png";
			else if (res.notification.icon == "exclamation")
				notificationIcon.src = "assets/images/notification/exclamation.png";
			else notificationIcon.style.display = "none";
			await this.showNotification();
		} else {
			await this.hideNotification();
		}
	}

	async showNotification() {
		let notification = document.querySelector(".message-container");
		notification.style.display = "flex";
		notification.style.visibility = "visible";
		requestAnimationFrame(function () {
			requestAnimationFrame(function () {
				notification.style.opacity = "1";
			});
		});
	}

	async hideNotification() {
		let notification = document.querySelector(".message-container");
		notification.style.opacity = "0";
		await new Promise((resolve) => setTimeout(resolve, 1000));
		notification.style.visibility = "hidden";
		notification.style.display = "none";
	}

	startNotificationCheck() {
		this.intervalId = setInterval(() => {
			this.notification();
		}, 60000);
		console.log("Comprobación de notificación programada iniciada.");
	}

	stopNotificationCheck() {
		if (this.intervalId) {
			clearInterval(this.intervalId);
			this.intervalId = null;
		}
		console.log("Se ha detenido la comprobación programada de notificaciones.");
	}

	async startButtonManager() {
		this.startModsButton();
		this.startMusicButton();
	}

	async startModsButton() {
		let res = await config.GetConfig();
		if (res.modsBeta || dev) {
			document.querySelector(".action-button:nth-child(2)").style.display =
				"flex";
			document
				.querySelector(".action-button:nth-child(2)")
				.addEventListener("click", (e) => changePanel("mods"));
		} else {
			document.querySelector(".action-button:nth-child(2)").style.display =
				"none";
		}
	}

	async startMusicButton() {
		let res = await config.GetConfig();
		if (res.musicBeta || dev) {
			let configClient = await this.db.readData("configClient");
			document.querySelector(".action-button:nth-child(1)").style.display =
				"flex";
			document
				.querySelector(".action-button:nth-child(1)")
				.addEventListener("click", function () {
					if (!playing) toggleMusic();
				});
			if (configClient.launcher_config.music_muted) {
				document
					.querySelector(".music-btn")
					.classList.remove("icon-speaker-on");
				document.querySelector(".music-btn").classList.add("icon-speaker-off");
			} else {
				document
					.querySelector(".music-btn")
					.classList.remove("icon-speaker-off");
				document.querySelector(".music-btn").classList.add("icon-speaker-on");
			}
		} else {
			document.querySelector(".action-button:nth-child(1)").style.display =
				"none";
		}
	}

	async news() {
		let name = pkg.preductname;
		let version = pkg.version;
		let subversion = pkg.sub_version;
		let changelog = pkg.changelog;
		let titlechangelog = document.querySelector(".titlechangelog");
		let changelogcontent = document.querySelector(".bbWrapper");
		changelogcontent.innerHTML = `<p>${changelog}</p>`;
		titlechangelog.innerHTML = `${name} ${version}${
			subversion ? `-${subversion}` : ""
		}`;

		let newsElement = document.querySelector(".news-list");
		let news = await config
			.getNews()
			.then((res) => res)
			.catch((err) => false);
		if (news) {
			if (!news.length) {
				let blockNews = document.createElement("div");
				blockNews.classList.add("news-block");
				blockNews.innerHTML = `
                    <div class="news-header">
                        <div class="header-text">
                            <div class="title">Actualmente no hay noticias disponibles.</div>
                        </div>
                        <div class="date">
                            <div class="day">1</div>
                            <div class="month">Enero</div>
                        </div>
                    </div>
                    <div class="news-content">
                        <div class="bbWrapper">
                            <p>Puede seguir todas las noticias sobre el servidor aquí.</p>
                        </div>
                    </div>`;
				newsElement.appendChild(blockNews);
			} else {
				for (let News of news) {
					let date = this.getdate(News.publish_date);
					let blockNews = document.createElement("div");
					blockNews.classList.add("news-block");
					blockNews.innerHTML = `
                        <div class="news-header">
                            <div class="header-text">
                                <div class="title">${News.title}</div>
                            </div>
                            <div class="date">
                                <div class="day">${date.day}</div>
                                <div class="month">${date.month}</div>
                            </div>
                        </div>
                        <div class="news-content">
                            <div class="bbWrapper">
                                <p>${News.content.replace(/\n/g, "</br>")}</p>
                                <p class="news-author">Autor - <span>${
																	News.author
																}</span></p>
                            </div>
                        </div>`;
					newsElement.appendChild(blockNews);
				}
			}
		} else {
			let blockNews = document.createElement("div");
			blockNews.classList.add("news-block");
			blockNews.innerHTML = `
                <div class="news-header">
                        <div class="header-text">
                            <div class="title">Error.</div>
                        </div>
                        <div class="date">
                            <div class="day">1</div>
                            <div class="month">Enero</div>
                        </div>
                    </div>
                    <div class="news-content">
                        <div class="bbWrapper">
                            <p>No se puede contactar con el servidor de noticias.</p>
                        </div>
                    </div>`;
			newsElement.appendChild(blockNews);
		}
	}

	socialLick() {
		let socials = document.querySelectorAll(".social-block");

		socials.forEach((social) => {
			social.addEventListener("click", (e) => {
				shell.openExternal(e.target.dataset.url);
			});
		});
	}

	async instancesSelect() {
		let configClient = await this.db.readData("configClient");
		let auth = await this.db.readData(
			"accounts",
			configClient.account_selected
		);
		let username = await getUsername();
		let instancesList = await config.getInstanceList();
		let instanceSelect =
			instancesList &&
			instancesList.length > 0 &&
			instancesList.find((i) => i.name == configClient?.instance_selct)
				? configClient?.instance_selct
				: null;

		let instanceBTN = document.querySelector(".play-instance");
		let instancePopup = document.querySelector(".instance-popup");
		let instancesGrid = document.querySelector(".instances-grid");
		let instanceSelectBTN = document.querySelector(".instance-select");
		let instanceCloseBTN = document.querySelector(".close-popup");

		if (!instancesList || instancesList.length === 0) {
			instancesGrid.innerHTML = `
                <div class="no-instances-message">
                    <p>No hay instancias disponibles</p>
                    <p>Contacta con un administrador o usa el botón + para agregar una instancia con código.</p>
                </div>
            `;
			if (configClient.instance_selct) {
				configClient.instance_selct = null;
				await this.db.updateData("configClient", configClient);
			}
		}

		if (!instanceSelect) {
			let newInstanceSelect = instancesList.find(
				(i) => i.whitelistActive == false
			);

			if (newInstanceSelect) {
				configClient.instance_selct = newInstanceSelect.name;
				instanceSelect = newInstanceSelect.name;
				await this.db.updateData("configClient", configClient);
			} else if (instancesList.length > 0) {
				configClient.instance_selct = instancesList[0].name;
				instanceSelect = instancesList[0].name;
				await this.db.updateData("configClient", configClient);
			}
		}

		if (instancesList && instancesList.length > 0) {
			for (let instance of instancesList) {
				if (instance.whitelistActive) {
					let whitelist = instance.whitelist.find(
						(whitelist) => whitelist == username
					);
					if (whitelist !== username) {
						if (instance.name == instanceSelect) {
							let newInstanceSelect = instancesList.find(
								(i) => i.whitelistActive == false
							);

							if (newInstanceSelect) {
								configClient.instance_selct = newInstanceSelect.name;
								instanceSelect = newInstanceSelect.name;
								setStatus(newInstanceSelect);
								setBackgroundMusic(newInstanceSelect.backgroundMusic);
								setInstanceBackground(newInstanceSelect.background);
								await this.db.updateData("configClient", configClient);
							} else if (instancesList.length > 0) {
								configClient.instance_selct = instancesList[0].name;
								instanceSelect = instancesList[0].name;
								setStatus(instancesList[0]);
								setBackgroundMusic(instancesList[0].backgroundMusic);
								setInstanceBackground(instancesList[0].background);
								await this.db.updateData("configClient", configClient);
							}
						}
					}
				} else {
					console.log(`Configurando instancia ${instance.name}...`);
				}

				if (instanceSelect && instance.name == instanceSelect) {
					setStatus(instance);
					setBackgroundMusic(instance.backgroundMusic);
					setInstanceBackground(instance.background);
					this.updateSelectedInstanceStyle(instanceSelect);
				}

				this.notification();
			}

			instanceSelectBTN.removeEventListener(
				"click",
				this.instanceSelectClickHandler
			);
			this.instanceSelectClickHandler = async () => {
				if (instanceSelectBTN.disabled) return;

				// Verificar si hay bloqueo de dispositivo u otros errores antes de mostrar la ventana
				let hwid = await getHWID();
				let check = await checkHWID(hwid);
				let fetchError = await getFetchError();

				if (check) {
					if (fetchError == false) {
						let popupError = new popup();
						popupError.openPopup({
							title: "Error",
							content:
								"No puedes seleccionar ninguna instancia debido al bloqueo de dispositivo presente.<br><br>Si crees que esto es un error, abre ticket en el discord de Miguelki Network.",
							color: "red",
							options: true,
						});
						return;
					} else {
						let popupError = new popup();
						popupError.openPopup({
							title: "Error",
							content:
								"No se ha podido conectar con el Anticheat de Miguelki Network y por lo tanto no se podrá seleccionar ninguna instancia.",
							color: "red",
							options: true,
						});
						return;
					}
				}

				let username = await getUsername();

				let refreshedInstancesList = await config.getInstanceList();

				instancesGrid.innerHTML = "";

				if (!refreshedInstancesList || refreshedInstancesList.length === 0) {
					instancesGrid.innerHTML = `
                        <div class="no-instances-message">
                            <p>No hay instancias disponibles</p>
                            <p>Contacta con un administrador o usa el botón + para agregar una instancia con código.</p>
                        </div>
                    `;
				} else {
					let visibleInstanceCount = 0;

					for (let instance of refreshedInstancesList) {
						let color = instance.maintenance ? "red" : "green";
						let whitelist =
							instance.whitelistActive && instance.whitelist.includes(username);
						let imageUrl =
							instance.thumbnail || "assets/images/default/placeholder.jpg";
						if (!instance.whitelistActive || whitelist) {
							instancesGrid.innerHTML += `
                                <div id="${
																	instance.name
																}" class="instance-element ${
								instance.name === instanceSelect ? "active-instance" : ""
							}">
                                    <div class="instance-image" style="background-image: url('${imageUrl}');"></div>
                                    <div class="instance-name">${
																			instance.name
																		}<div class="instance-mkid" style="background-color: ${color};"></div></div>
                                </div>`;
							visibleInstanceCount++;
						}
					}

					if (visibleInstanceCount === 0) {
						instancesGrid.innerHTML = `
                            <div class="no-instances-message">
                                <p>No hay instancias disponibles para tu cuenta</p>
                                <p>Contacta con un administrador o usa el botón + para agregar una instancia con código.</p>
                            </div>
                        `;
					} else {
						const remainder = visibleInstanceCount % 3;
						instancesGrid.classList.remove("one-item", "two-items");

						if (remainder === 1) {
							instancesGrid.classList.add("one-item");
						} else if (remainder === 2) {
							instancesGrid.classList.add("two-items");
						}
					}
				}

				instancePopup.classList.add("show");
			};

			instanceSelectBTN.addEventListener(
				"click",
				this.instanceSelectClickHandler
			);

			instancePopup.addEventListener("click", async (e) => {
				let configClient = await this.db.readData("configClient");

				if (e.target.closest(".instance-element")) {
					let newInstanceSelect = e.target.closest(".instance-element").id;
					let activeInstanceSelect = document.querySelector(".active-instance");

					if (activeInstanceSelect)
						activeInstanceSelect.classList.remove("active-instance");
					e.target
						.closest(".instance-element")
						.classList.add("active-instance");

					configClient.instance_selct = newInstanceSelect;
					await this.db.updateData("configClient", configClient);
					instanceSelect = newInstanceSelect;
					instancePopup.classList.remove("show");
					this.notification();
					let instance = await config.getInstanceList();
					let options = instance.find(
						(i) => i.name == configClient.instance_selct
					);
					setStatus(options);
					setBackgroundMusic(options.backgroundMusic);
					const performanceMode = isPerformanceModeEnabled();
					if (performanceMode) {
						document
							.querySelector(".server-status-icon")
							?.setAttribute("data-background", options.background);
						if (
							options.background &&
							options.background.match(/^(http|https):\/\/[^ "]+$/)
						) {
							await captureAndSetVideoFrame(options.background);
						} else {
							await captureAndSetVideoFrame();
						}
					} else {
						setInstanceBackground(options.background);
					}
					this.updateSelectedInstanceStyle(newInstanceSelect);
				}
			});

			instanceBTN.addEventListener("click", async () => {
				this.disablePlayButton();
				this.startGame();
			});

			instanceCloseBTN.addEventListener("click", () => {
				instancePopup.classList.remove("show");
				this.notification();
			});
		}
	}

	disablePlayButton() {
		const playInstanceBTN = document.querySelector(".play-instance");
		playInstanceBTN.disabled = true;
		playInstanceBTN.style.pointerEvents = "none";
		playInstanceBTN.style.opacity = "0.5";
	}

	enablePlayButton() {
		const playInstanceBTN = document.querySelector(".play-instance");
		playInstanceBTN.disabled = false;
		playInstanceBTN.style.pointerEvents = "auto";
		playInstanceBTN.style.opacity = "1";
	}

	async startGame() {
		try {
			let configClient = await this.db.readData("configClient");

		if (!configClient.instance_selct) {
			this.enablePlayButton();
			let popupError = new popup();
			popupError.openPopup({
				title: "Selecciona una instancia",
				content: "Debes seleccionar una instancia antes de iniciar el juego.",
				color: "var(--color)",
				options: true,
			});
			return;
		}

		let instance = await config.getInstanceList();

		if (!configClient.account_selected) {
			this.enablePlayButton();
			let popupError = new popup();
			popupError.openPopup({
				title: "Error de cuenta",
				content:
					"No hay una cuenta seleccionada. Por favor, selecciona una cuenta para continuar.",
				color: "red",
				options: true,
			});
			return;
		}

		console.log(`Obteniendo cuenta con ID: ${configClient.account_selected}`);

		await this.db.syncAccountIds();

		let authenticator = null;

		try {
			authenticator = await this.db.getSelectedAccount();

			if (authenticator) {
				console.log(
					`Cuenta obtenida mediante getSelectedAccount: ${authenticator.name} (ID: ${authenticator.ID})`
				);
			}
		} catch (err) {
			console.warn(`Error al obtener cuenta seleccionada: ${err.message}`);
		}

		if (!authenticator) {
			try {
				authenticator = await this.db.readData(
					"accounts",
					configClient.account_selected
				);

				if (authenticator) {
					console.log(
						`Cuenta obtenida mediante readData: ${authenticator.name} (ID: ${authenticator.ID})`
					);
				}
			} catch (err) {
				console.warn(`Error al leer cuenta directamente: ${err.message}`);
			}
		}

		if (!authenticator) {
			console.log(`Intentando obtener cuenta desde la lista completa...`);
			let allAccounts = await this.db.readAllData("accounts");
			if (Array.isArray(allAccounts) && allAccounts.length > 0) {
				authenticator = allAccounts.find(
					(acc) =>
						String(acc.ID) === String(configClient.account_selected) ||
						Number(acc.ID) === Number(configClient.account_selected)
				);

				if (authenticator) {
					console.log(
						`Cuenta encontrada por método alternativo: ${authenticator.name} (ID: ${authenticator.ID})`
					);

					await this.db.updateData("accounts", authenticator, authenticator.ID);
				}
			}
		}

		if (!authenticator) {
			console.error(
				`No se pudo encontrar la cuenta con ID: ${configClient.account_selected}`
			);

			let allAccounts = await this.db.readAllData("accounts");
			if (Array.isArray(allAccounts)) {
				console.log(
					`Cuentas disponibles: ${allAccounts
						.map((a) => `${a.name}(${a.ID})`)
						.join(", ")}`
				);
			}

			this.enablePlayButton();
			let popupError = new popup();
			popupError.openPopup({
				title: "Error de cuenta",
				content:
					"La cuenta seleccionada no se encuentra disponible. Por favor, selecciona otra cuenta o inicia sesión nuevamente.",
				color: "red",
				options: true,
			});
			return;
		}

		let hwid = await getHWID();
		let check = await checkHWID(hwid);
		let fetchError = await getFetchError();

		if (check) {
			if (fetchError == false) {
				this.enablePlayButton();
				let popupError = new popup();
				popupError.openPopup({
					title: "Error",
					content:
						"No puedes iniciar ninguna instancia debido al bloqueo de dispositivo presente.<br><br>Si crees que esto es un error, abre ticket en el discord de Miguelki Network.",
					color: "red",
					options: true,
				});
				return;
			} else {
				this.enablePlayButton();
				let popupError = new popup();
				popupError.openPopup({
					title: "Error",
					content:
						"No se ha podido conectar con el Anticheat de Miguelki Network y por lo tanto no se podrá jugar a ninguna instancia.",
					color: "red",
					options: true,
				});
				return;
			}
		}

		console.log(
			`Cuenta recuperada: ${authenticator.name} (ID: ${authenticator.ID})`
		);
		let options = instance.find((i) => i.name == configClient.instance_selct);

		if (!options) {
			this.enablePlayButton();
			let popupError = new popup();
			popupError.openDialog({
				title: "Instancia No Encontrada",
				content: `La instancia "${configClient.instance_selct}" ya no existe en el servidor.

Posibles causas:
• La instancia fue removida del servidor
• Problemas de conectividad con el servidor
• Configuración local desactualizada

¿Quieres actualizar la lista de instancias disponibles?`,
				options: true,
				acceptText: "Actualizar Lista",
				cancelText: "Seleccionar Otra",
				callback: async (result) => {
					if (result === 'accept') {
						// Recargar lista de instancias
						try {
							await config.getInstanceList(true); // Force refresh
							location.reload(); // Refresh UI
						} catch (error) {
							console.error("Error al actualizar lista de instancias:", error);
							let errorPopup = new popup();
							errorPopup.openPopup({
								title: "Error de Actualización",
								content: `No se pudo actualizar la lista de instancias:\n\n${error.message}`,
								color: "red",
								options: true,
							});
						}
					} else {
						// Abrir selector de instancias
						document.querySelector(".instance-popup").style.display = "flex";
					}
				}
			});
			return;
		}

		let playInstanceBTN = document.querySelector(".play-instance");
		let infoStartingBOX = document.querySelector(".info-starting-game");
		let instanceSelectBTN = document.querySelector(".instance-select");
		let infoStarting = document.querySelector(".info-starting-game-text");
		let progressBar = document.querySelector(".progress-bar");
		let closeGameButton = document.querySelector(".force-close-button");

		if (options.maintenance) {
			this.enablePlayButton();
			let popupError = new popup();
			if (options.maintenancemsg == "") {
				popupError.openPopup({
					title: "Error al iniciar el cliente",
					content: "El cliente no se encuentra disponible.",
					color: "red",
					options: true,
				});
			} else {
				popupError.openPopup({
					title: "Error al iniciar el cliente",
					content: options.maintenancemsg,
					color: "red",
					options: true,
				});
			}
			return;
		}

		let username = await getUsername();
		if (options.whitelistActive && !options.whitelist.includes(username)) {
			this.enablePlayButton();
			let popupError = new popup();
			popupError.openPopup({
				title: "Error",
				content: "No tienes permiso para iniciar esta instancia.",
				color: "red",
				options: true,
			});
			return;
		}

		playInstanceBTN.style.display = "none";
		infoStartingBOX.style.display = "flex";
		instanceSelectBTN.disabled = true;
		instanceSelectBTN.classList.add("disabled");
		progressBar.style.display = "none";

		try {
			const queueResult = await this.checkQueueStatus(hwid, username);
			if (queueResult.cancelled) {
				this.enablePlayButton();
				playInstanceBTN.style.display = "flex";
				infoStartingBOX.style.display = "none";
				instanceSelectBTN.disabled = false;
				instanceSelectBTN.classList.remove("disabled");
				ipcRenderer.send("main-window-progress-reset");
				return;
			}
		} catch (error) {
			console.error("Error in queue system:", error);
			this.enablePlayButton();
			playInstanceBTN.style.display = "flex";
			infoStartingBOX.style.display = "none";
			instanceSelectBTN.disabled = false;
			instanceSelectBTN.classList.remove("disabled");
			ipcRenderer.send("main-window-progress-reset");

			let popupError = new popup();
			popupError.openPopup({
				title: "Error en la cola",
				content:
					"Ha ocurrido un error al conectar con el sistema de cola. Por favor, inténtalo de nuevo más tarde.",
				color: "red",
				options: true,
			});
			return;
		}

		progressBar.style.display = "";
		ipcRenderer.send("main-window-progress-load");

		let recentInstances = configClient.recent_instances || [];

		recentInstances = recentInstances.filter((name) => name !== options.name);

		recentInstances.unshift(options.name);

		if (recentInstances.length > 3)
			recentInstances = recentInstances.slice(0, 3);

		configClient.recent_instances = recentInstances;

		await this.db.updateData("configClient", configClient);

		await this.loadRecentInstances();

		console.log("Instancias recientes actualizadas:", recentInstances);

		const ignoredFiles = [...options.ignored];

		try {
			infoStarting.innerHTML = `Descargando librerias extra...`;
			const loaderType = options.loadder.loadder_type;
			const minecraftVersion = options.loadder.minecraft_version;

			// Asegurar que la carpeta mods existe y está oculta
			const instanceModsPath = path.join(
				await appdata(),
				process.platform == "darwin"
					? this.config.dataDirectory
					: `.${this.config.dataDirectory}`,
				"instances",
				options.name,
				"mods"
			);

			// Crear la carpeta mods si no existe
			if (!fs.existsSync(instanceModsPath)) {
				fs.mkdirSync(instanceModsPath, { recursive: true });
			}

			/* await hideFolder(instanceModsPath); */

			const installResult = await installMKLibMods(
				options.name,
				minecraftVersion,
				loaderType
			);

			if (installResult.success && installResult.modFile) {
				if (!ignoredFiles.includes(installResult.modFile)) {
					ignoredFiles.push(installResult.modFile);
				}
			}

			await new Promise((resolve) => setTimeout(resolve, 500));
		} catch (error) {
			console.error("Error al instalar las librerias extra:", error);
		}

		infoStarting.innerHTML = `Conectando...`;
		progressBar.value = 0;

		console.log("Obteniendo clave de ejecución...");
		let execKey = null;
		let execKeyValid = false;
		let gameArgs = options.game_args || [];
		try {
			const execKeyResponse = await getExecutionKey();

			if (
				execKeyResponse &&
				execKeyResponse.status === "success" &&
				execKeyResponse.exec_key
			) {
				execKey = execKeyResponse.exec_key;
				execKeyValid = true;
				console.log("Execution key obtained successfully");

				// Corregir cómo se añaden los argumentos según si gameArgs es array o string
				if (Array.isArray(gameArgs)) {
					gameArgs.push("--key", execKey, "--id", hwid);
				} else if (typeof gameArgs === "string") {
					// Si es string, añadir los argumentos con el formato correcto
					gameArgs = gameArgs
						? `${gameArgs} --key ${execKey} --id ${hwid}`
						: `--key ${execKey} --id ${hwid}`;
				}
			} else {
				throw new Error("Invalid execution key response");
			}
		} catch (keyError) {
			console.error("Error fetching execution key:", keyError.message);

			// Ask user if they want to continue without execution key
			const continueWithoutKey = await new Promise((resolve) => {
				let keyErrorPopup = new popup();
				keyErrorPopup.openDialog({
					title: "Error de verificación",
					content: `Error al obtener la clave de ejecución: ${keyError.message}. Sin esta verificación, el juego podría no iniciar correctamente. ¿Desea continuar de todos modos?`,
					options: true,
					callback: resolve,
				});
			});

			if (continueWithoutKey === "cancel") {
				this.enablePlayButton();
				infoStartingBOX.style.display = "none";
				playInstanceBTN.style.display = "flex";
				instanceSelectBTN.disabled = false;
				instanceSelectBTN.classList.remove("disabled");
				ipcRenderer.send("main-window-progress-reset");
				if (closeGameButton) {
					closeGameButton.style.display = "none";
				}
				return;
			}
		}

		console.log("Configurando opciones de lanzamiento...");
		let launcher = new Client();
		let launchConfig;
		
		try {
			console.log(`Obteniendo configuración para loader: ${options.loadder.loadder_type}`);
			
			const rootPath = `${await appdata()}/${
				process.platform == "darwin"
					? this.config.dataDirectory
					: `.${this.config.dataDirectory}`
			}`;
			
			// Mostrar progreso de configuración
			infoStarting.innerHTML = `Configurando ${options.loadder.loadder_type}...`;
			progressBar.value = 0;
			progressBar.max = 100;
			progressBar.style.display = "block";
			
			const loaderResult = await ipcRenderer.invoke('get-launcher-config', {
				loaderType: options.loadder.loadder_type,
				gameVersion: options.loadder.minecraft_version,
				rootPath: rootPath
			});
			
			if (!loaderResult.success) {
				console.error('Error detallado del loader:', loaderResult);
				
				// Manejo específico por tipo de error
				let errorTitle = "Error de Configuración";
				let errorContent = loaderResult.error;
				let suggestions = [];
				
				switch (loaderResult.category) {
					case 'network':
						errorTitle = "Error de Conexión";
						suggestions.push("• Verifica tu conexión a internet");
						suggestions.push("• Inténtalo de nuevo en unos minutos");
						break;
					case 'filesystem':
						errorTitle = "Error de Permisos";
						suggestions.push("• Ejecuta el launcher como administrador");
						suggestions.push("• Verifica que tienes permisos de escritura");
						break;
					case 'timeout':
						errorTitle = "Timeout de Descarga";
						suggestions.push("• Tu conexión puede ser lenta");
						suggestions.push("• Inténtalo de nuevo");
						break;
					case 'version':
						errorTitle = "Versión No Disponible";
						suggestions.push(`• Verifica que ${options.loadder.loadder_type} soporta Minecraft ${options.loadder.minecraft_version}`);
						suggestions.push("• Contacta al administrador del servidor");
						break;
					default:
						suggestions.push("• Inténtalo de nuevo");
						suggestions.push("• Si el problema persiste, contacta al soporte");
						break;
				}
				
				const fullErrorMessage = `${errorContent}\n\nSugerencias:\n${suggestions.join('\n')}`;
				
				throw new Error(fullErrorMessage);
			}
			
			// Validar configuración antes de continuar
			const validationResult = await ipcRenderer.invoke('validate-launcher-config', {
				config: loaderResult.config,
				loaderType: options.loadder.loadder_type,
				gameVersion: options.loadder.minecraft_version
			});
			
			if (validationResult.success) {
				if (!validationResult.validation.valid) {
					console.warn('Configuración del launcher tiene problemas:', validationResult.validation);
					
					// Mostrar advertencias al usuario si las hay
					if (validationResult.validation.warnings.length > 0) {
						console.warn('Advertencias de configuración:', validationResult.validation.warnings);
					}
					
					// Solo fallar si hay errores críticos que no podemos solucionar
					const criticalErrors = validationResult.validation.errors.filter(error => 
						!error.includes('directorio del juego') // Este error lo solucionamos nosotros
					);
					
					if (criticalErrors.length > 0) {
						throw new Error(`Configuración inválida:\n${criticalErrors.join('\n')}`);
					}
				}
			} else {
				console.warn('Error al validar configuración:', validationResult.error);
				// Continuar de todos modos, la validación no es crítica
			}
			
			launchConfig = loaderResult.config;
			console.log("Configuración del launcher obtenida y validada correctamente");
			
		} catch (error) {
			console.error("Error al configurar el launcher:", error);
			
			// Restablecer UI
			this.enablePlayButton();
			if (playInstanceBTN) playInstanceBTN.style.display = "flex";
			if (infoStartingBOX) infoStartingBOX.style.display = "none";
			if (instanceSelectBTN) {
				instanceSelectBTN.disabled = false;
				instanceSelectBTN.classList.remove("disabled");
			}
			if (closeGameButton) closeGameButton.style.display = "none";
			
			// Limpiar barra de progreso
			ipcRenderer.send("main-window-progress-reset");
			
			// Mostrar error detallado al usuario
			let popupError = new popup();
			popupError.openPopup({
				title: "Error de Configuración del Loader",
				content: `No se pudo configurar ${options.loadder.loadder_type} para Minecraft ${options.loadder.minecraft_version}:\n\n${error.message}`,
				color: "red",
				options: true,
			});
			
			return;
		}

		let opt;
		/* if (options.loadder.loadder_type == "forge") { */
		
		// Establecer el gameDirectory correcto para la instancia
		const instanceGameDirectory = `${await appdata()}/${
			process.platform == "darwin"
				? this.config.dataDirectory
				: `.${this.config.dataDirectory}`
		}/instances/${options.name}`;
		
		// Asegurar que launchConfig tiene las propiedades necesarias
		if (!launchConfig.gameDirectory && !launchConfig.directory) {
			console.log(`Estableciendo gameDirectory para la instancia: ${instanceGameDirectory}`);
			launchConfig.gameDirectory = instanceGameDirectory;
		}
		
		// Crear el directorio de la instancia si no existe
		if (!fs.existsSync(instanceGameDirectory)) {
			console.log(`Creando directorio de instancia: ${instanceGameDirectory}`);
			fs.mkdirSync(instanceGameDirectory, { recursive: true });
		}
		
		opt = {
			...launchConfig,
			authorization: authenticator,
			timeout: 10000,
			root: `${await appdata()}/${
				process.platform == "darwin"
					? this.config.dataDirectory
					: `.${this.config.dataDirectory}`
			}`,
			instance: options.name,
			version: {
				number: options.loadder.minecraft_version,
				type: "release",
				custom: options.loadder.custom_version
			},
			detached:
				configClient.launcher_config.closeLauncher == "close-all"
					? false
					: true,

			loader: {
				type: options.loadder.loadder_type,
				build: options.loadder.loadder_version,
				enable: options.loadder_type == "none" ? false : true,
			},

			java: {
				path: configClient.java_config.java_path,
			},

			customArgs: options.jvm_args ? options.jvm_args : [],
			customLaunchArgs: options.game_args ? options.game_args : [],

			screen: {
				width: configClient.game_config.screen_size.width,
				height: configClient.game_config.screen_size.height,
			},

			memory: {
				min: `${configClient.java_config.java_memory.min * 1024}M`,
				max: `${configClient.java_config.java_memory.max * 1024}M`,
			},

			overrides: {
				gameDirectory: instanceGameDirectory
			}
		};
		
		// Log final de configuración para debug
		console.log(`Configuración final del launcher:`, {
			hasGameDirectory: !!launchConfig.gameDirectory,
			gameDirectory: launchConfig.gameDirectory,
			instanceDirectory: instanceGameDirectory,
			rootPath: opt.root,
			overridesGameDirectory: instanceGameDirectory
		});
	/* } else {
		opt = {
			authenticator: authenticator,
			timeout: 10000,
			path: `${await appdata()}/${
				process.platform == "darwin"
					? this.config.dataDirectory
					: `.${this.config.dataDirectory}`
			}`,
			instance: options.name,
			version: options.loadder.minecraft_version,
			detached:
				configClient.launcher_config.closeLauncher == "close-all"
					? false
					: true,

			loader: {
				type: options.loadder.loadder_type,
				build: options.loadder.loadder_version,
				enable: options.loadder_type == "none" ? false : true,
			},

			java: {
				path: configClient.java_config.java_path,
			},

			JVM_ARGS: options.jvm_args ? options.jvm_args : [],
			GAME_ARGS: options.game_args ? options.game_args : [],

			screen: {
				width: configClient.game_config.screen_size.width,
				height: configClient.game_config.screen_size.height,
			},
			memory: {
				min: `${configClient.java_config.java_memory.min * 1024}M`,
				max: `${configClient.java_config.java_memory.max * 1024}M`,
			},
		};
	} */

		let musicMuted = configClient.launcher_config.music_muted;
		let musicPlaying = true;

		let modsApplied = false;
		let specialModCleaned = false;

		// Inicializar el proceso de limpieza antes del lanzamiento
		let gameStartMonitoringStarted = false;
		let cleanupTriggered = false;

		// Definir rootPath para uso en cleanup
		const rootPath = `${await appdata()}/${
			process.platform == "darwin"
				? this.config.dataDirectory
				: `.${this.config.dataDirectory}`
		}`;

		if (
			options.cleaning &&
			options.cleaning.enabled &&
			cleanupManager.enabled
		) {
			console.log(`Configurando limpieza para la instancia: ${options.name}`);
			await cleanupManager.queueCleanup(
				options.name,
				rootPath, // Usar rootPath en lugar de opt.root
				options.cleaning.files,
				false
			);
		} else {
			console.log(
				`Limpieza no configurada o desactivada para la instancia: ${options.name}`
			);
		}

		/* if (options.loader.loadder_type == "forge") { */
		try {
			console.log(`Iniciando descarga de assets para la instancia: ${options.name}`);
			infoStarting.innerHTML = `Descargando assets...`;
			progressBar.style.display = "block";
			progressBar.value = 0;
			progressBar.max = 100;

			// Carpeta de destino para los assets - directamente en la instancia
			const instancePath = `${await appdata()}/${
				process.platform == "darwin"
					? this.config.dataDirectory
					: `.${this.config.dataDirectory}`
			}/instances/${options.name}`;
			console.log(`Ruta de la instancia: ${instancePath}`);
			
			// URL de assets basada en la URL de la instancia con un endpoint fijo
			const assetsUrl = options.url;
			console.log(`URL de assets: ${assetsUrl}`);
			
			// Lista de archivos ignorados para la verificación de integridad
			const ignoredAssets = ignoredFiles;
			
			// Callback para reportar progreso
			const progressCallback = (progress, processed, total, downloadedSize, totalSize) => {
				console.log('Progress callback called with:', { progress, processed, total, downloadedSize, totalSize });
				
				// Validar que los valores sean números finitos válidos
				const safeProgress = (typeof progress === 'number' && isFinite(progress) && !isNaN(progress)) ? Math.max(0, Math.min(100, progress)) : 0;
				const safeProcessed = (typeof processed === 'number' && isFinite(processed) && !isNaN(processed)) ? processed : 0;
				const safeTotal = (typeof total === 'number' && isFinite(total) && !isNaN(total)) ? Math.max(1, total) : 1;
				const safeDownloadedSize = (typeof downloadedSize === 'number' && isFinite(downloadedSize) && !isNaN(downloadedSize)) ? downloadedSize : 0;
				const safeTotalSize = (typeof totalSize === 'number' && isFinite(totalSize) && !isNaN(totalSize)) ? totalSize : 0;
				
				console.log('Safe values:', { safeProgress, safeProcessed, safeTotal, safeDownloadedSize, safeTotalSize });
				
				const sizeText = safeTotalSize > 0 ? 
					` (${(safeDownloadedSize / 1024 / 1024).toFixed(1)}MB/${(safeTotalSize / 1024 / 1024).toFixed(1)}MB)` : '';
				
				// Actualizar la barra de progreso local con valores validados
				if (progressBar) {
					// Doble verificación antes de asignar
					let finalProgress = (isFinite(safeProgress) && !isNaN(safeProgress)) ? safeProgress : 0;
					// HTMLProgressElement solo acepta números entre 0 y max
					finalProgress = Math.max(0, Math.min(100, finalProgress));
					
					console.log('Setting progress bar value to:', finalProgress, typeof finalProgress);
					try {
						progressBar.value = finalProgress;
						progressBar.max = 100;
						progressBar.style.display = "block";
					} catch (error) {
						console.error('Error setting progress bar:', error);
						console.error('Final progress value:', finalProgress, typeof finalProgress);
						// Fallback: set to 0 if there's still an error
						try {
							progressBar.value = 0;
						} catch (fallbackError) {
							console.error('Even fallback failed:', fallbackError);
						}
					}
				}
				
				// Actualizar el progreso en la barra de tareas de Windows
				ipcRenderer.send("main-window-progress", { progress: safeProgress, size: 100 });
				
				// Mostrar progreso visual en el texto del estado
				if (infoStarting) {
					if (safeProgress <= 50) {
						// Fase de verificación (0-50%)
						infoStarting.innerHTML = `Verificando assets... ${Math.round(safeProgress)}% (${safeProcessed}/${safeTotal})`;
					} else {
						// Fase de descarga (50-100%)
						infoStarting.innerHTML = `Descargando assets... ${Math.round(safeProgress)}% (${safeProcessed}/${safeTotal})${sizeText}`;
					}
				}
			};

			// Callback para actualizar el estado
			const statusCallback = (status) => {
				// Validar que el status sea una cadena válida
				const safeStatus = (typeof status === 'string' && status.trim()) ? status.trim() : 'Procesando...';
				if (infoStarting) {
					infoStarting.innerHTML = safeStatus;
				}
			};

			// Descargar assets
			await downloadAssets(
				assetsUrl,
				instancePath,
				ignoredAssets,
				progressCallback,
				statusCallback
			);

			console.log(`Descarga de assets completada para la instancia: ${options.name}`);
			infoStarting.innerHTML = `Assets descargados correctamente`;
			await new Promise(resolve => setTimeout(resolve, 500));

		} catch (error) {
			console.error(`Error al descargar assets para ${options.name}:`, error);
			
			// Mostrar error al usuario con detalles específicos
			this.enablePlayButton();
			if (playInstanceBTN) playInstanceBTN.style.display = "flex";
			if (infoStartingBOX) infoStartingBOX.style.display = "none";
			if (instanceSelectBTN) {
				instanceSelectBTN.disabled = false;
				instanceSelectBTN.classList.remove("disabled");
			}
			if (closeGameButton) closeGameButton.style.display = "none";
			
			ipcRenderer.send("main-window-progress-reset");
			
			// Categorizar el error para mostrar mensaje más útil
			let errorTitle = "Error de Descarga de Assets";
			let errorMessage = error.message;
			let suggestions = [];
			
			if (errorMessage.includes('ENOTFOUND') || errorMessage.includes('ECONNREFUSED')) {
				errorTitle = "Error de Conexión";
				errorMessage = "No se pudo conectar al servidor de assets.";
				suggestions.push("• Verifica tu conexión a internet");
				suggestions.push("• El servidor puede estar temporalmente no disponible");
				suggestions.push("• Inténtalo de nuevo en unos minutos");
			} else if (errorMessage.includes('ENOSPC')) {
				errorTitle = "Espacio Insuficiente";
				errorMessage = "No hay suficiente espacio en disco para descargar los assets.";
				suggestions.push("• Libera espacio en tu disco duro");
				suggestions.push("• Verifica que tienes al menos 2GB libres");
			} else if (errorMessage.includes('EPERM') || errorMessage.includes('EACCES')) {
				errorTitle = "Error de Permisos";
				errorMessage = "No se tienen permisos para escribir en la carpeta de destino.";
				suggestions.push("• Ejecuta el launcher como administrador");
				suggestions.push("• Verifica permisos de la carpeta del launcher");
			} else if (errorMessage.includes('timeout') || errorMessage.includes('ETIMEDOUT')) {
				errorTitle = "Timeout de Descarga";
				errorMessage = "La descarga tardó demasiado tiempo.";
				suggestions.push("• Tu conexión puede ser lenta");
				suggestions.push("• Inténtalo de nuevo");
				suggestions.push("• Considera usar una conexión más estable");
			} else if (errorMessage.includes('404') || errorMessage.includes('not found')) {
				errorTitle = "Assets No Encontrados";
				errorMessage = "Los assets para esta instancia no están disponibles.";
				suggestions.push("• Contacta al administrador del servidor");
				suggestions.push("• Verifica que la instancia esté configurada correctamente");
			}
			
			const fullMessage = suggestions.length > 0 
				? `${errorMessage}\n\nSugerencias:\n${suggestions.join('\n')}`
				: errorMessage;
			
			let popupError = new popup();
			popupError.openPopup({
				title: errorTitle,
				content: fullMessage,
				color: "red",
				options: true,
			});
			return;
		}
		console.log("Finalizada la descarga de assets.");
	/* } */

	launcher.launch(opt);
		
		
		
		infoStarting.innerHTML = `Verificando archivos...`;
		progressBar.value = 0;

		launcher.on("extract", (extract) => {
			ipcRenderer.send("main-window-progress-load");
			console.log(extract);
		});

		launcher.on("progress", (progress, size) => {
			// Validar que los valores sean números finitos válidos
			const safeProgress = (typeof progress === 'number' && isFinite(progress)) ? Math.max(0, progress) : 0;
			const safeSize = (typeof size === 'number' && isFinite(size)) ? Math.max(1, size) : 1;
			const safePercentage = safeSize > 0 ? ((safeProgress / safeSize) * 100).toFixed(0) : '0';
			
			infoStarting.innerHTML = `Descargando loader... ${safePercentage}%`;
			ipcRenderer.send("main-window-progress", { progress: safeProgress, size: safeSize });
			progressBar.value = safeProgress;
			progressBar.max = safeSize;
		});

		launcher.on("check", (progress, size) => {
			// Validar que los valores sean números finitos válidos
			const safeProgress = (typeof progress === 'number' && isFinite(progress)) ? Math.max(0, progress) : 0;
			const safeSize = (typeof size === 'number' && isFinite(size)) ? Math.max(1, size) : 1;
			const safePercentage = safeSize > 0 ? ((safeProgress / safeSize) * 100).toFixed(0) : '0';
			
			infoStarting.innerHTML = `Verificando... ${safePercentage}%`;
			ipcRenderer.send("main-window-progress", { progress: safeProgress, size: safeSize });
			progressBar.value = safeProgress;
			progressBar.max = safeSize;
		});

		launcher.on("data", async (e) => {
			if (typeof e === "string") {
				console.log(e);

				if (rpcActive) {
					username = await getUsername();
					RPC.setActivity({
						state: `Jugando a ${configClient.instance_selct}`,
						startTimestamp: startingTime,
						largeImageKey: "icon",
						smallImageKey: `https://minotar.net/helm/${username}/512.png`,
						smallImageText: username,
						largeImageText: pkg.preductname,
						instance: true,
					});
				}

				// Procesar la salida para detectar patrones de limpieza si la limpieza está activada
				if (
					options.cleaning &&
					options.cleaning.enabled &&
					cleanupManager.enabled
				) {
					// Procesa la salida para detectar patrones que indiquen que el juego se inició completamente
					cleanupManager.processGameOutput(options.name, e);

					// Si el juego ya se inició completamente y no hemos ejecutado la limpieza
					if (
						cleanupManager.isGameFullyStarted(options.name) &&
						!cleanupTriggered
					) {
						cleanupTriggered = true;
						console.log(
							`Juego completamente iniciado. Ejecutando limpieza de archivos para: ${options.name}`
						);

						try {
							// Esperar un poco para asegurar que el juego esté estable
							setTimeout(async () => {
								await cleanupManager.performStartupCleanup(options.name);
								console.log(
									`Limpieza de archivos completada para: ${options.name}`
								);
							}, 5000);
						} catch (error) {
							console.error(
								`Error durante la limpieza de archivos: ${error.message}`
							);
						}
					}

					if (!gameStartMonitoringStarted) {
						gameStartMonitoringStarted = true;
						console.log(
							`Monitoreo de inicio del juego activado para: ${options.name}`
						);
					}
				}
			}

			if (!modsApplied) {
				modsApplied = true;
				try {
					infoStarting.innerHTML = "Aplicando mods opcionales...";
					await this.applyOptionalMods(options.name);
					console.log(`Mods opcionales aplicados para: ${options.name}`);
				} catch (error) {
					console.error(`Error al aplicar mods opcionales: ${error}`);
				}
			}

			if (
				!specialModCleaned &&
				(e.includes("Setting user:") ||
					e.includes("Connecting to") ||
					e.includes("LWJGL Version:") ||
					e.includes("OpenAL initialized"))
			) {
				specialModCleaned = true;
				try {
					launcher;
					const basePath = `${await appdata()}/${
						process.platform == "darwin"
							? this.config.dataDirectory
							: `.${this.config.dataDirectory}`
					}`;
					setTimeout(async () => {
						await cleanupManager.cleanMKLibMods(options.name, basePath);
					}, 5000);
				} catch (cleanError) {
					console.error("Error al limpiar las librerías extra:", cleanError);
				}
			}

			if (!musicMuted && musicPlaying) {
				musicPlaying = false;
				fadeOutAudio();
			}
			progressBar.style.display = "none";
			closeGameButton.style.display = "block";

			if (configClient.launcher_config.closeLauncher == "close-launcher") {
				ipcRenderer.send("main-window-hide");
			}

			if (!playing) {
				playing = true;
				playMSG(configClient.instance_selct);

				removeUserFromQueue(hwid);
			}

			ipcRenderer.send("main-window-progress-load");
			infoStarting.innerHTML = `Jugando...`;
		});

		launcher.on("estimated", (time) => {
			let hours = Math.floor(time / 3600);
			let minutes = Math.floor((time - hours * 3600) / 60);
			let seconds = Math.floor(time - hours * 3600 - minutes * 60);
			console.log(
				`Tiempo de descarga estimado: ${hours}h ${minutes}m ${seconds}s`
			);
		});

		launcher.on("speed", (speed) => {
			console.log(
				`Velocidad de descarga: ${(speed / 1067008).toFixed(2)} Mb/s`
			);
		});

		launcher.on("patch", (patch) => {
			console.log(patch);
			ipcRenderer.send("main-window-progress-load");
			infoStarting.innerHTML = `Parcheando...`;
		});

		launcher.on("close", async (code) => {
			if (configClient.launcher_config.closeLauncher == "close-launcher") {
				ipcRenderer.send("main-window-show");
			}

			this.notification();
			if (!musicMuted && !musicPlaying) {
				musicPlaying = true;
				setBackgroundMusic(options.backgroundMusic);
			}
			infoStartingBOX.style.display = "none";
			playInstanceBTN.style.display = "flex";
			instanceSelectBTN.disabled = false;
			instanceSelectBTN.classList.remove("disabled");
			infoStarting.innerHTML = `Cerrando...`;
			console.log("Close");

			if (closeGameButton) {
				closeGameButton.style.display = "none";
			}

			this.enablePlayButton();

			// Ejecutar limpieza en cierre si está configurada
			if (
				options.cleaning &&
				options.cleaning.enabled &&
				cleanupManager.enabled
			) {
				try {
					await cleanupManager.cleanupOnGameClose(options.name);
					console.log(
						`Limpieza en cierre del juego completada para: ${options.name}`
					);
				} catch (error) {
					console.error(`Error durante limpieza en cierre: ${error.message}`);
				}
			}

			if (rpcActive) {
				username = await getUsername();
				RPC.setActivity({
					state: `En el launcher`,
					startTimestamp: startingTime,
					largeImageKey: "icon",
					largeImageText: pkg.preductname,
					instance: true,
				}).catch();
				playquitMSG(configClient.instance_selct);
				playing = false;
			}
		});

		launcher.on("error", async (err) => {
			console.error("Error del launcher:", err);
			removeUserFromQueue(hwid);

			// Restablecer estado de UI
			this.enablePlayButton();
			if (playInstanceBTN) playInstanceBTN.style.display = "flex";
			if (infoStartingBOX) infoStartingBOX.style.display = "none";
			if (instanceSelectBTN) {
				instanceSelectBTN.disabled = false;
				instanceSelectBTN.classList.remove("disabled");
			}
			if (closeGameButton) closeGameButton.style.display = "none";
			
			// Limpiar progreso
			ipcRenderer.send("main-window-progress-reset");
			
			// Restablecer música
			let configClient = await this.db.readData("configClient").catch(() => ({}));
			let musicMuted = configClient.launcher_config?.music_muted;
			if (!musicMuted && !musicPlaying) {
				musicPlaying = true;
				if (options?.backgroundMusic) {
					setBackgroundMusic(options.backgroundMusic);
				}
			}
			
			// Mostrar launcher si estaba oculto
			if (configClient.launcher_config?.closeLauncher == "close-launcher") {
				ipcRenderer.send("main-window-show");
			}

			// Determinar tipo de error y mensaje apropiado
			let errorTitle = "Error al Iniciar el Juego";
			let errorContent = "Ha ocurrido un error inesperado al iniciar el juego.";
			let showTroubleshooting = false;
			
			if (typeof err.error === "undefined") {
				// Error sin mensaje específico - posiblemente problema de configuración
				errorTitle = "Error de Configuración";
				errorContent = `El juego no pudo iniciarse debido a un problema de configuración.
				
Posibles causas:
• Archivos del juego corruptos o faltantes
• Configuración de Java incorrecta
• Problemas con ${options.loadder.loadder_type}
• Falta de memoria RAM

¿Quieres ejecutar herramientas de diagnóstico?`;
				showTroubleshooting = true;
			} else {
				// Error con mensaje específico
				let originalError = err.error;
				
				// Categorizar errores comunes
				if (originalError.includes('OutOfMemoryError') || originalError.includes('heap')) {
					errorTitle = "Error de Memoria";
					errorContent = `El juego se quedó sin memoria RAM.

Soluciones:
• Incrementa la memoria máxima de Java en Configuración
• Cierra otros programas que consuman memoria
• Usa menos mods o un modpack más ligero

Error técnico: ${originalError}`;
				} else if (originalError.includes('java') || originalError.includes('JVM')) {
					errorTitle = "Error de Java";
					errorContent = `Problema con la instalación de Java.

Soluciones:
• Verifica que Java esté instalado correctamente
• Reinstala Java desde el sitio oficial
• Verifica la ruta de Java en Configuración

Error técnico: ${originalError}`;
				} else if (originalError.includes('connection') || originalError.includes('network')) {
					errorTitle = "Error de Conexión";
					errorContent = `No se pudo conectar al servidor.

Soluciones:
• Verifica tu conexión a internet
• El servidor puede estar temporalmente no disponible
• Verifica que no tengas firewall bloqueando el juego

Error técnico: ${originalError}`;
				} else if (originalError.includes('mod') || originalError.includes('forge') || originalError.includes('fabric')) {
					errorTitle = "Error de Mods";
					errorContent = `Problema con mods o el mod loader.

Soluciones:
• Verifica que todos los mods sean compatibles
• Verifica que ${options.loadder.loadder_type} sea la versión correcta
• Intenta desactivar mods opcionales

Error técnico: ${originalError}`;
				} else if (originalError.includes('file') || originalError.includes('path')) {
					errorTitle = "Error de Archivos";
					errorContent = `Problema con archivos del juego.

Soluciones:
• Ejecuta el launcher como administrador
• Verifica permisos de la carpeta del juego
• Verifica que hay suficiente espacio en disco

Error técnico: ${originalError}`;
				} else {
					// Error genérico
					errorContent = `${originalError}

Si el problema persiste, contacta al soporte técnico.`;
				}
			}

			// Actualizar Discord RPC
			if (rpcActive) {
				try {
					let username = await getUsername();
					RPC.setActivity({
						state: `En el launcher`,
						largeImageKey: "icon",
						largeImageText: pkg.preductname,
						instance: true,
					}).catch();
				} catch (rpcError) {
					console.error("Error al actualizar Discord RPC:", rpcError);
				}
			}

			// Mostrar popup de error
			let popupError = new popup();
			
			if (showTroubleshooting) {
				// Mostrar diálogo con opciones de solución de problemas
				popupError.openDialog({
					title: errorTitle,
					content: errorContent,
					options: true,
					acceptText: "Ejecutar Diagnósticos",
					cancelText: "Cerrar",
					callback: async (result) => {
						if (result === 'accept') {
							// Ejecutar herramientas de diagnóstico
							console.log("Ejecutando herramientas de diagnóstico...");
							await this.runSystemDiagnostics();
						}
					}
				});
			} else {
				// Mostrar popup simple de error con opción de diagnósticos
				popupError.openDialog({
					title: errorTitle,
					content: `${errorContent}\n\n¿Quieres ejecutar diagnósticos del sistema para identificar posibles problemas?`,
					options: true,
					acceptText: "Ejecutar Diagnósticos",
					cancelText: "Cerrar",
					callback: async (result) => {
						if (result === 'accept') {
							await this.runSystemDiagnostics();
						}
					}
				});
			}

			// Resetear notificación y estado
			this.notification();
			infoStarting.innerHTML = `Verificando...`;
		});
		
		} catch (error) {
			console.error("Error fatal en startGame:", error);
			
			// Restablecer el estado de la UI
			this.enablePlayButton();
			const playInstanceBTN = document.querySelector(".play-instance");
			const infoStartingBOX = document.querySelector(".info-starting-game");
			const instanceSelectBTN = document.querySelector(".instance-select");
			const closeGameButton = document.querySelector(".force-close-button");
			
			if (playInstanceBTN) playInstanceBTN.style.display = "flex";
			if (infoStartingBOX) infoStartingBOX.style.display = "none";
			if (instanceSelectBTN) {
				instanceSelectBTN.disabled = false;
				instanceSelectBTN.classList.remove("disabled");
			}
			if (closeGameButton) closeGameButton.style.display = "none";
			
			// Limpiar barra de progreso
			ipcRenderer.send("main-window-progress-reset");
			
			// Restablecer música si estaba silenciada
			let configClient = await this.db.readData("configClient").catch(() => ({}));
			let musicMuted = configClient.launcher_config?.music_muted;
			if (!musicMuted && !musicPlaying) {
				musicPlaying = true;
				if (options?.backgroundMusic) {
					setBackgroundMusic(options.backgroundMusic);
				}
			}
			
			// Mostrar popup de error
			let popupError = new popup();
			popupError.openPopup({
				title: "Error Fatal",
				content: `Ha ocurrido un error inesperado al iniciar el juego:\n\n${error.message}\n\nRevisa la consola para más detalles.`,
				color: "red",
				options: true,
			});
			
			// Limpiar Discord RPC si estaba activo
			if (rpcActive) {
				try {
					let username = await getUsername();
					RPC.setActivity({
						state: `En el launcher`,
						largeImageKey: "icon",
						largeImageText: pkg.preductname,
						instance: true,
					}).catch();
				} catch (rpcError) {
					console.error("Error al actualizar Discord RPC:", rpcError);
				}
			}
		}
	}

	async applyOptionalMods(instanceName) {
		console.log(`Aplicando mods opcionales para instancia: ${instanceName}`);

		const instances = await config.getInstanceList();
		const instance = instances.find((i) => i.name === instanceName);

		if (
			!instance ||
			!instance.optionalMods ||
			instance.optionalMods.length === 0
		) {
			console.log(`No hay mods opcionales para la instancia: ${instanceName}`);
			return;
		}

		const db = new database();
		let configClient = await db.readData("configClient");

		const activeModsForInstance = configClient.mods_enabled
			.filter((modId) => {
				const [modIdInstanceName] = modId.split("-");
				return modIdInstanceName === instanceName;
			})
			.map((modId) => {
				const [, modIdModName] = modId.split("-");
				return modIdModName;
			});

		let res = await config.GetConfig();
		const appdataPath = await appdata();
		const instanceModsPath = path.join(
			appdataPath,
			process.platform == "darwin"
				? res.dataDirectory
				: `.${res.dataDirectory}`,
			"instances",
			instanceName,
			"mods"
		);

		for (const mod of instance.optionalMods) {
			const modIsActiveInConfig = activeModsForInstance.includes(mod.name);
			const modFile = mod.file;

			const activeModPath = path.join(instanceModsPath, `${modFile}.jar`);
			const disabledModPath = path.join(
				instanceModsPath,
				`${modFile}.disabled`
			);

			if (!fs.existsSync(activeModPath) && !fs.existsSync(disabledModPath)) {
				console.warn(`No se ha encontrado el mod opcional: ${modFile}`);
				continue;
			}

			try {
				if (modIsActiveInConfig && fs.existsSync(disabledModPath)) {
					console.log(`Activando mod: ${modFile}`);
					fs.renameSync(disabledModPath, activeModPath);
				} else if (!modIsActiveInConfig && fs.existsSync(activeModPath)) {
					console.log(`Desactivando mod: ${modFile}`);
					fs.renameSync(activeModPath, disabledModPath);
				}
			} catch (error) {
				console.error(`Error al procesar el mod ${modFile}:`, error);
			}
		}

		return true;
	}

	async checkQueueStatus(hwid, username) {
		return new Promise(async (resolve, reject) => {
			let cancelled = false;
			let infoStarting = document.querySelector(".info-starting-game-text");

			let cancelButton = document.createElement("button");
			cancelButton.textContent = "Cancelar";
			cancelButton.classList.add("cancel-queue-button");

			cancelButton.addEventListener("click", async () => {
				cancelled = true;
				document.querySelector(".info-starting-game").removeChild(cancelButton);
				await removeUserFromQueue(hwid);
				resolve({ cancelled: true });
			});

			document.querySelector(".info-starting-game").appendChild(cancelButton);

			const checkStatus = async () => {
				if (cancelled) return;

				try {
					const formData = new URLSearchParams();
					formData.append("hwid", hwid);
					formData.append("username", username);

					const response = await fetch(`${pkg.url}/api/queue-status.php`, {
						method: "POST",
						body: formData,
						headers: {
							"Content-Type": "application/x-www-form-urlencoded",
							"User-Agent": "MiguelkiNetworkMCLauncher",
						},
					});

					if (!response.ok) {
						throw new Error(`Error en la respuesta: ${response.status}`);
					}

					const data = await response.json();

					if (data.status === "open") {
						if (
							document
								.querySelector(".info-starting-game")
								.contains(cancelButton)
						) {
							document
								.querySelector(".info-starting-game")
								.removeChild(cancelButton);
						}
						infoStarting.innerHTML = `Preparando lanzamiento...`;
						resolve({ cancelled: false });
						return;
					} else if (data.status === "on_queue") {
						infoStarting.innerHTML = `En cola, posición: ${data.position} / ${data.total_in_queue}`;

						if (!cancelled) {
							setTimeout(checkStatus, 30000);
						}
					} else {
						throw new Error(`Estado de cola desconocido: ${data.status}`);
					}
				} catch (error) {
					if (
						document.querySelector(".info-starting-game").contains(cancelButton)
					) {
						document
							.querySelector(".info-starting-game")
							.removeChild(cancelButton);
					}

					reject(error);
				}
			};

			await checkStatus();
		});
	}

	async loadRecentInstances() {
		try {
			const configClient = await this.db.readData("configClient");
			const recentInstances = configClient.recent_instances || [];
			const recentInstancesContainer =
				document.querySelector(".recent-instances");
			const instancesList = await config.getInstanceList();

			recentInstancesContainer.innerHTML = "";

			if (
				!recentInstances.length ||
				!instancesList ||
				instancesList.length === 0
			) {
				return;
			}

			const validInstances = recentInstances.filter((name) =>
				instancesList.some((instance) => instance.name === name)
			);

			if (validInstances.length !== recentInstances.length) {
				configClient.recent_instances = validInstances;
				await this.db.updateData("configClient", configClient);
			}

			const username = await getUsername();

			for (const instanceName of validInstances) {
				const instance = instancesList.find((i) => i.name === instanceName);

				if (!instance) continue;

				const button = document.createElement("div");
				button.classList.add("recent-instance-button");
				button.style.backgroundImage = `url(${
					instance.icon ||
					instance.thumbnail ||
					"assets/images/default/placeholder.jpg"
				})`;
				button.dataset.instanceName = instanceName;

				if (instanceName === configClient.instance_selct) {
					button.classList.add("selected-instance");
				}

				button.addEventListener("click", async () => {
					const refreshedInstances = await config.getInstanceList();
					const refreshedInstance = refreshedInstances.find(
						(i) => i.name === instanceName
					);
					const currentUsername = await getUsername();

					if (
						refreshedInstance &&
						refreshedInstance.whitelistActive &&
						(!refreshedInstance.whitelist ||
							!refreshedInstance.whitelist.includes(currentUsername))
					) {
						const popupError = new popup();
						popupError.openPopup({
							title: "Error",
							content: "No tienes permiso para seleccionar esta instancia.",
							color: "red",
							options: true,
						});
					} else {
						await this.selectInstance(instanceName);
					}
				});

				this.addTooltipToElement(button, instanceName);

				recentInstancesContainer.appendChild(button);
			}
		} catch (error) {
			console.error("Error al cargar instancias recientes:", error);
		}
	}

	addTooltipToElement(element, text) {
		if (!window.tooltipManager) {
			this.initializeTooltipManager();
		}

		element.addEventListener("mouseenter", (e) => {
			window.tooltipManager.showTooltip(element, text);
		});

		element.addEventListener("mouseleave", (e) => {
			window.tooltipManager.hideTooltip(element);
		});

		const observer = new MutationObserver((mutations) => {
			for (const mutation of mutations) {
				if (
					mutation.type === "childList" &&
					Array.from(mutation.removedNodes).some(
						(node) =>
							node === element || (node.contains && node.contains(element))
					)
				) {
					if (window.tooltipManager) {
						window.tooltipManager.hideTooltip(element);
					}
					observer.disconnect();
					break;
				}
			}
		});

		if (element.parentNode) {
			observer.observe(element.parentNode, { childList: true, subtree: true });
		}
	}

	addPlayerTooltip() {
		const playerOptions = document.querySelector(".player-options");

		if (!window.tooltipManager) {
			this.initializeTooltipManager();
		}

		if (playerOptions) {
			let tooltipActive = false;

			playerOptions.addEventListener("mouseenter", async (e) => {
				if (tooltipActive) return;
				tooltipActive = true;

				try {
					const username = await getUsername();
					if (username) {
						window.tooltipManager.showTooltip(playerOptions, username);
					}
				} catch (error) {
					console.error("Error al obtener el nombre de usuario:", error);
				}
			});

			playerOptions.addEventListener("mouseleave", (e) => {
				tooltipActive = false;
				window.tooltipManager.hideTooltip(playerOptions);
			});

			playerOptions.style.pointerEvents = "auto";
		}
	}

	initializeTooltipManager() {
		if (window.tooltipManager) return;

		window.tooltipManager = {
			activeTooltips: new Map(),

			showTooltip(element, text) {
				this.hideTooltip(element);

				const tooltip = document.createElement("div");
				tooltip.classList.add("tooltip");
				tooltip.innerHTML = text;
				document.body.appendChild(tooltip);

				const rect = element.getBoundingClientRect();
				tooltip.style.left = `${rect.right + window.scrollX + 10}px`;
				tooltip.style.top = `${
					rect.top + window.scrollY + rect.height / 2 - tooltip.offsetHeight / 2
				}px`;

				tooltip.style.zIndex = "10000";

				this.activeTooltips.set(element, tooltip);

				tooltip.style.opacity = "1";
			},

			hideTooltip(element) {
				const tooltip = this.activeTooltips.get(element);
				if (tooltip) {
					tooltip.style.opacity = "0";
					this.activeTooltips.delete(element);

					setTimeout(() => {
						if (document.body.contains(tooltip)) {
							document.body.removeChild(tooltip);
						}
					}, 200);
				}
			},

			hideAllTooltips() {
				this.activeTooltips.forEach((tooltip, element) => {
					this.hideTooltip(element);
				});
			},

			cleanupOrphanedTooltips() {
				document.querySelectorAll(".tooltip").forEach((tooltip) => {
					if (!Array.from(this.activeTooltips.values()).includes(tooltip)) {
						if (document.body.contains(tooltip)) {
							document.body.removeChild(tooltip);
						}
					}
				});
			},
		};

		document.addEventListener("mouseleave", () => {
			window.tooltipManager.hideAllTooltips();
		});

		window.addEventListener("blur", () => {
			window.tooltipManager.hideAllTooltips();
		});

		setInterval(() => {
			window.tooltipManager.cleanupOrphanedTooltips();
		}, 5000);

		document.addEventListener("click", () => {
			window.tooltipManager.hideAllTooltips();
		});

		document.addEventListener("visibilitychange", () => {
			if (document.visibilityState === "hidden") {
				window.tooltipManager.hideAllTooltips();
			}
		});
	}

	async selectInstance(instanceName) {
		let selectInstanceBTN = document.querySelector(".instance-select");
		if (selectInstanceBTN.disabled) return;

		try {
			let configClient = await this.db.readData("configClient");
			const oldInstance = configClient.instance_selct;
			configClient.instance_selct = instanceName;
			await this.db.updateData("configClient", configClient);

			let instance = await config
				.getInstanceList()
				.then((instances) => instances.find((i) => i.name === instanceName));

			if (!instance) {
				return;
			}

			this.notification();
			setStatus(instance);

			const performanceMode = isPerformanceModeEnabled();
			if (performanceMode) {
				setBackgroundMusic(instance.backgroundMusic);
				if (
					instance.background &&
					instance.background.match(/^(http|https):\/\/[^ "]+$/)
				) {
					document
						.querySelector(".server-status-icon")
						?.setAttribute("data-background", instance.background);
				} else {
					document
						.querySelector(".server-status-icon")
						?.removeAttribute("data-background");
				}
			} else {
				setBackgroundMusic(instance.backgroundMusic);
				setInstanceBackground(instance.background);
			}

			this.updateSelectedInstanceStyle(instanceName);
		} catch (error) {
			console.error("Error al seleccionar instancia:", error);
		}
	}

	updateSelectedInstanceStyle(instanceName) {
		const recentInstancesContainer =
			document.querySelector(".recent-instances");
		const buttons = recentInstancesContainer.querySelectorAll(
			".recent-instance-button"
		);

		buttons.forEach((button) => {
			if (button.dataset.instanceName === instanceName) {
				button.classList.add("selected-instance");
			} else {
				button.classList.remove("selected-instance");
			}
		});
	}

	updateInstanceBackground(instance) {
		const performanceMode = isPerformanceModeEnabled();
		if (performanceMode) {
			if (
				instance.background &&
				instance.background.match(/^(http|https):\/\/[^ "]+$/)
			) {
				captureAndSetVideoFrame(instance.background);
			}
		}
	}

	getdate(e) {
		let date = new Date(e);
		let year = date.getFullYear();
		let month = date.getMonth() + 1;
		let day = date.getDate();
		let allMonth = [
			"Enero",
			"Febrero",
			"Marzo",
			"Abril",
			"Mayo",
			"Junio",
			"Julio",
			"Agosto",
			"Septiembre",
			"Octubre",
			"Noviembre",
			"Diciembre",
		];
		return { year: year, month: allMonth[month - 1], day: day };
	}

	addInstanceButton() {
		const addInstanceButton = document.querySelector(".add-instance");
		const instancePopup = document.querySelector(".instance-popup");
		const addInstancePopup = document.querySelector(".add-instance-popup");
		const addInstanceInput = document.querySelector(".add-instance-input");
		const addInstanceConfirm = document.querySelector(".add-instance-confirm");
		const addInstanceCancel = document.querySelector(".add-instance-cancel");

		addInstanceButton.addEventListener("click", () => {
			addInstancePopup.classList.add("show");
		});

		addInstanceConfirm.addEventListener("click", async () => {
			const code = addInstanceInput.value;
			if (code) {
				try {
					const username = await getUsername();
					const response = await fetch(
						`${pkg.url}/api/instance-code.php?code=${code}&user=${username}`,
						{
							headers: {
								"User-Agent": "MiguelkiNetworkMCLauncher",
							},
						}
					);
					const result = await response.json();

					const popupMessage = new popup();
					popupMessage.openPopup({
						title: result.success ? "Éxito" : "Error",
						content: result.message,
						color: result.success ? "green" : "red",
						options: true,
					});
					if (result.success) {
						await this.instancesSelect();
					}
					addInstanceMSG(result.success, code);
					addInstancePopup.classList.remove("show");
					addInstanceInput.value = "";
				} catch (error) {
					addInstanceMSG(false, code);
					const popupMessage = new popup();
					popupMessage.openPopup({
						title: "Error",
						content: "Ha ocurrido un error al intentar agregar el código.",
						color: "red",
						options: true,
					});
				}
			}
		});

		addInstanceCancel.addEventListener("click", () => {
			addInstancePopup.classList.remove("show");
			addInstanceInput.value = "";
		});
	}

	async runCleanupBatchFiles() {
		try {
			const fs = require("fs");
			const path = require("path");
			const glob = require("glob");
			const { exec } = require("child_process");

			const appDir = await appdata();
			const instancesDir = path.join(
				appDir,
				process.platform === "darwin"
					? this.config.dataDirectory
					: `.${this.config.dataDirectory}`,
				"instances"
			);

			if (!fs.existsSync(instancesDir)) {
				return;
			}

			const batchFiles = glob.sync(
				path.join(instancesDir, "**", "_cleanup_*.bat")
			);

			if (batchFiles.length > 0) {
				for (const batchFile of batchFiles) {
					exec(`"${batchFile}"`, (error, stdout, stderr) => {
						if (error) {
							return;
						}
						if (stderr) {
							return;
						}
					});
				}
			}
		} catch (error) {
			console.error("Error running cleanup batch files:", error);
		}
	}

	addInterfaceTooltips() {
		if (!window.tooltipManager) {
			this.initializeTooltipManager();
		}

		const addInstanceButton = document.querySelector(".add-instance");
		if (addInstanceButton) {
			this.addTooltipToElement(addInstanceButton, "Añadir instancia");
		}

		const instanceSelectButton = document.querySelector(".instance-select");
		if (instanceSelectButton) {
			this.addTooltipToElement(instanceSelectButton, "Seleccionar instancia");
		}

		const musicButton = document.querySelector(".action-button:nth-child(1)");
		if (musicButton) {
			this.addDynamicTooltipToElement(musicButton, () =>
				musicButton
					.querySelector(".music-btn")
					.classList.contains("icon-speaker-on")
					? "Silenciar música"
					: "Activar música"
			);
		}

		const modsButton = document.querySelector(".action-button:nth-child(2)");
		if (modsButton) {
			this.addTooltipToElement(modsButton, "Gestionar mods");
		}

		const settingsButton = document.querySelector(
			".action-button:nth-child(3)"
		);
		if (settingsButton) {
			this.addTooltipToElement(settingsButton, "Configuración");
		}
	}

	addDynamicTooltipToElement(element, textCallback) {
		if (!window.tooltipManager) {
			this.initializeTooltipManager();
		}

		element.addEventListener("mouseenter", (e) => {
			const text =
				typeof textCallback === "function" ? textCallback() : textCallback;
			window.tooltipManager.showTooltip(element, text);
		});

		element.addEventListener("mouseleave", (e) => {
			window.tooltipManager.hideTooltip(element);
		});

		const observer = new MutationObserver((mutations) => {
			for (const mutation of mutations) {
				if (
					mutation.type === "childList" &&
					Array.from(mutation.removedNodes).some(
						(node) =>
							node === element || (node.contains && node.contains(element))
					)
				) {
					window.tooltipManager.hideTooltip(element);
					observer.disconnect();
				}
			}
		});

		if (element.parentNode) {
			observer.observe(element.parentNode, { childList: true, subtree: true });
		}
	}

	initializeCloseGameButton() {
		if (!document.querySelector(".force-close-button")) {
			const progressBar = document.querySelector(".progress-bar");
			const parentElement = progressBar.parentElement;

			const closeGameButton = document.createElement("div");
			closeGameButton.className = "force-close-button";
			closeGameButton.innerHTML = "Cerrar Juego";
			closeGameButton.style.display = "none";

			closeGameButton.addEventListener("click", () => this.closeRunningGame());

			parentElement.insertBefore(closeGameButton, progressBar.nextSibling);
		}
	}

	closeRunningGame() {
		if (!playing) {
			console.warn("No hay juego en ejecución para cerrar");
			return;
		}

		try {
			const closeGamePopup = new popup();
			closeGamePopup.openDialog({
				title: "Cerrar juego",
				content:
					"¿Estás seguro de que quieres cerrar el juego actual? Se perderá todo progreso no guardado.",
				options: true,
				callback: async (result) => {
					if (result === "cancel") {
						return;
					}

					try {
						console.log("Intentando cerrar el proceso de Minecraft...");
						closeGamePopup.openPopup({
							title: "Cerrando juego...",
							content: "Por favor, espera mientras se cierra el juego.",
							color: "var(--color)",
							options: false,
						});
						const killed = await killMinecraftProcess();
						closeGamePopup.closePopup();

						if (killed) {
							console.log("Proceso de Minecraft terminado correctamente");

							const successPopup = new popup();
							successPopup.openPopup({
								title: "Juego cerrado",
								content: "El juego se ha cerrado correctamente.",
								color: "var(--color)",
								options: true,
							});
						} else {
							console.error("No se pudo terminar el proceso de Minecraft");

							const errorPopup = new popup();
							errorPopup.openPopup({
								title: "Error",
								content:
									"No se pudo cerrar el juego. Por favor, ciérralo manualmente.",
								color: "red",
								options: true,
							});
						}
					} catch (err) {
						console.error("Error al intentar cerrar el juego:", err);

						const errorPopup = new popup();
						errorPopup.openPopup({
							title: "Error",
							content:
								"No se pudo cerrar el juego. Intenta cerrarlo manualmente.",
							color: "red",
							options: true,
						});
					}
				},
			});
		} catch (error) {
			console.error("Error al intentar cerrar el juego:", error);
		}
	}

	// Función para ejecutar diagnósticos del sistema
	async runSystemDiagnostics() {
		try {
			console.log("Iniciando diagnósticos del sistema...");
			
			// Mostrar popup de carga
			let diagnosticsPopup = new popup();
			diagnosticsPopup.openPopup({
				title: "Ejecutando Diagnósticos",
				content: "Analizando el sistema, por favor espera...",
				color: "var(--color)",
				background: false,
			});

			// Ejecutar diagnósticos
			const diagnosticsResult = await ipcRenderer.invoke('run-diagnostics');
			
			if (!diagnosticsResult.success) {
				throw new Error(diagnosticsResult.error);
			}

			const diag = diagnosticsResult.diagnostics;
			
			// Preparar reporte de diagnósticos
			let report = `REPORTE DE DIAGNÓSTICOS
Fecha: ${new Date(diag.timestamp).toLocaleString()}

SISTEMA:
• Plataforma: ${diag.system.platform}
• Arquitectura: ${diag.system.arch}
• Node.js: ${diag.system.nodeVersion}
• Electron: ${diag.system.electronVersion}

MEMORIA:
• Total: ${(diag.memory.total / 1024 / 1024 / 1024).toFixed(1)} GB
• Libre: ${(diag.memory.free / 1024 / 1024 / 1024).toFixed(1)} GB
• Usado por launcher: ${(diag.memory.used.rss / 1024 / 1024).toFixed(1)} MB

DIRECTORIOS:
• App Data: ${diag.directories.appData.exists ? '✓' : '✗'} ${diag.directories.appData.writable ? '(Escribible)' : '(Solo lectura)'}
• User Data: ${diag.directories.userData.exists ? '✓' : '✗'} ${diag.directories.userData.writable ? '(Escribible)' : '(Solo lectura)'}

JAVA:
${diag.java.available ? `✓ Disponible: ${diag.java.version}` : `✗ No disponible: ${diag.java.error}`}

CONECTIVIDAD:`;

			if (diag.connectivity) {
				for (const [url, result] of Object.entries(diag.connectivity)) {
					if (url !== 'error') {
						report += `\n• ${url}: ${result.accessible ? '✓' : '✗'} (${result.status})`;
					}
				}
			}

			// Identificar problemas y sugerencias
			let issues = [];
			let suggestions = [];

			if (!diag.directories.appData.writable || !diag.directories.userData.writable) {
				issues.push("Problemas de permisos de escritura");
				suggestions.push("Ejecuta el launcher como administrador");
			}

			if (!diag.java.available) {
				issues.push("Java no está disponible");
				suggestions.push("Instala Java desde https://adoptium.net/");
			}

			if (diag.connectivity && Object.values(diag.connectivity).some(c => !c.accessible)) {
				issues.push("Problemas de conectividad");
				suggestions.push("Verifica tu conexión a internet y firewall");
			}

			if ((diag.memory.free / diag.memory.total) < 0.1) {
				issues.push("Poca memoria libre en el sistema");
				suggestions.push("Cierra programas innecesarios o añade más RAM");
			}

			if (issues.length > 0) {
				report += `\n\nPROBLEMAS DETECTADOS:
${issues.map(issue => `• ${issue}`).join('\n')}

SUGERENCIAS:
${suggestions.map(suggestion => `• ${suggestion}`).join('\n')}`;
			} else {
				report += `\n\n✓ No se detectaron problemas importantes`;
			}

			// Cerrar popup de carga y mostrar resultados
			diagnosticsPopup.closePopup();

			let resultsPopup = new popup();
			resultsPopup.openPopup({
				title: issues.length > 0 ? `Diagnósticos (${issues.length} problema(s))` : "Diagnósticos - Sistema OK",
				content: report,
				color: issues.length > 0 ? "orange" : "green",
				options: true,
			});

			return { success: true, issues: issues.length, report };

		} catch (error) {
			console.error("Error en diagnósticos:", error);
			
			let errorPopup = new popup();
			errorPopup.openPopup({
				title: "Error en Diagnósticos",
				content: `No se pudieron ejecutar los diagnósticos del sistema:\n\n${error.message}`,
				color: "red",
				options: true,
			});

			return { success: false, error: error.message };
		}
	}

	// Función para limpiar caché del sistema
	async cleanSystemCache() {
		try {
			console.log("Iniciando limpieza de caché...");
			
			// Mostrar popup de confirmación
			let confirmPopup = new popup();
			const confirmed = await new Promise(resolve => {
				confirmPopup.openDialog({
					title: "Limpiar Caché del Sistema",
					content: `Esta acción eliminará:
• Caché de Electron
• Caché de GPU
• Archivos temporales del launcher

Esto puede mejorar el rendimiento pero requerirá descargar algunos archivos nuevamente.

¿Continuar?`,
					options: true,
					acceptText: "Limpiar",
					cancelText: "Cancelar",
					callback: resolve
				});
			});

			if (confirmed !== 'accept') {
				return { success: false, cancelled: true };
			}

			// Mostrar progreso
			let progressPopup = new popup();
			progressPopup.openPopup({
				title: "Limpiando Caché",
				content: "Eliminando archivos temporales...",
				color: "var(--color)",
				background: false,
			});

			// Ejecutar limpieza
			const cleanupResult = await ipcRenderer.invoke('cleanup-cache', {
				cleanLogs: true
			});

			progressPopup.closePopup();

			if (!cleanupResult.success) {
				throw new Error(cleanupResult.error);
			}

			const results = cleanupResult.results;
			const totalSizeMB = (results.totalSize / 1024 / 1024).toFixed(1);
			
			let report = `LIMPIEZA COMPLETADA

Archivos eliminados: ${results.cleaned.length}
Espacio liberado: ${totalSizeMB} MB

DETALLES:`;

			results.cleaned.forEach(item => {
				const sizeMB = (item.size / 1024 / 1024).toFixed(1);
				report += `\n• ${path.basename(item.path)}: ${sizeMB} MB`;
			});

			if (results.errors.length > 0) {
				report += `\n\nERRORES:`;
				results.errors.forEach(error => {
					report += `\n• ${path.basename(error.path)}: ${error.error}`;
				});
			}

			let resultsPopup = new popup();
			resultsPopup.openPopup({
				title: "Limpieza Completada",
				content: report,
				color: "green",
				options: true,
			});

			return { success: true, results };

		} catch (error) {
			console.error("Error en limpieza de caché:", error);
			
			let errorPopup = new popup();
			errorPopup.openPopup({
				title: "Error en Limpieza",
				content: `No se pudo completar la limpieza de caché:\n\n${error.message}`,
				color: "red",
				options: true,
			});

			return { success: false, error: error.message };
		}
	}
}
export default Home;
