const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const statusEl = document.getElementById("status");

const TAU = Math.PI * 2;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

class Vec2 {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }

  copy() {
    return new Vec2(this.x, this.y);
  }

  add(v) {
    this.x += v.x;
    this.y += v.y;
    return this;
  }

  sub(v) {
    this.x -= v.x;
    this.y -= v.y;
    return this;
  }

  scale(s) {
    this.x *= s;
    this.y *= s;
    return this;
  }

  length() {
    return Math.hypot(this.x, this.y);
  }

  normalize() {
    const len = this.length() || 1;
    this.x /= len;
    this.y /= len;
    return this;
  }

  static subtract(a, b) {
    return new Vec2(a.x - b.x, a.y - b.y);
  }
}

class Input {
  constructor() {
    this.keys = new Set();
    this.mousePos = new Vec2();
    this.mouseDown = false;
    this.init();
  }

  init() {
    window.addEventListener("keydown", (e) => this.keys.add(e.key.toLowerCase()));
    window.addEventListener("keyup", (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener("mousedown", () => (this.mouseDown = true));
    window.addEventListener("mouseup", () => (this.mouseDown = false));
    window.addEventListener("mousemove", (e) => {
      const rect = canvas.getBoundingClientRect();
      this.mousePos.x = e.clientX - rect.left;
      this.mousePos.y = e.clientY - rect.top;
    });
  }
}

class Bullet {
  constructor(position, direction, speed, owner, damage, noiseRadius) {
    this.position = position.copy();
    this.direction = direction.copy().normalize();
    this.speed = speed;
    this.owner = owner;
    this.alive = true;
    this.damage = damage;
    this.noiseRadius = noiseRadius;
  }

  update(dt) {
    this.position.add(this.direction.copy().scale(this.speed * dt));
    if (
      this.position.x < 0 ||
      this.position.x > canvas.width ||
      this.position.y < 0 ||
      this.position.y > canvas.height
    ) {
      this.alive = false;
    }
  }

  draw() {
    ctx.save();
    ctx.fillStyle = this.owner === "player" ? "#ffda6b" : "#ff5c8d";
    ctx.beginPath();
    ctx.arc(this.position.x, this.position.y, 3, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

class Weapon {
  constructor({ name, fireRate, damage, noiseRadius, bulletSpeed }) {
    this.name = name;
    this.fireRate = fireRate;
    this.damage = damage;
    this.noiseRadius = noiseRadius;
    this.bulletSpeed = bulletSpeed;
    this.cooldown = 0;
  }

  update(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
  }

  tryFire(origin, direction, owner) {
    if (this.cooldown > 0) return null;
    this.cooldown = 1 / this.fireRate;
    return new Bullet(origin, direction, this.bulletSpeed, owner, this.damage, this.noiseRadius);
  }
}

class Player {
  constructor(input) {
    this.position = new Vec2(canvas.width / 2, canvas.height / 2 + 60);
    this.speed = 180;
    this.input = input;
    this.health = 100;
    this.weapons = [
      new Weapon({
        name: "Quiet Repeater",
        fireRate: 6,
        damage: 12,
        noiseRadius: 90,
        bulletSpeed: 480,
      }),
      new Weapon({
        name: "Loud Thumper",
        fireRate: 2.5,
        damage: 28,
        noiseRadius: 200,
        bulletSpeed: 420,
      }),
    ];
    this.activeWeapon = 0;
  }

  handleInput(dt) {
    const dir = new Vec2();
    if (this.input.keys.has("w")) dir.y -= 1;
    if (this.input.keys.has("s")) dir.y += 1;
    if (this.input.keys.has("a")) dir.x -= 1;
    if (this.input.keys.has("d")) dir.x += 1;
    if (dir.length() > 0) {
      dir.normalize().scale(this.speed * dt);
      this.position.add(dir);
      this.position.x = clamp(this.position.x, 20, canvas.width - 20);
      this.position.y = clamp(this.position.y, 20, canvas.height - 20);
    }

    if (this.input.keys.has("1")) this.activeWeapon = 0;
    if (this.input.keys.has("2")) this.activeWeapon = 1;
  }

  update(dt, bullets, noises) {
    this.handleInput(dt);
    this.weapons.forEach((w) => w.update(dt));
    if (this.input.mouseDown) {
      const weapon = this.weapons[this.activeWeapon];
      const dir = Vec2.subtract(this.input.mousePos, this.position);
      if (dir.length() > 0) {
        const bullet = weapon.tryFire(this.position, dir, "player");
        if (bullet) {
          bullets.push(bullet);
          noises.push(new NoiseEvent(this.position.copy(), weapon.noiseRadius, "player"));
        }
      }
    }
  }

  draw() {
    ctx.save();
    ctx.translate(this.position.x, this.position.y);
    ctx.fillStyle = "#7be0a5";
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "#0b0";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
  }
}

class Enemy {
  constructor(position, waypoints, loadout) {
    this.position = position.copy();
    this.waypoints = waypoints;
    this.currentWp = 0;
    this.speed = 90;
    this.state = "patrol";
    this.alertTimer = 0;
    this.searchTarget = null;
    this.health = 60;
    this.loadout = loadout;
    this.weapon = new Weapon(loadout);
    this.weapon.cooldown = Math.random() * 0.4;
  }

  seePlayer(player) {
    const toPlayer = Vec2.subtract(player.position, this.position);
    const dist = toPlayer.length();
    const maxVision = 260;
    if (dist > maxVision) return false;
    const facing = Vec2.subtract(this.nextWaypoint(), this.position).normalize();
    const direction = toPlayer.copy().normalize();
    const dot = facing.x * direction.x + facing.y * direction.y;
    return dot > 0.25; // ~75° cone
  }

  hearNoise(noises) {
    for (const noise of noises) {
      const dist = Vec2.subtract(noise.position, this.position).length();
      if (dist <= noise.radius) {
        this.searchTarget = noise.position.copy();
        this.state = "alert";
        this.alertTimer = 4 + Math.random() * 2;
        return true;
      }
    }
    return false;
  }

  nextWaypoint() {
    return this.waypoints[this.currentWp];
  }

  update(dt, player, bullets, noises) {
    this.weapon.update(dt);

    if (this.health <= 0) return;

    if (this.state === "patrol") {
      const target = this.nextWaypoint();
      const dir = Vec2.subtract(target, this.position);
      if (dir.length() < 10) {
        this.currentWp = (this.currentWp + 1) % this.waypoints.length;
      } else {
        dir.normalize().scale(this.speed * dt);
        this.position.add(dir);
      }
      if (this.seePlayer(player)) {
        this.state = "attack";
      } else {
        this.hearNoise(noises);
      }
    } else if (this.state === "alert") {
      if (this.seePlayer(player)) {
        this.state = "attack";
      } else {
        this.alertTimer -= dt;
        if (this.searchTarget) {
          const dir = Vec2.subtract(this.searchTarget, this.position);
          if (dir.length() > 4) {
            dir.normalize().scale(this.speed * 0.8 * dt);
            this.position.add(dir);
          } else if (Math.random() < 0.02) {
            // wander around the search origin
            this.searchTarget.add(new Vec2(Math.random() * 60 - 30, Math.random() * 60 - 30));
          }
        }
        if (this.alertTimer <= 0) {
          this.state = "patrol";
          this.searchTarget = null;
        }
      }
    } else if (this.state === "attack") {
      const dirToPlayer = Vec2.subtract(player.position, this.position);
      if (dirToPlayer.length() > 300) {
        this.state = "alert";
        this.searchTarget = player.position.copy();
        this.alertTimer = 3;
      } else {
        if (dirToPlayer.length() > 120) {
          dirToPlayer.normalize().scale(this.speed * 1.1 * dt);
          this.position.add(dirToPlayer);
        }
        this.fireAt(player, bullets, noises);
      }
    }
  }

  fireAt(player, bullets, noises) {
    const dir = Vec2.subtract(player.position, this.position);
    if (dir.length() === 0) return;
    const shot = this.weapon.tryFire(this.position, dir, "enemy");
    if (shot) {
      // small inaccuracy for cartoon feel
      const jitter = (Math.random() - 0.5) * 0.15;
      const rotated = new Vec2(
        dir.x * Math.cos(jitter) - dir.y * Math.sin(jitter),
        dir.x * Math.sin(jitter) + dir.y * Math.cos(jitter)
      ).normalize();
      shot.direction = rotated;
      bullets.push(shot);
      noises.push(new NoiseEvent(this.position.copy(), this.weapon.noiseRadius, "enemy"));
    }
  }

  draw() {
    if (this.health <= 0) return;
    ctx.save();
    ctx.translate(this.position.x, this.position.y);
    ctx.fillStyle = this.state === "attack" ? "#ff7b9c" : this.state === "alert" ? "#ffd166" : "#7aa2f7";
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "#0b0d13";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }
}

class NoiseEvent {
  constructor(position, radius, source) {
    this.position = position;
    this.radius = radius;
    this.source = source;
    this.time = 0.4;
  }

  update(dt) {
    this.time -= dt;
  }

  get active() {
    return this.time > 0;
  }

  draw() {
    if (!this.active) return;
    ctx.save();
    ctx.strokeStyle = this.source === "player" ? "rgba(255, 218, 107, 0.4)" : "rgba(255, 92, 141, 0.4)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(this.position.x, this.position.y, this.radius, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
}

class Game {
  constructor() {
    this.input = new Input();
    this.player = new Player(this.input);
    this.bullets = [];
    this.noises = [];
    this.enemies = this.spawnEnemies();
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  spawnEnemies() {
    const archetypes = [
      { name: "Chipper", fireRate: 5, damage: 8, noiseRadius: 90, bulletSpeed: 360 },
      { name: "Grunt", fireRate: 3, damage: 12, noiseRadius: 120, bulletSpeed: 380 },
      { name: "Bomber", fireRate: 1.5, damage: 20, noiseRadius: 180, bulletSpeed: 300 },
      { name: "Silenced Elite", fireRate: 3.5, damage: 10, noiseRadius: 60, bulletSpeed: 400 },
    ];

    const waypoints = [
      [new Vec2(140, 140), new Vec2(340, 160), new Vec2(260, 240)],
      [new Vec2(600, 120), new Vec2(820, 160), new Vec2(760, 260)],
      [new Vec2(280, 360), new Vec2(440, 440), new Vec2(320, 500)],
      [new Vec2(640, 340), new Vec2(820, 440), new Vec2(680, 500)],
    ];

    return waypoints.map((wps) => {
      const archetype = archetypes[Math.floor(Math.random() * archetypes.length)];
      return new Enemy(wps[0], wps, archetype);
    });
  }

  loop(time) {
    const dt = Math.min(0.05, (time - this.lastTime) / 1000);
    this.lastTime = time;
    this.update(dt);
    this.render();
    requestAnimationFrame((t) => this.loop(t));
  }

  update(dt) {
    this.player.update(dt, this.bullets, this.noises);
    this.enemies.forEach((enemy) => enemy.update(dt, this.player, this.bullets, this.noises));

    this.bullets.forEach((bullet) => bullet.update(dt));
    this.handleCollisions();
    this.bullets = this.bullets.filter((b) => b.alive);

    this.noises.forEach((n) => n.update(dt));
    this.noises = this.noises.filter((n) => n.active);

    this.updateStatus();
  }

  handleCollisions() {
    for (const bullet of this.bullets) {
      if (!bullet.alive) continue;
      if (bullet.owner === "player") {
        for (const enemy of this.enemies) {
          if (enemy.health <= 0) continue;
          const dist = Vec2.subtract(bullet.position, enemy.position).length();
          if (dist < 12) {
            bullet.alive = false;
            enemy.health -= bullet.damage;
            if (enemy.health <= 0) {
              enemy.state = "down";
            } else {
              enemy.state = "attack";
            }
            break;
          }
        }
      } else if (bullet.owner === "enemy") {
        const dist = Vec2.subtract(bullet.position, this.player.position).length();
        if (dist < 12) {
          bullet.alive = false;
          this.player.health -= bullet.damage;
        }
      }
    }
  }

  render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // stylized floor grid for a 2.5D vibe
    ctx.save();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 60, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y + 30);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
    ctx.restore();

    this.noises.forEach((n) => n.draw());
    this.player.draw();
    this.enemies.forEach((e) => e.draw());
    this.bullets.forEach((b) => b.draw());

    // HUD
    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
    ctx.fillRect(0, canvas.height - 60, canvas.width, 60);
    ctx.fillStyle = "#f3f4f6";
    ctx.font = "16px Inter, sans-serif";
    ctx.fillText(`Health: ${Math.max(0, Math.round(this.player.health))}`, 16, canvas.height - 28);
    const weapon = this.player.weapons[this.player.activeWeapon];
    ctx.fillText(
      `Weapon: ${weapon.name} (Noise ${weapon.noiseRadius.toFixed(0)})`,
      180,
      canvas.height - 28
    );
    ctx.restore();
  }

  updateStatus() {
    const weapon = this.player.weapons[this.player.activeWeapon];
    const aliveEnemies = this.enemies.filter((e) => e.health > 0).length;
    statusEl.innerHTML = `
      <div><span class="badge">Weapon</span> ${weapon.name} — Fire rate ${weapon.fireRate.toFixed(
        1
      )}/s, Damage ${weapon.damage}, Noise ${weapon.noiseRadius}</div>
      <div><span class="badge">Enemies</span> ${aliveEnemies} active</div>
      <div><span class="badge">States</span> Patrol → Alert (noise/search) → Attack (line of sight)</div>
    `;
  }
}

class BoundsGuard {
  constructor() {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    window.addEventListener("resize", () => {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
    });
  }
}

new BoundsGuard();
new Game();
