import * as THREE from 'three';

export const loadingManager = new THREE.LoadingManager();
const textureLoader = new THREE.TextureLoader(loadingManager);
const audioLoader = new THREE.AudioLoader(loadingManager);

export const images = {
    bg: null // No longer using bg texture, we use black background
};

export const sounds = {
    shoot: null,
    move: null,
    explosion: null,
    laser2: null,
};

export function loadAssets(onLoadCallback) {
    loadingManager.onLoad = onLoadCallback;

    audioLoader.load('assets/shoot.ogg', (buffer) => sounds.shoot = buffer);
    audioLoader.load('assets/ship_moving.ogg', (buffer) => sounds.move = buffer);
    audioLoader.load('assets/explosion.ogg', (buffer) => sounds.explosion = buffer);
    audioLoader.load('assets/laser2.ogg', (buffer) => sounds.laser2 = buffer);
}
