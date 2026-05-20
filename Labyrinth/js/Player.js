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

export function initPlayer(scene, spawnPosition, renderer) {
    const loader = new FBXLoader();

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

    renderer.xr.addEventListener('sessionstart', () => { isVR = true; });
    renderer.xr.addEventListener('sessionend', () => { isVR = false; });

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

export function updatePlayer(delta, camera, mapData) {
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
    // No movemos la cámara manualmente para evitar mareo y que se “pelee” con el tracking.
    if (!isVR) {
        if (isColliding) camera.position.lerp(finalCamPos, 0.4);
        else camera.position.lerp(finalCamPos, 0.2);

        camera.lookAt(character.position.clone().add(new THREE.Vector3(0, 120, 0)));
    }
}