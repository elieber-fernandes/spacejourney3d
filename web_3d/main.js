import * as THREE from 'three';
import { Player, Laser, PowerUp } from './entities.js';
import { loadAssets, loadingManager, sounds } from './src/assets.js';
import { WaveManager } from './src/managers.js';
import { ExplosionManager, EngineTrail } from './src/effects.js';

// --- GAME STATE ---
let gameState = 'START'; // 'START', 'PLAYING', 'GAMEOVER', 'PAUSED'
let score = 0;
let level = 1;

// --- PROGRESSION & UPGRADES ---
let highScore = parseInt(localStorage.getItem('space_highscore')) || 0;
let scrap = parseInt(localStorage.getItem('space_scrap')) || 0;
let upgHealth = parseInt(localStorage.getItem('space_upg_health')) || 0;
let upgHeat = parseInt(localStorage.getItem('space_upg_heat')) || 0;
let upgMagnet = parseInt(localStorage.getItem('space_upg_magnet')) || 0;

// Ships
let unlockedShips = JSON.parse(localStorage.getItem('space_unlocked_ships')) || [0];
let currentShipIndex = parseInt(localStorage.getItem('space_current_ship')) || 0;

function saveProgression() {
    localStorage.setItem('space_highscore', highScore);
    localStorage.setItem('space_scrap', scrap);
    localStorage.setItem('space_upg_health', upgHealth);
    localStorage.setItem('space_upg_heat', upgHeat);
    localStorage.setItem('space_upg_magnet', upgMagnet);
    localStorage.setItem('space_unlocked_ships', JSON.stringify(unlockedShips));
    localStorage.setItem('space_current_ship', currentShipIndex);
}

// --- SHIPS DEFINITION ---
const SHIPS = [
    {
        name: "Basic Ship",
        cost: 0,
        color: 0x00ffff,
        createMesh: () => {
            const geo = new THREE.ConeGeometry(1.5, 3, 8);
            geo.rotateX(-Math.PI / 2);
            return geo;
        },
        stats: { hpBase: 100, speedBase: 0.6, coolingBase: 0.5, heatCostMult: 1.0 }
    },
    {
        name: "Speedster",
        cost: 5000,
        color: 0xffff00,
        createMesh: () => {
            // Sleeker, thinner design
            const geo = new THREE.ConeGeometry(1.0, 4, 4);
            geo.rotateX(-Math.PI / 2);
            return geo;
        },
        stats: { hpBase: 70, speedBase: 0.8, coolingBase: 0.6, heatCostMult: 0.8 } // Faster, better cooling, less heat cost, but fragile
    },
    {
        name: "Heavy Cruiser",
        cost: 10000,
        color: 0xff0000,
        createMesh: () => {
            // Bulky, wide design
            const geo = new THREE.BoxGeometry(3, 1.5, 3);
            return geo;
        },
        stats: { hpBase: 200, speedBase: 0.4, coolingBase: 0.4, heatCostMult: 1.5 } // Tanky, slow, overheats slightly faster (or slow cool)
    }
];

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
const shopContainer = document.getElementById('shop-container');
const scrapVal = document.getElementById('scrap-val');
const highScoreDisplay = document.getElementById('high-score-display');
const highScoreVal = document.getElementById('high-score-val');
const pauseScreen = document.getElementById('pause-screen');
const resumeBtn = document.getElementById('resume-btn');
const quitBtn = document.getElementById('quit-btn');

// Hangar UI
const hangarContainer = document.getElementById('hangar-container');
const prevShipBtn = document.getElementById('prev-ship-btn');
const nextShipBtn = document.getElementById('next-ship-btn');
const shipName = document.getElementById('ship-name');
const shipStatus = document.getElementById('ship-status');
const buyShipBtn = document.getElementById('buy-ship-btn');
const shipCost = document.getElementById('ship-cost');

const floatingTextContainer = document.getElementById('floating-text-container');

let viewingShipIndex = currentShipIndex;

// --- SOUNDS FUNC ---
const bgListener = new THREE.AudioListener();
const bgMusic = new THREE.Audio(bgListener);

function playBgMusic() {
    if (sounds.bgMusic && !bgMusic.isPlaying) {
        bgMusic.setBuffer(sounds.bgMusic);
        bgMusic.setLoop(true);
        bgMusic.setVolume(0.4);
        bgMusic.play();
    }
}

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
camera.add(bgListener);

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
let obstacles = [];
const waveManager = new WaveManager(scene);
const explosionManager = new ExplosionManager(scene);
const engineTrail = new EngineTrail(scene);

// Screen shake params
let shakeDuration = 0;

// --- INPUT HANDLING ---
const keys = { w: false, a: false, s: false, d: false, ArrowUp: false, ArrowLeft: false, ArrowDown: false, ArrowRight: false, Space: false, ShiftLeft: false, ShiftRight: false, Shift: false, Escape: false };

window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        togglePause();
    } else if (keys.hasOwnProperty(e.key) || e.code === 'Space' || e.key === 'Shift') {
        if (e.code === 'Space') {
            e.preventDefault(); // Prevent Space from pressing focused buttons or scrolling
            keys['Space'] = true;
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

// --- TOUCH HANDLING (MOBILE CONTROLS) ---
const mobileUI = document.getElementById('mobile-ui');
const joystickZone = document.getElementById('joystick-zone');
const joystickBase = document.getElementById('joystick-base');
const joystickKnob = document.getElementById('joystick-knob');
const fireBtn = document.getElementById('fire-btn');

let isTouchDevice = false;
let joystickActive = false;
let joystickStartPos = { x: 0, y: 0 };
let joystickTouchId = null;

// Only show mobile UI if touch starts
window.addEventListener('touchstart', () => {
    if (!isTouchDevice) {
        isTouchDevice = true;
        // The mobile UI is displayed ONLY when we start playing. We do not show it on the start screen.
    }
}, { once: true });

// Fire Button Logic
fireBtn.addEventListener('touchstart', (e) => {
    e.preventDefault(); // Prevents mouse emulation and scrolling
    keys['Space'] = true;
});
fireBtn.addEventListener('touchend', (e) => {
    e.preventDefault();
    keys['Space'] = false;
});
fireBtn.addEventListener('touchcancel', (e) => {
    e.preventDefault();
    keys['Space'] = false;
});

// Joystick Logic
joystickZone.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (joystickActive) return; // Prevent multiple touches on joystick

    for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        joystickTouchId = touch.identifier;
        joystickStartPos.x = touch.clientX;
        joystickStartPos.y = touch.clientY;
        joystickActive = true;

        joystickBase.classList.remove('hidden');
        joystickBase.style.left = `${touch.clientX}px`;
        joystickBase.style.top = `${touch.clientY}px`;
        joystickKnob.style.transform = `translate(-50%, -50%)`;
        break; // Only track one finger for joystick
    }
});

joystickZone.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (!joystickActive) return;

    for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier === joystickTouchId) {
            const dx = touch.clientX - joystickStartPos.x;
            const dy = touch.clientY - joystickStartPos.y;

            // Limit knob visual movement to a max radius (e.g. 50px)
            const magnitude = Math.hypot(dx, dy);
            const maxRadius = 50;
            let knobX = dx;
            let knobY = dy;

            if (magnitude > maxRadius) {
                knobX = (dx / magnitude) * maxRadius;
                knobY = (dy / magnitude) * maxRadius;
            }

            joystickKnob.style.transform = `translate(calc(-50% + ${knobX}px), calc(-50% + ${knobY}px))`;

            // Logic mapping -> Keyboard Keys
            // Threshold for direction to be considered "pressed"
            const threshold = 15;

            keys.w = dy < -threshold;
            keys.s = dy > threshold;
            keys.a = dx < -threshold;
            keys.d = dx > threshold;
        }
    }
});

function resetJoystick() {
    joystickActive = false;
    joystickTouchId = null;
    joystickBase.classList.add('hidden');
    keys.w = false;
    keys.s = false;
    keys.a = false;
    keys.d = false;
}

joystickZone.addEventListener('touchend', (e) => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === joystickTouchId) {
            resetJoystick();
        }
    }
});

joystickZone.addEventListener('touchcancel', (e) => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === joystickTouchId) {
            resetJoystick();
        }
    }
});

// --- PAUSE LOGIC ---
function togglePause() {
    if (gameState === 'PLAYING') {
        gameState = 'PAUSED';
        pauseScreen.classList.remove('hidden');
    } else if (gameState === 'PAUSED') {
        resumeGame();
    }
}

function resumeGame() {
    gameState = 'PLAYING';
    pauseScreen.classList.add('hidden');
    // Important: we need to reset the 'lastTime' of our loop otherwise the delta will be huge 
    // and things might teleport or break immediately upon unpausing. But we aren't using `dt` 
    // strictly for movement at the moment (we are using fixed per-frame movement). 
    // It's still good practice:
    lastTime = Date.now();

    // Also clear keys to prevent stuck inputs after pausing
    for (let k in keys) keys[k] = false;
}

resumeBtn.addEventListener('click', resumeGame);
quitBtn.addEventListener('click', () => {
    location.reload();
});

// --- HELPER FUNC ---
function checkCollision(obj1, obj2, threshold = 2.0) {
    if (!obj1 || !obj2) return false;
    return obj1.position.distanceTo(obj2.position) < threshold;
}

// --- FLOATING TEXT ---
function showFloatingText(text, colorHex, position3D) {
    if (!floatingTextContainer) return;

    // Convert 3D position to 2D screen coordinates
    const vector = position3D.clone();
    vector.project(camera);

    const x = (vector.x * 0.5 + 0.5) * window.innerWidth;
    const y = -(vector.y * 0.5 - 0.5) * window.innerHeight;

    // Create element
    const el = document.createElement('div');
    el.className = 'floating-text';
    el.innerText = text;

    // Convert hex color to CSS formatting (e.g. 0xff0000 -> #ff0000)
    let colorStr = '#' + colorHex.toString(16).padStart(6, '0');
    el.style.color = colorStr;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;

    floatingTextContainer.appendChild(el);

    // Remove element after animation completes (1 second)
    setTimeout(() => {
        if (el.parentNode === floatingTextContainer) {
            floatingTextContainer.removeChild(el);
        }
    }, 1000);
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

        waveManager.update(enemies, obstacles);

        // Announce Wave Start
        if (waveManager.state === 'SPAWNING' && prevWaveState === 'WAVE_START') {
            waveBanner.classList.remove('hidden');
            if (waveManager.currentWave % 5 === 0) {
                waveVal.innerText = `BOSS WAVE ${waveManager.currentWave}`;
                waveVal.style.color = '#ff5500';
                playSound(sounds.siren, 0.8);
            } else {
                waveVal.innerText = `WAVE ${waveManager.currentWave}`;
                waveVal.style.color = '#00ffff';
            }
            setTimeout(() => { waveBanner.classList.add('hidden'); }, 2000);
        }

        explosionManager.update();

        // Update Player
        player.update(keys, lasers, () => {
            if (gameState === 'PLAYING') {
                if (currentShipIndex === 1) playSound(sounds.speedsterShoot);
                else playSound(sounds.shoot);
            }
        });

        // Spawn engine trails if player is moving or idling
        engineTrail.spawnTrail(player.mesh.position, false);
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

            if (checkCollision(player.mesh, p.mesh, player.magnetRadius || 2.0)) {
                let text = "";
                if (p.type === 'health') {
                    player.health = Math.min(player.maxHealth || 100, player.health + 20);
                    text = "+ HEALTH";
                } else if (p.type === 'shield') {
                    player.shieldActive = true;
                    text = "SHIELD ACTIVE";
                } else if (p.type === 'triple_shot') {
                    // This is now plasma_shot
                    player.tripleShotTimer = 800;
                    player.spreadShotTimer = 0;
                    player.speedBoostTimer = 0;
                    text = "PLASMA CANNON";
                } else if (p.type === 'spread_shot') {
                    player.spreadShotTimer = 800;
                    player.tripleShotTimer = 0;
                    player.speedBoostTimer = 0;
                    text = "SPREAD SHOT";
                } else if (p.type === 'rapid_fire') {
                    player.speedBoostTimer = 600; // Reuse speed boost timer internally for rapid fire
                    player.spreadShotTimer = 0;
                    player.tripleShotTimer = 0;
                    text = "RAPID FIRE";
                }

                healthVal.innerText = player.health;
                playSound(sounds.powerup);

                // Visual feedbacks
                showFloatingText(text, p.color, p.mesh.position);

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

                        let newRecord = false;
                        if (player.score > highScore) {
                            highScore = player.score;
                            newRecord = true;
                        }

                        // Keep 50% of score as Scrap currency
                        const earnedScrap = Math.floor(player.score * 0.5);
                        scrap += earnedScrap;
                        saveProgression();

                        startScreen.innerHTML = `<h1>GAME OVER</h1>
                        <p style="margin-bottom: 20px; font-size: 1.5rem;">Score: ${player.score}</p>
                        ${newRecord ? '<p style="color: #00ffcc; font-weight: bold; margin-bottom: 10px;">🌟 NEW HIGH SCORE! 🌟</p>' : ''}
                        <p style="margin-bottom: 20px; color: yellow;">Earned Scrap: +${earnedScrap}</p>
                        <button id="start-btn" onclick="location.reload()">Return to Base</button>`;
                        startScreen.classList.remove('hidden');
                        hud.classList.add('hidden');
                        if (mobileUI) mobileUI.classList.add('hidden');
                        if (typeof resetJoystick === 'function') resetJoystick();
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

                        let newRecord = false;
                        if (player.score > highScore) {
                            highScore = player.score;
                            newRecord = true;
                        }

                        // Keep 50% of score as Scrap currency
                        const earnedScrap = Math.floor(player.score * 0.5);
                        scrap += earnedScrap;
                        saveProgression();

                        startScreen.innerHTML = `<h1>GAME OVER</h1>
                        <p style="margin-bottom: 20px; font-size: 1.5rem;">Score: ${player.score}</p>
                        ${newRecord ? '<p style="color: #00ffcc; font-weight: bold; margin-bottom: 10px;">🌟 NEW HIGH SCORE! 🌟</p>' : ''}
                        <p style="margin-bottom: 20px; color: yellow;">Earned Scrap: +${earnedScrap}</p>
                        <button id="start-btn" onclick="location.reload()">Return to Base</button>`;
                        startScreen.classList.remove('hidden');
                        hud.classList.add('hidden');
                        if (mobileUI) mobileUI.classList.add('hidden');
                        if (typeof resetJoystick === 'function') resetJoystick();
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

                    if (e.hp > 0) {
                        explosionManager.createHitSpark(l.mesh.position, e.mesh.material.color.getHex());
                    }

                    if (!e.active) {
                        player.score += points;
                        scoreVal.innerText = player.score;
                        explosionManager.createExplosion(e.mesh.position, 0xffaa00);
                        if (l.isHoming) playSound(sounds.homingExplosion);
                        else playSound(sounds.explosion);

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

        // Update Obstacles (Asteroids) & Collisions
        for (let i = obstacles.length - 1; i >= 0; i--) {
            const obs = obstacles[i];
            obs.update();

            // Collision with Player
            if (!player.isDashing && checkCollision(player.mesh, obs.mesh, obs.size + 1.0)) {
                if (player.shieldActive) {
                    player.shieldActive = false;
                } else {
                    player.health -= 50; // Heavy damage from asteroid
                    shakeDuration = 20;
                    healthVal.innerText = player.health;
                    explosionManager.createExplosion(player.mesh.position, 0xff0000);
                    playSound(sounds.explosion);

                    // Bounce player backwards
                    player.velocity.z += 0.8;

                    if (player.health <= 0) {
                        gameState = 'GAMEOVER';

                        let newRecord = false;
                        if (player.score > highScore) {
                            highScore = player.score;
                            newRecord = true;
                        }

                        // Keep 50% of score as Scrap currency
                        const earnedScrap = Math.floor(player.score * 0.5);
                        scrap += earnedScrap;
                        saveProgression();

                        startScreen.innerHTML = `<h1>GAME OVER</h1>
                        <p style="margin-bottom: 20px; font-size: 1.5rem;">Score: ${player.score}</p>
                        ${newRecord ? '<p style="color: #00ffcc; font-weight: bold; margin-bottom: 10px;">🌟 NEW HIGH SCORE! 🌟</p>' : ''}
                        <p style="margin-bottom: 20px; color: yellow;">Earned Scrap: +${earnedScrap}</p>
                        <button id="start-btn" onclick="location.reload()">Return to Base</button>`;
                        startScreen.classList.remove('hidden');
                        hud.classList.add('hidden');
                        if (mobileUI) mobileUI.classList.add('hidden');
                        if (typeof resetJoystick === 'function') resetJoystick();
                    }
                }
            }

            // Check collision with Player Lasers (bounce/destroy laser, no damage to asteroid)
            for (let j = lasers.length - 1; j >= 0; j--) {
                const l = lasers[j];
                if (l.active && checkCollision(l.mesh, obs.mesh, obs.size + 0.5)) {
                    l.active = false;
                    explosionManager.createHitSpark(l.mesh.position, 0xdddddd, 8); // more sparks for rock ping
                }
            }

            if (!obs.active) {
                obs.destroy();
                obstacles.splice(i, 1);
            }
        }
    } else if (gameState === 'PAUSED') {
        // Just freeze the camera and let the renderer draw the frozen scene.
        // We do not update entities or positions.
    } else {
        // Idle animation for START or GAMEOVER overworld
    }

    renderer.render(scene, camera);
}

// --- RESIZE ---
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- SHOP LOGIC ---
const upgBtnHealth = document.getElementById('upg-health');
const upgBtnHeat = document.getElementById('upg-heat');
const upgBtnMagnet = document.getElementById('upg-magnet');
const lblLvlHealth = document.getElementById('lvl-health');
const lblLvlHeat = document.getElementById('lvl-heat');
const lblLvlMagnet = document.getElementById('lvl-magnet');
const lblCostHealth = document.getElementById('cost-health');
const lblCostHeat = document.getElementById('cost-heat');
const lblCostMagnet = document.getElementById('cost-magnet');

function updateShopUI() {
    scrapVal.innerText = scrap;

    // Formula for costs: 1000 + (level * 500)
    const costHealth = 1000 + (upgHealth * 500);
    const costHeat = 1000 + (upgHeat * 500);
    const costMagnet = 1000 + (upgMagnet * 500);

    lblLvlHealth.innerText = upgHealth;
    lblCostHealth.innerText = upgHealth >= 5 ? 'MAX' : costHealth;
    upgBtnHealth.disabled = upgHealth >= 5 || scrap < costHealth;

    lblLvlHeat.innerText = upgHeat;
    lblCostHeat.innerText = upgHeat >= 5 ? 'MAX' : costHeat;
    upgBtnHeat.disabled = upgHeat >= 5 || scrap < costHeat;

    lblLvlMagnet.innerText = upgMagnet;
    lblCostMagnet.innerText = upgMagnet >= 5 ? 'MAX' : costMagnet;
    upgBtnMagnet.disabled = upgMagnet >= 5 || scrap < costMagnet;
}

if (upgBtnHealth) {
    upgBtnHealth.addEventListener('click', () => {
        const cost = 1000 + (upgHealth * 500);
        if (scrap >= cost && upgHealth < 5) {
            scrap -= cost;
            upgHealth++;
            saveProgression();
            updateShopUI();
        }
    });
    upgBtnHeat.addEventListener('click', () => {
        const cost = 1000 + (upgHeat * 500);
        if (scrap >= cost && upgHeat < 5) {
            scrap -= cost;
            upgHeat++;
            saveProgression();
            updateShopUI();
        }
    });
    upgBtnMagnet.addEventListener('click', () => {
        const cost = 1000 + (upgMagnet * 500);
        if (scrap >= cost && upgMagnet < 5) {
            scrap -= cost;
            upgMagnet++;
            saveProgression();
            updateShopUI();
        }
    });
}

// Hangar Logic
function updateHangarUI() {
    const ship = SHIPS[viewingShipIndex];
    shipName.innerText = ship.name;
    shipName.style.color = '#' + ship.color.toString(16).padStart(6, '0');

    if (unlockedShips.includes(viewingShipIndex)) {
        buyShipBtn.style.display = 'none';
        if (currentShipIndex === viewingShipIndex) {
            shipStatus.innerText = "EQUIPPED";
            shipStatus.style.color = "#00ffcc";
        } else {
            shipStatus.innerText = "OWNED (Click to Equip)";
            shipStatus.style.color = "#aaaaaa";
            shipStatus.style.cursor = "pointer";

            // Temporary one-time equip handler to avoid stacking
            shipStatus.onclick = () => {
                currentShipIndex = viewingShipIndex;
                saveProgression();
                updateHangarUI();
            };
        }
    } else {
        shipStatus.innerText = "LOCKED";
        shipStatus.style.color = "#ff0000";
        shipStatus.onclick = null;
        shipStatus.style.cursor = "default";

        buyShipBtn.style.display = 'inline-block';
        shipCost.innerText = ship.cost;
        buyShipBtn.disabled = scrap < ship.cost;
    }
}

if (prevShipBtn && nextShipBtn && buyShipBtn) {
    prevShipBtn.addEventListener('click', () => {
        viewingShipIndex = (viewingShipIndex - 1 + SHIPS.length) % SHIPS.length;
        updateHangarUI();
    });

    nextShipBtn.addEventListener('click', () => {
        viewingShipIndex = (viewingShipIndex + 1) % SHIPS.length;
        updateHangarUI();
    });

    buyShipBtn.addEventListener('click', () => {
        const ship = SHIPS[viewingShipIndex];
        if (scrap >= ship.cost && !unlockedShips.includes(viewingShipIndex)) {
            scrap -= ship.cost;
            unlockedShips.push(viewingShipIndex);
            currentShipIndex = viewingShipIndex;
            saveProgression();
            updateShopUI(); // Updates top scrap counter too
            updateHangarUI();
        }
    });
}

// --- UI INTERACTIONS ---
startBtn.addEventListener('click', () => {
    startBtn.blur(); // Remove focus so Spacebar doesn't trigger it again

    playBgMusic();

    gameState = 'PLAYING';
    startScreen.classList.add('hidden');
    hud.classList.remove('hidden');

    if (isTouchDevice) {
        mobileUI.classList.remove('hidden');
    }

    // Apply Ship & Upgrades to Player
    const currentShip = SHIPS[currentShipIndex];

    // Visually update the player mesh
    player.mesh.geometry.dispose();
    player.mesh.geometry = currentShip.createMesh();
    player.mesh.material.color.setHex(currentShip.color);

    // Apply Stats
    player.maxHealth = currentShip.stats.hpBase + (upgHealth * 20); // Each level +20 HP
    player.heatCooldownRate = currentShip.stats.coolingBase + (upgHeat * 0.1); // Each level cools faster
    player.maxSpeed = currentShip.stats.speedBase;
    player.heatMultiplier = currentShip.stats.heatCostMult; // We will use this in shoot logic

    player.magnetRadius = 2.0 + (upgMagnet * 1.5); // Each level increases pickup radius

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
    obstacles.forEach(o => o.destroy());
    obstacles = [];

    waveManager.startWave(1);
});

// --- ASSETS LOADING ---
loadingManager.onProgress = function (url, itemsLoaded, itemsTotal) {
    loadingText.innerText = `Loading Assets... ${Math.round((itemsLoaded / itemsTotal) * 100)}%`;
};

loadAssets(() => {
    loadingText.classList.add('hidden');
    startBtn.classList.remove('hidden');

    if (highScore > 0) {
        highScoreDisplay.classList.remove('hidden');
        highScoreVal.innerText = highScore;
    }

    if (shopContainer) {
        shopContainer.classList.remove('hidden');
        updateShopUI();
    }

    if (hangarContainer) {
        hangarContainer.classList.remove('hidden');
        updateHangarUI();
    }

    scene.background = new THREE.Color(0x000000);
});

// START
animate();
