import { BasicEnemy, ShooterEnemy, KamikazeEnemy, HeavyTankEnemy, Meteor, BossEnemy, DashBoss, Obstacle } from '../entities.js';

export class WaveManager {
    constructor(scene) {
        this.scene = scene;
        this.currentWave = 1;
        this.enemiesRemainingToSpawn = 0;
        this.spawnTimer = 0;
        this.spawnRate = 60; // frames
        this.state = 'WAVE_START'; // WAVE_START, SPAWNING, WAITING_CLEAR, WAVE_COMPLETE
        this.waveTimer = 0;
        this.currentTypes = [];
    }

    startWave(waveNum) {
        this.currentWave = waveNum;
        this.state = 'WAVE_START';
        this.waveTimer = 180; // 3 seconds at 60fps

        // Dynamic spawn rate (gets faster each wave, caps at 15 frames)
        this.spawnRate = Math.max(15, 60 - (waveNum * 4));

        if (waveNum % 10 === 0) {
            // Dash Boss Wave (Level 10, 20, 30)
            this.enemiesRemainingToSpawn = 1;
            this.currentTypes = [{ type: 'dashboss', weight: 100 }];
        } else if (waveNum % 5 === 0) {
            // Regular Boss Wave (Level 5, 15, 25)
            // Spawn boss + a few minions
            this.enemiesRemainingToSpawn = 1 + Math.floor(waveNum / 5);
            this.currentTypes = [{ type: 'boss', weight: 100 }, { type: 'basic', weight: 20 }];
        } else if (waveNum <= 2) {
            // Intro: Just basics
            this.enemiesRemainingToSpawn = 5 + (waveNum * 3); // W1: 8, W2: 11
            this.currentTypes = [{ type: 'basic', weight: 100 }];
        } else if (waveNum <= 4) {
            // Introduce shooters
            this.enemiesRemainingToSpawn = 10 + (waveNum * 3); // W3: 19, W4: 22
            this.currentTypes = [{ type: 'basic', weight: 70 }, { type: 'shooter', weight: 30 }];
        } else if (waveNum <= 9) {
            // Mix of everything basic + kamikaze + tanks
            this.enemiesRemainingToSpawn = 15 + (waveNum * 4);
            this.currentTypes = [
                { type: 'basic', weight: 50 },
                { type: 'shooter', weight: 20 },
                { type: 'kamikaze', weight: 20 },
                { type: 'tank', weight: 10 }
            ];
        } else {
            // High level madness
            this.enemiesRemainingToSpawn = 30 + (waveNum * 5);
            this.currentTypes = [
                { type: 'basic', weight: 30 },
                { type: 'shooter', weight: 25 },
                { type: 'kamikaze', weight: 25 },
                { type: 'tank', weight: 20 }
            ];
        }
    }

    update(activeEnemies, obstacles) {
        if (this.state === 'WAVE_START') {
            this.waveTimer--;
            if (this.waveTimer <= 0) this.state = 'SPAWNING';
        } else if (this.state === 'SPAWNING') {
            this.spawnTimer++;
            if (this.spawnTimer >= this.spawnRate) {
                this.spawnTimer = 0;
                if (this.enemiesRemainingToSpawn > 0) {
                    this.spawnEnemy(activeEnemies);
                    this.enemiesRemainingToSpawn--;

                    // 15% chance to spawn an Obstacle alongside an enemy (unless Boss Wave)
                    if (this.currentWave % 5 !== 0 && Math.random() < 0.15) {
                        this.spawnObstacle(obstacles);
                    }
                } else {
                    this.state = 'WAITING_CLEAR';
                }
            }
        } else if (this.state === 'WAITING_CLEAR') {
            if (activeEnemies.length === 0) {
                this.state = 'WAVE_COMPLETE';
                this.waveTimer = 180;
            }
        } else if (this.state === 'WAVE_COMPLETE') {
            this.waveTimer--;
            if (this.waveTimer <= 0) {
                this.startWave(this.currentWave + 1);
            }
        }
    }

    spawnEnemy(activeEnemies) {
        // Spawn randomly
        const x = (Math.random() - 0.5) * 40;
        const z = -60 - Math.random() * 20;

        // Simple weighted random selection
        let totalWeight = 0;
        for (let t of this.currentTypes) {
            totalWeight += t.weight;
        }

        let r = Math.random() * totalWeight;
        let selectedType = 'basic';
        for (let t of this.currentTypes) {
            r -= t.weight;
            if (r <= 0) {
                selectedType = t.type;
                break;
            }
        }

        let enemy;
        // Pass currentWave to constructors so they can scale their own HP
        if (selectedType === 'dashboss') enemy = new DashBoss(this.scene, 0, -50, this.currentWave);
        else if (selectedType === 'boss') enemy = new BossEnemy(this.scene, 0, z, this.currentWave);
        else if (selectedType === 'tank') enemy = new HeavyTankEnemy(this.scene, x, z, this.currentWave);
        else if (selectedType === 'shooter') enemy = new ShooterEnemy(this.scene, x, z, this.currentWave);
        else if (selectedType === 'kamikaze') enemy = new KamikazeEnemy(this.scene, x, z, this.currentWave);
        else enemy = new BasicEnemy(this.scene, x, z, this.currentWave);

        activeEnemies.push(enemy);
    }

    spawnObstacle(obstacles) {
        // Cap obstacles to max 4 at a time
        if (obstacles.length >= 4) return;

        // More obstacles on later waves, but don't exceed the cap of 4
        let count = Math.floor(Math.random() * (1 + this.currentWave / 5)) + 1;
        count = Math.min(count, 4 - obstacles.length);

        for (let i = 0; i < count; i++) {
            const x = (Math.random() - 0.5) * 40;
            const z = -70 - Math.random() * 20;
            const size = 3 + Math.random() * 4;
            obstacles.push(new Obstacle(this.scene, x, z, size));
        }
    }
}
