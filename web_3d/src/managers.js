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

        if (waveNum % 10 === 0) {
            // Dash Boss Wave (Level 10, 20, 30)
            this.enemiesRemainingToSpawn = 1;
            this.currentTypes = ['dashboss'];
        } else if (waveNum % 5 === 0) {
            // Regular Boss Wave (Level 5, 15, 25)
            this.enemiesRemainingToSpawn = 1;
            this.currentTypes = ['boss'];
        } else if (waveNum === 1) {
            this.enemiesRemainingToSpawn = 5;
            this.currentTypes = ['basic'];
        } else if (waveNum === 2) {
            this.enemiesRemainingToSpawn = 8;
            this.currentTypes = ['basic', 'kamikaze'];
        } else if (waveNum === 3) {
            this.enemiesRemainingToSpawn = 10;
            this.currentTypes = ['basic', 'shooter'];
        } else if (waveNum === 4) {
            this.enemiesRemainingToSpawn = 15;
            this.currentTypes = ['basic', 'kamikaze', 'shooter', 'tank'];
        } else {
            this.enemiesRemainingToSpawn = 10 + (waveNum * 2);
            this.currentTypes = ['basic', 'kamikaze', 'shooter', 'tank'];
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

        const weights = { basic: 50, kamikaze: 30, shooter: 10, tank: 5, boss: 100, dashboss: 100 };

        // Simple weighted random selection
        let totalWeight = 0;
        const validTypes = [];
        for (let t of this.currentTypes) {
            totalWeight += weights[t];
            validTypes.push({ t, weight: weights[t] });
        }

        let r = Math.random() * totalWeight;
        let selectedType = 'basic';
        for (let t of validTypes) {
            r -= t.weight;
            if (r <= 0) { selectedType = t.t; break; }
        }

        let enemy;
        if (selectedType === 'dashboss') enemy = new DashBoss(this.scene, 0, -50); // Spawns further back to telegraph better
        else if (selectedType === 'boss') enemy = new BossEnemy(this.scene, 0, z); // Boss spawns in middle
        else if (selectedType === 'tank') enemy = new HeavyTankEnemy(this.scene, x, z);
        else if (selectedType === 'shooter') enemy = new ShooterEnemy(this.scene, x, z);
        else if (selectedType === 'kamikaze') enemy = new KamikazeEnemy(this.scene, x, z);
        else enemy = new BasicEnemy(this.scene, x, z);

        activeEnemies.push(enemy);
    }

    spawnObstacle(obstacles) {
        const x = (Math.random() - 0.5) * 40;
        const z = -70 - Math.random() * 20;
        const size = 3 + Math.random() * 4; // Size between 3 and 7
        obstacles.push(new Obstacle(this.scene, x, z, size));
    }
}
