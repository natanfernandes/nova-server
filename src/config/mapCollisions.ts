// Map collision configuration
// Define walls, obstacles, and other collision shapes here
import { CollisionShape, createBoxObstacle, createWall, MapObstacle } from "../utils/obstacles";


export const WORLD_MAP_COLLISIONS: CollisionShape[] = [
  { type: 'box', x: 0, z: -128, width: 100, depth: 2 },   // North wall
  { type: 'box', x: 0, z: 128, width: 100, depth: 2 },    // South wall
  { type: 'box', x: -128, z: 0, width: 2, depth: 100 },   // West wall
  { type: 'box', x: 128, z: 0, width: 2, depth: 100 },    // East wall
];

/**
 * World map obstacles (server-authoritative)
 * Server defines all obstacles with positions, client spawns the 3D assets
 */
export const WORLD_MAP_OBSTACLES: MapObstacle[] = [
  // Buildings (box collision)
  createBoxObstacle('usables_shop_1', 'usables_shop_1', 21.52, -0.73, 4.75, 4.5, 2.8, -30),

  // Walls (using helper functions for cleaner code)
  createWall('shop_north_wall', 19.5, -7.5, 30.5, -7.5, 1, 1),
];

// Map collision configurations
export const MAP_COLLISIONS = {
  world: WORLD_MAP_COLLISIONS,
  // dungeon: DUNGEON_MAP_COLLISIONS,
  // arena: ARENA_MAP_COLLISIONS,
};

export const MAP_OBSTACLES = {
  world: WORLD_MAP_OBSTACLES,
  // dungeon: DUNGEON_MAP_OBSTACLES,
  // arena: ARENA_MAP_OBSTACLES,
};
