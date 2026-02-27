import * as THREE from 'three';

// --- ENTITIES MODULE ---
export class Player {
    constructor(scene) {
        this.scene = scene;
        // Cone pointing towards -Z (up in game world)
        const geo = new THREE.ConeGeometry(1.5, 3, 8);
        geo.rotateX(-Math.PI / 2);
        const mat = new THREE.MeshStandardMaterial({
            color: 0x00ffff,
            roughness: 0.5,
            metalness: 0.1
        });

        this.mesh = new THREE.Mesh(geo, mat);
        this.mesh.castShadow = true;
        this.scene.add(this.mesh);

        // Physics
        this.velocity = new THREE.Vector3();
        this.acceleration = 0.05;
        this.friction = 0.90;
        this.maxSpeed = 0.6;

        // Dash settings
        this.isDashing = false;
        this.dashTimer = 0;
        this.dashCooldown = 0;

        // Powerup states
        this.shieldActive = false;
        this.tripleShotTimer = 0;
        this.speedBoostTimer = 0;
        this.spreadShotTimer = 0;

        this.limitX = 20;
        this.limitZ = 10;

        this.lastShot = 0;
        this.baseShootDelay = 250;
        this.shootDelay = 250;

        this.health = 100;
        this.score = 0;
    }

    update(keys, lasers) {
        if (this.dashCooldown > 0) this.dashCooldown--;
        if (this.tripleShotTimer > 0) this.tripleShotTimer--;
        if (this.speedBoostTimer > 0) this.speedBoostTimer--;
        if (this.spreadShotTimer > 0) this.spreadShotTimer--;

        if (this.currentPenalty > 0) {
            this.currentPenalty--;
            if (this.currentPenalty <= 0) {
                this.isOverheated = false;
            }
        } else {
            // Cool down
            this.heat -= this.heatCooldownRate;
            if (this.heat < 0) this.heat = 0;
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

        if (!this.isDashing) {
            if (keys.w || keys.ArrowUp) { accZ -= currentAccel; moving = true; }
            if (keys.s || keys.ArrowDown) { accZ += currentAccel / 2; moving = true; }
            if (keys.a || keys.ArrowLeft) { accX -= currentAccel; moving = true; }
            if (keys.d || keys.ArrowRight) { accX += currentAccel; moving = true; }

            if (keys.Shift) { // Shift handling
                if (this.dashCooldown === 0 && moving) {
                    this.isDashing = true;
                    this.dashTimer = 15;
                    this.dashCooldown = 120;
                    const angle = Math.atan2(accZ, accX);
                    this.velocity.x = Math.cos(angle) * 1.5;
                    this.velocity.z = Math.sin(angle) * 1.5;
                }
            }
        }

        if (!this.isDashing) {
            this.velocity.x += accX;
            this.velocity.z += accZ;
            this.velocity.multiplyScalar(this.friction);

            const speed = this.velocity.length();
            if (speed > this.maxSpeed) {
                this.velocity.setLength(this.maxSpeed);
            }
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
            this.shoot(lasers);
        }
    }

    shoot(lasers) {
        if (this.isOverheated) return; // Cannot shoot

        const now = Date.now();
        if (now - this.lastShot > this.shootDelay) {

            let heatCost = this.baseHeatCost;

            if (this.spreadShotTimer > 0) {
                heatCost = 15; // Spread costs more heat
                // 5-way arc
                const spreadAngles = [-0.4, -0.2, 0, 0.2, 0.4];
                for (let a of spreadAngles) {
                    const l = new Laser(this.scene, this.mesh.position.clone(), a);
                    // Modify rotation of laser to match direction visually
                    l.mesh.rotation.y = -a;
                    lasers.push(l);
                }
            } else if (this.tripleShotTimer > 0) {
                heatCost = 20; // Plasma takes a lot of heat
                // Plasma shot: massive, slow moving, piercing laser
                const l = new Laser(this.scene, this.mesh.position.clone(), 0);
                l.mesh.scale.set(4, 4, 4); // Huge
                l.mesh.material.color.setHex(0x00ffff); // Cyan
                l.speedZ = 0.4; // Slower
                l.isPlasma = true; // Special flag we'll use in main.js
                lasers.push(l);
            } else {
                lasers.push(new Laser(this.scene, this.mesh.position.clone(), 0));
            }

            this.heat += heatCost;
            if (this.heat >= 100) {
                this.heat = 100;
                this.isOverheated = true;
                this.currentPenalty = this.overheatPenaltyTime;
            }

            this.lastShot = now;
        }
    }

    reset() {
        this.mesh.position.set(0, 0, 0);
        this.mesh.rotation.set(0, 0, 0);
        this.velocity.set(0, 0, 0);
        this.health = 100;
        this.score = 0;
        this.shieldActive = false;
        this.tripleShotTimer = 0;
        this.speedBoostTimer = 0;
        this.spreadShotTimer = 0;
        this.heat = 0;
        this.isOverheated = false;
        this.currentPenalty = 0;
    }
}

export class Laser {
    constructor(scene, startPosition, dirX = 0) {
        this.scene = scene;
        const geo = new THREE.CylinderGeometry(0.1, 0.1, 1, 8);
        geo.rotateX(Math.PI / 2);
        const mat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        this.mesh = new THREE.Mesh(geo, mat);

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
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
    }
}

export class Enemy {
    constructor(scene, x, y, geometry, color, size = 3, hp = 1, scoreValue = 10) {
        this.scene = scene;
        const mat = new THREE.MeshStandardMaterial({
            color: color,
            roughness: 0.8,
            metalness: 0.1
        });

        this.mesh = new THREE.Mesh(geometry, mat);
        this.mesh.position.set(x, 0, y);
        this.mesh.castShadow = true;
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
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
    }
}

export class BasicEnemy extends Enemy {
    constructor(scene, x, y) {
        const geo = new THREE.BoxGeometry(2, 2, 2);
        super(scene, x, y, geo, 0x00ff00, 2.5, 1, 10);
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

        // Spin randomly
        this.mesh.rotation.x += 0.02;
        this.mesh.rotation.y += 0.02;
    }
}

export class ShooterEnemy extends Enemy {
    constructor(scene, x, y) {
        const geo = new THREE.ConeGeometry(1.5, 3, 4);
        geo.rotateX(-Math.PI / 2);
        super(scene, x, y, geo, 0xff00ff, 3, 2, 20);
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
        enemyLasers.push(new EnemyLaser(this.scene, startPos, angle));
        this.currentCooldown = this.shootCooldown;
    }
}

export class EnemyLaser {
    constructor(scene, startPosition, angle) {
        this.scene = scene;
        const geo = new THREE.CylinderGeometry(0.1, 0.1, 1, 8);
        geo.rotateX(Math.PI / 2);
        const mat = new THREE.MeshBasicMaterial({ color: 0xff00ff }); // purple laser
        this.mesh = new THREE.Mesh(geo, mat);
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
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
    }
}

export class KamikazeEnemy extends Enemy {
    constructor(scene, x, y) {
        const geo = new THREE.IcosahedronGeometry(1.5);
        super(scene, x, y, geo, 0xffff00, 2.5, 1, 15);
        this.speed = 0.25;
    }

    update(player) {
        const dx = player.mesh.position.x - this.mesh.position.x;
        const dz = player.mesh.position.z - this.mesh.position.z;
        const angle = Math.atan2(dz, dx);

        this.velocity.x += Math.cos(angle) * 0.02;
        this.velocity.z += Math.sin(angle) * 0.02;
        this.velocity.multiplyScalar(0.96);
        if (this.velocity.length() > this.speed) this.velocity.setLength(this.speed);
        this.mesh.position.add(this.velocity);

        // Spin aggressively
        this.mesh.rotation.x += 0.1;
        this.mesh.rotation.y += 0.1;
    }
}

export class HeavyTankEnemy extends Enemy {
    constructor(scene, x, y) {
        const geo = new THREE.BoxGeometry(4, 4, 4);
        super(scene, x, y, geo, 0xff0000, 4.5, 6, 50);
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
        laser.mesh.scale.set(2, 2, 2);
        laser.mesh.material.color.setHex(0xff0000); // Red laser
        laser.isHeavy = true;
        enemyLasers.push(laser);
        this.currentCooldown = this.shootCooldown;
    }
}

export class BossEnemy extends Enemy {
    constructor(scene, x, y) {
        const geo = new THREE.BoxGeometry(8, 2, 4);
        super(scene, x, y, geo, 0xff5500, 8, 40, 500);
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
            laser.mesh.scale.set(1.5, 1.5, 1.5);
            laser.mesh.material.color.setHex(0xff8800); // Orange boss laser
            laser.isHeavy = true;
            enemyLasers.push(laser);
        }

        this.currentCooldown = this.shootCooldown;
    }
}

export class Meteor extends Enemy {
    constructor(scene, x, y, dirX, dirZ) {
        const radius = 2 + Math.random() * 1.5;
        const geo = new THREE.DodecahedronGeometry(radius);
        super(scene, x, y, geo, 0x888888, radius * 2, 4, 10);
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

        let color = 0xffffff;
        if (type === 'health') color = 0xff0000;
        else if (type === 'shield') color = 0x0000ff;
        else if (type === 'plasma_shot') color = 0x00ffff; // Cyan plasma
        else if (type === 'rapid_fire') color = 0x00ff00; // Green rapid fire
        else if (type === 'spread_shot') color = 0xff00ff; // Magenta spread

        const geo = new THREE.OctahedronGeometry(1);
        const mat = new THREE.MeshStandardMaterial({
            color: color,
            emissive: color,
            emissiveIntensity: 0.5,
            transparent: true,
            opacity: 0.8
        });

        this.mesh = new THREE.Mesh(geo, mat);
        this.mesh.position.set(x, 0, y);
        this.scene.add(this.mesh);

        this.lifeTime = 600;
        this.active = true;
    }

    update() {
        this.lifeTime--;
        if (this.lifeTime <= 0) this.active = false;

        // Drift towards the player (+Z axis)
        this.mesh.position.z += 0.08;

        this.mesh.rotation.y += 0.05;
        this.mesh.rotation.x += 0.02;

        const scale = 1 + Math.sin(Date.now() * 0.005) * 0.2;
        this.mesh.scale.set(scale, scale, scale);
    }

    destroy() {
        this.scene.remove(this.mesh);
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
    }
}
