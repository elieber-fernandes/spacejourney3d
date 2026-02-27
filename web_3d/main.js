import * as THREE from 'three';
import { Player, Laser, PowerUp } from './entities.js';
import { loadAssets, loadingManager, sounds } from './src/assets.js';
import { WaveManager } from './src/managers.js';
import { ExplosionManager, EngineTrail } from './src/effects.js';

// --- GAME STATE ---
let gameState = 'START'; // 'START', 'PLAYING', 'GAMEOVER'
let score = 0;
let level = 1;

// --- DOM ELEMENTS ---
const startScreen = document.getElementById('start-screen');
const startBtn = document.getElementById('start-btn');
const loadingText = document.getElementById('loading-text');
const hud = document.getElementById('hud');
const scoreVal = document.getElementById('score-val');
const healthVal = document.getElementById('health-val');
const heatBar = document.getElementById('heat-bar');
const heatBarBg = document.getElementById('heat-bar-bg');
const waveBanner = document.getElementById('wave-banner');
const waveVal = document.getElementById('wave-val');

// --- SOUNDS FUNC ---
function playSound(audioBuffer, volume = 0.5) {
    if (!audioBuffer) return;
    const listener = new THREE.AudioListener();
    camera.add(listener);
    const audio = new THREE.Audio(listener);
    audio.setBuffer(audioBuffer);
    audio.setVolume(volume);
    audio.play();

    // Clean up listener context eventually
    audio.onEnded = function () {
        camera.remove(listener);
    }
}

// --- THREE.JS SETUP ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
scene.fog = new THREE.FogExp2(0x000000, 0.002);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 15, 20);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1);
dirLight.position.set(10, 20, 10);
dirLight.castShadow = true;
scene.add(dirLight);

// Starfield
const starGeo = new THREE.BufferGeometry();
const starCount = 3000;
const starPos = new Float32Array(starCount * 3);
for (let i = 0; i < starCount * 3; i += 3) {
    starPos[i] = (Math.random() - 0.5) * 200; // x
    starPos[i + 1] = (Math.random() - 0.5) * 50 - 15; // y
    starPos[i + 2] = (Math.random() - 0.5) * 200; // z
}
starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.1 });
const stars = new THREE.Points(starGeo, starMat);
scene.add(stars);

// --- ENTITIES & MANAGERS ---
const player = new Player(scene);
let lasers = [];
let enemyLasers = [];
let enemies = [];
let powerups = [];
const waveManager = new WaveManager(scene);
const explosionManager = new ExplosionManager(scene);
const engineTrail = new EngineTrail(scene);

// Screen shake params
let shakeDuration = 0;

// --- INPUT HANDLING ---
const keys = { w: false, a: false, s: false, d: false, ArrowUp: false, ArrowLeft: false, ArrowDown: false, ArrowRight: false, Space: false, ShiftLeft: false, ShiftRight: false, Shift: false };

window.addEventListener('keydown', (e) => {
    if (keys.hasOwnProperty(e.key) || e.code === 'Space' || e.key === 'Shift') {
        if (e.code === 'Space') {
            e.preventDefault(); // Prevent Space from pressing focused buttons or scrolling
            keys['Space'] = true;
            player.shoot(lasers);
            if (gameState === 'PLAYING') playSound(sounds.shoot);
        }
        else if (e.key === 'Shift') keys['Shift'] = true;
        else keys[e.key] = true;
    }
});

window.addEventListener('keyup', (e) => {
    if (keys.hasOwnProperty(e.key) || e.code === 'Space' || e.key === 'Shift') {
        if (e.code === 'Space') keys['Space'] = false;
        else if (e.key === 'Shift') keys['Shift'] = false;
        else keys[e.key] = false;
    }
});

// --- HELPER FUNC ---
function checkCollision(obj1, obj2, threshold = 2.0) {
    if (!obj1 || !obj2) return false;
    return obj1.position.distanceTo(obj2.position) < threshold;
}

// --- GAME LOOP ---
let lastTime = Date.now();
function animate() {
    requestAnimationFrame(animate);
    const now = Date.now();
    const dt = now - lastTime;
    lastTime = now;

    if (gameState === 'PLAYING') {
        // Camera Shake
        if (shakeDuration > 0) {
            shakeDuration--;
            camera.position.x = (Math.random() - 0.5) * 0.5;
            camera.position.y = 15 + (Math.random() - 0.5) * 0.5;
        } else {
            camera.position.set(0, 15, 20);
        }

        // Update Starfield
        const positions = stars.geometry.attributes.position.array;
        for (let i = 2; i < starCount * 3; i += 3) {
            positions[i] += 0.5; // move stars towards camera (z-axis)
            if (positions[i] > 50) {
                positions[i] -= 200; // reset back
            }
        }
        stars.geometry.attributes.position.needsUpdate = true;

        // Wave logic & managers
        const prevWaveState = waveManager.state;
        const currentWaveNum = waveManager.currentWave;

        waveManager.update(enemies);

        // Announce Wave Start
        if (waveManager.state === 'SPAWNING' && prevWaveState === 'WAVE_START') {
            waveBanner.classList.remove('hidden');
            if (waveManager.currentWave % 5 === 0) {
                waveVal.innerText = `BOSS WAVE ${waveManager.currentWave}`;
                waveVal.style.color = '#ff5500';
            } else {
                waveVal.innerText = `WAVE ${waveManager.currentWave}`;
                waveVal.style.color = '#00ffff';
            }
            setTimeout(() => { waveBanner.classList.add('hidden'); }, 2000);
        }

        explosionManager.update();

        // Update Player
        player.update(keys, lasers);

        // Spawn engine trails if player is moving or idling
        engineTrail.spawnTrail(player.mesh.position, player.isDashing);
        engineTrail.update();

        // Update Heat UI
        heatBar.style.width = `${player.heat}%`;
        if (player.isOverheated) {
            heatBarBg.classList.add('overheated');
        } else {
            heatBarBg.classList.remove('overheated');
            // Shift color based on heat gradually
            if (player.heat > 75) heatBar.style.backgroundColor = '#ff6600'; // Orange
            else heatBar.style.backgroundColor = '#ffff00'; // Yellow
        }

        // Update Powerups
        for (let i = powerups.length - 1; i >= 0; i--) {
            const p = powerups[i];
            p.update();

            if (checkCollision(player.mesh, p.mesh, 2.0)) {
                if (p.type === 'health') {
                    player.health = Math.min(100, player.health + 20);
                } else if (p.type === 'shield') {
                    player.shieldActive = true;
                } else if (p.type === 'triple_shot') {
                    // This is now plasma_shot
                    player.tripleShotTimer = 800;
                    player.spreadShotTimer = 0;
                    player.speedBoostTimer = 0;
                } else if (p.type === 'spread_shot') {
                    player.spreadShotTimer = 800;
                    player.tripleShotTimer = 0;
                    player.speedBoostTimer = 0;
                } else if (p.type === 'rapid_fire') {
                    player.speedBoostTimer = 600; // Reuse speed boost timer internally for rapid fire
                    player.spreadShotTimer = 0;
                    player.tripleShotTimer = 0;
                }

                healthVal.innerText = player.health;
                p.destroy();
                powerups.splice(i, 1);
            } else if (!p.active) {
                p.destroy();
                powerups.splice(i, 1);
            }
        }

        // Update Lasers
        for (let i = lasers.length - 1; i >= 0; i--) {
            const l = lasers[i];
            l.update();
            if (!l.active) {
                l.destroy();
                lasers.splice(i, 1);
            }
        }

        // Update Enemy Lasers
        for (let i = enemyLasers.length - 1; i >= 0; i--) {
            const el = enemyLasers[i];
            el.update();

            if (el.active && !player.isDashing && checkCollision(player.mesh, el.mesh, 1.5)) {
                el.active = false;
                if (player.shieldActive) {
                    player.shieldActive = false;
                } else {
                    player.health -= (el.isHeavy ? 20 : 10);
                    shakeDuration = 10;
                    healthVal.innerText = player.health;
                    explosionManager.createExplosion(player.mesh.position, 0xff0000);
                    playSound(sounds.explosion);

                    if (player.health <= 0) {
                        gameState = 'GAMEOVER';
                        startScreen.innerHTML = `<h1>GAME OVER</h1><p style="margin-bottom: 20px; font-size: 1.5rem;">Score: ${player.score}</p><button id="start-btn" onclick="location.reload()">Restart</button>`;
                        startScreen.classList.remove('hidden');
                        hud.classList.add('hidden');
                    }
                }
            }

            if (!el.active) {
                el.destroy();
                enemyLasers.splice(i, 1);
            }
        }

        // Update Enemies & Collisions
        for (let i = enemies.length - 1; i >= 0; i--) {
            const e = enemies[i];
            e.update(player, enemyLasers);

            // Check collision with Player
            if (!player.isDashing && checkCollision(player.mesh, e.mesh, e.size ? e.size : 2.5)) {
                e.active = false;
                if (player.shieldActive) {
                    player.shieldActive = false;
                } else {
                    player.health -= 20;
                    shakeDuration = 20;
                    healthVal.innerText = player.health;
                    explosionManager.createExplosion(player.mesh.position, 0xff0000);
                    playSound(sounds.explosion);

                    if (player.health <= 0) {
                        gameState = 'GAMEOVER';
                        startScreen.innerHTML = `<h1>GAME OVER</h1><p style="margin-bottom: 20px; font-size: 1.5rem;">Score: ${player.score}</p><button id="start-btn" onclick="location.reload()">Restart</button>`;
                        startScreen.classList.remove('hidden');
                        hud.classList.add('hidden');
                    }
                }
            }

            // Check collision with Player Lasers
            for (let j = lasers.length - 1; j >= 0; j--) {
                const l = lasers[j];
                if (l.active && checkCollision(l.mesh, e.mesh, e.size ? e.size : 2.5)) {
                    if (!l.isPlasma) {
                        l.active = false; // Normal lasers get destroyed on impact
                    }
                    const points = e.takeDamage(l.isPlasma ? 10 : 1); // Plasma does 10 damage instantly

                    if (!e.active) {
                        player.score += points;
                        scoreVal.innerText = player.score;
                        explosionManager.createExplosion(e.mesh.position, 0xffaa00);
                        playSound(sounds.explosion);

                        // Drop powerup
                        if (Math.random() < 0.2 || (e.isHeavy && Math.random() < 0.5) || e.hp > 100) { // Boss drops guaranteed
                            const types = ['health', 'shield', 'plasma_shot', 'spread_shot', 'rapid_fire'];
                            const pType = types[Math.floor(Math.random() * types.length)];
                            powerups.push(new PowerUp(scene, e.mesh.position.x, e.mesh.position.z, pType));
                        }
                    }
                    break;
                }
            }

            if (!e.active) {
                e.destroy();
                enemies.splice(i, 1);
            }
        }
    } else {
        // Idle animation
    }

    renderer.render(scene, camera);
}

// --- RESIZE ---
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- UI INTERACTIONS ---
startBtn.addEventListener('click', () => {
    startBtn.blur(); // Remove focus so Spacebar doesn't trigger it again

    gameState = 'PLAYING';
    startScreen.classList.add('hidden');
    hud.classList.remove('hidden');

    player.reset();
    healthVal.innerText = player.health;
    scoreVal.innerText = player.score;
    lasers.forEach(l => l.destroy());
    lasers = [];
    enemyLasers.forEach(el => el.destroy());
    enemyLasers = [];
    enemies.forEach(e => e.destroy());
    enemies = [];
    powerups.forEach(p => p.destroy());
    powerups = [];

    waveManager.startWave(1);
});

// --- ASSETS LOADING ---
loadingManager.onProgress = function (url, itemsLoaded, itemsTotal) {
    loadingText.innerText = `Loading Assets... ${Math.round((itemsLoaded / itemsTotal) * 100)}%`;
};

loadAssets(() => {
    loadingText.classList.add('hidden');
    startBtn.classList.remove('hidden');
    scene.background = new THREE.Color(0x000000);
});

// START
animate();
