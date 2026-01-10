/**
 * Map utility functions
 * Helper functions for working with map dimensions and boundaries
 */

export interface MapConfig {
  id: string;
  name: string;
  width: number;
  height: number;
  availableMonsters: Record<string, any>;
}

export interface MapBoundaries {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  centerX: number;
  centerZ: number;
  width: number;
  height: number;
}

/**
 * Get map boundaries based on map dimensions
 * Maps are centered at (0, 0), so boundaries extend from -width/2 to +width/2
 */
export function getMapBoundaries(map: MapConfig): MapBoundaries {
  const halfWidth = Math.floor(map.width / 2);
  const halfHeight = Math.floor(map.height / 2);

  return {
    minX: -halfWidth,
    maxX: halfWidth,
    minZ: -halfHeight,
    maxZ: halfHeight,
    centerX: 0,
    centerZ: 0,
    width: map.width,
    height: map.height,
  };
}

/**
 * Check if a position is within map boundaries
 */
export function isWithinMapBounds(
  x: number,
  z: number,
  boundaries: MapBoundaries
): boolean {
  return (
    x >= boundaries.minX &&
    x <= boundaries.maxX &&
    z >= boundaries.minZ &&
    z <= boundaries.maxZ
  );
}

/**
 * Clamp a position to stay within map boundaries
 */
export function clampToMapBounds(
  x: number,
  z: number,
  boundaries: MapBoundaries
): { x: number; z: number } {
  return {
    x: Math.max(boundaries.minX, Math.min(x, boundaries.maxX)),
    z: Math.max(boundaries.minZ, Math.min(z, boundaries.maxZ)),
  };
}

/**
 * Get a random position within map boundaries
 */
export function getRandomPositionInMap(boundaries: MapBoundaries): {
  x: number;
  z: number;
} {
  return {
    x: boundaries.minX + Math.random() * boundaries.width,
    z: boundaries.minZ + Math.random() * boundaries.height,
  };
}

/**
 * Calculate distance from a position to the nearest map edge
 */
export function getDistanceToNearestEdge(
  x: number,
  z: number,
  boundaries: MapBoundaries
): number {
  const distToLeft = x - boundaries.minX;
  const distToRight = boundaries.maxX - x;
  const distToTop = z - boundaries.minZ;
  const distToBottom = boundaries.maxZ - z;

  return Math.min(distToLeft, distToRight, distToTop, distToBottom);
}

/**
 * Generate collision boxes for map boundaries
 * Creates 4 walls around the map edges
 */
export function generateMapBoundaryCollisions(
  boundaries: MapBoundaries,
  wallThickness: number = 2
): Array<{
  type: "box";
  x: number;
  z: number;
  width: number;
  depth: number;
}> {
  const halfThickness = wallThickness / 2;

  return [
    // North wall (top, negative Z)
    {
      type: "box",
      x: 0,
      z: boundaries.minZ - halfThickness,
      width: boundaries.width + wallThickness,
      depth: wallThickness,
    },
    // South wall (bottom, positive Z)
    {
      type: "box",
      x: 0,
      z: boundaries.maxZ + halfThickness,
      width: boundaries.width + wallThickness,
      depth: wallThickness,
    },
    // West wall (left, negative X)
    {
      type: "box",
      x: boundaries.minX - halfThickness,
      z: 0,
      width: wallThickness,
      depth: boundaries.height + wallThickness,
    },
    // East wall (right, positive X)
    {
      type: "box",
      x: boundaries.maxX + halfThickness,
      z: 0,
      width: wallThickness,
      depth: boundaries.height + wallThickness,
    },
  ];
}
