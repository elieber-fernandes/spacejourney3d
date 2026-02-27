import * as THREE from 'three';

export class ExplosionManager {
    constructor(scene) {
        this.scene = scene;
        this.explosions = [];
        this.lights = [];

        // Single material for all particles
        this.mat = new THREE.SpriteMaterial({
            color: 0xffaa00,
            transparent: true,
            blending: THREE.AdditiveBlending
        });
    }

    createExplosion(position, color = 0xffaa00, count = 15) {
        // Add a dynamic light flash
        const light = new THREE.PointLight(color, 10, 30); // color, intensity, distance
        light.position.copy(position);
        this.scene.add(light);
        this.lights.push({ light, decay: 0.5, life: 10 });

        for (let i = 0; i < count; i++) {
            const sprite = new THREE.Sprite(this.mat.clone());
            sprite.material.color.setHex(color);
            sprite.position.copy(position);

            // Random velocity spread outward
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

            this.scene.add(sprite);
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
                this.scene.remove(p);
                p.material.dispose();
                this.explosions.splice(i, 1);
            }
        }

        // Update explosion lights
        for (let i = this.lights.length - 1; i >= 0; i--) {
            const data = this.lights[i];
            data.life -= data.decay;
            data.light.intensity = data.life;
            if (data.life <= 0) {
                this.scene.remove(data.light);
                data.light.dispose();
                this.lights.splice(i, 1);
            }
        }
    }
}

export class EngineTrail {
    constructor(scene) {
        this.scene = scene;
        this.particles = [];
        this.mat = new THREE.SpriteMaterial({
            color: 0x00ffff, // Cyan/blue engine glow
            transparent: true,
            blending: THREE.AdditiveBlending,
            opacity: 0.8
        });
    }

    spawnTrail(position, isDashing = false) {
        // Emit 1-2 particles per frame
        const count = isDashing ? 3 : 1;
        for (let i = 0; i < count; i++) {
            const p = new THREE.Sprite(this.mat.clone());
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
            }

            this.scene.add(p);
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
                this.scene.remove(p);
                p.material.dispose();
                this.particles.splice(i, 1);
            }
        }
    }
}
