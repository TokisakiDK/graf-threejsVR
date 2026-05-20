import * as THREE from 'three';

let vrRig = null;
let cameraRef = null;

let isVR = false;
let portalCooldown = 0;

export let isAerialView = false;

const keys = { w: false, a: false, s: false, d: false, shift: false };

const config = {
    eyeHeight: 175,
    radius: 40,
    walkSpeed: 180,
    runSpeed: 350,
    turnSpeedPC: 2.5,
    turnSpeedVR: 2.4,
    deadzone: 0.18
};

const vrInput = {
    leftX: 0,
    leftY: 0,
    rightX: 0,
    running: false
};

const playerPosition = new THREE.Vector3();

export function initPlayer(scene, spawnPosition, renderer, camera) {
    cameraRef = camera;

    vrRig = new THREE.Group();
    vrRig.name = 'VR_CAMERA_RIG';

    vrRig.position.set(spawnPosition.x, config.eyeHeight, spawnPosition.z);
    scene.add(vrRig);

    camera.position.set(0, 0, 0);
    camera.rotation.set(0, 0, 0);
    vrRig.add(camera);

    playerPosition.set(spawnPosition.x, 0, spawnPosition.z);

    document.addEventListener('keydown', (e) => {
        const k = e.key.toLowerCase();
        if (k in keys) keys[k] = true;
        if (e.key === 'Shift') keys.shift = true;
        if (k === 'v') isAerialView = !isAerialView;
    });

    document.addEventListener('keyup', (e) => {
        const k = e.key.toLowerCase();
        if (k in keys) keys[k] = false;
        if (e.key === 'Shift') keys.shift = false;
    });

    renderer.xr.addEventListener('sessionstart', () => { isVR = true; resetVRInput(); });
    renderer.xr.addEventListener('sessionend', () => { isVR = false; resetVRInput(); });
}

export function getPlayerPosition() {
    if (!vrRig) return playerPosition.clone();
    playerPosition.set(vrRig.position.x, 0, vrRig.position.z);
    return playerPosition.clone();
}

export function updatePlayer(delta, camera, mapData, renderer, isUIOpen = false) {
    if (!vrRig) return;

    if (isAerialView && !isVR) {
        updateAerialView(camera);
        return;
    }

    if (isVR) readVRControls(renderer);

    if (!isUIOpen) {
        if (isVR) updateVRMovement(delta, mapData);
        else updateKeyboardMovement(delta, mapData);
    }

    updatePortals(delta, mapData);
    updatePortalsFacingCamera(mapData, camera);
}

function resetVRInput() {
    vrInput.leftX = 0; vrInput.leftY = 0; vrInput.rightX = 0; vrInput.running = false;
}

function readVRControls(renderer) {
    vrInput.leftX = 0; vrInput.leftY = 0; vrInput.rightX = 0; vrInput.running = false;

    const session = renderer.xr.getSession();
    if (!session) return;

    const sources = Array.from(session.inputSources);

    for (let i = 0; i < sources.length; i++) {
        const source = sources[i];
        if (!source.gamepad) continue;

        const gamepad = source.gamepad;
        const axes = gamepad.axes || [];
        const buttons = gamepad.buttons || [];
        const stick = getStickAxes(axes);
        const handedness = source.handedness || (i === 0 ? 'left' : 'right');

        if (handedness === 'left') {
            vrInput.leftX = applyDeadzone(stick.x);
            vrInput.leftY = applyDeadzone(stick.y);
            // GATILLO IZQUIERDO PARA CORRER
            vrInput.running = isButtonPressed(buttons, 0); 
        }

        if (handedness === 'right') {
            // Mando derecho controla cámara horizontal
            vrInput.rightX = applyDeadzone(stick.x); 
        }
    }
}

function getStickAxes(axes) {
    if (!axes || axes.length === 0) return { x: 0, y: 0 };
    if (axes.length >= 4) {
        const pairA = Math.abs(axes[0] || 0) + Math.abs(axes[1] || 0);
        const pairB = Math.abs(axes[2] || 0) + Math.abs(axes[3] || 0);
        if (pairB >= pairA) return { x: axes[2] || 0, y: axes[3] || 0 };
    }
    return { x: axes[0] || 0, y: axes[1] || 0 };
}

function isButtonPressed(buttons, index) {
    return !!(buttons[index] && buttons[index].pressed);
}

function applyDeadzone(value) {
    return Math.abs(value) < config.deadzone ? 0 : value;
}

function updateVRMovement(delta, mapData) {
    if (vrInput.rightX !== 0) {
        vrRig.rotation.y -= vrInput.rightX * config.turnSpeedVR * delta;
    }

    const moveX = vrInput.leftX;
    const moveY = vrInput.leftY;

    if (moveX === 0 && moveY === 0) return;

    const speed = vrInput.running ? config.runSpeed : config.walkSpeed;
    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);

    cameraRef.getWorldDirection(forward);
    forward.y = 0;

    if (forward.lengthSq() === 0) return;

    forward.normalize();
    right.crossVectors(forward, up).normalize();

    const direction = new THREE.Vector3();
    direction.addScaledVector(forward, -moveY);
    direction.addScaledVector(right, moveX);

    if (direction.lengthSq() === 0) return;
    direction.normalize();

    const movement = direction.multiplyScalar(speed * delta);
    tryMove(movement.x, movement.z, mapData);
}

function updateKeyboardMovement(delta, mapData) {
    if (keys.a) vrRig.rotation.y += config.turnSpeedPC * delta;
    if (keys.d) vrRig.rotation.y -= config.turnSpeedPC * delta;

    let speed = 0;
    if (keys.w) speed = keys.shift ? config.runSpeed : config.walkSpeed;
    if (keys.s) speed = keys.shift ? -config.runSpeed : -config.walkSpeed;

    if (speed === 0) return;

    const direction = new THREE.Vector3(0, 0, -1);
    direction.applyQuaternion(vrRig.quaternion);
    direction.normalize();

    const movement = direction.multiplyScalar(speed * delta);
    tryMove(movement.x, movement.z, mapData);
}

function tryMove(moveX, moveZ, mapData) {
    const currentX = vrRig.position.x;
    const currentZ = vrRig.position.z;

    const nextX = currentX + moveX;
    if (!hayColision(nextX, currentZ, mapData) && !chocaConObstaculo(nextX, currentZ, mapData)) {
        vrRig.position.x = nextX;
    }

    const nextZ = currentZ + moveZ;
    if (!hayColision(vrRig.position.x, nextZ, mapData) && !chocaConObstaculo(vrRig.position.x, nextZ, mapData)) {
        vrRig.position.z = nextZ;
    }

    playerPosition.set(vrRig.position.x, 0, vrRig.position.z);
}

function hayColision(futuraX, futuraZ, mapData) {
    const radio = config.radius;
    const correccionOffset = mapData.offset + mapData.tileSize / 2;

    const colDerecha = Math.floor((futuraX + correccionOffset + radio) / mapData.tileSize);
    const colIzquierda = Math.floor((futuraX + correccionOffset - radio) / mapData.tileSize);
    const filaAbajo = Math.floor((futuraZ + correccionOffset + radio) / mapData.tileSize);
    const filaArriba = Math.floor((futuraZ + correccionOffset - radio) / mapData.tileSize);

    if (filaArriba < 0 || filaAbajo >= mapData.grid.length || colIzquierda < 0 || colDerecha >= mapData.grid[0].length) {
        return true;
    }

    const esquinas = [
        mapData.grid[filaArriba][colIzquierda],
        mapData.grid[filaArriba][colDerecha],
        mapData.grid[filaAbajo][colIzquierda],
        mapData.grid[filaAbajo][colDerecha]
    ];

    return esquinas.some((valor) => valor === 1 || valor === 5 || valor === 2);
}

function chocaConObstaculo(x, z, mapData) {
    const playerBox = new THREE.Box3().setFromCenterAndSize(
        new THREE.Vector3(x, config.eyeHeight / 2, z),
        new THREE.Vector3(70, config.eyeHeight, 70)
    );

    for (const obstacle of mapData.obstacles) {
        if (!obstacle || obstacle.isInstancedMesh) continue;

        let obstacleBox;
        if (obstacle.boundingBox) {
            obstacle.updateMatrixWorld(true);
            obstacle.boundingBox.setFromObject(obstacle);
            obstacleBox = obstacle.boundingBox;
        } else {
            obstacle.updateMatrixWorld(true);
            obstacleBox = new THREE.Box3().setFromObject(obstacle);
        }

        if (playerBox.intersectsBox(obstacleBox)) return true;
    }
    return false;
}

function updatePortals(delta, mapData) {
    if (portalCooldown > 0) {
        portalCooldown -= delta;
        return;
    }

    const pos = getPlayerPosition();

    if (mapData.linkedPortals.length === 2) {
        const p1 = mapData.linkedPortals[0];
        const p2 = mapData.linkedPortals[1];

        if (pos.distanceTo(p1) < 120) { teleportTo(p2.x, p2.z); portalCooldown = 2.0; playSound(mapData.sfxPortalB); return; }
        if (pos.distanceTo(p2) < 120) { teleportTo(p1.x, p1.z); portalCooldown = 2.0; playSound(mapData.sfxPortalB); return; }
    }

    if (mapData.randomPortals.length > 0) {
        for (const portal of mapData.randomPortals) {
            if (pos.distanceTo(portal) < 120) {
                const randomSpot = getRandomSafeSpot(mapData);
                if (randomSpot) {
                    teleportTo(randomSpot.x, randomSpot.z);
                    portalCooldown = 2.0;
                    playSound(mapData.sfxPortalP);
                }
                return;
            }
        }
    }
}

function getRandomSafeSpot(mapData) {
    let randomSpot = null;
    let isValid = false;
    let attempts = 0;

    while (!isValid && attempts < 50) {
        randomSpot = mapData.safeSpots[Math.floor(Math.random() * mapData.safeSpots.length)];
        isValid = true;
        const allPortals = [...mapData.linkedPortals, ...mapData.randomPortals];
        for (const p of allPortals) {
            if (randomSpot.distanceTo(p) < 300) { isValid = false; break; }
        }
        attempts++;
    }
    return randomSpot;
}

function teleportTo(x, z) {
    vrRig.position.x = x;
    vrRig.position.z = z;
    playerPosition.set(x, 0, z);
}

function playSound(sound) {
    if (!sound || !sound.buffer) return;
    if (sound.isPlaying) sound.stop();
    sound.play();
}

function updatePortalsFacingCamera(mapData, camera) {
    if (!mapData.portalsArray) return;
    const camWorldPos = new THREE.Vector3();
    camera.getWorldPosition(camWorldPos);
    mapData.portalsArray.forEach((portal) => { portal.lookAt(camWorldPos); });
}

function updateAerialView(camera) {
    const pos = getPlayerPosition();
    const aerialPos = new THREE.Vector3(pos.x, 3000, pos.z + 10);
    camera.position.lerp(aerialPos, 0.05);
    camera.lookAt(pos);
}
let vrRig = null;
let cameraRef = null;

let isVR = false;
let portalCooldown = 0;

export let isAerialView = false;

const keys = { w: false, a: false, s: false, d: false, shift: false };

const config = {
    eyeHeight: 175, radius: 40, walkSpeed: 180, runSpeed: 350, turnSpeedPC: 2.5, turnSpeedVR: 2.4, deadzone: 0.18
};

const vrInput = {
    leftX: 0, leftY: 0, rightX: 0, running: false,
    interactNow: false, interactPrev: false, interactConsumed: false,
    confirmNow: false, confirmPrev: false, confirmConsumed: false,
    cancelNow: false, cancelPrev: false, cancelConsumed: false
};

const playerPosition = new THREE.Vector3();

export function initPlayer(scene, spawnPosition, renderer, camera) {
    cameraRef = camera;
    vrRig = new THREE.Group();
    vrRig.name = 'VR_CAMERA_RIG';
    vrRig.position.set(spawnPosition.x, config.eyeHeight, spawnPosition.z);
    scene.add(vrRig);

    camera.position.set(0, 0, 0);
    camera.rotation.set(0, 0, 0);
    vrRig.add(camera);

    playerPosition.set(spawnPosition.x, 0, spawnPosition.z);

    document.addEventListener('keydown', (e) => {
        const k = e.key.toLowerCase();
        if (k in keys) keys[k] = true;
        if (e.key === 'Shift') keys.shift = true;
        if (k === 'v') isAerialView = !isAerialView;
    });

    document.addEventListener('keyup', (e) => {
        const k = e.key.toLowerCase();
        if (k in keys) keys[k] = false;
        if (e.key === 'Shift') keys.shift = false;
    });

    renderer.xr.addEventListener('sessionstart', () => { isVR = true; resetVRInput(); });
    renderer.xr.addEventListener('sessionend', () => { isVR = false; resetVRInput(); });
}

export function getPlayerPosition() {
    if (!vrRig) return playerPosition.clone();
    playerPosition.set(vrRig.position.x, 0, vrRig.position.z);
    return playerPosition.clone();
}

export function getVRNavAxes() { return { x: vrInput.leftX, y: vrInput.leftY }; }

export function consumeVRInteractPressed() {
    const justPressed = vrInput.interactNow && !vrInput.interactPrev && !vrInput.interactConsumed;
    if (justPressed) { vrInput.interactConsumed = true; return true; }
    return false;
}

export function consumeVRConfirmPressed() {
    const justPressed = vrInput.confirmNow && !vrInput.confirmPrev && !vrInput.confirmConsumed;
    if (justPressed) { vrInput.confirmConsumed = true; return true; }
    return false;
}

export function consumeVRCancelPressed() {
    const justPressed = vrInput.cancelNow && !vrInput.cancelPrev && !vrInput.cancelConsumed;
    if (justPressed) { vrInput.cancelConsumed = true; return true; }
    return false;
}

export function updatePlayer(delta, camera, mapData, renderer, isUIOpen = false) {
    if (!vrRig) return;
    if (isAerialView && !isVR) { updateAerialView(camera); return; }

    if (isVR) readVRControls(renderer);

    if (!isUIOpen) {
        if (isVR) updateVRMovement(delta, mapData);
        else updateKeyboardMovement(delta, mapData);
    }

    updatePortals(delta, mapData);
    updatePortalsFacingCamera(mapData, camera);
}

function resetVRInput() {
    vrInput.leftX = 0; vrInput.leftY = 0; vrInput.rightX = 0; vrInput.running = false;
    vrInput.interactNow = false; vrInput.interactPrev = false; vrInput.interactConsumed = false;
    vrInput.confirmNow = false; vrInput.confirmPrev = false; vrInput.confirmConsumed = false;
    vrInput.cancelNow = false; vrInput.cancelPrev = false; vrInput.cancelConsumed = false;
}

function readVRControls(renderer) {
    vrInput.leftX = 0; vrInput.leftY = 0; vrInput.rightX = 0; vrInput.running = false;
    vrInput.interactPrev = vrInput.interactNow; vrInput.confirmPrev = vrInput.confirmNow; vrInput.cancelPrev = vrInput.cancelNow;
    vrInput.interactNow = false; vrInput.confirmNow = false; vrInput.cancelNow = false;
    vrInput.interactConsumed = false; vrInput.confirmConsumed = false; vrInput.cancelConsumed = false;

    const session = renderer.xr.getSession();
    if (!session) return;

    const sources = Array.from(session.inputSources);
    for (let i = 0; i < sources.length; i++) {
        const source = sources[i];
        if (!source.gamepad) continue;

        const gamepad = source.gamepad;
        const axes = gamepad.axes || [];
        const buttons = gamepad.buttons || [];
        const stick = getStickAxes(axes);
        const handedness = source.handedness || (i === 0 ? 'left' : 'right');

        if (handedness === 'left') {
            vrInput.leftX = applyDeadzone(stick.x);
            vrInput.leftY = applyDeadzone(stick.y);
            // Gatillo Izquierdo (0 o 1) para Correr
            vrInput.running = isButtonPressed(buttons, 0) || isButtonPressed(buttons, 1);
        }

        if (handedness === 'right') {
            vrInput.rightX = applyDeadzone(stick.x);
            // Gatillo Derecho para Interactuar (Abrir puerta o Pinpad)
            vrInput.interactNow = isButtonPressed(buttons, 0) || isButtonPressed(buttons, 1);
            // Botón A para presionar UI
            vrInput.confirmNow = isButtonPressed(buttons, 4);
            // Botón B para cerrar UI
            vrInput.cancelNow = isButtonPressed(buttons, 5);
        }
    }
}

function getStickAxes(axes) {
    if (!axes || axes.length === 0) return { x: 0, y: 0 };
    if (axes.length >= 4) {
        const pairA = Math.abs(axes[0] || 0) + Math.abs(axes[1] || 0);
        const pairB = Math.abs(axes[2] || 0) + Math.abs(axes[3] || 0);
        if (pairB >= pairA) return { x: axes[2] || 0, y: axes[3] || 0 };
    }
    return { x: axes[0] || 0, y: axes[1] || 0 };
}

function isButtonPressed(buttons, index) {
    return !!(buttons[index] && buttons[index].pressed);
}

function applyDeadzone(value) {
    return Math.abs(value) < config.deadzone ? 0 : value;
}

function updateVRMovement(delta, mapData) {
    if (vrInput.rightX !== 0) vrRig.rotation.y -= vrInput.rightX * config.turnSpeedVR * delta;

    const moveX = vrInput.leftX;
    const moveY = vrInput.leftY;
    if (moveX === 0 && moveY === 0) return;

    const speed = vrInput.running ? config.runSpeed : config.walkSpeed;
    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);

    cameraRef.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() === 0) return;

    forward.normalize();
    right.crossVectors(forward, up).normalize();

    const direction = new THREE.Vector3();
    direction.addScaledVector(forward, -moveY);
    direction.addScaledVector(right, moveX);

    if (direction.lengthSq() === 0) return;
    direction.normalize();

    const movement = direction.multiplyScalar(speed * delta);
    tryMove(movement.x, movement.z, mapData);
}

function updateKeyboardMovement(delta, mapData) {
    if (keys.a) vrRig.rotation.y += config.turnSpeedPC * delta;
    if (keys.d) vrRig.rotation.y -= config.turnSpeedPC * delta;

    let speed = 0;
    if (keys.w) speed = keys.shift ? config.runSpeed : config.walkSpeed;
    if (keys.s) speed = keys.shift ? -config.runSpeed : -config.walkSpeed;

    if (speed === 0) return;

    const direction = new THREE.Vector3(0, 0, -1);
    direction.applyQuaternion(vrRig.quaternion);
    direction.normalize();

    const movement = direction.multiplyScalar(speed * delta);
    tryMove(movement.x, movement.z, mapData);
}

function tryMove(moveX, moveZ, mapData) {
    const currentX = vrRig.position.x;
    const currentZ = vrRig.position.z;

    const nextX = currentX + moveX;
    if (!hayColision(nextX, currentZ, mapData) && !chocaConObstaculo(nextX, currentZ, mapData)) {
        vrRig.position.x = nextX;
    }

    const nextZ = currentZ + moveZ;
    if (!hayColision(vrRig.position.x, nextZ, mapData) && !chocaConObstaculo(vrRig.position.x, nextZ, mapData)) {
        vrRig.position.z = nextZ;
    }

    playerPosition.set(vrRig.position.x, 0, vrRig.position.z);
}

function hayColision(futuraX, futuraZ, mapData) {
    const radio = config.radius;
    const correccionOffset = mapData.offset + mapData.tileSize / 2;

    const colDerecha = Math.floor((futuraX + correccionOffset + radio) / mapData.tileSize);
    const colIzquierda = Math.floor((futuraX + correccionOffset - radio) / mapData.tileSize);
    const filaAbajo = Math.floor((futuraZ + correccionOffset + radio) / mapData.tileSize);
    const filaArriba = Math.floor((futuraZ + correccionOffset - radio) / mapData.tileSize);

    if (filaArriba < 0 || filaAbajo >= mapData.grid.length || colIzquierda < 0 || colDerecha >= mapData.grid[0].length) return true;

    const esquinas = [
        mapData.grid[filaArriba][colIzquierda], mapData.grid[filaArriba][colDerecha],
        mapData.grid[filaAbajo][colIzquierda], mapData.grid[filaAbajo][colDerecha]
    ];
    return esquinas.some((valor) => valor === 1 || valor === 5 || valor === 2);
}

function chocaConObstaculo(x, z, mapData) {
    const playerBox = new THREE.Box3().setFromCenterAndSize(
        new THREE.Vector3(x, config.eyeHeight / 2, z),
        new THREE.Vector3(70, config.eyeHeight, 70)
    );

    for (const obstacle of mapData.obstacles) {
        if (!obstacle || obstacle.isInstancedMesh) continue;

        let obstacleBox;
        if (obstacle.boundingBox) {
            obstacle.updateMatrixWorld(true);
            obstacle.boundingBox.setFromObject(obstacle);
            obstacleBox = obstacle.boundingBox;
        } else {
            obstacle.updateMatrixWorld(true);
            obstacleBox = new THREE.Box3().setFromObject(obstacle);
        }
        if (playerBox.intersectsBox(obstacleBox)) return true;
    }
    return false;
}

function updatePortals(delta, mapData) {
    if (portalCooldown > 0) { portalCooldown -= delta; return; }

    const pos = getPlayerPosition();

    if (mapData.linkedPortals.length === 2) {
        const p1 = mapData.linkedPortals[0], p2 = mapData.linkedPortals[1];
        if (pos.distanceTo(p1) < 120) { teleportTo(p2.x, p2.z); portalCooldown = 2.0; playSound(mapData.sfxPortalB); return; }
        if (pos.distanceTo(p2) < 120) { teleportTo(p1.x, p1.z); portalCooldown = 2.0; playSound(mapData.sfxPortalB); return; }
    }

    if (mapData.randomPortals.length > 0) {
        for (const portal of mapData.randomPortals) {
            if (pos.distanceTo(portal) < 120) {
                const randomSpot = getRandomSafeSpot(mapData);
                if (randomSpot) {
                    teleportTo(randomSpot.x, randomSpot.z); portalCooldown = 2.0; playSound(mapData.sfxPortalP);
                }
                return;
            }
        }
    }
}

function getRandomSafeSpot(mapData) {
    let randomSpot = null, isValid = false, attempts = 0;
    while (!isValid && attempts < 50) {
        randomSpot = mapData.safeSpots[Math.floor(Math.random() * mapData.safeSpots.length)];
        isValid = true;
        const allPortals = [...mapData.linkedPortals, ...mapData.randomPortals];
        for (const p of allPortals) { if (randomSpot.distanceTo(p) < 300) { isValid = false; break; } }
        attempts++;
    }
    return randomSpot;
}

function teleportTo(x, z) {
    vrRig.position.x = x; vrRig.position.z = z;
    playerPosition.set(x, 0, z);
}

function playSound(sound) {
    if (!sound || !sound.buffer) return;
    if (sound.isPlaying) sound.stop();
    sound.play();
}

function updatePortalsFacingCamera(mapData, camera) {
    if (!mapData.portalsArray) return;
    const camWorldPos = new THREE.Vector3();
    camera.getWorldPosition(camWorldPos);
    mapData.portalsArray.forEach((portal) => portal.lookAt(camWorldPos));
}

function updateAerialView(camera) {
    const pos = getPlayerPosition();
    const aerialPos = new THREE.Vector3(pos.x, 3000, pos.z + 10);
    camera.position.lerp(aerialPos, 0.05);
    camera.lookAt(pos);
}