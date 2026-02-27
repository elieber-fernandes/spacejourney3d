import * as THREE from 'three';

export class ExplosionManager {
    constructor(scene) {
        this.scene = scene;
        this.explosions = [];

        // Single material for all particles
        this.mat = new THREE.SpriteMaterial({
            color: 0xffaa00,
            transparent: true,
            blending: THREE.AdditiveBlending
        });
    }

    createExplosion(position, color = 0xffaa00, count = 15) {
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
    }
}
