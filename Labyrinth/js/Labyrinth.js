import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

function crearTexturaDeVideo(ruta) {
    const video = document.createElement('video');

    video.src = ruta;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';
    video.preload = 'auto';

    const textura = new THREE.VideoTexture(video);
    textura.colorSpace = THREE.SRGBColorSpace;

    video.addEventListener('canplay', () => {
        video.play().catch((e) => {
            console.warn('Video pausado:', ruta, e);
        });
    });

    video.addEventListener('error', () => {
        console.warn('No se pudo cargar video:', ruta);
    });

    return textura;
}

function crearTexturaGlifo(numero, posicionIndex) {
    const canvas = document.createElement('canvas');

    canvas.width = 256;
    canvas.height = 256;

    const context = canvas.getContext('2d');

    context.fillStyle = 'rgba(0, 0, 0, 0)';
    context.fillRect(0, 0, 256, 256);

    context.font = 'bold 130px Arial';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = '#0dcaf0';
    context.shadowColor = '#000000';
    context.shadowBlur = 15;
    context.fillText(numero, 128, 100);

    let puntos = '';

    for (let i = 0; i <= posicionIndex; i++) {
        puntos += '• ';
    }

    context.font = 'bold 40px Arial';
    context.fillText(puntos.trim(), 128, 200);

    const textura = new THREE.CanvasTexture(canvas);
    textura.colorSpace = THREE.SRGBColorSpace;

    return textura;
}

function randomSeguro() {
    if (window.crypto && window.crypto.getRandomValues) {
        const array = new Uint32Array(1);
        window.crypto.getRandomValues(array);
        return array[0] / 4294967295;
    }

    return Math.random();
}

export function construirMundo(scene) {
    const texLoader = new THREE.TextureLoader();
    const gltfLoader = new GLTFLoader();

    const mapState = {
        obstacles: [],
        portalsArray: [],
        linkedPortals: [],
        randomPortals: [],
        safeSpots: [],
        spawnPosition: new THREE.Vector3(),
        escapeDoor: null,
        doorPos: new THREE.Vector3(),
        doorBarrier: null,
        doorGridIndex: null,
        pinpadObj: null,
        codigoSecreto: [],
        grid: [],
        tileSize: 250,
        offset: 0,

        mapName: '',
        mapIndex: 0,
        mapTexture: ''
    };

    const glifosPosibles = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

    for (let i = 0; i < 4; i++) {
        const index = Math.floor(randomSeguro() * glifosPosibles.length);
        mapState.codigoSecreto.push(glifosPosibles.splice(index, 1)[0]);
    }

    const tileSize = 250;
    const tamanoMapa = 15 * tileSize;

    const floorTex = texLoader.load('assets/Alfombra.jpg');

    floorTex.wrapS = THREE.RepeatWrapping;
    floorTex.wrapT = THREE.RepeatWrapping;
    floorTex.repeat.set(15, 15);

    const floorMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(tamanoMapa, tamanoMapa),
        new THREE.MeshStandardMaterial({
            map: floorTex,
            roughness: 0.9
        })
    );

    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.set(-125, 0, -125);
    floorMesh.receiveShadow = true;

    scene.add(floorMesh);

    const geomMuro = new THREE.BoxGeometry(tileSize, 350, tileSize);

    const mapa1 = [
        [1, 1, 1, 1, 1, 1, 1, 5, 1, 1, 1, 1, 1, 1, 1],
        [1, 8, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 9, 0, 1],
        [1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1, 0, 1],
        [1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1],
        [1, 0, 1, 0, 1, 1, 1, 1, 1, 0, 1, 0, 1, 0, 1],
        [1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 9, 0, 0, 1],
        [1, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        [1, 9, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 0, 1],
        [1, 0, 1, 9, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 1],
        [1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1, 1],
        [1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1],
        [1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1],
        [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 8, 0, 1],
        [1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1]
    ];

    const mapa2 = [
        [1, 1, 1, 1, 1, 1, 1, 5, 1, 1, 1, 1, 1, 1, 1],
        [1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 8, 0, 0, 1],
        [1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1],
        [1, 9, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1],
        [1, 0, 1, 1, 1, 1, 1, 0, 1, 1, 1, 0, 1, 0, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1],
        [1, 1, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1, 1],
        [1, 0, 0, 0, 1, 0, 1, 9, 0, 0, 1, 0, 0, 0, 1],
        [1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1],
        [1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0, 1, 8, 1],
        [1, 0, 1, 1, 1, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1],
        [1, 9, 0, 0, 0, 0, 0, 0, 0, 0, 0, 9, 0, 0, 1],
        [1, 1, 1, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1, 0, 1],
        [1, 9, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1],
        [1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1]
    ];

    const mapa3 = [
        [1, 1, 1, 1, 1, 1, 1, 5, 1, 1, 1, 1, 1, 1, 1],
        [1, 8, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 9, 1],
        [1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1],
        [1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1],
        [1, 0, 1, 0, 1, 1, 0, 0, 0, 1, 1, 0, 1, 0, 1],
        [1, 9, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1],
        [1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1],
        [1, 0, 0, 0, 0, 0, 0, 9, 0, 0, 0, 0, 0, 0, 1],
        [1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1],
        [1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 9, 1],
        [1, 0, 1, 0, 1, 1, 0, 0, 0, 1, 1, 0, 1, 0, 1],
        [1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1],
        [1, 0, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 1],
        [1, 9, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 8, 0, 1],
        [1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1]
    ];

    const mapa4 = [
        [1, 1, 1, 1, 1, 1, 1, 5, 1, 1, 1, 1, 1, 1, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 8, 1],
        [1, 0, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 1],
        [1, 9, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1],
        [1, 0, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 0, 1],
        [1, 0, 0, 0, 1, 0, 0, 9, 0, 0, 1, 0, 0, 0, 1],
        [1, 1, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1],
        [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1],
        [1, 1, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1],
        [1, 9, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 9, 1],
        [1, 0, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 0, 1],
        [1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 9, 1],
        [1, 0, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 1],
        [1, 8, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1],
        [1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1]
    ];

    const catalogoMapas = [
        {
            name: 'Mapa 1',
            grid: mapa1,
            texture: 'tapiz.webp'
        },
        {
            name: 'Mapa 2',
            grid: mapa2,
            texture: 'tapiz.webp'
        },
        {
            name: 'Mapa 3',
            grid: mapa3,
            texture: 'Fun.png'
        },
        {
            name: 'Mapa 4',
            grid: mapa4,
            texture: 'Fun.png'
        }
    ];

    const mapIndex = Math.floor(randomSeguro() * catalogoMapas.length);
    const mapSelection = catalogoMapas[mapIndex];
    const mapa = mapSelection.grid;

    mapState.mapName = mapSelection.name;
    mapState.mapIndex = mapIndex;
    mapState.mapTexture = mapSelection.texture;

    console.log('Laberinto aleatorio seleccionado:', mapState.mapName);
    console.log('Índice del laberinto:', mapState.mapIndex);
    console.log('Textura del laberinto:', mapState.mapTexture);

    const texMuro = texLoader.load('assets/' + mapSelection.texture);

    texMuro.wrapS = THREE.RepeatWrapping;
    texMuro.wrapT = THREE.RepeatWrapping;
    texMuro.repeat.set(1, 1);

    const matMuroTapiz = new THREE.MeshStandardMaterial({
        map: texMuro,
        roughness: 0.8
    });

    const matPortalB = new THREE.MeshBasicMaterial({
        map: crearTexturaDeVideo('assets/portal_b.webm'),
        transparent: true,
        side: THREE.DoubleSide
    });

    const matPortalP = new THREE.MeshBasicMaterial({
        map: crearTexturaDeVideo('assets/portal_p.webm'),
        transparent: true,
        side: THREE.DoubleSide
    });

    const geomPortal = new THREE.PlaneGeometry(200, 200);

    const offset = (mapa.length * tileSize) / 2;

    mapState.grid = mapa;
    mapState.offset = offset;

    let spawnPositionSet = false;
    const paredesDisponibles = [];

    const catalogoDecoraciones = [
        'models/cactus_maceta.glb',
        'models/maceta.glb'
    ];

    const cargarPropEscena = (ruta, config) => {
        gltfLoader.load(
            ruta,
            (gltf) => {
                const m = gltf.scene;

                m.scale.set(config.escala, config.escala, config.escala);
                m.position.set(config.x, config.y || 0, config.z);

                if (config.rotY) {
                    m.rotation.y = config.rotY;
                }

                m.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;

                        if (child.material) {
                            const materials = Array.isArray(child.material)
                                ? child.material
                                : [child.material];

                            materials.forEach((mat) => {
                                if (mat.normalMap) {
                                    mat.normalMap.dispose();
                                    mat.normalMap = null;
                                }

                                if (mat.specularMap) {
                                    mat.specularMap.dispose();
                                    mat.specularMap = null;
                                }

                                if (mat.aoMap) {
                                    mat.aoMap.dispose();
                                    mat.aoMap = null;
                                }

                                if (mat.map) {
                                    mat.color.set(0xffffff);
                                }

                                mat.roughness = 0.8;
                                mat.metalness = 0.1;
                                mat.needsUpdate = true;
                            });
                        }
                    }
                });

                scene.add(m);

                m.updateMatrixWorld(true);
                m.boundingBox = new THREE.Box3().setFromObject(m);

                if (config.alignGround) {
                    m.position.y += -m.boundingBox.min.y;
                    m.updateMatrixWorld(true);
                    m.boundingBox.setFromObject(m);
                }

                if (config.isObstacle !== false) {
                    mapState.obstacles.push(m);
                }

                if (config.onLoad) {
                    config.onLoad(m);
                }
            },
            undefined,
            (error) => {
                console.error('Error cargando GLB:', ruta, error);
            }
        );
    };

    let totalMuros = 0;

    for (let f = 0; f < mapa.length; f++) {
        for (let c = 0; c < mapa[f].length; c++) {
            if (mapa[f][c] === 1 || mapa[f][c] === 5) {
                totalMuros++;
            }
        }
    }

    const instancedWalls = new THREE.InstancedMesh(
        geomMuro,
        matMuroTapiz,
        totalMuros
    );

    instancedWalls.castShadow = false;
    instancedWalls.receiveShadow = true;

    const dummy = new THREE.Object3D();
    let wallCounter = 0;

    for (let f = 0; f < mapa.length; f++) {
        for (let c = 0; c < mapa[f].length; c++) {
            const posX = c * tileSize - offset;
            const posZ = f * tileSize - offset;
            const valor = mapa[f][c];

            if (valor === 1 || valor === 5) {
                dummy.position.set(posX, 175, posZ);
                dummy.updateMatrix();

                instancedWalls.setMatrixAt(wallCounter, dummy.matrix);
                wallCounter++;

                if (valor === 5) {
                    let pRotY = 0;
                    let pOffsetZ = 0;
                    let pOffsetX = 0;

                    if (mapa[f + 1] && mapa[f + 1][c] === 0) {
                        pRotY = 0;
                        pOffsetZ = 125;
                    } else if (mapa[f - 1] && mapa[f - 1][c] === 0) {
                        pRotY = Math.PI;
                        pOffsetZ = -125;
                    } else if (mapa[f][c + 1] === 0) {
                        pRotY = Math.PI / 2;
                        pOffsetX = 125;
                    } else if (mapa[f][c - 1] === 0) {
                        pRotY = -Math.PI / 2;
                        pOffsetX = -125;
                    }

                    cargarPropEscena('models/pinpad.glb', {
                        escala: 3.5,
                        x: posX + pOffsetX,
                        y: 150,
                        z: posZ + pOffsetZ,
                        rotY: pRotY,
                        onLoad: (mesh) => {
                            mapState.pinpadObj = mesh;
                            console.log('Pinpad cargado en:', mesh.position);
                        },
                        isObstacle: false
                    });
                } else {
                    if (mapa[f + 1] && mapa[f + 1][c] === 0) {
                        paredesDisponibles.push({
                            x: posX,
                            z: posZ + 125,
                            rotY: 0,
                            isFloor: false
                        });
                    }

                    if (mapa[f - 1] && mapa[f - 1][c] === 0) {
                        paredesDisponibles.push({
                            x: posX,
                            z: posZ - 125,
                            rotY: Math.PI,
                            isFloor: false
                        });
                    }

                    if (mapa[f][c + 1] === 0) {
                        paredesDisponibles.push({
                            x: posX + 125,
                            z: posZ,
                            rotY: -Math.PI / 2,
                            isFloor: false
                        });
                    }

                    if (mapa[f][c - 1] === 0) {
                        paredesDisponibles.push({
                            x: posX - 125,
                            z: posZ,
                            rotY: Math.PI / 2,
                            isFloor: false
                        });
                    }
                }
            } else if (valor === 2) {
                mapState.doorPos.set(posX, 0, posZ);
                mapState.doorGridIndex = {
                    r: f,
                    c: c
                };

                let dRotY = 0;
                let dOffsetX = 0;
                let dOffsetZ = 0;

                const pushDoor = 125;

                if (mapa[f - 1] && mapa[f - 1][c] === 0) {
                    dRotY = 0;
                    dOffsetZ = -pushDoor;
                } else if (mapa[f + 1] && mapa[f + 1][c] === 0) {
                    dRotY = Math.PI;
                    dOffsetZ = pushDoor;
                } else if (mapa[f][c - 1] === 0) {
                    dRotY = Math.PI / 2;
                    dOffsetX = pushDoor;
                } else if (mapa[f][c + 1] === 0) {
                    dRotY = -Math.PI / 2;
                    dOffsetX = -pushDoor;
                }

                cargarPropEscena('models/door.glb', {
                    escala: 2.2,
                    x: posX + dOffsetX,
                    y: 0,
                    z: posZ + dOffsetZ,
                    rotY: dRotY,
                    alignGround: true,
                    onLoad: (mesh) => {
                        mapState.escapeDoor = mesh;
                        console.log('Puerta cargada en:', mesh.position);
                    },
                    isObstacle: false
                });

                const doorBarrier = new THREE.Mesh(
                    new THREE.BoxGeometry(tileSize, 350, 40),
                    new THREE.MeshBasicMaterial({
                        visible: false
                    })
                );

                doorBarrier.position.set(posX, 175, posZ);
                doorBarrier.updateMatrixWorld();

                mapState.obstacles.push(doorBarrier);
                mapState.doorBarrier = doorBarrier;
            } else if (valor === 8) {
                mapState.linkedPortals.push(new THREE.Vector3(posX, 0, posZ));

                const p = new THREE.Mesh(geomPortal, matPortalB);
                p.position.set(posX, 100, posZ);

                scene.add(p);
                mapState.portalsArray.push(p);
            } else if (valor === 9) {
                mapState.randomPortals.push(new THREE.Vector3(posX, 0, posZ));

                const p = new THREE.Mesh(geomPortal, matPortalP);
                p.position.set(posX, 100, posZ);

                scene.add(p);
                mapState.portalsArray.push(p);
            } else if (valor === 0) {
                if (!spawnPositionSet) {
                    mapState.spawnPosition.set(posX, 0, posZ);
                    spawnPositionSet = true;
                }

                mapState.safeSpots.push(new THREE.Vector3(posX, 0, posZ));

                paredesDisponibles.push({
                    x: posX,
                    z: posZ,
                    rotY: 0,
                    isFloor: true
                });

                let offsetX = 0;
                let offsetZ = 0;
                let formsL = false;

                const pushAmount = 75;

                const N = mapa[f - 1] ? mapa[f - 1][c] : 1;
                const S = mapa[f + 1] ? mapa[f + 1][c] : 1;
                const W = mapa[f][c - 1] !== undefined ? mapa[f][c - 1] : 1;
                const E = mapa[f][c + 1] !== undefined ? mapa[f][c + 1] : 1;

                if (N === 1 && W === 1 && S !== 1 && E !== 1) {
                    formsL = true;
                    offsetZ = -pushAmount;
                    offsetX = -pushAmount;
                } else if (N === 1 && E === 1 && S !== 1 && W !== 1) {
                    formsL = true;
                    offsetZ = -pushAmount;
                    offsetX = pushAmount;
                } else if (S === 1 && W === 1 && N !== 1 && E !== 1) {
                    formsL = true;
                    offsetZ = pushAmount;
                    offsetX = -pushAmount;
                } else if (S === 1 && E === 1 && N !== 1 && W !== 1) {
                    formsL = true;
                    offsetZ = pushAmount;
                    offsetX = pushAmount;
                }

                const isSpawn =
                    Math.abs(posX - mapState.spawnPosition.x) < 10 &&
                    Math.abs(posZ - mapState.spawnPosition.z) < 10;

                if (formsL && !isSpawn && randomSeguro() > 0.40) {
                    const recursoElegido =
                        catalogoDecoraciones[
                            Math.floor(randomSeguro() * catalogoDecoraciones.length)
                        ];

                    const esCactus = recursoElegido.includes('cactus');

                    cargarPropEscena(recursoElegido, {
                        escala: esCactus ? 50.0 : 1.0,
                        x: posX + offsetX,
                        z: posZ + offsetZ,
                        alignGround: true
                    });
                } else if (
                    !formsL &&
                    !isSpawn &&
                    (N === 1 || S === 1 || E === 1 || W === 1) &&
                    randomSeguro() > 0.70
                ) {
                    const recursoElegido =
                        catalogoDecoraciones[
                            Math.floor(randomSeguro() * catalogoDecoraciones.length)
                        ];

                    const esCactus = recursoElegido.includes('cactus');

                    let pOffsetX = 0;
                    let pOffsetZ = 0;

                    if (N === 1) {
                        pOffsetZ = -pushAmount;
                    } else if (S === 1) {
                        pOffsetZ = pushAmount;
                    } else if (W === 1) {
                        pOffsetX = -pushAmount;
                    } else if (E === 1) {
                        pOffsetX = pushAmount;
                    }

                    cargarPropEscena(recursoElegido, {
                        escala: esCactus ? 50.0 : 1.0,
                        x: posX + pOffsetX,
                        z: posZ + pOffsetZ,
                        alignGround: true
                    });
                }
            }
        }
    }

    instancedWalls.instanceMatrix.needsUpdate = true;
    instancedWalls.isInstancedMesh = true;

    scene.add(instancedWalls);
    mapState.obstacles.push(instancedWalls);

    paredesDisponibles.sort(() => randomSeguro() - 0.5);

    const lugaresParaCodigo = paredesDisponibles.splice(0, 4);

    for (let i = 0; i < 4; i++) {
        const data = lugaresParaCodigo[i];

        if (!data) continue;

        const meshSimbolo = new THREE.Mesh(
            new THREE.PlaneGeometry(120, 120),
            new THREE.MeshBasicMaterial({
                map: crearTexturaGlifo(mapState.codigoSecreto[i], i),
                transparent: true
            })
        );

        if (data.isFloor) {
            meshSimbolo.position.set(data.x, 2, data.z);
            meshSimbolo.rotation.x = -Math.PI / 2;
        } else {
            meshSimbolo.position.set(data.x, 150, data.z);
            meshSimbolo.rotation.y = data.rotY;
        }

        scene.add(meshSimbolo);
    }

    let cuadrosGenerados = 0;

    for (let i = 0; i < paredesDisponibles.length; i++) {
        const data = paredesDisponibles[i];

        if (!data.isFloor && randomSeguro() > 0.50 && cuadrosGenerados < 30) {
            cargarPropEscena('models/cuadro.glb', {
                escala: 1.4,
                x: data.x,
                y: 180,
                z: data.z,
                rotY: data.rotY,
                isObstacle: false
            });

            cuadrosGenerados++;
        }
    }

    console.log('Código secreto generado:', mapState.codigoSecreto.join(''));
    console.log('Spawn:', mapState.spawnPosition);
    console.log('Posición lógica de puerta:', mapState.doorPos);
    console.log('Portales vinculados:', mapState.linkedPortals.length);
    console.log('Portales aleatorios:', mapState.randomPortals.length);

    return mapState;
}