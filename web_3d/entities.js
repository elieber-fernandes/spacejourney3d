import * as THREE from 'three';

import { models } from './src/assets.js';

// Pre-allocated objects for fitModelToTargetSize to avoid GC pressure
const _fitBox = new THREE.Box3();
const _fitSize = new THREE.Vector3();

export function fitModelToTargetSize(model, targetSize) {
    if (!model) return;
    // Reset scale first
    model.scale.set(1, 1, 1);

    // Ensure world matrices are updated so Box3 calculates correctly
    model.updateMatrixWorld(true);

    _fitBox.setFromObject(model);
    _fitBox.getSize(_fitSize);

    const maxDim = Math.max(_fitSize.x, _fitSize.y, _fitSize.z);
    if (maxDim > 0) {
        const scale = targetSize / maxDim;
        model.scale.setScalar(scale);
    }
}

// --- HELPER FOR SHARED MATERIALS ---
function getSharedMaterial(model, colorHex, emissiveHex, isTransparent, opacity) {
    if (!model) return null;
    if (!model.userData.sharedMats) model.userData.sharedMats = {};
    const key = `${colorHex}_${emissiveHex}_${isTransparent}_${opacity}`;
    if (!model.userData.sharedMats[key]) {
        let baseMat = null;
        model.traverse(c => { if (c.isMesh && !baseMat) baseMat = c.material; });
        if (baseMat) {
            const newMat = baseMat.clone();
            if (colorHex !== undefined && colorHex !== null) newMat.color.setHex(colorHex);
            if (emissiveHex !== undefined && emissiveHex !== null) newMat.emissive = new THREE.Color(emissiveHex);
            if (isTransparent) {
                newMat.transparent = true;
                newMat.opacity = opacity;
            }
            model.userData.sharedMats[key] = newMat;
        }
    }
    return model.userData.sharedMats[key];
}

// --- ENTITIES MODULE ---
export class Player {
    constructor(scene, modelKey = 'basico', targetSize = 3) {
        this.scene = scene;

        // Clone the loaded GLTF scene
        const sourceModel = models[modelKey];
        if (sourceModel) {
            this.mesh = sourceModel.clone();

            // Re-apply specific materials if needed
            this.mesh.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = false;
                }
            });

            fitModelToTargetSize(this.mesh, targetSize);
        } else {
            // Fallback just in case
            const geo = new THREE.ConeGeometry(1.5, 3, 8);
            geo.rotateX(-Math.PI / 2);
            const mat = new THREE.MeshStandardMaterial({ color: 0x00ffff });
            this.mesh = new THREE.Mesh(geo, mat);
            this.mesh.castShadow = false;
        }

        this.scene.add(this.mesh);

        // Shield Mesh
        const shieldGeo = new THREE.SphereGeometry(2.5, 32, 32);
        const shieldMat = new THREE.MeshBasicMaterial({
            color: 0x00aaff,
            transparent: true,
            opacity: 0.4,
            blending: THREE.AdditiveBlending,
            wireframe: true
        });
        this.shieldMesh = new THREE.Mesh(shieldGeo, shieldMat);
        this.shieldMesh.visible = false;
        this.scene.add(this.shieldMesh);

        // Physics
        this.velocity = new THREE.Vector3();
        this.acceleration = 0.05;
        this.friction = 0.90;
        this.maxSpeed = 0.6;

        // Dash settings removed

        // Powerup states
        this.shieldActive = false;
        this.shieldTimer = 0;
        this.tripleShotTimer = 0;
        this.speedBoostTimer = 0;
        this.spreadShotTimer = 0;

        this.limitX = 20;
        this.limitZ = 10;

        this.lastShot = 0;
        this.baseShootDelay = 250;
        this.shootDelay = 250;

        this.maxHealth = 100;
        this.health = this.maxHealth;
        this.magnetRadius = 6.0;

        this.score = 0;

        // Overheating
        this.heat = 0;
        this.isOverheated = false;
        this.heatCooldownRate = 0.5; // Amount cooled per frame
        this.baseHeatCost = 10;
        this.overheatPenaltyTime = 120; // Frames disabled when maxed
        this.currentPenalty = 0;
    }

    update(keys, lasers, soundCallback) {
        if (this.tripleShotTimer > 0) this.tripleShotTimer--;
        if (this.speedBoostTimer > 0) this.speedBoostTimer--;
        if (this.spreadShotTimer > 0) this.spreadShotTimer--;
        if (this.homingMissilesTimer > 0) this.homingMissilesTimer--;

        if (this.shieldTimer > 0) {
            this.shieldTimer--;
            this.shieldActive = true;
        } else {
            this.shieldActive = false;
        }

        // Shield visual logic
        if (this.shieldActive) {
            this.shieldMesh.visible = true;
            this.shieldMesh.position.copy(this.mesh.position);
            this.shieldMesh.rotation.y += 0.02;
            this.shieldMesh.rotation.x += 0.02;
            const s = 1.0 + Math.sin(Date.now() * 0.005) * 0.05;
            this.shieldMesh.scale.set(s, s, s);
        } else {
            this.shieldMesh.visible = false;
        }

        if (this.isOverheated) {
            // Must wait for it to fully cool down
            this.heat -= this.heatCooldownRate;
            if (this.heat <= 0) {
                this.heat = 0;
                this.isOverheated = false;
            }
        } else {
            if (keys.Space) {
                let heatIncrease = 0.6; // Base
                if (this.tripleShotTimer > 0) heatIncrease = 1.2; // Plasma
                else if (this.spreadShotTimer > 0) heatIncrease = 0.9; // Spread
                else if (this.speedBoostTimer > 0) heatIncrease = 0.4; // Rapid
                else if (this.homingMissilesTimer > 0) heatIncrease = 0.8; // Homing

                this.heat += heatIncrease;
                if (this.heat >= 100) {
                    this.heat = 100;
                    this.isOverheated = true;
                }
            } else {
                // Cool down 2x faster when not shooting
                this.heat -= this.heatCooldownRate * 2;
                if (this.heat < 0) this.heat = 0;
            }
        }

        let currentAccel = this.acceleration;
        if (this.speedBoostTimer > 0) currentAccel *= 2;

        if (this.isDashing) {
            this.dashTimer--;
            if (this.dashTimer <= 0) {
                this.isDashing = false;
                this.velocity.multiplyScalar(0.5);
            }
        }

        let moving = false;
        let accX = 0, accZ = 0;

        if (keys.w || keys.ArrowUp) { accZ -= currentAccel; moving = true; }
        if (keys.s || keys.ArrowDown) { accZ += currentAccel / 2; moving = true; }
        if (keys.a || keys.ArrowLeft) { accX -= currentAccel; moving = true; }
        if (keys.d || keys.ArrowRight) { accX += currentAccel; moving = true; }

        this.velocity.x += accX;
        this.velocity.z += accZ;
        this.velocity.multiplyScalar(this.friction);

        const speed = this.velocity.length();
        if (speed > this.maxSpeed) {
            this.velocity.setLength(this.maxSpeed);
        }

        this.mesh.position.add(this.velocity);

        // Clamp
        this.mesh.position.x = THREE.MathUtils.clamp(this.mesh.position.x, -this.limitX, this.limitX);
        this.mesh.position.z = THREE.MathUtils.clamp(this.mesh.position.z, -this.limitZ, this.limitZ);

        // Bank rotation (tilt side to side based on X velocity)
        // Since we are not rotated on X anymore, rolling side to side is Z axis
        const targetRotationZ = (this.velocity.x * 0.5);
        this.mesh.rotation.z = THREE.MathUtils.lerp(this.mesh.rotation.z, targetRotationZ, 0.1);

        // Shoot delays logic updates based on powerups
        this.shootDelay = this.baseShootDelay;
        if (this.speedBoostTimer > 0) {
            // Rapid fire: 3x faster shooting
            this.shootDelay = this.baseShootDelay / 3;
        }

        // Shoot
        if (keys.Space) {
            if (this.shoot(lasers)) {
                if (soundCallback) soundCallback();
            }
        }
    }

    shoot(lasers) {
        if (this.isOverheated) return false; // Cannot shoot

        const now = Date.now();
        if (now - this.lastShot > this.shootDelay) {
            if (this.homingMissilesTimer > 0) {
                // Fire two homing missiles (not pooled - special behavior)
                const l1 = new HomingMissile(this.scene, this.mesh.position.clone());
                l1.mesh.position.x -= 1;
                const l2 = new HomingMissile(this.scene, this.mesh.position.clone());
                l2.mesh.position.x += 1;
                lasers.push(l1, l2);
            } else if (this.spreadShotTimer > 0) {
                // 5-way arc (pooled)
                const spreadAngles = [-0.4, -0.2, 0, 0.2, 0.4];
                for (let a of spreadAngles) {
                    const l = this.laserPool ? this.laserPool.acquire(this.mesh.position, a) : new Laser(this.scene, this.mesh.position.clone(), a);
                    // Modify rotation of laser to match direction visually
                    l.mesh.rotation.y = -a;
                    lasers.push(l);
                }
            } else if (this.tripleShotTimer > 0) {
                // Plasma shot: massive, slow moving, piercing laser (not pooled - swaps mesh)
                const l = new Laser(this.scene, this.mesh.position.clone(), 0);

                // Swap the mesh for the actual plasma model
                if (models['plasma']) {
                    this.scene.remove(l.mesh);
                    l.mesh = models['plasma'].clone();
                    l.mesh.position.copy(this.mesh.position).setZ(-1.5);
                    this.scene.add(l.mesh);
                    fitModelToTargetSize(l.mesh, 4); // Huge plasma shot

                    const mat = getSharedMaterial(models['plasma'], 0x00ffff, 0x00ffff, false, 1);
                    if (mat) {
                        l.mesh.traverse(c => { if (c.isMesh) c.material = mat; });
                    }
                } else {
                    l.mesh.scale.set(4, 4, 4); // Huge (fallback)
                }

                l.speedZ = 0.4; // Slower
                l.isPlasma = true; // Special flag we'll use in main.js
                lasers.push(l);
            } else {
                // Normal shot (pooled)
                const l = this.laserPool ? this.laserPool.acquire(this.mesh.position, 0) : new Laser(this.scene, this.mesh.position.clone(), 0);
                lasers.push(l);
            }

            this.lastShot = now;
            return true;
        }
        return false;
    }

    reset() {
        this.mesh.position.set(0, 0, 0);
        this.mesh.rotation.set(0, 0, 0);
        this.velocity.set(0, 0, 0);
        this.health = this.maxHealth || 100;
        this.score = 0;
        this.shieldActive = false;
        this.shieldTimer = 0;
        this.tripleShotTimer = 0;
        this.speedBoostTimer = 0;
        this.spreadShotTimer = 0;
        this.homingMissilesTimer = 0;
        this.heat = 0;
        this.isOverheated = false;
        this.currentPenalty = 0;
    }

    equipModel(modelKey, targetSize) {
        if (this.mesh) {
            this.scene.remove(this.mesh);
            // No dispose calls needed as materials/geometries are shared
        }

        const sourceModel = models[modelKey];
        if (sourceModel) {
            this.mesh = sourceModel.clone();
            this.mesh.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = false;
                }
            });
            fitModelToTargetSize(this.mesh, targetSize);
        } else {
            // Fallback just in case
            const geo = new THREE.ConeGeometry(1.5, 3, 8);
            geo.rotateX(-Math.PI / 2);
            const mat = getSharedMaterial(null, 0x00ffff); // Fallback material
            this.mesh = new THREE.Mesh(geo, mat);
            this.mesh.castShadow = false;
        }

        this.scene.add(this.mesh);
    }
}

export class Laser {
    constructor(scene, startPosition, dirX = 0) {
        this.scene = scene;

        // Use player laser by default, but we will override this for enemies and plasma later
        const sourceModel = models['laser_player'];
        if (sourceModel) {
            this.mesh = sourceModel.clone();
            const mat = getSharedMaterial(sourceModel, 0x00ffff, 0x00ffff);
            if (mat) this.mesh.traverse(c => { if (c.isMesh) c.material = mat; });
            fitModelToTargetSize(this.mesh, 1); // target dimension 1 length
        } else {
            const geo = new THREE.CylinderGeometry(0.1, 0.1, 1, 8);
            geo.rotateX(Math.PI / 2);
            const mat = getSharedMaterial(null, 0xff0000); // Fallback material
            this.mesh = new THREE.Mesh(geo, mat);
        }

        this.mesh.position.copy(startPosition);
        this.mesh.position.z -= 1.5;
        this.scene.add(this.mesh);

        this.speedZ = 1.0;
        this.speedX = dirX;
        this.active = true;
    }

    update() {
        this.mesh.position.z -= this.speedZ;
        this.mesh.position.x += this.speedX;
        if (this.mesh.position.z < -50 || Math.abs(this.mesh.position.x) > 30) {
            this.active = false;
        }
    }

    destroy() {
        this.scene.remove(this.mesh);
    }
}

// --- LASER POOL ---
export class LaserPool {
    constructor(scene, poolSize = 60) {
        this.scene = scene;
        this.pool = [];
        this.poolSize = poolSize;
    }

    acquire(startPosition, dirX = 0) {
        let laser;
        if (this.pool.length > 0) {
            laser = this.pool.pop();
            laser.mesh.visible = true;
            laser.mesh.position.copy(startPosition);
            laser.mesh.position.z -= 1.5;
            laser.speedZ = 1.0;
            laser.speedX = dirX;
            laser.active = true;
            laser.isPlasma = false;
            laser.isHoming = false;
            fitModelToTargetSize(laser.mesh, 1);
        } else {
            laser = new Laser(this.scene, startPosition, dirX);
        }
        return laser;
    }

    release(laser) {
        if (laser.isPlasma || laser.isHoming) {
            laser.destroy();
            return;
        }
        laser.mesh.visible = false;
        laser.active = false;
        if (this.pool.length < this.poolSize) {
            this.pool.push(laser);
        } else {
            laser.destroy();
        }
    }
}

export class Enemy {
    constructor(scene, x, y, modelKey, size = 3, hp = 1, scoreValue = 10, fallbackGeoStr = null) {
        this.scene = scene;

        const sourceModel = models[modelKey];
        if (sourceModel) {
            this.mesh = sourceModel.clone();
            this.mesh.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = false;
                }
            });
            fitModelToTargetSize(this.mesh, size);
        } else {
            // Fallback geometry if model fails to load
            let geo = new THREE.BoxGeometry(2, 2, 2);
            if (fallbackGeoStr === 'cone') { geo = new THREE.ConeGeometry(1.5, 3, 4); geo.rotateX(-Math.PI / 2); }
            else if (fallbackGeoStr === 'sphere') geo = new THREE.IcosahedronGeometry(1.5);
            else if (fallbackGeoStr === 'dodeca') geo = new THREE.DodecahedronGeometry(2);

            const mat = getSharedMaterial(null, 0xff0000, 0x000000, false, 1); // Fallback material
            this.mesh = new THREE.Mesh(geo, mat);
            this.mesh.castShadow = false;
        }

        this.mesh.position.set(x, 0, y);
        this.scene.add(this.mesh);

        this.size = size;
        this.hp = hp;
        this.scoreValue = scoreValue;
        this.velocity = new THREE.Vector3();
        this.active = true;
    }

    takeDamage(amount) {
        this.hp -= amount;
        if (this.hp <= 0) {
            this.active = false;
            return this.scoreValue;
        }
        return 0;
    }

    destroy() {
        this.scene.remove(this.mesh);
    }
}

export class BasicEnemy extends Enemy {
    constructor(scene, x, y, waveNum = 1) {
        const hp = 1 + Math.floor(waveNum * 0.5);
        super(scene, x, y, 'basico', 3, hp, 10, 'box'); // size 3 to match original BoxGeometry(2,2,2) with diagonal or cone(1.5,3)
        this.speed = 0.15 + (Math.random() * 0.1);
    }

    update(player) {
        const dx = player.mesh.position.x - this.mesh.position.x;
        const dz = player.mesh.position.z - this.mesh.position.z;
        const angle = Math.atan2(dz, dx);

        this.velocity.x += Math.cos(angle) * 0.01;
        this.velocity.z += Math.sin(angle) * 0.01;
        this.velocity.multiplyScalar(0.94); // friction

        if (this.velocity.length() > this.speed) {
            this.velocity.setLength(this.speed);
        }

        this.mesh.position.add(this.velocity);

        // Point towards the player, but don't shoot
        this.mesh.rotation.y = -angle - Math.PI / 2;
    }
}

export class ShooterEnemy extends Enemy {
    constructor(scene, x, y, waveNum = 1) {
        const hp = 2 + Math.floor(waveNum * 0.8);
        super(scene, x, y, 'atirador', 3.0, hp, 20, 'cone');
        this.speed = 0.1;
        this.shootCooldown = 150;
        this.currentCooldown = 0;
    }

    update(player, enemyLasers) {
        const dx = player.mesh.position.x - this.mesh.position.x;
        const dz = player.mesh.position.z - this.mesh.position.z;
        const angle = Math.atan2(dz, dx);

        this.velocity.x += Math.cos(angle) * 0.005;
        this.velocity.z += Math.sin(angle) * 0.005;
        this.velocity.multiplyScalar(0.95);
        if (this.velocity.length() > this.speed) this.velocity.setLength(this.speed);
        this.mesh.position.add(this.velocity);

        // Point at player
        this.mesh.rotation.y = -angle - Math.PI / 2;

        if (this.currentCooldown > 0) {
            this.currentCooldown--;
        } else {
            this.shoot(angle, enemyLasers);
        }
    }

    shoot(angle, enemyLasers) {
        const startPos = this.mesh.position.clone();
        const laser = new EnemyLaser(this.scene, startPos, angle);

        // Ensure the laser uses its natural proportions
        // (Modifiers removed to maintain 1/3 scale of the ship naturally)

        enemyLasers.push(laser);
        this.currentCooldown = this.shootCooldown;
    }
}

export class EnemyLaser {
    constructor(scene, startPosition, angle) {
        this.scene = scene;

        const sourceModel = models['laser_inimigo'];
        if (sourceModel) {
            this.mesh = sourceModel.clone();
            // Default color red if no shared mat, but main.js might override
            const mat = getSharedMaterial(sourceModel, 0xff00ff, 0xff00ff); // Purple laser
            this.mesh.traverse((child) => {
                if (child.isMesh) {
                    child.material = mat;
                }
            });
            // Set scale to exactly 1/3 of the base ship size (which is 3)
            fitModelToTargetSize(this.mesh, 1.0);
        } else {
            const geo = new THREE.CylinderGeometry(0.1, 0.1, 1, 8);
            geo.rotateX(Math.PI / 2);
            const mat = new THREE.MeshBasicMaterial({ color: 0xff00ff }); // purple laser
            this.mesh = new THREE.Mesh(geo, mat);
        }

        this.mesh.position.copy(startPosition);
        this.scene.add(this.mesh);

        this.speed = 0.5;
        this.velX = Math.cos(angle) * this.speed;
        this.velZ = Math.sin(angle) * this.speed;

        this.mesh.rotation.y = -angle + Math.PI / 2;

        this.active = true;
    }

    update() {
        this.mesh.position.x += this.velX;
        this.mesh.position.z += this.velZ;
        if (Math.abs(this.mesh.position.z) > 50 || Math.abs(this.mesh.position.x) > 50) {
            this.active = false;
        }
    }

    destroy() {
        this.scene.remove(this.mesh);
    }
}

export class KamikazeEnemy extends Enemy {
    constructor(scene, x, y, waveNum = 1) {
        const hp = 1 + Math.floor(waveNum * 0.3);
        super(scene, x, y, 'basico', 3, hp, 15, 'sphere'); // Icosahedron 1.5 radius -> max dim 3
        this.speed = 0.35; // Increased speed

        const mat = getSharedMaterial(models['basico'], 0xffff00, 0x000000, false, 1);
        if (mat) {
            this.mesh.traverse(c => { if (c.isMesh) c.material = mat; });
        }

        // Cache mesh children to avoid traverse() every frame
        this._meshChildren = [];
        this.mesh.traverse(c => { if (c.isMesh) this._meshChildren.push(c); });
        this._baseMat = getSharedMaterial(models['basico'], 0xffff00, 0x000000, false, 1);
        this._alertMat = getSharedMaterial(models['basico'], 0xff0000, 0xff0000, false, 1);
    }

    update(player) {
        const dx = player.mesh.position.x - this.mesh.position.x;
        const dz = player.mesh.position.z - this.mesh.position.z;
        const dist = Math.hypot(dx, dz);
        const angle = Math.atan2(dz, dx);

        // Stronger pulling force
        this.velocity.x += Math.cos(angle) * 0.04;
        this.velocity.z += Math.sin(angle) * 0.04;

        this.velocity.multiplyScalar(0.96);
        if (this.velocity.length() > this.speed) {
            this.velocity.setLength(this.speed);
        }

        this.mesh.position.add(this.velocity);

        // Blinking effect based on distance (using cached refs)
        if (dist < 20) {
            const blinkSpeed = Math.max(0.05, dist * 0.01);
            const useAlert = Date.now() % (blinkSpeed * 1000) < (blinkSpeed * 500);
            const mat = useAlert ? this._alertMat : this._baseMat;
            if (mat) {
                for (let i = 0; i < this._meshChildren.length; i++) {
                    this._meshChildren[i].material = mat;
                }
            }
        }

        // Spin aggressively
        this.mesh.rotation.x += 0.15;
        this.mesh.rotation.y += 0.15;
    }
}

export class HeavyTankEnemy extends Enemy {
    constructor(scene, x, y, waveNum = 1) {
        const hp = 6 + Math.floor(waveNum * 1.5);
        super(scene, x, y, 'tanque', 4, hp, 50, 'box'); // box(4,4,4) -> max dim 4
        this.speed = 0.05;
        this.shootCooldown = 120;
        this.currentCooldown = 0;
    }

    update(player, enemyLasers) {
        const dx = player.mesh.position.x - this.mesh.position.x;
        const dz = player.mesh.position.z - this.mesh.position.z;
        const dist = Math.hypot(dx, dz);
        const angle = Math.atan2(dz, dx);

        if (dist > 15) {
            this.velocity.x += Math.cos(angle) * 0.005;
            this.velocity.z += Math.sin(angle) * 0.005;
        }

        this.velocity.multiplyScalar(0.90);
        if (this.velocity.length() > this.speed) this.velocity.setLength(this.speed);
        this.mesh.position.add(this.velocity);

        this.mesh.rotation.y = -angle;

        if (this.currentCooldown > 0) {
            this.currentCooldown--;
        } else {
            this.shoot(angle, enemyLasers);
        }
    }

    shoot(angle, enemyLasers) {
        const startPos = this.mesh.position.clone();
        const laser = new EnemyLaser(this.scene, startPos, angle);
        laser.mesh.scale.multiplyScalar(2); // Double the base (now smaller) size
        const mat = getSharedMaterial(models['laser_inimigo'], 0xff0000, 0xff0000, false, 1);
        if (mat) {
            laser.mesh.traverse(c => { if (c.isMesh) c.material = mat; });
        }
        laser.isHeavy = true;
        enemyLasers.push(laser);
        this.currentCooldown = this.shootCooldown;
    }
}

export class BossEnemy extends Enemy {
    constructor(scene, x, y, waveNum = 5) {
        const hp = 40 + (waveNum * 10);
        super(scene, x, y, 'boss', 8, hp, 500, 'box');
        this.speed = 0.08;
        this.shootCooldown = 90;
        this.currentCooldown = 60; // initial delay
        this.timeOffset = Math.random() * Math.PI * 2;
        this.startY = y;
    }

    update(player, enemyLasers) {
        // Boss moves down to a specific line, then sweeps side to side
        if (this.mesh.position.z < -40) {
            this.velocity.z += 0.01;
            this.velocity.multiplyScalar(0.9);
            this.mesh.position.add(this.velocity);
        } else {
            // Sweeping motion
            this.mesh.position.x = Math.sin(Date.now() * 0.001 + this.timeOffset) * 20;
            // Hover slighty
            this.mesh.position.z = -40 + Math.cos(Date.now() * 0.002) * 2;
        }

        if (this.currentCooldown > 0) {
            this.currentCooldown--;
        } else {
            this.shoot(enemyLasers);
        }
    }

    shoot(enemyLasers) {
        const startPos = this.mesh.position.clone();
        startPos.z += 2; // spawn a bit in front

        // 5-way spread
        const angles = [Math.PI / 2 - 0.4, Math.PI / 2 - 0.2, Math.PI / 2, Math.PI / 2 + 0.2, Math.PI / 2 + 0.4];

        for (let angle of angles) {
            const laser = new EnemyLaser(this.scene, startPos, angle);
            laser.mesh.scale.multiplyScalar(1.5);
            const mat = getSharedMaterial(models['laser_inimigo'], 0xff8800, 0xff8800);
            if (mat) laser.mesh.traverse(c => { if (c.isMesh) c.material = mat; });
            laser.isHeavy = true;
            enemyLasers.push(laser);
        }

        this.currentCooldown = this.shootCooldown;
    }
}

export class DashBoss extends Enemy {
    constructor(scene, x, y, waveNum = 10) {
        const hp = 70 + (waveNum * 15);
        super(scene, x, y, 'boss', 12, hp, 1000, 'cone'); // Cylinder(6) -> max dim 12

        // Give it a distinct tint so it doesn't look identical to the regular boss
        const mat = getSharedMaterial(models['boss'], 0x00ff00, 0x000000, false, 1);
        if (mat) {
            this.mesh.traverse(c => { if (c.isMesh) c.material = mat; });
        }

        this.speed = 0.05;
        this.dashSpeed = 1.5;
        this.state = 'IDLE'; // IDLE, TELEGRAPH, DASHING, RECOVERING
        this.stateTimer = 180;
        this.targetPoint = new THREE.Vector3();
    }

    update(player, enemyLasers) {
        if (this.state === 'IDLE') {
            // Hover near the top
            if (this.mesh.position.z < -40) {
                this.velocity.z += 0.01;
                this.velocity.multiplyScalar(0.9);
                this.mesh.position.add(this.velocity);
            } else {
                this.mesh.position.x = Math.sin(Date.now() * 0.001) * 30;
                this.mesh.position.z = -40;
            }

            // Shoot regular lasers
            if (Math.random() < 0.05) {
                const laser = new EnemyLaser(this.scene, this.mesh.position.clone(), 0);
                const mat = getSharedMaterial(models['laser_inimigo'], 0x00ff00, 0x00ff00);
                if (mat) laser.mesh.traverse(c => { if (c.isMesh) c.material = mat; });
                laser.speed = 0.8; // Faster lasers
                laser.velZ = laser.speed;
                laser.isHeavy = true;
                enemyLasers.push(laser);
            }

            this.stateTimer--;
            if (this.stateTimer <= 0) {
                this.state = 'TELEGRAPH';
                this.stateTimer = 60; // 1 second telegraph
                const telMat = getSharedMaterial(models['boss'], 0x00ff00, 0x00ff00, false, 1);
                if (telMat) this.mesh.traverse(c => { if (c.isMesh) c.material = telMat; });
            }
        }
        else if (this.state === 'TELEGRAPH') {
            // Flash heavily
            this.mesh.traverse(child => { if (child.isMesh) child.material.emissiveIntensity = (Math.sin(Date.now() * 0.02) + 1) / 2; });

            this.stateTimer--;
            if (this.stateTimer <= 0) {
                this.state = 'DASHING';
                this.stateTimer = 100; // max dash time
                const dashMat = getSharedMaterial(models['boss'], 0x00ff00, 0x00ff00, false, 1);
                if (dashMat) this.mesh.traverse(c => { if (c.isMesh) c.material = dashMat; });

                // Calculate dash vector directly at player
                const dx = player.mesh.position.x - this.mesh.position.x;
                const dz = player.mesh.position.z - this.mesh.position.z;
                const angle = Math.atan2(dz, dx);
                this.velocity.x = Math.cos(angle) * this.dashSpeed;
                this.velocity.z = Math.sin(angle) * this.dashSpeed;

                // Point at player
                this.mesh.rotation.y = -angle - Math.PI / 2;
                this.mesh.rotation.x = 0;
            }
        }
        else if (this.state === 'DASHING') {
            this.mesh.position.add(this.velocity);

            // Spin wildly while dashing
            this.mesh.rotation.z += 0.5;

            this.stateTimer--;
            if (this.stateTimer <= 0 || this.mesh.position.z > 30 || Math.abs(this.mesh.position.x) > 50) {
                this.state = 'RECOVERING';
                this.stateTimer = 120; // 2 seconds to recover
                this.velocity.set(0, 0, 0);
                const recMat = getSharedMaterial(models['boss'], 0x00ff00, 0x000000, false, 1);
                if (recMat) this.mesh.traverse(c => { if (c.isMesh) c.material = recMat; });
                this.mesh.rotation.set(0, 0, 0); // Reset rotation
            }
        }
        else if (this.state === 'RECOVERING') {
            // Slowly drift back to the top
            const dx = 0 - this.mesh.position.x;
            const dz = -50 - this.mesh.position.z;
            const dist = Math.hypot(dx, dz);
            if (dist > 5) {
                const angle = Math.atan2(dz, dx);
                this.velocity.x += Math.cos(angle) * 0.05;
                this.velocity.z += Math.sin(angle) * 0.05;
                this.velocity.multiplyScalar(0.9);
                this.mesh.position.add(this.velocity);
            }

            this.stateTimer--;
            if (this.stateTimer <= 0) {
                this.state = 'IDLE';
                this.stateTimer = 180 + Math.random() * 60; // Random idle time before next dash
            }
        }
    }
}

export class Meteor extends Enemy {
    constructor(scene, x, y, dirX, dirZ) {
        const radius = 2 + Math.random() * 1.5; // radius between 2 and 3.5 -> max dim between 4 and 7
        super(scene, x, y, 'meteoro', radius * 2, hp = 4, scoreValue = 10, fallbackGeoStr = 'dodeca');

        this.velX = dirX * (0.1 + Math.random() * 0.2);
        this.velZ = dirZ * (0.1 + Math.random() * 0.2);
        this.rotSpeedX = (Math.random() - 0.5) * 0.1;
        this.rotSpeedY = (Math.random() - 0.5) * 0.1;
    }

    update() {
        this.mesh.position.x += this.velX;
        this.mesh.position.z += this.velZ;
        this.mesh.rotation.x += this.rotSpeedX;
        this.mesh.rotation.y += this.rotSpeedY;

        if (Math.abs(this.mesh.position.x) > 60 || Math.abs(this.mesh.position.z) > 60) {
            this.active = false;
        }
    }
}

export class PowerUp {
    constructor(scene, x, y, type) {
        this.scene = scene;
        this.type = type;

        let modelKey = 'pu_vida';
        let color = 0xffffff;
        if (type === 'health') { modelKey = 'pu_vida'; color = 0xff0000; }
        else if (type === 'shield') { modelKey = 'pu_escudo'; color = 0x0000ff; }
        else if (type === 'plasma_shot') { modelKey = 'pu_plasma'; color = 0x00ffff; } // Cyan plasma
        else if (type === 'rapid_fire') { modelKey = 'pu_tiro_rapido'; color = 0x00ff00; } // Green rapid fire
        else if (type === 'spread_shot') { modelKey = 'pu_tiro_multiplo'; color = 0xff00ff; } // Magenta spread
        else if (type === 'homing_missiles') { modelKey = 'pu_tiro_teleguiado'; color = 0xff9900; } // Orange Homing Missiles

        this.color = color;

        const sourceModel = models[modelKey];
        if (sourceModel) {
            this.mesh = sourceModel.clone();
            const mat = getSharedMaterial(sourceModel, color, color, true, 0.8);
            if (mat) {
                this.mesh.traverse((child) => {
                    if (child.isMesh) {
                        child.material = mat;
                    }
                });
            }
            fitModelToTargetSize(this.mesh, 2);
        } else {
            const geo = new THREE.OctahedronGeometry(1);
            const mat = new THREE.MeshStandardMaterial({
                color: color,
                emissive: color,
                emissiveIntensity: 0.5,
                transparent: true,
                opacity: 0.8
            });
            this.mesh = new THREE.Mesh(geo, mat);
        }

        this.mesh.position.set(x, 0, y);
        this.scene.add(this.mesh);

        this.lifeTime = 600;
        this.active = true;
        this.baseScale = this.mesh.scale.clone();
    }

    update(player) {
        this.lifeTime--;
        if (this.lifeTime <= 0) this.active = false;

        if (player && player.mesh) {
            const dx = player.mesh.position.x - this.mesh.position.x;
            const dz = player.mesh.position.z - this.mesh.position.z;
            const distSq = dx * dx + dz * dz;
            const pullRadius = (player.magnetRadius || 6.0) * 2.5;

            if (distSq < pullRadius * pullRadius && distSq > 0) {
                // Fly rapidly towards player
                const dist = Math.sqrt(distSq);
                const speed = 0.8; 
                this.mesh.position.x += (dx / dist) * speed;
                this.mesh.position.z += (dz / dist) * speed;
            } else {
                // Normal drift
                this.mesh.position.z += 0.08;
            }
        } else {
            this.mesh.position.z += 0.08;
        }
    }

    destroy() {
        this.scene.remove(this.mesh);
        if (this.mesh.geometry) this.mesh.geometry.dispose();
        if (this.mesh.material) {
            if (Array.isArray(this.mesh.material)) this.mesh.material.forEach(m => m.dispose());
            else this.mesh.material.dispose();
        }
    }
}

export class HomingMissile extends Laser {
    constructor(scene, startPosition) {
        super(scene, startPosition, 0);
        this.isHoming = true;

        // Use a different model or re-tint the basic laser if we don't have a specific missile
        // For now, let's tint the existing laser model
        this.mesh.traverse((child) => {
            if (child.isMesh) {
                child.material = child.material.clone();
                child.material.color.setHex(0xffaa00);
                child.castShadow = false;
            }
        });
        fitModelToTargetSize(this.mesh, 1.5); // ConGeometry(0.3, 1.5) -> max 1.5

        this.velocity = new THREE.Vector3(0, 0, -1.5);
        this.maxSpeed = 1.2;
        this.turnSpeed = 0.08;
    }

    // Pass enemies array to update so it can find a target
    update(enemies) {
        if (!enemies || enemies.length === 0) {
            // Dumb dumb straight movement
            this.mesh.position.add(this.velocity);
        } else {
            // Find closest enemy
            let closest = null;
            let minDist = Infinity;
            for (let e of enemies) {
                if (!e.active) continue;
                const dist = this.mesh.position.distanceToSquared(e.mesh.position);
                if (dist < minDist) {
                    minDist = dist;
                    closest = e;
                }
            }

            if (closest) {
                // Steer towards target
                const myPos = this.mesh.position;
                const targetPos = closest.mesh.position;
                const dx = targetPos.x - myPos.x;
                const dz = targetPos.z - myPos.z;

                const desiredAngle = Math.atan2(dz, dx);
                const desiredVelX = Math.cos(desiredAngle) * this.maxSpeed;
                const desiredVelZ = Math.sin(desiredAngle) * this.maxSpeed;

                this.velocity.x = Math.max(Math.min(this.velocity.x + (desiredVelX - this.velocity.x) * this.turnSpeed, 2), -2);
                this.velocity.z = Math.max(Math.min(this.velocity.z + (desiredVelZ - this.velocity.z) * this.turnSpeed, 2), -2);

                // Point visually
                this.mesh.rotation.y = -Math.atan2(this.velocity.z, this.velocity.x) - Math.PI / 2;
            }

            this.mesh.position.add(this.velocity);
        }

        if (this.mesh.position.z < -60 || Math.abs(this.mesh.position.x) > 50 || this.mesh.position.z > 50) {
            this.active = false;
        }
    }
}

export class Obstacle {
    constructor(scene, x, y, size = 3) {
        this.scene = scene;
        this.size = size;
        const geo = new THREE.DodecahedronGeometry(size);
        const mat = new THREE.MeshStandardMaterial({
            color: 0x555555,
            roughness: 0.9,
            metalness: 0.2
        });

        this.mesh = new THREE.Mesh(geo, mat);
        this.mesh.position.set(x, 0, y);
        this.mesh.castShadow = false;
        this.scene.add(this.mesh);

        this.velZ = 0.15 + Math.random() * 0.1;
        this.rotSpeedX = (Math.random() - 0.5) * 0.05;
        this.rotSpeedY = (Math.random() - 0.5) * 0.05;
        this.active = true;
        this.isInvincible = true;
    }

    update() {
        this.mesh.position.z += this.velZ;
        this.mesh.rotation.x += this.rotSpeedX;
        this.mesh.rotation.y += this.rotSpeedY;

        if (this.mesh.position.z > 50) {
            this.active = false;
        }
    }

    destroy() {
        this.scene.remove(this.mesh);
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
    }
}
