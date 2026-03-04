import * as THREE from 'three';

export const loadingManager = new THREE.LoadingManager();
const textureLoader = new THREE.TextureLoader(loadingManager);
const audioLoader = new THREE.AudioLoader(loadingManager);

export const images = {
    bg: null // No longer using bg texture, we use black background
};

export const sounds = {
    bgMusic: null,
    shoot: null,
    move: null,
    explosion: null,
    laser2: null,
    siren: null,
    homingExplosion: null,
    speedsterShoot: null,
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

function generateExplosionBuffer() {
    const ctx = THREE.AudioContext.getContext();
    const sampleRate = ctx.sampleRate;
    const duration = 0.8;
    const buffer = ctx.createBuffer(1, sampleRate * duration, sampleRate);
    const data = buffer.getChannelData(0);

    let lastVal = 0;
    for (let i = 0; i < buffer.length; i++) {
        const time = i / sampleRate;

        // White noise base
        const whiteNoise = Math.random() * 2 - 1;

        // Low pass filter logic to make it bassy (lowered alpha to cut more high freq)
        const alpha = 0.02 + time * 0.05; // Filter opens up then closes slower
        const filtered = lastVal + Math.min(Math.max(alpha, 0), 1) * (whiteNoise - lastVal);
        lastVal = filtered;

        // Envelope: sudden loud hit, fast decay
        const envelope = Math.exp(-time * 4); // decay slightly slower

        // Add a "pitch drop" feel using a low frequency sine that drops out (intensified bass)
        // Start lower (80hz) and drop to (20hz) over time
        const subBass = Math.sin(2 * Math.PI * (80 - time * 60) * time) * 0.8;

        data[i] = (filtered * 0.6 + subBass) * envelope;
    }
    sounds.explosion = buffer;
}

function generateHomingExplosionBuffer() {
    const ctx = THREE.AudioContext.getContext();
    const sampleRate = ctx.sampleRate;
    const duration = 0.5;
    const buffer = ctx.createBuffer(1, sampleRate * duration, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < buffer.length; i++) {
        const time = i / sampleRate;
        const whiteNoise = Math.random() * 2 - 1;

        // Fast crackling noise
        const envelope = Math.exp(-time * 10);

        // Add a high pitched zap to it to sound "electric" or "missile-like"
        const zap = Math.sin(2 * Math.PI * (800 - time * 600) * time) * 0.4;

        data[i] = (whiteNoise * 0.5 + zap) * envelope;
    }
    sounds.homingExplosion = buffer;
}

function generateSpeedsterShootBuffer() {
    const ctx = THREE.AudioContext.getContext();
    const sampleRate = ctx.sampleRate;
    const duration = 0.2;
    const buffer = ctx.createBuffer(1, sampleRate * duration, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < buffer.length; i++) {
        const time = i / sampleRate;

        // Very fast, high pitched pew
        // Starts at 1200 hz, drops rapidly to 400 hz
        const freq = 1200 - time * 4000;
        const osc = Math.sin(2 * Math.PI * Math.max(freq, 400) * time);

        const envelope = Math.exp(-time * 15);

        data[i] = osc * 0.4 * envelope; // slightly quieter as it fires faster
    }
    sounds.speedsterShoot = buffer;
}

export function loadAssets(onLoadCallback) {
    loadingManager.onLoad = onLoadCallback;

    audioLoader.load('assets/tema.mp3', (buffer) => sounds.bgMusic = buffer);
    audioLoader.load('assets/shoot.ogg', (buffer) => sounds.shoot = buffer);
    audioLoader.load('assets/ship_moving.ogg', (buffer) => sounds.move = buffer);
    audioLoader.load('assets/laser2.ogg', (buffer) => sounds.laser2 = buffer);

    generateSirenBuffer();
    generateExplosionBuffer();
    generateHomingExplosionBuffer();
    generateSpeedsterShootBuffer();
}
