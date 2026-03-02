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
    siren: null,
};

function generateSirenBuffer() {
    const ctx = THREE.AudioContext.getContext();
    const sampleRate = ctx.sampleRate;
    const duration = 2.0;
    const buffer = ctx.createBuffer(1, sampleRate * duration, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < buffer.length; i++) {
        const time = i / sampleRate;
        // Alternating 600Hz and 400Hz every 0.5s
        const freq = time % 1.0 < 0.5 ? 600 : 400;
        data[i] = Math.sin(2 * Math.PI * freq * time) > 0 ? 0.3 : -0.3; // Square wave
    }
    sounds.siren = buffer;
}

export function loadAssets(onLoadCallback) {
    loadingManager.onLoad = onLoadCallback;

    audioLoader.load('assets/shoot.ogg', (buffer) => sounds.shoot = buffer);
    audioLoader.load('assets/ship_moving.ogg', (buffer) => sounds.move = buffer);
    audioLoader.load('assets/explosion.ogg', (buffer) => sounds.explosion = buffer);
    audioLoader.load('assets/laser2.ogg', (buffer) => sounds.laser2 = buffer);

    generateSirenBuffer();
}
