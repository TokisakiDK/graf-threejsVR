import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { construirMundo } from './Labyrinth.js';
import { initPlayer, updatePlayer } from './Player.js';

let camera, scene, renderer, mapData, bgMusic;
let gameStarted = false; 
let isUIOpen = false;
let doorOpened = false;
let successTriggered = false;
let alertTimeout; 
const clock = new THREE.Clock();

let currentPin = "";
let sfxPin, sfxError, sfxSuccess; 

init();

function init() {
    THREE.DefaultLoadingManager.onProgress = function (url, itemsLoaded, itemsTotal) {
        const progress = (itemsLoaded / itemsTotal) * 100;
        document.getElementById('progress-bar').style.width = progress + '%';
        document.getElementById('loading-text').innerText = Math.floor(progress) + '%';
    };

    THREE.DefaultLoadingManager.onLoad = function () {
        document.getElementById('loading-screen').style.display = 'none';
        document.getElementById('start-screen').style.display = 'flex';
    };

    document.getElementById('start-btn').addEventListener('click', () => {
        document.getElementById('start-screen').style.display = 'none';
        if (bgMusic && bgMusic.buffer) bgMusic.play();
        gameStarted = true; 
    });

    document.addEventListener('keydown', (event) => {
        if (!gameStarted || doorOpened) return;
        
        if (event.key.toLowerCase() === 'e' && !isUIOpen) {
            if (mapData.pinpadObj && camera.position.distanceTo(mapData.pinpadObj.position) < 250) {
                abrirPinpad();
            }
            else if (mapData.escapeDoor && camera.position.distanceTo(mapData.escapeDoor.position) < 250) {
                mostrarAlertaPuerta();
            }
        }
        
        if (event.key === 'Escape' && isUIOpen) {
            cerrarPinpad();
        }
    });

    document.getElementById('pinpad-close').addEventListener('click', cerrarPinpad);

    const botones = document.querySelectorAll('.pinpad-btn:not(.action-btn)');
    botones.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const numero = e.target.innerText;
            if (numero !== 'C' && numero !== 'E' && currentPin.length < 4) {
                currentPin += numero;
                actualizarPantallaPinpad();
                reproducirSonido(sfxPin);
            }
        });
    });

    document.getElementById('pinpad-clear').addEventListener('click', () => {
        currentPin = "";
        actualizarPantallaPinpad();
        reproducirSonido(sfxPin); 
        const msg = document.getElementById('pinpad-msg');
        msg.innerText = "INTRODUCE EL PIN";
        msg.style.color = "#a0a0b0";
    });

    document.getElementById('pinpad-enter').addEventListener('click', () => {
        const correcta = mapData.codigoSecreto.join('');
        const msg = document.getElementById('pinpad-msg');

        if (currentPin === correcta) {
            msg.innerText = "CÓDIGO ACEPTADO";
            msg.style.color = "#4ade80"; 
            
            reproducirSonido(sfxSuccess);
            
            setTimeout(() => {
                cerrarPinpad();
                if (mapData.escapeDoor) mapData.escapeDoor.visible = false;
                
                if (mapData.doorGridIndex) {
                    mapData.grid[mapData.doorGridIndex.r][mapData.doorGridIndex.c] = 0;
                }
                
                if (mapData.doorBarrier) {
                    const index = mapData.obstacles.indexOf(mapData.doorBarrier);
                    if (index > -1) mapData.obstacles.splice(index, 1);
                }
                doorOpened = true;
            }, 1000); 

        } else {
            msg.innerText = "ERROR CAPA 8"; 
            msg.style.color = "#ff2a5f"; 
            currentPin = ""; 
            actualizarPantallaPinpad();
            reproducirSonido(sfxError);
        }
    });

    scene = new THREE.Scene(); 
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 5000);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    
    renderer.xr.enabled = true;
    document.body.appendChild(VRButton.createButton(renderer));

    document.getElementById('game-container').appendChild(renderer.domElement);

    // --- CARGADOR DE CIELOS HDR ---
    const catalogoCielos = [
        'assets/sky/sky_1.hdr',
        'assets/sky/sky_2.hdr',
        'assets/sky/sky_3.hdr',
        'assets/sky/sky_4.hdr'
    ];
    const cieloElegido = catalogoCielos[Math.floor(Math.random() * catalogoCielos.length)];

    const rgbeLoader = new RGBELoader(THREE.DefaultLoadingManager);
    rgbeLoader.load(cieloElegido, (texture) => {
        texture.mapping = THREE.EquirectangularReflectionMapping;
        scene.background = texture; // Mantiene el cielo visualmente
        
        const skyGeo = new THREE.SphereGeometry(4000, 32, 32);
        const skyMat = new THREE.MeshBasicMaterial({ 
            map: texture, 
            side: THREE.BackSide 
        });
        const skySphere = new THREE.Mesh(skyGeo, skyMat);
        scene.add(skySphere);
    });

    // Luces
    const ambient = new THREE.AmbientLight(0xffffff, 0.8); scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xffffff, 1.5); 
    sun.position.set(500, 1000, 250); sun.castShadow = true;
    scene.add(sun);

    const listener = new THREE.AudioListener(); 
    camera.add(listener);

    const catalogoAudio = [
        'assets/bgm/dreamcore.wav',
        'assets/bgm/dreamcore_2.wav',
        'assets/bgm/dreamcore_3.wav',
        'assets/bgm/dreamcore_4.wav'
    ];
    const pistaElegida = catalogoAudio[Math.floor(Math.random() * catalogoAudio.length)];
    
    bgMusic = new THREE.Audio(listener);
    const audioLoader = new THREE.AudioLoader();

    audioLoader.load(pistaElegida, (b) => { 
        bgMusic.setBuffer(b); 
        bgMusic.setLoop(true); 
        bgMusic.setVolume(0.4); 
    });

    const portalSoundB = new THREE.Audio(listener);
    const portalSoundP = new THREE.Audio(listener);
    sfxPin = new THREE.Audio(listener);
    sfxError = new THREE.Audio(listener);
    sfxSuccess = new THREE.Audio(listener); 

    audioLoader.load('assets/affects/portal_b.wav', (b) => { portalSoundB.setBuffer(b); portalSoundB.setVolume(0.8); });
    audioLoader.load('assets/affects/portal_p.wav', (b) => { portalSoundP.setBuffer(b); portalSoundP.setVolume(0.8); });
    audioLoader.load('assets/affects/pin.wav', (b) => { sfxPin.setBuffer(b); sfxPin.setVolume(1.0); });
    audioLoader.load('assets/affects/error.wav', (b) => { sfxError.setBuffer(b); sfxError.setVolume(1.0); });
    audioLoader.load('assets/affects/pinpad.wav', (b) => { sfxSuccess.setBuffer(b); sfxSuccess.setVolume(1.0); });

    mapData = construirMundo(scene);
    
    mapData.sfxPortalB = portalSoundB;
    mapData.sfxPortalP = portalSoundP;

    initPlayer(scene, mapData.spawnPosition, renderer, camera); // Pasamos también la cámara para rig VR


    window.addEventListener('resize', () => { 
        camera.aspect = window.innerWidth / window.innerHeight; 
        camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); 
    });
    
    renderer.setAnimationLoop(animate);
}

function reproducirSonido(audioObject) {
    if (audioObject && audioObject.buffer) {
        if (audioObject.isPlaying) audioObject.stop();
        audioObject.play();
    }
}

function abrirPinpad() {
    isUIOpen = true;
    currentPin = "";
    actualizarPantallaPinpad();
    document.getElementById('pinpad-msg').innerText = "INTRODUCE EL PIN";
    document.getElementById('pinpad-msg').style.color = "#a0a0b0";
    document.getElementById('interact-prompt').style.display = 'none';
    document.getElementById('pinpad-ui').style.display = 'flex';
}

function cerrarPinpad() {
    isUIOpen = false;
    document.getElementById('pinpad-ui').style.display = 'none';
}

function actualizarPantallaPinpad() {
    const displayStr = currentPin.padEnd(4, '-');
    document.getElementById('pinpad-screen').innerText = displayStr;
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
        updatePlayer(delta, camera, mapData, renderer); // Pasamos renderer para detectar VR
        if (!isUIOpen && !successTriggered) updatePlayer(delta, camera, mapData, renderer);


        if (!isUIOpen && !doorOpened) {
            let cercaDePinpad = mapData.pinpadObj && camera.position.distanceTo(mapData.pinpadObj.position) < 250;
            let cercaDePuerta = mapData.escapeDoor && camera.position.distanceTo(mapData.escapeDoor.position) < 250;
            
            const prompt = document.getElementById('interact-prompt');
            if (prompt) {
                prompt.style.display = (cercaDePinpad || cercaDePuerta) ? 'block' : 'none';
            }
        } else {
            const prompt = document.getElementById('interact-prompt');
            if(prompt) prompt.style.display = 'none';
        }

        if (doorOpened && !successTriggered) {
            const distToExit = Math.hypot(camera.position.x - mapData.doorPos.x, camera.position.z - mapData.doorPos.z);
            if (distToExit < 200) {
                successTriggered = true;
                document.getElementById('success-screen').style.display = 'flex';
            }
        }
    }
    
    renderer.render(scene, camera);
}