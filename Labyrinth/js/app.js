import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';

import { construirMundo, iniciarVideosLaberinto } from './Labyrinth.js?v=30';

import {
    consumeVRConfirmPressed,
    consumeVRInteractPressed,
    getPlayerPosition,
    getVRNavAxes,
    initPlayer,
    updatePlayer
} from './Player.js?v=30';

let camera, scene, renderer, mapData, bgMusic;

let gameStarted = false;
let isUIOpen = false;
let doorOpened = false;
let successTriggered = false;
let alertTimeout;

const clock = new THREE.Clock();

let currentPin = '';
let sfxPin, sfxError, sfxSuccess;

let selectedPinpadIndex = 0;
let vrNavCooldown = 0;

init();

function init() {
    prepararPantallaCargaSegura();
    injectVRPinpadStyle();

    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0xdbeafe, 0.00032);

    camera = new THREE.PerspectiveCamera(
        60,
        window.innerWidth / window.innerHeight,
        1,
        5000
    );

    renderer = new THREE.WebGLRenderer({
        antialias: true
    });

    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);

    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;

    renderer.xr.enabled = true;

    document.body.appendChild(
        VRButton.createButton(renderer, {
            optionalFeatures: [
                'local-floor',
                'bounded-floor',
                'dom-overlay'
            ],
            domOverlay: {
                root: document.body
            }
        })
    );

    const gameContainer = document.getElementById('game-container');

    if (gameContainer) {
        gameContainer.appendChild(renderer.domElement);
    } else {
        document.body.appendChild(renderer.domElement);
    }

    cargarCielo();
    crearLuces();
    crearAudio();

    mapData = construirMundo(scene);

    console.log('Mapa cargado:', mapData.mapName);
    console.log('Código secreto:', mapData.codigoSecreto.join(''));

    initPlayer(scene, mapData.spawnPosition, renderer, camera);

    configurarInicio();
    configurarTeclado();
    configurarPinpad();

    window.addEventListener('resize', onWindowResize);

    renderer.xr.addEventListener('sessionstart', () => {
        iniciarVideosLaberinto();
    });

    renderer.setAnimationLoop(animate);

    mostrarPantallaInicio();
}

function prepararPantallaCargaSegura() {
    THREE.DefaultLoadingManager.onProgress = function (url, itemsLoaded, itemsTotal) {
        const progress = itemsTotal > 0 ? (itemsLoaded / itemsTotal) * 100 : 100;

        const progressBar = document.getElementById('progress-bar');
        const loadingText = document.getElementById('loading-text');

        if (progressBar) {
            progressBar.style.width = Math.min(progress, 100) + '%';
        }

        if (loadingText) {
            loadingText.innerText = Math.floor(Math.min(progress, 100)) + '%';
        }
    };

    THREE.DefaultLoadingManager.onError = function (url) {
        console.warn('No se pudo cargar un recurso, pero el juego continuará:', url);
    };
}

function mostrarPantallaInicio() {
    const loadingScreen = document.getElementById('loading-screen');
    const startScreen = document.getElementById('start-screen');

    if (loadingScreen) {
        loadingScreen.style.display = 'none';
    }

    if (startScreen) {
        startScreen.style.display = 'flex';
    }
}

function configurarInicio() {
    const startBtn = document.getElementById('start-btn');

    if (!startBtn) return;

    startBtn.addEventListener('click', () => {
        const startScreen = document.getElementById('start-screen');

        if (startScreen) {
            startScreen.style.display = 'none';
        }

        iniciarVideosLaberinto();

        if (bgMusic && bgMusic.buffer && !bgMusic.isPlaying) {
            bgMusic.play();
        }

        gameStarted = true;
    });
}

function configurarTeclado() {
    document.addEventListener('keydown', (event) => {
        if (!gameStarted || doorOpened) return;

        if (event.key.toLowerCase() === 'e' && !isUIOpen) {
            intentarInteractuar();
        }

        if (event.key === 'Escape' && isUIOpen) {
            cerrarPinpad();
        }
    });
}

function configurarPinpad() {
    const pinpadClose = document.getElementById('pinpad-close');

    if (pinpadClose) {
        pinpadClose.addEventListener('click', cerrarPinpad);
    }

    const botones = document.querySelectorAll('.pinpad-btn:not(.action-btn)');

    botones.forEach((btn) => {
        btn.addEventListener('click', (e) => {
            const numero = e.target.innerText.trim();

            if (numero !== 'C' && numero !== 'E' && currentPin.length < 4) {
                currentPin += numero;
                actualizarPantallaPinpad();
                reproducirSonido(sfxPin);
            }
        });
    });

    const pinpadClear = document.getElementById('pinpad-clear');

    if (pinpadClear) {
        pinpadClear.addEventListener('click', () => {
            currentPin = '';
            actualizarPantallaPinpad();
            reproducirSonido(sfxPin);

            const msg = document.getElementById('pinpad-msg');

            if (msg) {
                msg.innerText = 'INTRODUCE EL PIN';
                msg.style.color = '#a0a0b0';
            }
        });
    }

    const pinpadEnter = document.getElementById('pinpad-enter');

    if (pinpadEnter) {
        pinpadEnter.addEventListener('click', validarCodigoPinpad);
    }
}

function cargarCielo() {
    const catalogoCielos = [
        'assets/sky/sky_1.hdr',
        'assets/sky/sky_2.hdr',
        'assets/sky/sky_3.hdr',
        'assets/sky/sky_4.hdr'
    ];

    const cieloElegido = catalogoCielos[
        Math.floor(Math.random() * catalogoCielos.length)
    ];

    const rgbeLoader = new RGBELoader();

    rgbeLoader.load(
        cieloElegido,
        (texture) => {
            texture.mapping = THREE.EquirectangularReflectionMapping;

            scene.background = texture;
            scene.environment = texture;

            const skyGeo = new THREE.SphereGeometry(4000, 32, 32);

            const skyMat = new THREE.MeshBasicMaterial({
                map: texture,
                side: THREE.BackSide
            });

            const skySphere = new THREE.Mesh(skyGeo, skyMat);
            scene.add(skySphere);
        },
        undefined,
        (error) => {
            console.warn('No se pudo cargar el HDR, usando color de fondo.', error);
            scene.background = new THREE.Color(0xdbeafe);
        }
    );
}

function crearLuces() {
    const ambient = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffffff, 1.5);
    sun.position.set(500, 1000, 250);
    sun.castShadow = true;
    scene.add(sun);
}

function crearAudio() {
    const listener = new THREE.AudioListener();
    camera.add(listener);

    const audioLoader = new THREE.AudioLoader();

    const catalogoAudio = [
        'assets/bgm/dreamcore.wav',
        'assets/bgm/dreamcore_2.wav',
        'assets/bgm/dreamcore_3.wav',
        'assets/bgm/dreamcore_4.wav'
    ];

    const pistaElegida = catalogoAudio[
        Math.floor(Math.random() * catalogoAudio.length)
    ];

    bgMusic = new THREE.Audio(listener);

    audioLoader.load(
        pistaElegida,
        (buffer) => {
            bgMusic.setBuffer(buffer);
            bgMusic.setLoop(true);
            bgMusic.setVolume(0.4);
        },
        undefined,
        () => {
            console.warn('No se pudo cargar música de fondo.');
        }
    );

    const portalSoundB = new THREE.Audio(listener);
    const portalSoundP = new THREE.Audio(listener);

    sfxPin = new THREE.Audio(listener);
    sfxError = new THREE.Audio(listener);
    sfxSuccess = new THREE.Audio(listener);

    cargarSFX(audioLoader, portalSoundB, 'assets/affects/portal_b.wav', 0.8);
    cargarSFX(audioLoader, portalSoundP, 'assets/affects/portal_p.wav', 0.8);
    cargarSFX(audioLoader, sfxPin, 'assets/affects/pin.wav', 1.0);
    cargarSFX(audioLoader, sfxError, 'assets/affects/error.wav', 1.0);
    cargarSFX(audioLoader, sfxSuccess, 'assets/affects/pinpad.wav', 1.0);

    window.addEventListener('load', () => {
        if (mapData) {
            mapData.sfxPortalB = portalSoundB;
            mapData.sfxPortalP = portalSoundP;
        }
    });

    setTimeout(() => {
        if (mapData) {
            mapData.sfxPortalB = portalSoundB;
            mapData.sfxPortalP = portalSoundP;
        }
    }, 200);
}

function cargarSFX(loader, audioObject, ruta, volumen) {
    loader.load(
        ruta,
        (buffer) => {
            audioObject.setBuffer(buffer);
            audioObject.setVolume(volumen);
        },
        undefined,
        () => {
            console.warn('No se pudo cargar audio:', ruta);
        }
    );
}

function intentarInteractuar() {
    if (!mapData || doorOpened) return;

    const playerPos = getPlayerPosition();

    const cercaDePinpad =
        mapData.pinpadObj &&
        playerPos.distanceTo(mapData.pinpadObj.position) < 300;

    const cercaDePuerta =
        mapData.escapeDoor &&
        playerPos.distanceTo(mapData.escapeDoor.position) < 300;

    if (cercaDePinpad) {
        abrirPinpad();
        return;
    }

    if (cercaDePuerta) {
        mostrarAlertaPuerta();
    }
}

function validarCodigoPinpad() {
    if (!mapData) return;

    const correcta = mapData.codigoSecreto.join('');
    const msg = document.getElementById('pinpad-msg');

    if (!msg) return;

    if (currentPin === correcta) {
        msg.innerText = 'CÓDIGO ACEPTADO';
        msg.style.color = '#4ade80';

        reproducirSonido(sfxSuccess);

        setTimeout(() => {
            cerrarPinpad();

            if (mapData.escapeDoor) {
                mapData.escapeDoor.visible = false;
            }

            if (mapData.doorGridIndex) {
                mapData.grid[mapData.doorGridIndex.r][mapData.doorGridIndex.c] = 0;
            }

            if (mapData.doorBarrier) {
                const index = mapData.obstacles.indexOf(mapData.doorBarrier);

                if (index > -1) {
                    mapData.obstacles.splice(index, 1);
                }

                if (mapData.doorBarrier.parent) {
                    mapData.doorBarrier.parent.remove(mapData.doorBarrier);
                }
            }

            doorOpened = true;
        }, 1000);
    } else {
        msg.innerText = 'ERROR CAPA 8';
        msg.style.color = '#ff2a5f';

        currentPin = '';
        actualizarPantallaPinpad();
        reproducirSonido(sfxError);
    }
}

function reproducirSonido(audioObject) {
    if (audioObject && audioObject.buffer) {
        if (audioObject.isPlaying) {
            audioObject.stop();
        }

        audioObject.play();
    }
}

function abrirPinpad() {
    isUIOpen = true;
    currentPin = '';
    selectedPinpadIndex = 0;
    vrNavCooldown = 0;

    actualizarPantallaPinpad();

    const msg = document.getElementById('pinpad-msg');
    const prompt = document.getElementById('interact-prompt');
    const pinpadUI = document.getElementById('pinpad-ui');

    if (msg) {
        msg.innerText = 'INTRODUCE EL PIN';
        msg.style.color = '#a0a0b0';
    }

    if (prompt) {
        prompt.style.display = 'none';
    }

    if (pinpadUI) {
        pinpadUI.style.display = 'flex';
        pinpadUI.style.zIndex = '99999';
        pinpadUI.style.pointerEvents = 'auto';
    }

    actualizarSeleccionPinpadVR();
}

function cerrarPinpad() {
    isUIOpen = false;

    const pinpadUI = document.getElementById('pinpad-ui');

    if (pinpadUI) {
        pinpadUI.style.display = 'none';
    }

    limpiarSeleccionPinpadVR();
}

function actualizarPantallaPinpad() {
    const displayStr = currentPin.padEnd(4, '-');
    const screen = document.getElementById('pinpad-screen');

    if (screen) {
        screen.innerText = displayStr;
    }
}

function mostrarAlertaPuerta() {
    const alerta = document.getElementById('door-alert');

    if (alerta) {
        alerta.innerText = doorOpened
            ? 'PUERTA ABIERTA'
            : 'LA PUERTA ESTÁ BLOQUEADA. BUSCA EL PIN.';

        alerta.style.display = 'block';
        alerta.style.zIndex = '99999';

        clearTimeout(alertTimeout);

        alertTimeout = setTimeout(() => {
            alerta.style.display = 'none';
        }, 3000);
    }
}

function actualizarMensajeInteraccion() {
    if (!mapData || isUIOpen || doorOpened) {
        const prompt = document.getElementById('interact-prompt');

        if (prompt) {
            prompt.style.display = 'none';
        }

        return;
    }

    const playerPos = getPlayerPosition();

    const cercaDePinpad =
        mapData.pinpadObj &&
        playerPos.distanceTo(mapData.pinpadObj.position) < 300;

    const cercaDePuerta =
        mapData.escapeDoor &&
        playerPos.distanceTo(mapData.escapeDoor.position) < 300;

    const prompt = document.getElementById('interact-prompt');

    if (!prompt) return;

    if (cercaDePinpad) {
        prompt.innerText = 'GATILLO DERECHO / E: USAR PINPAD';
        prompt.style.display = 'block';
    } else if (cercaDePuerta) {
        prompt.innerText = 'GATILLO DERECHO / E: REVISAR PUERTA';
        prompt.style.display = 'block';
    } else {
        prompt.style.display = 'none';
    }
}

function getPinpadButtonsVR() {
    const numericButtons = Array.from(
        document.querySelectorAll('.pinpad-btn:not(.action-btn)')
    );

    const clearButton = document.getElementById('pinpad-clear');
    const enterButton = document.getElementById('pinpad-enter');

    const buttons = [];

    numericButtons.forEach((btn) => buttons.push(btn));

    if (clearButton) {
        buttons.push(clearButton);
    }

    if (enterButton) {
        buttons.push(enterButton);
    }

    return buttons;
}

function limpiarSeleccionPinpadVR() {
    const buttons = getPinpadButtonsVR();

    buttons.forEach((btn) => {
        btn.classList.remove('vr-pinpad-selected');
    });
}

function actualizarSeleccionPinpadVR() {
    const buttons = getPinpadButtonsVR();

    if (buttons.length === 0) return;

    if (selectedPinpadIndex < 0) {
        selectedPinpadIndex = 0;
    }

    if (selectedPinpadIndex >= buttons.length) {
        selectedPinpadIndex = buttons.length - 1;
    }

    buttons.forEach((btn, index) => {
        btn.classList.toggle('vr-pinpad-selected', index === selectedPinpadIndex);
    });

    const msg = document.getElementById('pinpad-msg');

    if (msg) {
        msg.innerText = 'STICK IZQ: MOVER | A: PRESIONAR';
        msg.style.color = '#a0a0b0';
    }
}

function actualizarPinpadVR(delta) {
    if (!isUIOpen) return;

    vrNavCooldown -= delta;

    const buttons = getPinpadButtonsVR();

    if (buttons.length === 0) return;

    const axes = getVRNavAxes();
    const cols = 3;

    if (vrNavCooldown <= 0) {
        if (axes.x > 0.55) {
            selectedPinpadIndex += 1;
            vrNavCooldown = 0.22;
        } else if (axes.x < -0.55) {
            selectedPinpadIndex -= 1;
            vrNavCooldown = 0.22;
        } else if (axes.y > 0.55) {
            selectedPinpadIndex += cols;
            vrNavCooldown = 0.22;
        } else if (axes.y < -0.55) {
            selectedPinpadIndex -= cols;
            vrNavCooldown = 0.22;
        }

        if (selectedPinpadIndex < 0) {
            selectedPinpadIndex = 0;
        }

        if (selectedPinpadIndex >= buttons.length) {
            selectedPinpadIndex = buttons.length - 1;
        }

        actualizarSeleccionPinpadVR();
    }

    if (consumeVRConfirmPressed()) {
        const selectedButton = buttons[selectedPinpadIndex];

        if (selectedButton) {
            selectedButton.click();
        }
    }
}

function injectVRPinpadStyle() {
    const style = document.createElement('style');

    style.innerHTML = `
        .vr-pinpad-selected {
            outline: 4px solid #38bdf8 !important;
            box-shadow: 0 0 18px #38bdf8 !important;
            transform: scale(1.08);
        }
    `;

    document.head.appendChild(style);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    const delta = clock.getDelta();

    if (mapData && gameStarted) {
        updatePlayer(delta, camera, mapData, renderer, isUIOpen);

        if (!isUIOpen && consumeVRInteractPressed()) {
            intentarInteractuar();
        }

        actualizarPinpadVR(delta);
        actualizarMensajeInteraccion();

        const playerPos = getPlayerPosition();

        if (doorOpened && !successTriggered) {
            const distToExit = Math.hypot(
                playerPos.x - mapData.doorPos.x,
                playerPos.z - mapData.doorPos.z
            );

            if (distToExit < 200) {
                successTriggered = true;

                const successScreen = document.getElementById('success-screen');

                if (successScreen) {
                    successScreen.style.display = 'flex';
                    successScreen.style.zIndex = '99999';
                }
            }
        }
    }

    renderer.render(scene, camera);
}