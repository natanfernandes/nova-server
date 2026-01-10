// Map collision configuration
// Define walls, obstacles, and other collision shapes here

export interface Box {
  type: 'box';
  x: number;      // Center X position
  z: number;      // Center Z position
  width: number;  // Width (X axis)
  depth: number;  // Depth (Z axis)
  sceneObjectId?: string; // Optional: ID of the 3D object in the scene
}

export interface Circle {
  type: 'circle';
  x: number;      // Center X position
  z: number;      // Center Z position
  radius: number; // Collision radius
  sceneObjectId?: string; // Optional: ID of the 3D object in the scene
}

export type CollisionShape = Box | Circle;

/**
 * Map obstacle configuration
 * Server defines obstacles with positions, client renders them
 */
export interface MapObstacle {
  id: string;           // Unique ID for this obstacle instance
  assetId: string;      // ID of the 3D asset/prefab to spawn (e.g., "tree_pine", "rock_large", "house_1")
  collisionType: 'box' | 'circle';
  position: ObstaclePosition;       // Optional height (default: 0 or ground level)
  // Rotation (optional)
  rotation?: number;    // Rotation in radians around Y axis
  // For box collision
  size?: ObstacleSize;
}
export interface ObstacleSize {
  x: number;
  z: number;
  y?: number;
  radius?: number;
}
export interface ObstaclePosition {
  x: number;
  z: number;
  y?: number;
  radius?: number;
}
// World map static collisions (no longer used for boundaries - auto-generated now)
export const WORLD_MAP_COLLISIONS: CollisionShape[] = [
  // Add custom static obstacles here (not tied to 3D scene objects)
  // Example: invisible walls, barriers, etc.
  { type: 'box', x: 0, z: -50, width: 100, depth: 2 },   // North wall
  { type: 'box', x: 0, z: 50, width: 100, depth: 2 },    // South wall
  { type: 'box', x: -50, z: 0, width: 2, depth: 100 },   // West wall
  { type: 'box', x: 50, z: 0, width: 2, depth: 100 },    // East wall
];

/**
 * World map obstacles (server-authoritative)
 * Server defines all obstacles with positions, client spawns the 3D assets
 */
export const WORLD_MAP_OBSTACLES: MapObstacle[] = [
  // Example obstacles - server defines position, client renders

  // Trees (circle collision)
  // { id: 'tree_1', assetId: 'tree_pine', collisionType: 'circle', x: 10, z: 10, radius: 1.5 },
  // { id: 'tree_2', assetId: 'tree_oak', collisionType: 'circle', x: -15, z: 20, radius: 2, rotation: 0.5 },
  // { id: 'tree_3', assetId: 'tree_pine', collisionType: 'circle', x: 5, z: -8, radius: 1.5 },

  // Buildings (box collision)
  { id: 'generator', assetId: 'generator', collisionType: 'box', size: { x: 2.8, y:1.7, z: 5.8 }, position: { x: 6, z: 1 }, rotation: 0 },
  // { id: 'house_2', assetId: 'house_large', collisionType: 'box', x: 20, z: -20, width: 10, depth: 8, rotation: 1.57 },

  // Rocks (circle collision)
  // { id: 'rock_1', assetId: 'rock_large', collisionType: 'circle', x: 30, z: 15, radius: 2 },
  // { id: 'rock_2', assetId: 'rock_small', collisionType: 'circle', x: -5, z: -12, radius: 1 },
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
