import * as THREE from 'three';

const keys = {
    w: false,
    a: false,
    s: false,
    d: false,
    shift: false
};

const player = {
    rig: null,
    camera: null,
    renderer: null,

    isVR: false,

    eyeHeight: 175,

    radius: 40,

    walkSpeed: 180,
    runSpeed: 320,

    keyboardTurnSpeed: 2.5,
    vrTurnSpeed: 2.2,

    deadzone: 0.18,

    portalCooldown: 0,

    position: new THREE.Vector3()
};

const input = {
    leftX: 0,
    leftY: 0,
    rightX: 0,
    runPressed: false
};

const tempVec3 = new THREE.Vector3();
const tempVec3B = new THREE.Vector3();
const tempQuat = new THREE.Quaternion();

export let isAerialView = false;

export function initPlayer(scene, spawnPosition, renderer, camera) {
    player.renderer = renderer;
    player.camera = camera;

    player.rig = new THREE.Group();
    player.rig.name = 'VR_Player_Rig';

    player.rig.position.set(
        spawnPosition.x,
        player.eyeHeight,
        spawnPosition.z
    );

    scene.add(player.rig);

    camera.position.set(0, 0, 0);
    camera.rotation.set(0, 0, 0);

    player.rig.add(camera);

    player.position.set(
        player.rig.position.x,
        0,
        player.rig.position.z
    );

    document.addEventListener('keydown', (e) => {
        const k = e.key.toLowerCase();

        if (keys.hasOwnProperty(k)) {
            keys[k] = true;
        }

        if (e.key === 'Shift') {
            keys.shift = true;
        }

        if (k === 'v') {
            isAerialView = !isAerialView;
        }
    });

    document.addEventListener('keyup', (e) => {
        const k = e.key.toLowerCase();

        if (keys.hasOwnProperty(k)) {
            keys[k] = false;
        }

        if (e.key === 'Shift') {
            keys.shift = false;
        }
    });

    renderer.xr.addEventListener('sessionstart', () => {
        player.isVR = true;
    });

    renderer.xr.addEventListener('sessionend', () => {
        player.isVR = false;

        input.leftX = 0;
        input.leftY = 0;
        input.rightX = 0;
        input.runPressed = false;
    });
}

export function getPlayerPosition() {
    if (!player.rig) {
        return player.position.clone();
    }

    player.position.set(
        player.rig.position.x,
        0,
        player.rig.position.z
    );

    return player.position.clone();
}

export function updatePlayer(delta, camera, mapData, renderer, isUIOpen = false) {
    if (!player.rig) return;

    if (isAerialView) {
        updateAerialCamera(camera);
        return;
    }

    if (!isUIOpen) {
        if (player.isVR) {
            readVRInput(renderer);
            updateVRMovement(delta, mapData);
        } else {
            updateKeyboardMovement(delta, mapData);
        }
    }

    updatePortals(delta, mapData);
    updatePortalLookAt(mapData, camera);
}

function updateAerialCamera(camera) {
    const currentPos = getPlayerPosition();

    const aerialPos = new THREE.Vector3(
        currentPos.x,
        3000,
        currentPos.z + 10
    );

    camera.position.lerp(aerialPos, 0.05);
    camera.lookAt(currentPos);
}

function readVRInput(renderer) {
    input.leftX = 0;
    input.leftY = 0;
    input.rightX = 0;
    input.runPressed = false;

    const session = renderer.xr.getSession();

    if (!session) return;

    for (const source of session.inputSources) {
        if (!source.gamepad) continue;

        const gamepad = source.gamepad;
        const axes = gamepad.axes || [];
        const buttons = gamepad.buttons || [];

        const stick = getStickAxes(axes);

        if (source.handedness === 'left') {
            input.leftX = applyDeadzone(stick.x);
            input.leftY = applyDeadzone(stick.y);

            input.runPressed = isXButtonPressed(buttons);
        }

        if (source.handedness === 'right') {
            input.rightX = applyDeadzone(stick.x);
        }
    }
}

function getStickAxes(axes) {
    if (!axes || axes.length === 0) {
        return { x: 0, y: 0 };
    }

    if (axes.length >= 4) {
        return {
            x: axes[2] || 0,
            y: axes[3] || 0
        };
    }

    return {
        x: axes[0] || 0,
        y: axes[1] || 0
    };
}

function applyDeadzone(value) {
    return Math.abs(value) < player.deadzone ? 0 : value;
}

function isXButtonPressed(buttons) {
    if (!buttons || buttons.length === 0) return false;

    const possibleXIndexes = [4, 5];

    for (const index of possibleXIndexes) {
        if (buttons[index] && buttons[index].pressed) {
            return true;
        }
    }

    return false;
}

function updateVRMovement(delta, mapData) {
    const turnAmount = -input.rightX * player.vrTurnSpeed * delta;

    if (Math.abs(turnAmount) > 0.0001) {
        player.rig.rotation.y += turnAmount;
    }

    const moveX = input.leftX;
    const moveY = input.leftY;

    if (moveX === 0 && moveY === 0) return;

    const speed = input.runPressed ? player.runSpeed : player.walkSpeed;

    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();

    player.camera.getWorldDirection(forward);

    forward.y = 0;
    forward.normalize();

    right.crossVectors(forward, new THREE.Vector3(0, 1, 0));
    right.normalize();

    const moveDir = new THREE.Vector3();

    moveDir.addScaledVector(forward, -moveY);
    moveDir.addScaledVector(right, moveX);

    if (moveDir.lengthSq() > 0) {
        moveDir.normalize();
    }

    const movement = moveDir.multiplyScalar(speed * delta);

    tryMove(movement.x, movement.z, mapData);
}

function updateKeyboardMovement(delta, mapData) {
    if (keys.a) {
        player.rig.rotation.y += player.keyboardTurnSpeed * delta;
    }

    if (keys.d) {
        player.rig.rotation.y -= player.keyboardTurnSpeed * delta;
    }

    let forwardSpeed = 0;

    if (keys.w) {
        forwardSpeed = keys.shift ? player.runSpeed : player.walkSpeed;
    } else if (keys.s) {
        forwardSpeed = keys.shift ? -player.runSpeed : -player.walkSpeed;
    }

    if (forwardSpeed === 0) return;

    const movement = new THREE.Vector3(0, 0, -forwardSpeed * delta);

    movement.applyQuaternion(player.rig.quaternion);

    tryMove(movement.x, movement.z, mapData);
}

function tryMove(moveX, moveZ, mapData) {
    const currentX = player.rig.position.x;
    const currentZ = player.rig.position.z;

    const testX = currentX + moveX;

    if (!hayColision(testX, currentZ, mapData)) {
        if (!chocaConObstaculo(testX, currentZ, mapData)) {
            player.rig.position.x = testX;
        }
    }

    const testZ = currentZ + moveZ;

    if (!hayColision(player.rig.position.x, testZ, mapData)) {
        if (!chocaConObstaculo(player.rig.position.x, testZ, mapData)) {
            player.rig.position.z = testZ;
        }
    }

    player.position.set(
        player.rig.position.x,
        0,
        player.rig.position.z
    );
}

function hayColision(futuraX, futuraZ, mapData) {
    const radio = player.radius;
    const correccionOffset = mapData.offset + mapData.tileSize / 2;

    const colDerecha = Math.floor(
        (futuraX + correccionOffset + radio) / mapData.tileSize
    );

    const colIzquierda = Math.floor(
        (futuraX + correccionOffset - radio) / mapData.tileSize
    );

    const filaAbajo = Math.floor(
        (futuraZ + correccionOffset + radio) / mapData.tileSize
    );

    const filaArriba = Math.floor(
        (futuraZ + correccionOffset - radio) / mapData.tileSize
    );

    if (
        filaArriba < 0 ||
        filaAbajo >= mapData.grid.length ||
        colIzquierda < 0 ||
        colDerecha >= mapData.grid[0].length
    ) {
        return true;
    }

    const esquinas = [
        mapData.grid[filaArriba][colIzquierda],
        mapData.grid[filaArriba][colDerecha],
        mapData.grid[filaAbajo][colIzquierda],
        mapData.grid[filaAbajo][colDerecha]
    ];

    return esquinas.some((valor) => {
        return valor === 1 || valor === 5 || valor === 2;
    });
}

function chocaConObstaculo(x, z, mapData) {
    const pBox = new THREE.Box3().setFromCenterAndSize(
        new THREE.Vector3(x, 120, z),
        new THREE.Vector3(70, 240, 70)
    );

    for (const obstacle of mapData.obstacles) {
        if (!obstacle) continue;
        if (obstacle.isInstancedMesh) continue;

        if (obstacle.boundingBox) {
            obstacle.updateMatrixWorld(true);
            obstacle.boundingBox.setFromObject(obstacle);

            if (pBox.intersectsBox(obstacle.boundingBox)) {
                return true;
            }
        } else {
            const box = new THREE.Box3().setFromObject(obstacle);

            if (pBox.intersectsBox(box)) {
                return true;
            }
        }
    }

    return false;
}

function updatePortals(delta, mapData) {
    if (player.portalCooldown > 0) {
        player.portalCooldown -= delta;
        return;
    }

    const currentPos = getPlayerPosition();

    if (mapData.linkedPortals.length === 2) {
        const p1 = mapData.linkedPortals[0];
        const p2 = mapData.linkedPortals[1];

        let teleported = false;

        if (currentPos.distanceTo(p1) < 120) {
            teleportTo(p2.x, p2.z);
            teleported = true;
        } else if (currentPos.distanceTo(p2) < 120) {
            teleportTo(p1.x, p1.z);
            teleported = true;
        }

        if (teleported) {
            player.portalCooldown = 2.0;
            playPortalSound(mapData.sfxPortalB);
            return;
        }
    }

    if (mapData.randomPortals.length > 0) {
        for (let i = 0; i < mapData.randomPortals.length; i++) {
            const portal = mapData.randomPortals[i];

            if (currentPos.distanceTo(portal) < 120) {
                let randomSpot;
                let isValid = false;
                let attempts = 0;

                while (!isValid && attempts < 50) {
                    randomSpot =
                        mapData.safeSpots[
                            Math.floor(Math.random() * mapData.safeSpots.length)
                        ];

                    isValid = true;

                    const allPortals = [
                        ...mapData.linkedPortals,
                        ...mapData.randomPortals
                    ];

                    for (const p of allPortals) {
                        if (randomSpot.distanceTo(p) < 300) {
                            isValid = false;
                            break;
                        }
                    }

                    attempts++;
                }

                if (randomSpot) {
                    teleportTo(randomSpot.x, randomSpot.z);
                    player.portalCooldown = 2.0;
                    playPortalSound(mapData.sfxPortalP);
                }

                break;
            }
        }
    }
}

function teleportTo(x, z) {
    player.rig.position.x = x;
    player.rig.position.z = z;

    player.position.set(x, 0, z);
}

function playPortalSound(sound) {
    if (!sound || !sound.buffer) return;

    if (sound.isPlaying) {
        sound.stop();
    }

    sound.play();
}

function updatePortalLookAt(mapData, camera) {
    if (!mapData.portalsArray) return;

    camera.getWorldPosition(tempVec3);

    mapData.portalsArray.forEach((portal) => {
        portal.lookAt(tempVec3);
    });
}