import { PlayerState } from "../schema/Player";
import { Box, CollisionShape } from "../utils/obstacles";

/**
 * Collision Manager
 * Handles all collision detection logic for maps and entities
 * Reusable across different game rooms
 */
export class CollisionManager {
  private mapCollisions: CollisionShape[];
  private playerRadius: number;

  constructor(mapCollisions: CollisionShape[], playerRadius: number = 0.5) {
    this.mapCollisions = mapCollisions;
    this.playerRadius = playerRadius;
  }

  /**
   * Check if a circle collides with a box (supports rotation)
   */
  private circleBoxCollision(
    circleX: number,
    circleZ: number,
    circleRadius: number,
    box: Box
  ): boolean {
    const rotation = box.rotation ?? 0;

    // If no rotation, use faster AABB collision
    if (rotation === 0) {
      // Find the closest point on the box to the circle
      const closestX = Math.max(
        box.x - box.width / 2,
        Math.min(circleX, box.x + box.width / 2)
      );
      const closestZ = Math.max(
        box.z - box.depth / 2,
        Math.min(circleZ, box.z + box.depth / 2)
      );

      // Calculate distance from circle center to closest point
      const dx = circleX - closestX;
      const dz = circleZ - closestZ;
      const distance = Math.sqrt(dx * dx + dz * dz);

      return distance < circleRadius;
    }

    // For rotated boxes, transform circle to box's local space
    // Translate circle to box origin
    const localX = circleX - box.x;
    const localZ = circleZ - box.z;

    // Rotate circle position by inverse rotation (rotate back to axis-aligned)
    const cos = Math.cos(-rotation);
    const sin = Math.sin(-rotation);
    const rotatedX = localX * cos - localZ * sin;
    const rotatedZ = localX * sin + localZ * cos;

    // Now do AABB collision in local space
    const closestX = Math.max(
      -box.width / 2,
      Math.min(rotatedX, box.width / 2)
    );
    const closestZ = Math.max(
      -box.depth / 2,
      Math.min(rotatedZ, box.depth / 2)
    );

    // Calculate distance
    const dx = rotatedX - closestX;
    const dz = rotatedZ - closestZ;
    const distance = Math.sqrt(dx * dx + dz * dz);

    return distance < circleRadius;
  }

  /**
   * Check if two circles collide
   */
  private circleCircleCollision(
    x1: number,
    z1: number,
    r1: number,
    x2: number,
    z2: number,
    r2: number
  ): boolean {
    const dx = x1 - x2;
    const dz = z1 - z2;
    const distance = Math.sqrt(dx * dx + dz * dz);
    return distance < r1 + r2;
  }

  /**
   * Check if a position collides with any map obstacles
   */
  checkMapCollision(x: number, z: number, radius?: number): boolean {
    const entityRadius = radius ?? this.playerRadius;

    for (const shape of this.mapCollisions) {
      if (shape.type === "box") {
        if (this.circleBoxCollision(x, z, entityRadius, shape)) {
          return true;
        }
      } else if (shape.type === "circle") {
        if (this.circleCircleCollision(x, z, entityRadius, shape.x, shape.z, shape.radius)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Check if a position collides with any other players
   */
  checkPlayerCollision(
    currentPlayer: PlayerState,
    newX: number,
    newZ: number,
    allPlayers: Iterable<PlayerState>
  ): boolean {
    for (const otherPlayer of allPlayers) {
      // Skip self
      if (otherPlayer.id === currentPlayer.id) continue;

      // Calculate distance between players (only X and Z, ignore Y)
      const dx = newX - otherPlayer.x;
      const dz = newZ - otherPlayer.z;
      const distance = Math.sqrt(dx * dx + dz * dz);

      // Check if players would overlap (both radii combined)
      const minDistance = this.playerRadius * 2;
      if (distance < minDistance) {
        return true; // Collision detected
      }
    }
    return false;
  }

  /**
   * Check both map and player collisions in one call
   * Returns collision type: null | 'map' | 'player' | 'both'
   */
  checkAllCollisions(
    currentPlayer: PlayerState,
    newX: number,
    newZ: number,
    allPlayers: Iterable<PlayerState>
  ): { map: boolean; player: boolean; any: boolean } {
    const mapCollision = this.checkMapCollision(newX, newZ);
    const playerCollision = this.checkPlayerCollision(currentPlayer, newX, newZ, allPlayers);

    return {
      map: mapCollision,
      player: playerCollision,
      any: mapCollision || playerCollision,
    };
  }

  /**
   * Find a safe spawn position (no collisions)
   */
  findSafeSpawnPosition(
    minX: number,
    maxX: number,
    minZ: number,
    maxZ: number,
    allPlayers: Iterable<PlayerState>,
    maxAttempts: number = 50
  ): { x: number; z: number } | null {
    for (let i = 0; i < maxAttempts; i++) {
      const x = minX + Math.random() * (maxX - minX);
      const z = minZ + Math.random() * (maxZ - minZ);

      // Check if this position is safe
      const mapSafe = !this.checkMapCollision(x, z);

      // Check distance to all players
      let playerSafe = true;
      for (const player of allPlayers) {
        const dx = x - player.x;
        const dz = z - player.z;
        const distance = Math.sqrt(dx * dx + dz * dz);
        if (distance < this.playerRadius * 4) {
          // Spawn at least 4 radii away from other players
          playerSafe = false;
          break;
        }
      }

      if (mapSafe && playerSafe) {
        return { x, z };
      }
    }

    // Fallback to center if no safe position found
    console.warn("Could not find safe spawn position after", maxAttempts, "attempts");
    return null;
  }

  /**
   * Update map collisions (useful for dynamic maps)
   */
  setMapCollisions(collisions: CollisionShape[]) {
    this.mapCollisions = collisions;
  }

  /**
   * Add a new collision shape dynamically
   */
  addCollisionShape(shape: CollisionShape) {
    this.mapCollisions.push(shape);
  }

  /**
   * Remove collision shapes by filter
   */
  removeCollisionShapes(filter: (shape: CollisionShape) => boolean) {
    this.mapCollisions = this.mapCollisions.filter((s) => !filter(s));
  }
}
