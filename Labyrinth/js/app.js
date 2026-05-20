import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { construirMundo } from './Labyrinth.js';
import { getPlayerPosition, initPlayer, updatePlayer } from './Player.js?v=7';

let camera, scene, renderer, mapData, bgMusic;

let gameStarted = false;
let isUIOpen = false;
let doorOpened = false;
let successTriggered = false;
let alertTimeout;

const clock = new THREE.Clock();

let currentPin = '';
let sfxPin, sfxError, sfxSuccess;

init();

function init() {
    THREE.DefaultLoadingManager.onProgress = function (url, itemsLoaded, itemsTotal) {
        const progress = (itemsLoaded / itemsTotal) * 100;

        const progressBar = document.getElementById('progress-bar');
        const loadingText = document.getElementById('loading-text');

        if (progressBar) {
            progressBar.style.width = progress + '%';
        }

        if (loadingText) {
            loadingText.innerText = Math.floor(progress) + '%';
        }
    };

    THREE.DefaultLoadingManager.onLoad = function () {
        const loadingScreen = document.getElementById('loading-screen');
        const startScreen = document.getElementById('start-screen');

        if (loadingScreen) {
            loadingScreen.style.display = 'none';
        }

        if (startScreen) {
            startScreen.style.display = 'flex';
        }
    };

    const startBtn = document.getElementById('start-btn');

    if (startBtn) {
        startBtn.addEventListener('click', () => {
            const startScreen = document.getElementById('start-screen');

            if (startScreen) {
                startScreen.style.display = 'none';
            }

            if (bgMusic && bgMusic.buffer && !bgMusic.isPlaying) {
                bgMusic.play();
            }

            gameStarted = true;
        });
    }

    document.addEventListener('keydown', (event) => {
        if (!gameStarted || doorOpened) return;

        if (event.key.toLowerCase() === 'e' && !isUIOpen) {
            const playerPos = getPlayerPosition();

            if (
                mapData.pinpadObj &&
                playerPos.distanceTo(mapData.pinpadObj.position) < 250
            ) {
                abrirPinpad();
            } else if (
                mapData.escapeDoor &&
                playerPos.distanceTo(mapData.escapeDoor.position) < 250
            ) {
                mostrarAlertaPuerta();
            }
        }

        if (event.key === 'Escape' && isUIOpen) {
            cerrarPinpad();
        }
    });

    const pinpadClose = document.getElementById('pinpad-close');

    if (pinpadClose) {
        pinpadClose.addEventListener('click', cerrarPinpad);
    }

    const botones = document.querySelectorAll('.pinpad-btn:not(.action-btn)');

    botones.forEach((btn) => {
        btn.addEventListener('click', (e) => {
            const numero = e.target.innerText;

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
        pinpadEnter.addEventListener('click', () => {
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
        });
    }

    scene = new THREE.Scene();

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

    document.body.appendChild(VRButton.createButton(renderer));

    const gameContainer = document.getElementById('game-container');

    if (gameContainer) {
        gameContainer.appendChild(renderer.domElement);
    } else {
        document.body.appendChild(renderer.domElement);
    }

    const catalogoCielos = [
        'assets/sky/sky_1.hdr',
        'assets/sky/sky_2.hdr',
        'assets/sky/sky_3.hdr',
        'assets/sky/sky_4.hdr'
    ];

    const cieloElegido = catalogoCielos[
        Math.floor(Math.random() * catalogoCielos.length)
    ];

    const rgbeLoader = new RGBELoader(THREE.DefaultLoadingManager);

    rgbeLoader.load(cieloElegido, (texture) => {
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
    });

    const ambient = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffffff, 1.5);
    sun.position.set(500, 1000, 250);
    sun.castShadow = true;
    scene.add(sun);

    const listener = new THREE.AudioListener();
    camera.add(listener);

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

    const audioLoader = new THREE.AudioLoader();

    audioLoader.load(pistaElegida, (buffer) => {
        bgMusic.setBuffer(buffer);
        bgMusic.setLoop(true);
        bgMusic.setVolume(0.4);
    });

    const portalSoundB = new THREE.Audio(listener);
    const portalSoundP = new THREE.Audio(listener);

    sfxPin = new THREE.Audio(listener);
    sfxError = new THREE.Audio(listener);
    sfxSuccess = new THREE.Audio(listener);

    audioLoader.load('assets/affects/portal_b.wav', (buffer) => {
        portalSoundB.setBuffer(buffer);
        portalSoundB.setVolume(0.8);
    });

    audioLoader.load('assets/affects/portal_p.wav', (buffer) => {
        portalSoundP.setBuffer(buffer);
        portalSoundP.setVolume(0.8);
    });

    audioLoader.load('assets/affects/pin.wav', (buffer) => {
        sfxPin.setBuffer(buffer);
        sfxPin.setVolume(1.0);
    });

    audioLoader.load('assets/affects/error.wav', (buffer) => {
        sfxError.setBuffer(buffer);
        sfxError.setVolume(1.0);
    });

    audioLoader.load('assets/affects/pinpad.wav', (buffer) => {
        sfxSuccess.setBuffer(buffer);
        sfxSuccess.setVolume(1.0);
    });

    mapData = construirMundo(scene);

    mapData.sfxPortalB = portalSoundB;
    mapData.sfxPortalP = portalSoundP;

    initPlayer(scene, mapData.spawnPosition, renderer, camera);

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();

        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    renderer.setAnimationLoop(animate);
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
    }
}

function cerrarPinpad() {
    isUIOpen = false;

    const pinpadUI = document.getElementById('pinpad-ui');

    if (pinpadUI) {
        pinpadUI.style.display = 'none';
    }
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
        alerta.style.display = 'block';

        clearTimeout(alertTimeout);

        alertTimeout = setTimeout(() => {
            alerta.style.display = 'none';
        }, 3000);
    }
}

function animate() {
    const delta = clock.getDelta();

    if (mapData && gameStarted) {
        updatePlayer(delta, camera, mapData, renderer, isUIOpen);

        const playerPos = getPlayerPosition();

        if (!isUIOpen && !doorOpened) {
            const cercaDePinpad =
                mapData.pinpadObj &&
                playerPos.distanceTo(mapData.pinpadObj.position) < 250;

            const cercaDePuerta =
                mapData.escapeDoor &&
                playerPos.distanceTo(mapData.escapeDoor.position) < 250;

            const prompt = document.getElementById('interact-prompt');

            if (prompt) {
                prompt.style.display =
                    cercaDePinpad || cercaDePuerta ? 'block' : 'none';
            }
        } else {
            const prompt = document.getElementById('interact-prompt');

            if (prompt) {
                prompt.style.display = 'none';
            }
        }

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
                }
            }
        }
    }

    renderer.render(scene, camera);
}