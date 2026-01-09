// Map collision configuration
// Define walls, obstacles, and other collision shapes here

export interface Box {
  type: 'box';
  x: number;      // Center X position
  z: number;      // Center Z position
  width: number;  // Width (X axis)
  depth: number;  // Depth (Z axis)
}

export interface Circle {
  type: 'circle';
  x: number;      // Center X position
  z: number;      // Center Z position
  radius: number; // Collision radius
}

export type CollisionShape = Box | Circle;

// World map collisions
export const WORLD_MAP_COLLISIONS: CollisionShape[] = [
  // Map boundaries (100x100 map with 2-unit thick walls)
  { type: 'box', x: 0, z: -50, width: 100, depth: 2 },   // North wall
  { type: 'box', x: 0, z: 50, width: 100, depth: 2 },    // South wall
  { type: 'box', x: -50, z: 0, width: 2, depth: 100 },   // West wall
  { type: 'box', x: 50, z: 0, width: 2, depth: 100 },    // East wall

  // Example obstacles - customize these to match your 3D map
  // Trees (circles)
  // { type: 'circle', x: 10, z: 10, radius: 2 },
  // { type: 'circle', x: -15, z: 20, radius: 2.5 },

  // Buildings (boxes)
  // { type: 'box', x: -10, z: -10, width: 8, depth: 8 },
  // { type: 'box', x: 20, z: -20, width: 10, depth: 6 },

  // Rocks (circles)
  // { type: 'circle', x: 30, z: 15, radius: 3 },
];

// Add more maps here as needed
export const MAP_COLLISIONS = {
  world: WORLD_MAP_COLLISIONS,
  // dungeon: DUNGEON_MAP_COLLISIONS,
  // arena: ARENA_MAP_COLLISIONS,
};
