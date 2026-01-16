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

            case "skill":
              this.handlePlayerSkill(client, message);
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
      if (monster.isDead) continue;

      // Check if monster has aggro target
      const targetSessionId = this.monsterAggro.get(monster.id);
      if (targetSessionId) {
        this.updateMonsterCombatAI(monster, targetSessionId, delta);
      } else {
        // No aggro - wander behavior
        this.updateMonsterWanderAI(monster, delta);
      }

      // Move monster if it has direction
      if (isMoving(monster.dirX, 0, monster.dirZ)) {
        this.updateMonsterMovement(monster, delta);
      }
    }
  }

  updateMonsterCombatAI(monster: MonsterState, targetSessionId: string, delta: number) {
    const targetPlayer = this.state.players.get(targetSessionId);

    // Clear aggro if target is gone or dead
    if (!targetPlayer || targetPlayer.currentHp <= 0) {
      this.monsterAggro.delete(monster.id);
      monster.targetId = "";
      return;
    }

    // Calculate direction and distance to player
    const { dirX, dirZ, distance } = getDirectionToTarget(
      monster.x, monster.z,
      targetPlayer.x, targetPlayer.z
    );

    // If player is too far, drop aggro (leash distance)
    const LEASH_DISTANCE = 15.0;
    if (distance > LEASH_DISTANCE) {
      this.monsterAggro.delete(monster.id);
      monster.targetId = "";
      monster.dirX = 0;
      monster.dirZ = 0;
      return;
    }

    // If in attack range, stop and attack
    if (distance <= monster.attackRange) {
      console.log(`👹 ${monster.name} in range (${distance.toFixed(2)} <= ${monster.attackRange}), attempting attack`);
      monster.dirX = 0;
      monster.dirZ = 0;
      this.tryMonsterAttack(monster, targetPlayer, targetSessionId);
    } else {
      // Chase the player
      monster.dirX = dirX;
      monster.dirZ = dirZ;
    }
  }

  updateMonsterWanderAI(monster: MonsterState, delta: number) {
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

  tryMonsterAttack(monster: MonsterState, targetPlayer: PlayerState, targetSessionId: string) {
    const monsterEntity = this.monsterEntities.get(monster.id);
    const playerEntity = this.playerEntities.get(targetSessionId);

    if (!monsterEntity || !playerEntity) {
      console.log(`👹 tryMonsterAttack failed: entities not found - monster: ${!!monsterEntity}, player: ${!!playerEntity}`);
      return;
    }

    // Update positions for combat calculation
    monsterEntity.setPosition(monster.x, monster.y, monster.z);
    playerEntity.setPosition(targetPlayer.x, targetPlayer.y, targetPlayer.z);

    // Process attack through combat manager (handles cooldown internally via entity.canAttack)
    const result = this.combatManager.processAttack(
      monsterEntity,
      playerEntity,
      Date.now()
    );

    if (!result.success) {
      console.log(`👹 Monster attack failed: ${result.reason}`);
      return;
    }

    // Update player HP in schema
    targetPlayer.currentHp = playerEntity.stats.currentHp;

    // Set monster attacking state
    monster.isAttacking = true;
    monster.targetId = targetPlayer.id;

    // Broadcast monster attack to all clients
    this.broadcast("monster_attacked", {
      monsterId: monster.id,
      monsterName: monster.name,
      targetId: targetPlayer.id,
      targetName: targetPlayer.name,
      damage: result.damage,
      killed: result.killed,
      targetHp: playerEntity.stats.currentHp,
      targetMaxHp: playerEntity.stats.maxHp,
    });

    console.log(
      `👹 ${monster.name} attacked ${targetPlayer.name} for ${result.damage} damage (${playerEntity.stats.currentHp}/${playerEntity.stats.maxHp} HP)`
    );

    // Reset attacking state after a short delay
    setTimeout(() => {
      monster.isAttacking = false;
    }, 100);
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

    // Stop player movement when attacking to prevent sliding past the target
    player.dirX = 0;
    player.dirY = 0;
    player.dirZ = 0;

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

      // Set monster aggro to attacker (monster will fight back)
      if (!targetEntity.isDead) {
        this.monsterAggro.set(targetId, client.sessionId);
        (targetState as MonsterState).targetId = client.sessionId;
      }
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
      // Clear monster aggro on death
      this.monsterAggro.delete(targetId);

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
   * Handle player skill request
   */
  handlePlayerSkill(client: Client, message: any) {
    const player = this.state.players.get(client.sessionId);
    const playerEntity = this.playerEntities.get(client.sessionId);

    if (!player || !playerEntity) {
      console.log(`⚠️ Skill failed: Player not found`);
      return;
    }

    const { skillId, targetId, targetType } = message;

    // Update player entity position
    playerEntity.setPosition(player.x, player.y, player.z);

    // Get skill configuration
    const skillConfig = this.getSkillConfig(skillId);
    if (!skillConfig) {
      this.send(client, "skill_failed", {
        reason: "Unknown skill",
        skillId: skillId,
      });
      return;
    }

    // Find target if skill requires one
    let targetEntity = null;
    let targetState = null;

    if (targetType === "monster" && targetId) {
      targetEntity = this.monsterEntities.get(targetId);
      targetState = this.state.monsters.get(targetId);
    } else if (targetType === "player" && targetId) {
      targetEntity = this.playerEntities.get(targetId);
      targetState = this.state.players.get(targetId);
    }

    // Validate target exists for targeted skills
    if (skillConfig.requiresTarget && (!targetEntity || !targetState)) {
      this.send(client, "skill_failed", {
        reason: "Invalid target",
        skillId: skillId,
      });
      return;
    }

    // Update target position if exists
    if (targetEntity && targetState) {
      targetEntity.setPosition(targetState.x, targetState.y, targetState.z);
    }

    // Check range
    if (targetEntity && skillConfig.range > 0) {
      const distance = playerEntity.distanceTo(targetEntity);
      if (distance > skillConfig.range) {
        this.send(client, "skill_failed", {
          reason: "Out of range",
          skillId: skillId,
        });
        return;
      }
    }

    // Check if target is dead
    if (targetEntity && targetEntity.isDead) {
      this.send(client, "skill_failed", {
        reason: "Target is dead",
        skillId: skillId,
      });
      return;
    }

    // Calculate and apply damage
    let damage = 0;
    let killed = false;

    if (skillConfig.damage > 0 && targetEntity) {
      damage = Math.floor(skillConfig.damage * playerEntity.stats.damageMultiplier);
      targetEntity.takeDamage(damage);
      killed = targetEntity.isDead;

      // Update target HP in schema
      if (targetType === "monster" && targetState) {
        (targetState as MonsterState).currentHp = targetEntity.stats.currentHp;
        (targetState as MonsterState).isDead = targetEntity.isDead;
      } else if (targetState) {
        (targetState as PlayerState).currentHp = targetEntity.stats.currentHp;
      }
    }

    // Set attacking state
    player.isAttacking = true;
    player.targetId = targetId || "";

    // Broadcast skill to all clients
    this.broadcast("skill_used", {
      playerId: client.sessionId,
      playerName: player.name,
      skillId: skillId,
      targetId: targetId,
      targetType: targetType,
      damage: damage,
      killed: killed,
      targetHp: targetEntity?.stats.currentHp ?? 0,
      targetMaxHp: targetEntity?.stats.maxHp ?? 0,
    });

    console.log(
      `✨ ${player.name} used ${skillId} on ${targetState?.name || "no target"} for ${damage} damage`
    );

    // Handle monster death and respawn
    if (killed && targetType === "monster" && targetEntity) {
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
   * Get skill configuration by ID
   */
  getSkillConfig(skillId: string): { damage: number; range: number; requiresTarget: boolean } | null {
    const skills: Record<string, { damage: number; range: number; requiresTarget: boolean }> = {
      fireball: {
        damage: 25,
        range: 5.0,
        requiresTarget: true,
      },
      // Add more skills here
    };

    return skills[skillId] || null;
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
