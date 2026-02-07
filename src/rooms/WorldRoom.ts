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
  getRandomDirection,
  shouldDoAction,
  getRandomInterval,
  getDirectionToTarget,
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

// TODO: just check collision in nearby area instead of whole map
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


  // Entity management (source of truth for all game state)
  playerEntities: Map<string, PlayerEntity> = new Map(); // sessionId -> PlayerEntity
  monsterEntities: Map<string, MonsterEntity> = new Map();

  // Monster AI timers (per monster)
  monsterAITimers: Map<string, number> = new Map();

  // Monster combat state
  monsterAggro: Map<string, string> = new Map(); // monsterId -> playerSessionId

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

    console.log(`✅ Loaded ${obstacleCollisions.length} obstacles with collision`);

    this.spawnMonstersOnCreate();
    // Loop principal (20Hz = 50ms per tick)
    this.setSimulationInterval((deltaMs) => this.update(deltaMs / 1000), this.TICK_RATE);

    this.onMessage("*", (client: Client, type: string|number, message: any) => {
        console.log(client.sessionId, "sent 'action' message: ", message);
        const playerEntity = this.playerEntities.get(client.sessionId);

        switch (type) {
          case "move":
            if (!playerEntity) return;
            const [dx, dy, dz] = message.dir;
            playerEntity.setDirection(dx, dy, dz);
            playerEntity.lastProcessedInput = message.seq;

            if (dx !== 0 || dy !== 0 || dz !== 0) {
              console.log(`Player ${playerEntity.name} is moving to direction:`, dx, dy, dz);
            } else {
              console.log(`Player ${playerEntity.name} stopped moving`);
            }
            break;

          case "attack":
            this.handlePlayerAttack(client, message);
            break;

          case "skill":
            this.handlePlayerSkill(client, message);
            break;

          case "damage":
            if (!playerEntity) return;
            playerEntity.takeDamage(message.amount);
            break;
        }
    });
  }

  /**
   * Convert obstacle configurations to collision shapes
   */
  // TODO: remove from here and put in collision manager
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
        const monsterId = `${monsterData.name}_${i}`;

        // Find safe spawn position for monster using map boundaries
        const spawnPos = this.collisionManager.findSafeSpawnPosition(
          this.MAP_BOUNDARIES.minX,
          this.MAP_BOUNDARIES.maxX,
          this.MAP_BOUNDARIES.minZ,
          this.MAP_BOUNDARIES.maxZ,
          this.playerEntities.values()
        );

        const pos = spawnPos || getRandomPositionInMap(this.MAP_BOUNDARIES);

        // Create entity first (source of truth)
        const monsterEntity = new MonsterEntity(
          monsterId,
          monsterData.name,
          { x: pos.x, y: 1, z: pos.z },
          {
            maxHp: monsterData.maxHp || 50,
            baseDamage: monsterData.attack || 5,
            attackSpeed: 1.0,
            attackRange: 2.0,
            defense: 0,
            respawnTime: 30
          }
        );
        this.monsterEntities.set(monsterId, monsterEntity);

        // Create schema and sync from entity
        const monster = new MonsterState();
        monster.id = monsterId;
        monster.name = monsterData.name;
        monsterEntity.syncToSchema(monster);
        this.state.monsters.set(monsterId, monster);
      }
    });
  }

  update(delta: number) {
    // 1. Update player entities (movement)
    for (const entity of this.playerEntities.values()) {
      if (entity.isMoving()) {
        this.updatePlayerMovement(entity, delta);
      }
    }

    // 2. Update monsters (AI + movement on entities)
    this.updateMonsterAI(delta);

    // 3. Sync all entities to schemas (single pass per tick)
    this.syncAllEntitiesToSchemas();
  }

  /**
   * Sync all entity state to their corresponding schemas for network replication.
   * Called once per tick after all entity updates are complete.
   */
  syncAllEntitiesToSchemas() {
    for (const [sessionId, entity] of this.playerEntities) {
      const schema = this.state.players.get(sessionId);
      if (schema) {
        entity.syncToSchema(schema);
      }
    }

    for (const [monsterId, entity] of this.monsterEntities) {
      const schema = this.state.monsters.get(monsterId);
      if (schema) {
        entity.syncToSchema(schema);
      }
    }
  }

  updatePlayerMovement(entity: PlayerEntity, delta: number) {
    const { newX, newZ } = entity.calculateMovement(this.SPEED, delta);

    // Try to move with collision sliding
    const slideResult = this.collisionManager.trySlideMovement(
      entity.position.x,
      entity.position.z,
      newX,
      newZ,
      entity,
      this.playerEntities.values()
    );

    // Update entity position (may be slid along walls)
    entity.setPosition(slideResult.x, entity.position.y, slideResult.z);

    // Y movement (jumping, etc.) - no collision check for now
    if (entity.dirY !== 0) {
      entity.position.y += entity.dirY * this.SPEED * delta;
    }
  }

  updateMonsterAI(delta: number) {
    for (const [monsterId, entity] of this.monsterEntities) {
      if (entity.isDead) continue;

      // Check if monster has aggro target
      const targetSessionId = this.monsterAggro.get(monsterId);
      if (targetSessionId) {
        this.updateMonsterCombatAI(entity, targetSessionId, delta);
      } else {
        // No aggro - wander behavior
        this.updateMonsterWanderAI(entity, delta);
      }

      // Move monster if it has direction
      if (entity.isMoving()) {
        this.updateMonsterMovement(entity, delta);
      }
    }
  }

  updateMonsterCombatAI(monster: MonsterEntity, targetSessionId: string, _delta: number) {
    const targetEntity = this.playerEntities.get(targetSessionId);

    // Clear aggro if target is gone or dead
    if (!targetEntity || targetEntity.isDead) {
      this.monsterAggro.delete(monster.id);
      monster.targetId = "";
      return;
    }

    // Calculate direction and distance to player
    const { dirX, dirZ, distance } = getDirectionToTarget(
      monster.position.x, monster.position.z,
      targetEntity.position.x, targetEntity.position.z
    );

    // If player is too far, drop aggro (leash distance)
    const LEASH_DISTANCE = 15.0;
    if (distance > LEASH_DISTANCE) {
      this.monsterAggro.delete(monster.id);
      monster.targetId = "";
      monster.stopMovement();
      return;
    }

    // If in attack range, stop and attack
    if (distance <= monster.stats.attackRange) {
      console.log(`👹 ${monster.name} in range (${distance.toFixed(2)} <= ${monster.stats.attackRange}), attempting attack`);
      monster.stopMovement();
      this.tryMonsterAttack(monster, targetEntity);
    } else {
      // Chase the player
      monster.dirX = dirX;
      monster.dirZ = dirZ;
    }
  }

  updateMonsterWanderAI(monster: MonsterEntity, delta: number) {
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
        monster.stopMovement();
      }

      // Reset timer (2-5 seconds)
      timer = getRandomInterval(2, 5);
      this.monsterAITimers.set(monster.id, timer);
    } else {
      this.monsterAITimers.set(monster.id, timer);
    }
  }

  tryMonsterAttack(monster: MonsterEntity, targetPlayer: PlayerEntity) {
    const result = monster.attack(targetPlayer, Date.now());

    if (!result.success) {
      console.log(`👹 Monster attack failed: ${result.reason}`);
      return;
    }

    // Broadcast monster attack to all clients
    this.broadcast("monster_attacked", {
      monsterId: monster.id,
      monsterName: monster.name,
      targetId: targetPlayer.id,
      targetName: targetPlayer.name,
      damage: result.damage,
      killed: result.killed,
      targetHp: targetPlayer.stats.currentHp,
      targetMaxHp: targetPlayer.stats.maxHp,
    });

    console.log(
      `👹 ${monster.name} attacked ${targetPlayer.name} for ${result.damage} damage (${targetPlayer.stats.currentHp}/${targetPlayer.stats.maxHp} HP)`
    );

    // Reset attacking state after a short delay
    setTimeout(() => {
      monster.isAttacking = false;
    }, 100);
  }

  updateMonsterMovement(monster: MonsterEntity, delta: number) {
    const { newX, newZ } = monster.calculateMovement(this.MONSTER_SPEED, delta);

    // Try to move with collision sliding
    const slideResult = this.collisionManager.trySlideMovement(
      monster.position.x,
      monster.position.z,
      newX,
      newZ
    );

    // Update monster entity position (may be slid along walls)
    monster.setPosition(slideResult.x, monster.position.y, slideResult.z);

    // If monster is completely blocked, force new direction next tick
    if (slideResult.collided && slideResult.x === monster.position.x && slideResult.z === monster.position.z) {
      monster.stopMovement();
      this.monsterAITimers.set(monster.id, 0); // Force new direction next tick
    }
  }

  /**
   * Handle player attack request
   */
  handlePlayerAttack(client: Client, message: any) {
    const playerEntity = this.playerEntities.get(client.sessionId);

    if (!playerEntity) {
      console.log(`⚠️ Attack failed: Player not found`);
      return;
    }

    const { targetId, targetType } = message; // targetType: "player" or "monster"

    let targetEntity: PlayerEntity | MonsterEntity | undefined;

    // Find target entity
    if (targetType === "monster") {
      targetEntity = this.monsterEntities.get(targetId);
    } else if (targetType === "player") {
      targetEntity = this.playerEntities.get(targetId);
    }

    if (!targetEntity) {
      console.log(`⚠️ Attack failed: Target not found (${targetId})`);
      return;
    }

    // Stop movement if already in attack range (prevents sliding past target)
    // Keep moving if out of range (player still chasing)
    const distance = playerEntity.distanceTo(targetEntity);
    if (distance <= playerEntity.stats.attackRange) {
      playerEntity.stopMovement();
    }

    // Entity handles all attack logic (range, cooldown, damage)
    const result = playerEntity.attack(targetEntity, Date.now());

    if (!result.success) {
      this.send(client, "attack_failed", {
        reason: result.reason,
        targetId: targetId,
      });
      return;
    }

    // Set monster aggro to attacker (monster will fight back)
    if (targetType === "monster" && !targetEntity.isDead) {
      this.monsterAggro.set(targetId, client.sessionId);
      targetEntity.targetId = client.sessionId;
    }

    // Broadcast attack to all clients
    this.broadcast("player_attacked", {
      attackerId: client.sessionId,
      attackerName: playerEntity.name,
      targetId: targetId,
      targetType: targetType,
      damage: result.damage,
      killed: result.killed,
      targetHp: targetEntity.stats.currentHp,
      targetMaxHp: targetEntity.stats.maxHp,
    });

    console.log(
      `⚔️ ${playerEntity.name} attacked ${targetEntity.name} for ${result.damage} damage (${targetEntity.stats.currentHp}/${targetEntity.stats.maxHp} HP)`
    );

    // Handle monster death and respawn
    if (result.killed && targetType === "monster") {
      this.monsterAggro.delete(targetId);

      setTimeout(() => {
        this.handleMonsterRespawn(targetId);
      }, (targetEntity as MonsterEntity).respawnTime * 1000);
    }

    // Reset attacking state after a short delay
    setTimeout(() => {
      playerEntity.isAttacking = false;
      playerEntity.targetId = "";
    }, 100);
  }

  /**
   * Handle player skill request
   */
  handlePlayerSkill(client: Client, message: any) {
    const playerEntity = this.playerEntities.get(client.sessionId);

    if (!playerEntity) {
      console.log(`⚠️ Skill failed: Player not found`);
      return;
    }

    const { skillId, targetId, targetType } = message;

    // Find target entity
    let targetEntity: PlayerEntity | MonsterEntity | null = null;

    if (targetType === "monster" && targetId) {
      targetEntity = this.monsterEntities.get(targetId) || null;
    } else if (targetType === "player" && targetId) {
      targetEntity = this.playerEntities.get(targetId) || null;
    }

    // Entity handles all skill logic (lookup, range, damage)
    const result = playerEntity.useSkill(skillId, targetEntity, Date.now());

    if (!result.success) {
      this.send(client, "skill_failed", {
        reason: result.reason,
        skillId: skillId,
      });
      return;
    }

    // Broadcast skill to all clients
    this.broadcast("skill_used", {
      playerId: client.sessionId,
      playerName: playerEntity.name,
      skillId: skillId,
      targetId: targetId,
      targetType: targetType,
      damage: result.damage,
      killed: result.killed,
      targetHp: targetEntity?.stats.currentHp ?? 0,
      targetMaxHp: targetEntity?.stats.maxHp ?? 0,
    });

    console.log(
      `✨ ${playerEntity.name} used ${skillId} on ${targetEntity?.name || "no target"} for ${result.damage} damage`
    );

    // Handle monster death and respawn
    if (result.killed && targetType === "monster" && targetEntity) {
      this.monsterAggro.delete(targetId);

      setTimeout(() => {
        this.handleMonsterRespawn(targetId);
      }, (targetEntity as MonsterEntity).respawnTime * 1000);
    }

    // Reset attacking state after a short delay
    setTimeout(() => {
      playerEntity.isAttacking = false;
      playerEntity.targetId = "";
    }, 100);
  }

  /**
   * Handle monster respawn
   */
  handleMonsterRespawn(monsterId: string) {
    const monsterEntity = this.monsterEntities.get(monsterId);
    if (!monsterEntity) return;

    monsterEntity.respawn();

    // Clear any leftover aggro so monster doesn't immediately chase a player
    this.monsterAggro.delete(monsterId);
    this.monsterAITimers.delete(monsterId);

    // Immediate sync needed because this runs in setTimeout (outside tick loop)
    const monsterState = this.state.monsters.get(monsterId);
    if (monsterState) {
      monsterEntity.syncToSchema(monsterState);
    }

    // Broadcast respawn to all clients
    this.broadcast("monster_respawned", {
      monsterId: monsterId,
      x: monsterEntity.position.x,
      y: monsterEntity.position.y,
      z: monsterEntity.position.z,
    });

    console.log(`🔄 Monster ${monsterEntity.name} respawned`);
  }

  async onJoin(client: Client, options: any) {
    const playerName = options.name || `Player_${client.sessionId.slice(0, 4)}`;

    // Load player from database or create new
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

    // Create entity first (source of truth)
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

    // Create schema and sync from entity
    const p = new PlayerState();
    p.id = player.id;
    p.name = player.name;
    playerEntity.syncToSchema(p);
    this.state.players.set(client.sessionId, p);

    console.log(`👤 ${playerEntity.name} entrou no mundo`);

    // Send obstacle data to client so they can spawn 3D assets
    this.send(client, "spawn_obstacles", {
      obstacles: MAP_OBSTACLES.world
    });
  }

  async onLeave(client: Client) {
    const entity = this.playerEntities.get(client.sessionId);
    if (entity) {
      await prisma.player.update({
        where: { id: entity.id },
        data: {
          x: entity.position.x,
          y: entity.position.y,
          z: entity.position.z,
          hp: entity.stats.currentHp,
        },
      });
      console.log(`💾 Salvou ${entity.name}`);
      this.state.players.delete(client.sessionId);
      this.playerEntities.delete(client.sessionId);
    }
  }

  async onDispose() {
    console.log("🧹 Room disposed");
  }
}
