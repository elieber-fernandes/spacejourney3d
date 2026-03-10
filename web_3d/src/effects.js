import * as THREE from 'three';

export class ExplosionManager {
    constructor(scene) {
        this.scene = scene;
        this.explosions = [];
        this.lights = [];
        this.spritePool = [];
        this.lightPool = [];

        // Single material base for cloning per-sprite (to allow per-sprite opacity if needed, pooled anyway)
        this.mat = new THREE.SpriteMaterial({
            color: 0xffaa00,
            transparent: true,
            blending: THREE.AdditiveBlending
        });
    }

    getSpriteFromPool() {
        if (this.spritePool.length > 0) {
            const s = this.spritePool.pop();
            s.visible = true;
            return s;
        }
        const s = new THREE.Sprite(this.mat.clone());
        this.scene.add(s);
        return s;
    }

    getLightFromPool(color) {
        if (this.lightPool.length > 0) {
            const l = this.lightPool.pop();
            l.color.setHex(color);
            l.intensity = 10;
            return l;
        }
        const l = new THREE.PointLight(color, 10, 30);
        this.scene.add(l);
        return l;
    }

    createExplosion(position, color = 0xffaa00, count = 15) {
        const light = this.getLightFromPool(color);
        light.position.copy(position);
        this.lights.push({ light, decay: 0.5, life: 10 });

        for (let i = 0; i < count; i++) {
            const sprite = this.getSpriteFromPool();
            sprite.material.color.setHex(color);
            sprite.position.copy(position);

            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 0.5 + 0.1;

            sprite.userData = {
                vel: new THREE.Vector3(
                    Math.cos(angle) * speed,
                    (Math.random() - 0.5) * speed,
                    Math.sin(angle) * speed
                ),
                life: 1.0,
                decay: Math.random() * 0.05 + 0.02
            };

            const scale = Math.random() * 1.5 + 0.5;
            sprite.scale.set(scale, scale, scale);

            this.explosions.push(sprite);
        }
    }

    createHitSpark(position, color = 0xffffff, count = 5) {
        for (let i = 0; i < count; i++) {
            const sprite = this.getSpriteFromPool();
            sprite.material.color.setHex(color);
            sprite.position.copy(position);

            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 0.8 + 0.2;

            sprite.userData = {
                vel: new THREE.Vector3(
                    Math.cos(angle) * speed,
                    (Math.random() - 0.5) * speed,
                    -Math.abs(Math.sin(angle)) * speed
                ),
                life: 1.0,
                decay: Math.random() * 0.15 + 0.08
            };

            const scale = Math.random() * 0.5 + 0.2;
            sprite.scale.set(scale, scale, scale);

            this.explosions.push(sprite);
        }
    }

    createPowerUpSparkle(position, color = 0x00ff00, count = 12) {
        for (let i = 0; i < count; i++) {
            const sprite = this.getSpriteFromPool();
            sprite.material.color.setHex(color);
            sprite.position.copy(position);

            const angle = (i / count) * Math.PI * 2;
            const speed = 0.6;

            sprite.userData = {
                vel: new THREE.Vector3(
                    Math.cos(angle) * speed,
                    0,
                    Math.sin(angle) * speed
                ),
                life: 1.0,
                decay: 0.05
            };

            const scale = 0.8;
            sprite.scale.set(scale, scale, scale);

            this.explosions.push(sprite);
        }
    }

    update() {
        for (let i = this.explosions.length - 1; i >= 0; i--) {
            const p = this.explosions[i];
            p.position.add(p.userData.vel);
            p.userData.life -= p.userData.decay;
            p.material.opacity = p.userData.life;
            p.scale.multiplyScalar(0.9);

            if (p.userData.life <= 0) {
                p.visible = false;
                this.spritePool.push(p);
                this.explosions.splice(i, 1);
            }
        }

        // Update explosion lights
        for (let i = this.lights.length - 1; i >= 0; i--) {
            const data = this.lights[i];
            data.life -= data.decay;
            data.light.intensity = Math.max(0, data.life);
            if (data.life <= 0) {
                data.light.intensity = 0;
                this.lightPool.push(data.light);
                this.lights.splice(i, 1);
            }
        }
    }
}

export class EngineTrail {
    constructor(scene) {
        this.scene = scene;
        this.particles = [];
        this.pool = [];
        this.mat = new THREE.SpriteMaterial({
            color: 0x00ffff, // Cyan/blue engine glow
            transparent: true,
            blending: THREE.AdditiveBlending,
            opacity: 0.8
        });
    }

    getSpriteFromPool() {
        if (this.pool.length > 0) {
            const s = this.pool.pop();
            s.visible = true;
            return s;
        }
        const s = new THREE.Sprite(this.mat.clone());
        this.scene.add(s);
        return s;
    }

    spawnTrail(position, isDashing = false) {
        // Emit 1-2 particles per frame
        const count = isDashing ? 3 : 1;
        for (let i = 0; i < count; i++) {
            const p = this.getSpriteFromPool();
            // Place slightly behind the player
            p.position.copy(position);
            p.position.z += 1.5;
            p.position.x += (Math.random() - 0.5) * 0.5;
            p.position.y += (Math.random() - 0.5) * 0.5;

            p.userData = {
                life: 1.0,
                decay: isDashing ? 0.05 : 0.08
            };

            const size = Math.random() * 0.8 + 0.4;
            p.scale.set(size, size, size);

            if (isDashing) {
                p.material.color.setHex(0xffffff); // White trail when dashing
            } else {
                p.material.color.setHex(0x00ffff);
            }

            this.particles.push(p);
        }
    }

    update() {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.position.z += 0.2; // drift backwards
            p.userData.life -= p.userData.decay;
            p.material.opacity = p.userData.life;
            p.scale.multiplyScalar(0.95); // shrink

            if (p.userData.life <= 0) {
                p.visible = false;
                this.pool.push(p);
                this.particles.splice(i, 1);
            }
        }
    }
}
