import { Room, Client } from "colyseus";
import { PlayerState } from "../schema/Player";
import { prisma } from "../db";
import { v4 as uuidv4 } from "uuid";
import { MapState } from "../schema/Map";
import { GAME_MAPS, MAPS_KEYS } from "../db/maps";
import { MonsterState } from "../schema/Monster";
import { CollisionManager } from "../systems/CollisionManager";
import { MAP_OBSTACLES } from "../config/mapCollisions";
import {
  isMoving,
  getRandomDirection,
  calculateNewPosition,
  stopMovement,
  shouldDoAction,
  getRandomInterval,
} from "../utils/movement";
import {
  getMapBoundaries,
  getRandomPositionInMap,
  generateMapBoundaryCollisions,
  MapBoundaries,
} from "../utils/mapUtils";
import { CollisionShape } from "../utils/obstacles";
import { PlayerEntity } from "../entities/PlayerEntity";
import { MonsterEntity } from "../entities/MonsterEntity";
import { CombatManager } from "../systems/CombatManager";

export class WorldRoom extends Room<MapState> {
  maxClients = 100;
  SPEED = 5;
  TICK_RATE = 50; // 50ms = 20 ticks per second
  PLAYER_RADIUS = 0.5; // collision radius for players
  MONSTER_RADIUS = 0.5; // collision radius for monsters
  MONSTER_SPEED = 2; // monsters move slower than players
  ATTACK_RANGE = 2.0; // attack range for combat
  MAP = GAME_MAPS[MAPS_KEYS.WORLD];
  MAP_BOUNDARIES: MapBoundaries;
  state = new MapState();

  // Collision system
  collisionManager: CollisionManager;

  // Combat system
  combatManager: CombatManager;

  // Entity management (server-side combat logic)
  playerEntities: Map<string, PlayerEntity> = new Map(); // sessionId -> PlayerEntity
  monsterEntities: Map<string, MonsterEntity> = new Map();

  // Monster AI timers (per monster)
  monsterAITimers: Map<string, number> = new Map();

  onCreate() {
    console.log("🌍 WorldRoom created");

    // Initialize map boundaries
    this.MAP_BOUNDARIES = getMapBoundaries(this.MAP);

    // Generate dynamic map boundary collisions based on actual map size
    const mapBoundaryWalls = generateMapBoundaryCollisions(this.MAP_BOUNDARIES);

    // Convert obstacle configs to collision shapes
    const obstacleCollisions = this.convertObstaclesToCollisions(MAP_OBSTACLES.world);

    // Debug: Log obstacle collisions
    console.log('🔍 Obstacle collisions:', JSON.stringify(obstacleCollisions, null, 2));

    // Combine boundaries + obstacles
    const allCollisions = [
      ...mapBoundaryWalls,
      ...obstacleCollisions,
    ];

    // Initialize collision system
    this.collisionManager = new CollisionManager(allCollisions, this.PLAYER_RADIUS);

    // Initialize combat system
    this.combatManager = new CombatManager();

    console.log(`✅ Loaded ${obstacleCollisions.length} obstacles with collision`);

    this.spawnMonstersOnCreate();
    // Loop principal (20Hz = 50ms per tick)
    this.setSimulationInterval((deltaMs) => this.update(deltaMs / 1000), this.TICK_RATE);

    this.onMessage("*", (client: Client, type: string|number, message: any) => {
        console.log(client.sessionId, "sent 'action' message: ", message);
          const player = this.state.players.get(client.sessionId);
          const playerEntity = this.playerEntities.get(client.sessionId);

          switch (type) {
            case "move":
              if (!player) return;
              const [dx, dy, dz] = message.dir;
              // Always update direction, even if it's zero (stopped)
              player.dirX = dx;
              player.dirY = dy;
              player.dirZ = dz;
              player.last_processed_input = message.seq;

              // Update entity position
              if (playerEntity) {
                playerEntity.setPosition(player.x, player.y, player.z);
              }

              if (dx !== 0 || dy !== 0 || dz !== 0) {
                console.log(`Player ${player.name} is moving to direction:`, dx, dy, dz);
              } else {
                console.log(`Player ${player.name} stopped moving`);
              }
              break;

            case "attack":
              this.handlePlayerAttack(client, message);
              break;

            case "damage":
              if (!player) return;
              player.currentHp -= message.amount;
              if (player.currentHp < 0) player.currentHp = 0;
              break;
          }
    });
  }

  /**
   * Convert obstacle configurations to collision shapes
   */
  convertObstaclesToCollisions(obstacles: typeof MAP_OBSTACLES.world): CollisionShape[] {
    return obstacles.map((obstacle) => {
      if (obstacle.collisionType === "box") {
        return {
          type: "box" as const,
          x: obstacle.position.x,
          z: obstacle.position.z,
          width: obstacle.size?.x || 2,
          depth: obstacle.size?.z || 2,
          sceneObjectId: obstacle.id,
        };
      } else {
        // Circle collision
        return {
          type: "circle" as const,
          x: obstacle.position.x,
          z: obstacle.position.z,
          radius: obstacle.position.radius || obstacle.size?.radius || 1,
          sceneObjectId: obstacle.id,
        };
      }
    });
  }

  spawnMonstersOnCreate() {
    const monsterEntries = Object.entries(this.MAP.availableMonsters);
    if (monsterEntries.length === 0) return;

    monsterEntries.forEach(([_monsterKey, monsterData]) => {
      for (let i = 0; i < monsterData.quantity; i++) {
        const monster = new MonsterState();
        monster.id = `${monsterData.name}_${i}`;
        monster.name = monsterData.name;

        // Find safe spawn position for monster using map boundaries
        const spawnPos = this.collisionManager.findSafeSpawnPosition(
          this.MAP_BOUNDARIES.minX,
          this.MAP_BOUNDARIES.maxX,
          this.MAP_BOUNDARIES.minZ,
          this.MAP_BOUNDARIES.maxZ,
          this.state.players.values()
        );

        if (spawnPos) {
          monster.x = spawnPos.x;
          monster.z = spawnPos.z;
        } else {
          // Fallback to random position in map if safe spawn fails
          const randomPos = getRandomPositionInMap(this.MAP_BOUNDARIES);
          monster.x = randomPos.x;
          monster.z = randomPos.z;
        }
        monster.y = 1; // Ground level

        this.state.monsters.set(monster.id, monster);

        // Create monster entity for combat system
        const monsterEntity = new MonsterEntity(
          monster.id,
          monster.name,
          { x: monster.x, y: monster.y, z: monster.z },
          {
            maxHp: monsterData.maxHp || 50,
            baseDamage: monsterData.attack || 5,
            attackSpeed: 1.0,
            attackRange: 2.0,
            defense: 0,
            respawnTime: 30
          }
        );

        this.monsterEntities.set(monster.id, monsterEntity);

        // Sync stats to schema
        monster.maxHp = monsterEntity.stats.maxHp;
        monster.currentHp = monsterEntity.stats.currentHp;
        monster.baseDamage = monsterEntity.stats.baseDamage;
        monster.attackSpeed = monsterEntity.stats.attackSpeed;
        monster.attackRange = monsterEntity.stats.attackRange;
        monster.defense = monsterEntity.stats.defense;
      }
    });
  }
  
 update(delta: number) {
    // Update players
    for (const player of this.state.players.values()) {
      if (isMoving(player.dirX, player.dirY, player.dirZ)) {
        this.updatePlayerMovement(player, delta);
      }
    }

    // Update monsters (AI-controlled)
    this.updateMonsterAI(delta);
  }

  updatePlayerMovement(player: PlayerState, delta: number) {
    // Calculate new position
    const { newX, newZ } = calculateNewPosition(
      player.x,
      player.z,
      player.dirX,
      player.dirZ,
      this.SPEED,
      delta
    );

    // Try to move with collision sliding
    const slideResult = this.collisionManager.trySlideMovement(
      player.x,
      player.z,
      newX,
      newZ,
      player,
      this.state.players.values()
    );

    // Update player position (may be slid along walls)
    player.x = slideResult.x;
    player.z = slideResult.z;

    // Y movement (jumping, etc.) - no collision check for now
    if (player.dirY !== 0) {
      player.y += player.dirY * this.SPEED * delta;
    }
  }

  updateMonsterAI(delta: number) {
    for (const monster of this.state.monsters.values()) {
      // Update AI decision timer
      this.updateMonsterAIDecision(monster, delta);

      // Move monster if it has direction
      if (isMoving(monster.dirX, 0, monster.dirZ)) {
        this.updateMonsterMovement(monster, delta);
      }
    }
  }

  updateMonsterAIDecision(monster: MonsterState, delta: number) {
    // Get or initialize timer for this monster
    let timer = this.monsterAITimers.get(monster.id) || 0;
    timer -= delta;

    // Every 2-5 seconds, choose a new random direction (wander behavior)
    if (timer <= 0) {
      if (shouldDoAction(0.7)) {
        // 70% chance to move - set random direction
        const direction = getRandomDirection();
        monster.dirX = direction.dirX;
        monster.dirZ = direction.dirZ;
      } else {
        // 30% chance to stop
        const stop = stopMovement();
        monster.dirX = stop.dirX;
        monster.dirZ = stop.dirZ;
      }

      // Reset timer (2-5 seconds)
      timer = getRandomInterval(2, 5);
      this.monsterAITimers.set(monster.id, timer);
    } else {
      this.monsterAITimers.set(monster.id, timer);
    }
  }

  updateMonsterMovement(monster: MonsterState, delta: number) {
    // Calculate new position
    const { newX, newZ } = calculateNewPosition(
      monster.x,
      monster.z,
      monster.dirX,
      monster.dirZ,
      this.MONSTER_SPEED,
      delta
    );

    // Try to move with collision sliding
    const slideResult = this.collisionManager.trySlideMovement(
      monster.x,
      monster.z,
      newX,
      newZ
    );

    // Update monster position (may be slid along walls)
    monster.x = slideResult.x;
    monster.z = slideResult.z;

    // If monster is completely blocked, force new direction next tick
    if (slideResult.collided && slideResult.x === monster.x && slideResult.z === monster.z) {
      const stop = stopMovement();
      monster.dirX = stop.dirX;
      monster.dirZ = stop.dirZ;
      this.monsterAITimers.set(monster.id, 0); // Force new direction next tick
    }
  }

  /**
   * Handle player attack request
   */
  handlePlayerAttack(client: Client, message: any) {
    const player = this.state.players.get(client.sessionId);
    const playerEntity = this.playerEntities.get(client.sessionId);

    if (!player || !playerEntity) {
      console.log(`⚠️ Attack failed: Player not found`);
      return;
    }

    const { targetId, targetType } = message; // targetType: "player" or "monster"

    // Update player entity position
    playerEntity.setPosition(player.x, player.y, player.z);

    let targetEntity;
    let targetState;

    // Find target entity
    if (targetType === "monster") {
      targetEntity = this.monsterEntities.get(targetId);
      targetState = this.state.monsters.get(targetId);
    } else if (targetType === "player") {
      targetEntity = this.playerEntities.get(targetId);
      targetState = this.state.players.get(targetId);
    }

    if (!targetEntity || !targetState) {
      console.log(`⚠️ Attack failed: Target not found (${targetId})`);
      return;
    }

    // Update target entity position
    targetEntity.setPosition(targetState.x, targetState.y, targetState.z);

    // Process attack through combat manager
    const result = this.combatManager.processAttack(
      playerEntity,
      targetEntity,
      Date.now()
    );

    if (!result.success) {
      // Send failure message to attacker only
      this.send(client, "attack_failed", {
        reason: result.reason,
        targetId: targetId,
      });
      return;
    }

    // Update target HP in schema
    if (targetType === "monster") {
      (targetState as MonsterState).currentHp = targetEntity.stats.currentHp;
      (targetState as MonsterState).isDead = targetEntity.isDead;
    } else {
      (targetState as PlayerState).currentHp = targetEntity.stats.currentHp;
    }

    // Set attacking state
    player.isAttacking = true;
    player.targetId = targetId;

    // Broadcast attack to all clients
    this.broadcast("player_attacked", {
      attackerId: client.sessionId,
      attackerName: player.name,
      targetId: targetId,
      targetType: targetType,
      damage: result.damage,
      killed: result.killed,
      targetHp: targetEntity.stats.currentHp,
      targetMaxHp: targetEntity.stats.maxHp,
    });

    console.log(
      `⚔️ ${player.name} attacked ${targetState.name} for ${result.damage} damage (${targetEntity.stats.currentHp}/${targetEntity.stats.maxHp} HP)`
    );

    // Handle monster death and respawn
    if (result.killed && targetType === "monster") {
      setTimeout(() => {
        this.handleMonsterRespawn(targetId);
      }, (targetEntity as MonsterEntity).respawnTime * 1000);
    }

    // Reset attacking state after a short delay
    setTimeout(() => {
      player.isAttacking = false;
      player.targetId = "";
    }, 100);
  }

  /**
   * Handle monster respawn
   */
  handleMonsterRespawn(monsterId: string) {
    const monsterEntity = this.monsterEntities.get(monsterId);
    const monsterState = this.state.monsters.get(monsterId);

    if (!monsterEntity || !monsterState) return;

    monsterEntity.respawn();

    // Sync to schema
    monsterState.x = monsterEntity.position.x;
    monsterState.y = monsterEntity.position.y;
    monsterState.z = monsterEntity.position.z;
    monsterState.currentHp = monsterEntity.stats.currentHp;
    monsterState.isDead = false;

    // Broadcast respawn to all clients
    this.broadcast("monster_respawned", {
      monsterId: monsterId,
      x: monsterState.x,
      y: monsterState.y,
      z: monsterState.z,
    });

    console.log(`🔄 Monster ${monsterState.name} respawned`);
  }

  async onJoin(client: Client, options: any) {
    const playerName = options.name || `Player_${client.sessionId.slice(0, 4)}`;
    
    // tenta carregar player do banco ou cria novo
    let player = await prisma.player.findUnique({
      where: { id: playerName },
    });

    if (!player) {
      // Spawn player at random position in map
      const spawnPos = getRandomPositionInMap(this.MAP_BOUNDARIES);
      player = await prisma.player.create({
        data: {
          id: uuidv4(),
          name: playerName,
          x: spawnPos.x,
          y: 1,
          z: spawnPos.z,
          hp: 100
        },
      });
    }

    const p = new PlayerState();

    p.id = player.id;
    p.name = player.name;
    p.x = player.x;
    p.y = player.y;
    p.z = player.z;
    p.currentHp = player.hp;

    this.state.players.set(client.sessionId, p);

    // Create player entity for combat system
    const playerEntity = new PlayerEntity(
      player.id,
      client.sessionId,
      player.name,
      { x: player.x, y: player.y, z: player.z },
      {
        maxHp: 100,
        currentHp: player.hp,
        baseDamage: 10,
        attackSpeed: 2.0,
        attackRange: 2.0,
        defense: 0,
        damageMultiplier: 1.0,
        damageReduction: 0,
      }
    );

    this.playerEntities.set(client.sessionId, playerEntity);

    // Sync combat stats to schema
    p.maxHp = playerEntity.stats.maxHp;
    p.baseDamage = playerEntity.stats.baseDamage;
    p.attackSpeed = playerEntity.stats.attackSpeed;
    p.attackRange = playerEntity.stats.attackRange;
    p.defense = playerEntity.stats.defense;
    p.damageMultiplier = playerEntity.stats.damageMultiplier;
    p.damageReduction = playerEntity.stats.damageReduction;

    console.log(`👤 ${p.name} entrou no mundo`);

    // Send obstacle data to client so they can spawn 3D assets
    this.send(client, "spawn_obstacles", {
      obstacles: MAP_OBSTACLES.world
    });
  }

  async onLeave(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (player) {
      await prisma.player.update({
        where: { id: player.id },
        data: { x: player.x, y: player.y, hp: player.currentHp },
      });
      console.log(`💾 Salvou ${player.name}`);
      this.state.players.delete(client.sessionId);
      this.playerEntities.delete(client.sessionId);
    }
  }

  async onDispose() {
    console.log("🧹 Room disposed");
  }
}
