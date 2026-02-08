import { BaseEntity } from "../entities/BaseEntity";
import { MonsterEntity } from "../entities/MonsterEntity";

/**
 * Combat Manager
 * AI utility for multi-entity queries (AoE, nearest target, respawns).
 * Core attack logic now lives in BaseEntity.attack().
 */
export class CombatManager {
  /**
   * Handle monster respawns
   */
  public handleRespawns(monsters: MonsterEntity[], currentTime: number): string[] {
    const respawned: string[] = [];

    for (const monster of monsters) {
      if (monster.shouldRespawn(currentTime)) {
        monster.respawn();
        respawned.push(monster.id);
      }
    }

    return respawned;
  }

  /**
   * Get all entities in range of attacker
   */
  public getEntitiesInRange(
    attacker: BaseEntity,
    targets: BaseEntity[],
    range?: number
  ): BaseEntity[] {
    const searchRange = range !== undefined ? range : attacker.stats.attackRange;
    return targets.filter(
      (target) =>
        !target.isDead &&
        target.id !== attacker.id &&
        attacker.distanceTo(target) <= searchRange
    );
  }

  /**
   * Find nearest target
   */
  public findNearestTarget(
    attacker: BaseEntity,
    targets: BaseEntity[]
  ): BaseEntity | null {
    const inRange = this.getEntitiesInRange(attacker, targets);

    if (inRange.length === 0) return null;

    return inRange.reduce((nearest, current) => {
      const currentDist = attacker.distanceTo(current);
      const nearestDist = attacker.distanceTo(nearest);
      return currentDist < nearestDist ? current : nearest;
    });
  }

  /**
   * Check if attacker can reach target (for AI)
   */
  public canReachTarget(attacker: BaseEntity, target: BaseEntity): boolean {
    return !target.isDead && attacker.distanceTo(target) <= attacker.stats.attackRange;
  }

  /**
   * Get all living entities within a radius of a world position (for area skills).
   * Uses a point origin, not an entity origin.
   */
  public getEntitiesInArea(
    centerX: number,
    centerZ: number,
    radius: number,
    targets: BaseEntity[]
  ): BaseEntity[] {
    return targets.filter((target) => {
      if (target.isDead) return false;
      const dx = target.position.x - centerX;
      const dz = target.position.z - centerZ;
      return Math.sqrt(dx * dx + dz * dz) <= radius;
    });
  }
}
