
export interface Box {
  type: 'box';
  x: number;      // Center X position
  z: number;      // Center Z position
  width: number;  // Width (X axis)
  depth: number;  // Depth (Z axis)
  rotation?: number; // Rotation in radians around Y axis (default: 0)
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

/**
 * Helper function to create a wall obstacle from start to end positions
 * @param id - Unique identifier for the wall
 * @param startX - Starting X position
 * @param startZ - Starting Z position
 * @param endX - Ending X position
 * @param endZ - Ending Z position
 * @param wallHeight - Height of the wall (default: 1)
 * @param wallThickness - Thickness of the wall (default: 1)
 * @returns MapObstacle configured as a wall
 */
export function createWall(
  id: string,
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
  wallHeight: number = 1,
  wallThickness: number = 1
): MapObstacle {
  // Calculate center position
  const centerX = (startX + endX) / 2;
  const centerZ = (startZ + endZ) / 2;

  // Calculate dimensions
  const deltaX = Math.abs(endX - startX);
  const deltaZ = Math.abs(endZ - startZ);

  // Determine if horizontal or vertical wall
  const isHorizontal = deltaX > deltaZ;

  const sizeX = isHorizontal ? deltaX + wallThickness : wallThickness;
  const sizeZ = isHorizontal ? wallThickness : deltaZ + wallThickness;

  return {
    id,
    assetId: 'wall',
    collisionType: 'box',
    size: { x: sizeX, z: sizeZ, y: wallHeight },
    position: { x: centerX, z: centerZ },
    rotation: 0,
  };
}

/**
 * Helper function to create a custom box obstacle
 * @param id - Unique identifier
 * @param assetId - Asset ID to render
 * @param centerX - Center X position
 * @param centerZ - Center Z position
 * @param sizeX - Width (X axis)
 * @param sizeZ - Depth (Z axis)
 * @param sizeY - Height (Y axis)
 * @param rotationDegrees - Rotation in degrees around Y axis (default: 0)
 */
export function createBoxObstacle(
  id: string,
  assetId: string,
  centerX: number,
  centerZ: number,
  sizeX: number,
  sizeZ: number,
  sizeY: number = 1,
  rotationDegrees: number = 0
): MapObstacle {
  return {
    id,
    assetId,
    collisionType: 'box',
    size: { x: sizeX, z: sizeZ, y: sizeY },
    position: { x: centerX, z: centerZ },
    rotation: degreesToRadians(rotationDegrees),
  };
}

/**
 * Convert degrees to radians
 * @param degrees - Angle in degrees
 * @returns Angle in radians
 */
export function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}