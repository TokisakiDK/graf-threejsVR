import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';

import { construirMundo } from './Labyrinth.js';
import { getPlayerPosition, initPlayer, updatePlayer } from './Player.js';

let camera, scene, renderer, mapData, bgMusic;
let gameStarted = false;
let isUIOpen = false;
let doorOpened = false;
let successTriggered = false;
let alertTimeout;

const clock = new THREE.Clock();

let currentPin = '';
let sfxPin, sfxError, sfxSuccess;

const vrPinpad = {
    group: null,
    buttons: [],
    open: false
};

let raycaster = new THREE.Raycaster();
let vrPrompt, vrSuccessPrompt;

init();

function init() {
    prepararPantallaCargaSegura();

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

    document.body.appendChild(VRButton.createButton(renderer, {
        optionalFeatures: ['local-floor', 'bounded-floor']
    }));

    const gameContainer = document.getElementById('game-container');
    if (gameContainer) gameContainer.appendChild(renderer.domElement);
    else document.body.appendChild(renderer.domElement);

    cargarCielo();
    crearLuces();
    crearAudio();

    mapData = construirMundo(scene);
    initPlayer(scene, mapData.spawnPosition, renderer, camera);

    crearPinpadVR3D();
    configurarControlesVR();
    
    // Prompts 3D para VR
    vrPrompt = crearTextoPlano('Gatillo: Interactuar', 380, 48, '#ffcc00');
    vrPrompt.scale.set(0.3, 0.3, 0.3);
    vrPrompt.visible = false;
    scene.add(vrPrompt);

    vrSuccessPrompt = crearTextoPlano('¡ESCAPASTE!', 400, 100, '#4ade80');
    vrSuccessPrompt.scale.set(0.5, 0.5, 0.5);
    vrSuccessPrompt.visible = false;
    scene.add(vrSuccessPrompt);

    configurarInicio();
    configurarTeclado();
    configurarPinpadHTML();

    renderer.xr.addEventListener('sessionstart', iniciarJuego);
    renderer.xr.addEventListener('sessionend', () => {
        cerrarPinpadVR();
        gameStarted = false;
        const startScreen = document.getElementById('start-screen');
        if (startScreen) startScreen.style.display = 'flex';
    });

    window.addEventListener('resize', onWindowResize);
    renderer.setAnimationLoop(animate);
    mostrarPantallaInicio();
}

function configurarControlesVR() {
    // Agregamos punteros láser a ambos mandos para interactuar con gatillos
    for (let i = 0; i < 2; i++) {
        const controller = renderer.xr.getController(i);
        controller.addEventListener('selectstart', onSelectStart);
        scene.add(controller);

        const geometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(0, 0, -300)
        ]);
        const material = new THREE.LineBasicMaterial({
            color: 0x38bdf8,
            transparent: true,
            opacity: 0.6
        });
        const line = new THREE.Line(geometry, material);
        controller.add(line);
    }
}

// LÓGICA DE INTERACCIÓN CON GATILLO (LÁSER)
function onSelectStart(event) {
    const controller = event.target;
    const tempMatrix = new THREE.Matrix4();
    tempMatrix.identity().extractRotation(controller.matrixWorld);
    raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

    // 1. Interacción con el Pinpad 3D
    if (vrPinpad.open && vrPinpad.group.visible) {
        const intersects = raycaster.intersectObjects(vrPinpad.buttons, true);
        if (intersects.length > 0) {
            let btn = intersects[0].object;
            while(btn.parent && !btn.userData.label) btn = btn.parent;
            if (btn.userData.label) presionarBotonPinpadVR(btn.userData.label);
        }
        return;
    }

    // 2. Interacción con el Mundo
    if (mapData.pinpadObj) {
        const intersects = raycaster.intersectObject(mapData.pinpadObj, true);
        if (intersects.length > 0 && intersects[0].distance < 300) {
            abrirPinpadVR();
            return;
        }
    }
    
    if (mapData.escapeDoor) {
        const intersects = raycaster.intersectObject(mapData.escapeDoor, true);
        if (intersects.length > 0 && intersects[0].distance < 300) {
            if (doorOpened) return;
            mostrarAlertaPuerta();
        }
    }
}

function prepararPantallaCargaSegura() {
    THREE.DefaultLoadingManager.onProgress = function (url, itemsLoaded, itemsTotal) {
        const progress = itemsTotal > 0 ? (itemsLoaded / itemsTotal) * 100 : 100;
        const progressBar = document.getElementById('progress-bar');
        const loadingText = document.getElementById('loading-text');
        if (progressBar) progressBar.style.width = Math.min(progress, 100) + '%';
        if (loadingText) loadingText.innerText = Math.floor(Math.min(progress, 100)) + '%';
    };
    THREE.DefaultLoadingManager.onError = function (url) {
        console.warn('Carga fallida en:', url);
    };
}

function mostrarPantallaInicio() {
    const loadingScreen = document.getElementById('loading-screen');
    const startScreen = document.getElementById('start-screen');
    if (loadingScreen) loadingScreen.style.display = 'none';
    if (startScreen) startScreen.style.display = 'flex';
}

function configurarInicio() {
    const startBtn = document.getElementById('start-btn');
    if (!startBtn) return;
    startBtn.addEventListener('click', () => {
        // Desbloqueo de AudioContext vital para GitHub Pages
        if (THREE.AudioContext.getContext().state !== 'running') {
            THREE.AudioContext.getContext().resume();
        }
        iniciarJuego();
    });
}

function iniciarJuego() {
    const startScreen = document.getElementById('start-screen');
    if (startScreen) startScreen.style.display = 'none';
    gameStarted = true;
    if (bgMusic && bgMusic.buffer && !bgMusic.isPlaying) bgMusic.play();
}

function cargarCielo() {
    const catalogoCielos = [
        'assets/sky/sky_1.hdr', 'assets/sky/sky_2.hdr', 'assets/sky/sky_3.hdr', 'assets/sky/sky_4.hdr'
    ];
    const cieloElegido = catalogoCielos[Math.floor(Math.random() * catalogoCielos.length)];
    const rgbeLoader = new RGBELoader(THREE.DefaultLoadingManager);
    
    rgbeLoader.load(
        cieloElegido,
        (texture) => {
            texture.mapping = THREE.EquirectangularReflectionMapping;
            scene.background = texture;
            const skyGeo = new THREE.SphereGeometry(4000, 32, 32);
            const skyMat = new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide });
            scene.add(new THREE.Mesh(skyGeo, skyMat));
        },
        undefined,
        () => { scene.background = new THREE.Color(0xdbeafe); }
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
    const audioLoader = new THREE.AudioLoader(THREE.DefaultLoadingManager);

    const catalogoAudio = [
        'assets/bgm/dreamcore.wav', 'assets/bgm/dreamcore_2.wav', 'assets/bgm/dreamcore_3.wav', 'assets/bgm/dreamcore_4.wav'
    ];
    const pistaElegida = catalogoAudio[Math.floor(Math.random() * catalogoAudio.length)];

    bgMusic = new THREE.Audio(listener);
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

    cargarSFX(audioLoader, portalSoundB, 'assets/affects/portal_b.wav', 0.8);
    cargarSFX(audioLoader, portalSoundP, 'assets/affects/portal_p.wav', 0.8);
    cargarSFX(audioLoader, sfxPin, 'assets/affects/pin.wav', 1.0);
    cargarSFX(audioLoader, sfxError, 'assets/affects/error.wav', 1.0);
    cargarSFX(audioLoader, sfxSuccess, 'assets/affects/pinpad.wav', 1.0);

    setTimeout(() => {
        if (mapData) {
            mapData.sfxPortalB = portalSoundB;
            mapData.sfxPortalP = portalSoundP;
        }
    }, 200);
}

function cargarSFX(loader, audioObject, ruta, volumen) {
    loader.load(ruta, (buffer) => {
        audioObject.setBuffer(buffer);
        audioObject.setVolume(volumen);
    });
}

function estaEnVR() {
    return renderer && renderer.xr && renderer.xr.isPresenting;
}

function reproducirSonido(audioObject) {
    if (audioObject && audioObject.buffer) {
        if (audioObject.isPlaying) audioObject.stop();
        audioObject.play();
    }
}

// ================= LÓGICA DE TECLADO / HTML ==================
function configurarTeclado() {
    document.addEventListener('keydown', (event) => {
        if (!gameStarted || doorOpened) return;
        if (event.key.toLowerCase() === 'e' && !isUIOpen) intentarInteractuar();
        if (event.key === 'Escape' && isUIOpen) {
            cerrarPinpadHTML();
            cerrarPinpadVR();
        }
    });
}

function configurarPinpadHTML() {
    document.getElementById('pinpad-close')?.addEventListener('click', cerrarPinpadHTML);
    const botones = document.querySelectorAll('.pinpad-btn:not(.action-btn)');
    botones.forEach((btn) => {
        btn.addEventListener('click', (e) => {
            const numero = e.target.innerText.trim();
            if (numero !== 'C' && numero !== 'E' && currentPin.length < 4) {
                currentPin += numero;
                actualizarPantallaPinpadHTML();
                reproducirSonido(sfxPin);
            }
        });
    });

    document.getElementById('pinpad-clear')?.addEventListener('click', () => {
        currentPin = '';
        actualizarPantallaPinpadHTML();
        reproducirSonido(sfxPin);
        const msg = document.getElementById('pinpad-msg');
        if (msg) { msg.innerText = 'INTRODUCE EL PIN'; msg.style.color = '#a0a0b0'; }
    });

    document.getElementById('pinpad-enter')?.addEventListener('click', validarCodigoPinpad);
}

function intentarInteractuar() {
    if (!mapData || doorOpened) return;
    const playerPos = getPlayerPosition();
    const pinpadPos = mapData.pinpadObj?.position;
    const puertaPos = mapData.escapeDoor?.position;

    if (pinpadPos && playerPos.distanceTo(pinpadPos) < 330) {
        estaEnVR() ? abrirPinpadVR() : abrirPinpadHTML();
        return;
    }
    if (puertaPos && playerPos.distanceTo(puertaPos) < 330) {
        mostrarAlertaPuerta();
    }
}

function abrirPinpadHTML() {
    isUIOpen = true; currentPin = '';
    actualizarPantallaPinpadHTML();
    const msg = document.getElementById('pinpad-msg');
    if (msg) { msg.innerText = 'INTRODUCE EL PIN'; msg.style.color = '#a0a0b0'; }
    document.getElementById('interact-prompt').style.display = 'none';
    document.getElementById('pinpad-ui').style.display = 'flex';
}

function cerrarPinpadHTML() {
    isUIOpen = false;
    document.getElementById('pinpad-ui').style.display = 'none';
}

function actualizarPantallaPinpadHTML() {
    const screen = document.getElementById('pinpad-screen');
    if (screen) screen.innerText = currentPin.padEnd(4, '-');
}

// ================= LÓGICA DE VR PINPAD ==================

function crearPinpadVR3D() {
    const group = new THREE.Group();
    group.name = 'VR_PINPAD_3D';
    group.visible = false;

    const panel = new THREE.Mesh(
        new THREE.PlaneGeometry(520, 620),
        new THREE.MeshBasicMaterial({ color: 0x050816, transparent: true, opacity: 0.94, side: THREE.DoubleSide })
    );
    panel.position.z = -2;
    group.add(panel);

    const title = crearTextoPlano('PINPAD', 180, 48, '#38bdf8');
    title.position.set(0, 250, 1);
    group.add(title);

    const screen = crearTextoPlano('----', 260, 64, '#ffffff');
    screen.name = 'VR_PINPAD_SCREEN';
    screen.position.set(0, 175, 1);
    group.add(screen);

    const message = crearTextoPlano('APUNTA CON GATILLO', 380, 34, '#a0a0b0');
    message.name = 'VR_PINPAD_MSG';
    message.position.set(0, 125, 1);
    group.add(message);

    const layout = [
        ['1', '2', '3'],
        ['4', '5', '6'],
        ['7', '8', '9'],
        ['C', '0', 'OK'],
        ['SALIR', 'CERRAR', '']
    ];

    vrPinpad.buttons = [];
    const startY = 55; const gapX = 145; const gapY = 82;

    for (let r = 0; r < layout.length; r++) {
        for (let c = 0; c < layout[r].length; c++) {
            if (!layout[r][c]) continue;
            const button = crearBotonVR(layout[r][c]);
            button.position.set((c - 1) * gapX, startY - r * gapY, 8);
            button.userData.label = layout[r][c];
            group.add(button);
            vrPinpad.buttons.push(button);
        }
    }
    scene.add(group);
    vrPinpad.group = group;
}

function crearBotonVR(label) {
    const group = new THREE.Group();
    const bg = new THREE.Mesh(
        new THREE.PlaneGeometry(label.length > 3 ? 128 : 110, 58),
        new THREE.MeshBasicMaterial({ color: 0x111827, transparent: true, opacity: 0.96, side: THREE.DoubleSide })
    );
    bg.name = 'BG';
    group.add(bg);
    const text = crearTextoPlano(label, label.length > 3 ? 120 : 90, 36, '#ffffff');
    text.position.z = 2;
    group.add(text);
    return group;
}

function crearTextoPlano(texto, width, height, color) {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = color;
    ctx.font = 'bold 64px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(texto, canvas.width / 2, canvas.height / 2);
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(width, height),
        new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide })
    );
    mesh.userData = { canvas, context: ctx, texture, color };
    return mesh;
}

function cambiarTextoPlano(mesh, texto, color = null) {
    if (!mesh || !mesh.userData.canvas) return;
    const { canvas, context: ctx, texture } = mesh.userData;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = color || mesh.userData.color || '#ffffff';
    ctx.font = 'bold 64px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(texto, canvas.width / 2, canvas.height / 2);
    texture.needsUpdate = true;
}

function abrirPinpadVR() {
    if (!vrPinpad.group) return;
    isUIOpen = true;
    vrPinpad.open = true;
    currentPin = '';

    const camPos = new THREE.Vector3();
    const camDir = new THREE.Vector3();
    camera.getWorldPosition(camPos);
    camera.getWorldDirection(camDir);
    camDir.y = 0; camDir.normalize();

    // Colocamos el pinpad más cerca (escala 0.15 a 120 unidades de distancia)
    const pos = camPos.clone().add(camDir.multiplyScalar(120));
    vrPinpad.group.position.set(pos.x, camPos.y - 10, pos.z);
    vrPinpad.group.lookAt(camPos);
    vrPinpad.group.rotation.y += Math.PI; 
    vrPinpad.group.scale.set(0.15, 0.15, 0.15); 
    
    vrPinpad.group.visible = true;

    actualizarPantallaPinpadVR();
    actualizarTextoPinpadVR('APUNTA CON EL LÁSER');
}

function cerrarPinpadVR() {
    isUIOpen = false;
    vrPinpad.open = false;
    if (vrPinpad.group) vrPinpad.group.visible = false;
}

function actualizarPantallaPinpadVR() {
    const screen = vrPinpad.group.getObjectByName('VR_PINPAD_SCREEN');
    if (screen) cambiarTextoPlano(screen, currentPin.padEnd(4, '-'), '#ffffff');
}

function actualizarTextoPinpadVR(texto) {
    const msg = vrPinpad.group.getObjectByName('VR_PINPAD_MSG');
    if (msg) cambiarTextoPlano(msg, texto, '#a0a0b0');
}

function presionarBotonPinpadVR(label) {
    reproducirSonido(sfxPin);
    if (/^[0-9]$/.test(label)) {
        if (currentPin.length < 4) {
            currentPin += label;
            actualizarPantallaPinpadVR();
        }
        return;
    }
    if (label === 'C') {
        currentPin = '';
        actualizarPantallaPinpadVR();
        actualizarTextoPinpadVR('APUNTA CON EL LÁSER');
        return;
    }
    if (label === 'OK') { validarCodigoPinpad(); return; }
    if (label === 'CERRAR') { cerrarPinpadVR(); return; }
    if (label === 'SALIR') {
        cerrarPinpadHTML(); cerrarPinpadVR();
        gameStarted = false;
        if (bgMusic && bgMusic.isPlaying) bgMusic.stop();
        renderer.xr.getSession()?.end();
        document.getElementById('start-screen').style.display = 'flex';
    }
}

function validarCodigoPinpad() {
    if (!mapData) return;
    const correcta = mapData.codigoSecreto.join('');

    if (currentPin === correcta) {
        reproducirSonido(sfxSuccess);
        abrirPuerta();

        if (estaEnVR()) {
            actualizarTextoPinpadVR('CÓDIGO ACEPTADO');
            setTimeout(cerrarPinpadVR, 900);
        } else {
            const msg = document.getElementById('pinpad-msg');
            if (msg) { msg.innerText = 'CÓDIGO ACEPTADO'; msg.style.color = '#4ade80'; }
            setTimeout(cerrarPinpadHTML, 900);
        }
    } else {
        currentPin = '';
        reproducirSonido(sfxError);

        if (estaEnVR()) {
            actualizarTextoPinpadVR('ERROR');
            actualizarPantallaPinpadVR();
        } else {
            const msg = document.getElementById('pinpad-msg');
            if (msg) { msg.innerText = 'ERROR CAPA 8'; msg.style.color = '#ff2a5f'; }
            actualizarPantallaPinpadHTML();
        }
    }
}

function abrirPuerta() {
    if (mapData.escapeDoor) mapData.escapeDoor.visible = false;
    if (mapData.doorGridIndex) mapData.grid[mapData.doorGridIndex.r][mapData.doorGridIndex.c] = 0;
    if (mapData.doorBarrier) {
        const index = mapData.obstacles.indexOf(mapData.doorBarrier);
        if (index > -1) mapData.obstacles.splice(index, 1);
        if (mapData.doorBarrier.parent) mapData.doorBarrier.parent.remove(mapData.doorBarrier);
    }
    doorOpened = true;
}

function mostrarAlertaPuerta() {
    if (estaEnVR()) {
        vrPrompt.text = doorOpened ? 'PUERTA ABIERTA' : 'LA PUERTA ESTÁ BLOQUEADA';
        cambiarTextoPlano(vrPrompt, vrPrompt.text, '#ff2a5f');
        vrPrompt.visible = true;
        clearTimeout(alertTimeout);
        alertTimeout = setTimeout(() => { vrPrompt.visible = false; }, 3000);
    } else {
        const alerta = document.getElementById('door-alert');
        if (alerta) {
            alerta.innerText = doorOpened ? 'PUERTA ABIERTA' : 'LA PUERTA ESTÁ BLOQUEADA. BUSCA EL PIN.';
            alerta.style.display = 'block';
            alerta.style.zIndex = '99999';
            clearTimeout(alertTimeout);
            alertTimeout = setTimeout(() => { alerta.style.display = 'none'; }, 3000);
        }
    }
}

function actualizarMensajeInteraccion() {
    if (!mapData || isUIOpen || doorOpened) {
        document.getElementById('interact-prompt').style.display = 'none';
        vrPrompt.visible = false;
        return;
    }

    const playerPos = getPlayerPosition();
    const pinpadPos = mapData.pinpadObj?.position;
    const puertaPos = mapData.escapeDoor?.position;

    const cercaDePinpad = pinpadPos && playerPos.distanceTo(pinpadPos) < 330;
    const cercaDePuerta = puertaPos && playerPos.distanceTo(puertaPos) < 330;

    if (estaEnVR()) {
        document.getElementById('interact-prompt').style.display = 'none';
        if (cercaDePinpad || cercaDePuerta) {
            vrPrompt.visible = true;
            const camPos = new THREE.Vector3();
            const camDir = new THREE.Vector3();
            camera.getWorldPosition(camPos);
            camera.getWorldDirection(camDir);
            camDir.y = 0; camDir.normalize();
            
            vrPrompt.position.copy(camPos).add(camDir.multiplyScalar(150));
            vrPrompt.position.y -= 30; // Un poco por debajo de la vista
            vrPrompt.lookAt(camPos);
            vrPrompt.rotation.y += Math.PI;
            
            cambiarTextoPlano(vrPrompt, cercaDePinpad ? 'Apunta el láser: Usar Pinpad' : 'Apunta el láser: Revisar Puerta', '#ffcc00');
        } else {
            vrPrompt.visible = false;
        }
    } else {
        vrPrompt.visible = false;
        const prompt = document.getElementById('interact-prompt');
        if (cercaDePinpad) {
            prompt.innerText = 'E: USAR PINPAD'; prompt.style.display = 'block';
        } else if (cercaDePuerta) {
            prompt.innerText = 'E: REVISAR PUERTA'; prompt.style.display = 'block';
        } else {
            prompt.style.display = 'none';
        }
    }
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
        actualizarMensajeInteraccion();

        const playerPos = getPlayerPosition();

        if (doorOpened && !successTriggered) {
            const distToExit = Math.hypot(playerPos.x - mapData.doorPos.x, playerPos.z - mapData.doorPos.z);

            if (distToExit < 200) {
                successTriggered = true;
                if (estaEnVR()) {
                    vrSuccessPrompt.visible = true;
                    const camPos = new THREE.Vector3();
                    const camDir = new THREE.Vector3();
                    camera.getWorldPosition(camPos);
                    camera.getWorldDirection(camDir);
                    camDir.y = 0; camDir.normalize();
                    vrSuccessPrompt.position.copy(camPos).add(camDir.multiplyScalar(150));
                    vrSuccessPrompt.lookAt(camPos);
                    vrSuccessPrompt.rotation.y += Math.PI;
                } else {
                    document.getElementById('success-screen').style.display = 'flex';
                }
            }
        }
    }

    renderer.render(scene, camera);
}