import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

let character, mixer, currentAction;
let idleAction, walkAction, walkBackAction, runAction, runBackAction;
const keys = { w: false, a: false, s: false, d: false, shift: false };
const rotationSpeed = 2.5; 
const camRaycaster = new THREE.Raycaster();
let portalCooldown = 0; 
let stepTimer = 0;
let isVR = false; // Estado de VR

export let isAerialView = false;

// Rig VR: contenedor al que se ancla la cámara para que el headset no quede "en el suelo"
let playerRig;

// Locomoción por thumbstick (Meta Quest)
let vrMove = { x: 0, y: 0 }; // x = strafe, y = forward/back
let vrTurn = 0;
const vr = { deadzone: 0.15, maxSpeed: 240, walkSpeed: 180, runMultiplier: 1.6 };


export function initPlayer(scene, spawnPosition, renderer, camera) {
    const loader = new FBXLoader();


    // Crear rig VR y anclar la cámara en él (la cámara/pose real la maneja el headset)
    playerRig = new THREE.Group();
    playerRig.position.set(spawnPosition.x, 1.6, spawnPosition.z);
    scene.add(playerRig);

    // Importante: en VR la cámara debe ser hija del rig para que no quede “en el suelo”
    if (camera && camera.parent !== playerRig) {
        playerRig.add(camera);
    }


    // En WebXR, la cámara es añadida al rig por app.js.
    // Nota: como la cámara viene desde app.js y se le pasa en updatePlayer, aquí solo creamos el contenedor.


    document.addEventListener('keydown', (e) => {
        const k = e.key.toLowerCase();
        if (keys.hasOwnProperty(k)) keys[k] = true;
        if (e.key === 'Shift') keys.shift = true;

        if (k === 'v') {
            isAerialView = !isAerialView;
        }
    });

    document.addEventListener('keyup', (e) => {
        const k = e.key.toLowerCase();
        if (keys.hasOwnProperty(k)) keys[k] = false;
        if (e.key === 'Shift') keys.shift = false;
    });

    // --- WebXR thumbstick input ---
    // Izquierdo: locomoción (x=strafe, y=forward/back)
    // Derecho: (opcional) yaw/turn. Aquí lo mapeamos a A/D virtual para girar el personaje.
    function readVRControlsFromSession(session) {
        if (!session) return;
        const axesToMove = { x: 0, y: 0 };
        const axesToTurn = { x: 0 };

        // Typical mapping:
        // - left thumbstick: axes[0] (x), axes[1] (y)
        // - right thumbstick: axes[2]/axes[3] depending on browser
        // We'll inspect axes length and index heuristics.
        const inputSources = session.inputSources || [];

        for (const src of inputSources) {
            const gp = src.gamepad;
            if (!gp || !gp.axes) continue;

            const a = gp.axes;
            // Heurística: usa ejes por magnitud (thumbsticks suelen ser los de mayor rango en 4 ejes)
            if (a.length >= 4) {
                // Izquierdo (suponemos 0,1) y derecho (2,3)
                // Forward suele venir con signo invertido dependiendo del dispositivo
                const lx = a[0];
                const ly = a[1];
                const rx = a[2];
                const ry = a[3];

                // Guardamos locomoción
                axesToMove.x = axesToMove.x !== 0 ? axesToMove.x : lx;
                axesToMove.y = axesToMove.y !== 0 ? axesToMove.y : -ly;

                // Guardamos giro: usamos rx
                axesToTurn.x = axesToTurn.x !== 0 ? axesToTurn.x : rx;

                // si ambos sticks tienen valores, salimos
                // (evita mezclar dos inputSources distintos)
                if (Math.abs(axesToMove.x) > 0.01 || Math.abs(axesToMove.y) > 0.01) {
                    break;
                }
            }
        }

        // Aplicar deadzone
        const dz = vr.deadzone;
        const fx = Math.abs(axesToMove.x) < dz ? 0 : axesToMove.x;
        const fy = Math.abs(axesToMove.y) < dz ? 0 : axesToMove.y;
        const tx = Math.abs(axesToTurn.x) < dz ? 0 : axesToTurn.x;

        vrMove.x = fx;
        vrMove.y = fy;
        vrTurn = tx; // lo interpretamos como señal de giro (no ángulo absoluto)
    }

    renderer.xr.addEventListener('sessionstart', (e) => {
        isVR = true;
        const session = e.session;
        // Guardamos la función en una variable closure para llamar en cada frame
        renderer.xr.__readVRControls = () => readVRControlsFromSession(session);
    });

    renderer.xr.addEventListener('sessionend', () => {
        isVR = false;
        renderer.xr.__readVRControls = null;
    });


    loader.load('player/Idle.fbx', (fbx) => {
        character = fbx;
        character.scale.set(1, 1, 1);
        character.position.copy(spawnPosition);
        character.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });

        mixer = new THREE.AnimationMixer(character);
        idleAction = mixer.clipAction(character.animations[0]);

        loader.load('player/Walking.fbx', (f) => walkAction = mixer.clipAction(f.animations[0]));
        loader.load('player/Walking Backwards.fbx', (f) => walkBackAction = mixer.clipAction(f.animations[0]));
        loader.load('player/Running.fbx', (f) => runAction = mixer.clipAction(f.animations[0]));
        loader.load('player/Run Backward.fbx', (f) => runBackAction = mixer.clipAction(f.animations[0]));

        currentAction = idleAction;
        currentAction.play();
        scene.add(character);
    });
}

function crossFade(nextAction) {
    if (!currentAction || !nextAction || currentAction === nextAction) return;
    nextAction.reset().play();
    currentAction.crossFadeTo(nextAction, 0.25, true); 
    currentAction = nextAction;
}

export function updatePlayer(delta, camera, mapData, renderer) {
    if (!character || !currentAction) return;
    if (mixer) mixer.update(delta);

    if (isAerialView) {
        if (currentAction !== idleAction) crossFade(idleAction);
        const aerialPos = new THREE.Vector3(character.position.x, 3000, character.position.z + 10);
        camera.position.lerp(aerialPos, 0.05); 
        camera.lookAt(character.position);
        return; 
    }

    if (keys.a) character.rotation.y += rotationSpeed * delta;
    if (keys.d) character.rotation.y -= rotationSpeed * delta;

    let targetAction = idleAction; let speed = 0;
    if (keys.w) { if (keys.shift) { targetAction = runAction; speed = 450; } else { targetAction = walkAction; speed = 180; } }
    else if (keys.s) { if (keys.shift) { targetAction = runBackAction; speed = -350; } else { targetAction = walkBackAction; speed = -120; } }

    if (targetAction !== currentAction) crossFade(targetAction);

    const mov = new THREE.Vector3(0, 0, speed * delta).applyQuaternion(character.quaternion);
    
    function hayColision(futuraX, futuraZ) {
        const radio = 40; 
        const correccionOffset = mapData.offset + (mapData.tileSize / 2);

        const colDerecha = Math.floor((futuraX + correccionOffset + radio) / mapData.tileSize);
        const colIzquierda = Math.floor((futuraX + correccionOffset - radio) / mapData.tileSize);
        const filaAbajo = Math.floor((futuraZ + correccionOffset + radio) / mapData.tileSize);
        const filaArriba = Math.floor((futuraZ + correccionOffset - radio) / mapData.tileSize);

        if (filaArriba < 0 || filaAbajo >= mapData.grid.length || colIzquierda < 0 || colDerecha >= mapData.grid[0].length) return true;

        const esquinas = [
            mapData.grid[filaArriba][colIzquierda],
            mapData.grid[filaArriba][colDerecha],
            mapData.grid[filaAbajo][colIzquierda],
            mapData.grid[filaAbajo][colDerecha]
        ];

        return esquinas.some(valor => valor === 1 || valor === 5 || valor === 2);
    }

    const testX = character.position.x + mov.x;
    if (!hayColision(testX, character.position.z)) {
        let chocaProp = false;
        const pBox = new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(testX, 100, character.position.z), new THREE.Vector3(70, 200, 70));
        for (let o of mapData.obstacles) {
            if (o.isInstancedMesh) continue; 
            if (o.boundingBox && pBox.intersectsBox(o.boundingBox)) { chocaProp = true; break; }
        }
        if (!chocaProp) character.position.x = testX;
    }

    const testZ = character.position.z + mov.z;
    if (!hayColision(character.position.x, testZ)) {
        let chocaProp = false;
        const pBox = new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(character.position.x, 100, testZ), new THREE.Vector3(70, 200, 70));
        for (let o of mapData.obstacles) {
            if (o.isInstancedMesh) continue; 
            if (o.boundingBox && pBox.intersectsBox(o.boundingBox)) { chocaProp = true; break; }
        }
        if (!chocaProp) character.position.z = testZ;
    }

    if (portalCooldown > 0) {
        portalCooldown -= delta;
    } else {
        if (mapData.linkedPortals.length === 2) {
            const p1 = mapData.linkedPortals[0];
            const p2 = mapData.linkedPortals[1];
            
            let teleported = false;

            if (character.position.distanceTo(p1) < 120) {
                character.position.set(p2.x, 0, p2.z);
                teleported = true;
            } else if (character.position.distanceTo(p2) < 120) {
                character.position.set(p1.x, 0, p1.z);
                teleported = true;
            }

            if (teleported) {
                portalCooldown = 2.0;
                if (mapData.sfxPortalB && mapData.sfxPortalB.isPlaying) mapData.sfxPortalB.stop();
                if (mapData.sfxPortalB && mapData.sfxPortalB.buffer) mapData.sfxPortalB.play();
            }
        }

        if (portalCooldown <= 0 && mapData.randomPortals.length > 0) {
            for (let i = 0; i < mapData.randomPortals.length; i++) {
                if (character.position.distanceTo(mapData.randomPortals[i]) < 120) {
                    
                    let randomSpot;
                    let isValid = false;
                    let attempts = 0;
                    
                    while (!isValid && attempts < 50) {
                        randomSpot = mapData.safeSpots[Math.floor(Math.random() * mapData.safeSpots.length)];
                        isValid = true;
                        
                        [...mapData.linkedPortals, ...mapData.randomPortals].forEach(p => {
                            if (randomSpot.distanceTo(p) < 300) isValid = false;
                        });
                        attempts++;
                    }

                    character.position.set(randomSpot.x, 0, randomSpot.z);
                    portalCooldown = 2.0;
                    
                    if (mapData.sfxPortalP && mapData.sfxPortalP.isPlaying) mapData.sfxPortalP.stop();
                    if (mapData.sfxPortalP && mapData.sfxPortalP.buffer) mapData.sfxPortalP.play();
                    
                    break; 
                }
            }
        }
    }

    mapData.portalsArray.forEach(p => p.lookAt(camera.position));
    
    const playerHead = character.position.clone().add(new THREE.Vector3(0, 150, 0));
    const zIdeal = keys.s ? -120 : -320; 
    const yIdeal = keys.s ? 160 : 180;
    
    const idealCamOffset = new THREE.Vector3(0, yIdeal, zIdeal).applyQuaternion(character.quaternion);
    const idealCamPos = character.position.clone().add(idealCamOffset);

    const rayDir = idealCamPos.clone().sub(playerHead).normalize();
    const rayDist = playerHead.distanceTo(idealCamPos);

    camRaycaster.set(playerHead, rayDir);
    const wallIntersects = camRaycaster.intersectObjects(mapData.obstacles, true);

    let finalCamPos = idealCamPos.clone();
    let isColliding = false;

    if (wallIntersects.length > 0) {
        const wallHit = wallIntersects[0];
        if (wallHit.distance < rayDist) {
            const safeDistance = Math.max(0, wallHit.distance - 30);
            finalCamPos = playerHead.clone().add(rayDir.multiplyScalar(safeDistance));
            isColliding = true;
        }
    }


// En VR la posición/orientación real la controla el headset (WebXR).
    // En VR no movemos la cámara, movemos el rig/character en el plano.
    if (isVR) {
        // Actualiza ejes desde el controlador VR (thumbstick)
        if (renderer && renderer.xr && renderer.xr.__readVRControls) {
            renderer.xr.__readVRControls();
        }

        // Rig sigue al personaje (altura fija; el headset añade el offset real)
        if (playerRig && character) {
            playerRig.position.x = character.position.x;
            playerRig.position.z = character.position.z;
            // y queda en altura fija
        }

    // Thumbstick VR: mueve al personaje como si fuera WASD
        // Nota: aquí vrMove se rellena leyendo los ejes del controlador WebXR.
        // vrMove.y = forward/back, vrMove.x = strafe
        if (character) {
            const moveVec = new THREE.Vector3(vrMove.x, 0, vrMove.y);
            if (moveVec.lengthSq() > 1e-6) {
                moveVec.normalize();

                // Rotación: usamos la dirección del stick para virar (aprox como A/D + facing al movimiento)
                vrTurn = Math.atan2(moveVec.x, moveVec.z);
                character.rotation.y += vrTurn * delta * rotationSpeed;

                // Animación
                let targetAction = idleAction; let speed = 0;
                const forward = vrMove.y;
                const strafe = vrMove.x;
                const moving = Math.abs(forward) > vr.deadzone || Math.abs(strafe) > vr.deadzone;

                if (moving) {
                    const running = keys.shift; // puedes correr con Shift en PC; en VR queda como walk
                    const dirForward = forward >= 0;
                    if (dirForward) {
                        targetAction = running && runAction ? runAction : walkAction;
                        speed = (running ? vr.maxSpeed * vr.runMultiplier : vr.walkSpeed) * forward;
                    } else {
                        targetAction = running && runBackAction ? runBackAction : walkBackAction;
                        speed = (running ? -vr.maxSpeed : -vr.walkSpeed) * Math.abs(forward);
                    }

                    // Si hay strafe fuerte, usamos forward animación igualmente (no hay strafe en el modelo)
                    if (Math.abs(forward) <= vr.deadzone && Math.abs(strafe) > vr.deadzone) {
                        targetAction = keys.shift ? runAction : walkAction;
                        speed = keys.shift ? vr.maxSpeed : vr.walkSpeed;
                        if (strafe < 0) speed = -speed;
                    }

                    if (targetAction !== currentAction) crossFade(targetAction);

                    // Movimiento en el plano siguiendo la rotación del personaje
                    const mov = new THREE.Vector3(0, 0, speed * delta).applyQuaternion(character.quaternion);

                    // Colisiones (misma lógica que PC, usando mov)
                    const testX = character.position.x + mov.x;
                    if (!hayColision(testX, character.position.z)) {
                        character.position.x = testX;
                    }

                    const testZ = character.position.z + mov.z;
                    if (!hayColision(character.position.x, testZ)) {
                        character.position.z = testZ;
                    }

                }
            }
        }
    } else {
        if (isColliding) camera.position.lerp(finalCamPos, 0.4);
        else camera.position.lerp(finalCamPos, 0.2);

        camera.lookAt(character.position.clone().add(new THREE.Vector3(0, 120, 0)));
    }
}