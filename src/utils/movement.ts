/**
 * Movement utility functions
 * Reusable logic for player and monster movement
 */

/**
 * Check if an entity is moving based on its direction
 */
export function isMoving(dirX: number, dirY: number, dirZ: number): boolean {
  return dirX !== 0 || dirY !== 0 || dirZ !== 0;
}

/**
 * Generate a random direction (normalized vector)
 * Used for wander/random movement AI
 */
export function getRandomDirection(): { dirX: number; dirZ: number } {
  const angle = Math.random() * Math.PI * 2;
  return {
    dirX: Math.cos(angle),
    dirZ: Math.sin(angle),
  };
}

/**
 * Calculate direction from one point to another (normalized)
 * Used for chase/follow behavior
 */
export function getDirectionToTarget(
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number
): { dirX: number; dirZ: number; distance: number } {
  const dx = toX - fromX;
  const dz = toZ - fromZ;
  const distance = Math.sqrt(dx * dx + dz * dz);

  if (distance === 0) {
    return { dirX: 0, dirZ: 0, distance: 0 };
  }

  return {
    dirX: dx / distance,
    dirZ: dz / distance,
    distance,
  };
}

/**
 * Calculate new position based on current position, direction, speed, and delta time
 */
export function calculateNewPosition(
  currentX: number,
  currentZ: number,
  dirX: number,
  dirZ: number,
  speed: number,
  delta: number
): { newX: number; newZ: number } {
  return {
    newX: currentX + dirX * speed * delta,
    newZ: currentZ + dirZ * speed * delta,
  };
}

/**
 * Stop an entity by returning zero direction
 */
export function stopMovement(): { dirX: number; dirZ: number } {
  return { dirX: 0, dirZ: 0 };
}

/**
 * Random decision helper - returns true with the given probability
 * @param probability - value between 0 and 1 (e.g., 0.7 = 70% chance)
 */
export function shouldDoAction(probability: number): boolean {
  return Math.random() < probability;
}

/**
 * Get random time interval (useful for AI timers)
 */
export function getRandomInterval(min: number, max: number): number {
  return min + Math.random() * (max - min);
}
