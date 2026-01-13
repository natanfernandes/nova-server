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

export class WorldRoom extends Room<MapState> {
  maxClients = 100;
  SPEED = 5;
  TICK_RATE = 50; // 50ms = 20 ticks per second
  PLAYER_RADIUS = 0.5; // collision radius for players
  MONSTER_RADIUS = 0.5; // collision radius for monsters
  MONSTER_SPEED = 2; // monsters move slower than players
  MAP = GAME_MAPS[MAPS_KEYS.WORLD];
  MAP_BOUNDARIES: MapBoundaries;
  state = new MapState();

  // Collision system
  collisionManager: CollisionManager;

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

    console.log(`✅ Loaded ${obstacleCollisions.length} obstacles with collision`);

    this.spawnMonstersOnCreate();
    // Loop principal (20Hz = 50ms per tick)
    this.setSimulationInterval((deltaMs) => this.update(deltaMs / 1000), this.TICK_RATE);

    this.onMessage("*", (client: Client, type: string|number, message: any) => {
        console.log(client.sessionId, "sent 'action' message: ", message);
          const player = this.state.players.get(client.sessionId);

          switch (type) {
            case "move":
              if (!player) return;
              const [dx, dy, dz] = message.dir;
              // Always update direction, even if it's zero (stopped)
              player.dirX = dx;
              player.dirY = dy;
              player.dirZ = dz;
              player.last_processed_input = message.seq;

              if (dx !== 0 || dy !== 0 || dz !== 0) {
                console.log(`Player ${player.name} is moving to direction:`, dx, dy, dz);
              } else {
                console.log(`Player ${player.name} stopped moving`);
              }
              break;

            case "damage":
              if (!player) return;
              player.hp -= message.amount;
              if (player.hp < 0) player.hp = 0;
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

    // Check collision before moving (both map and players)
    const collision = this.collisionManager.checkAllCollisions(
      player,
      newX,
      newZ,
      this.state.players.values()
    );

    if (!collision.any) {
      // No collision - move normally
      player.x = newX;
      player.z = newZ;

      // Y movement (jumping, etc.) - no collision check for now
      if (player.dirY !== 0) {
        player.y += player.dirY * this.SPEED * delta;
      }
    } else {
      // Collision detected - don't move, but keep the direction
      // This allows the player to continue moving if the obstacle clears
      if (collision.map) {
        console.log(`Player ${player.name} collided with map obstacle`);
      }
      if (collision.player) {
        console.log(`Player ${player.name} collided with another player`);
      }
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

    // Check collision with map
    const mapCollision = this.collisionManager.checkMapCollision(
      newX,
      newZ,
      this.MONSTER_RADIUS
    );

    if (!mapCollision) {
      // No collision - move normally
      monster.x = newX;
      monster.z = newZ;
    } else {
      // Collision detected - stop and force new decision next tick
      const stop = stopMovement();
      monster.dirX = stop.dirX;
      monster.dirZ = stop.dirZ;
      this.monsterAITimers.set(monster.id, 0); // Force new direction next tick
    }
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
    p.hp = player.hp;

    this.state.players.set(client.sessionId, p);
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
        data: { x: player.x, y: player.y, hp: player.hp },
      });
      console.log(`💾 Salvou ${player.name}`);
      this.state.players.delete(client.sessionId);
    }
  }

  async onDispose() {
    console.log("🧹 Room disposed");
  }
}
