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
    const rangeSq = searchRange * searchRange;
    return targets.filter(
      (target) =>
        !target.isDead &&
        target.id !== attacker.id &&
        attacker.distanceToSquared(target) <= rangeSq
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
      const currentDistSq = attacker.distanceToSquared(current);
      const nearestDistSq = attacker.distanceToSquared(nearest);
      return currentDistSq < nearestDistSq ? current : nearest;
    });
  }

  /**
   * Check if attacker can reach target (for AI)
   */
  public canReachTarget(attacker: BaseEntity, target: BaseEntity): boolean {
    const rangeSq = attacker.stats.attackRange * attacker.stats.attackRange;
    return !target.isDead && attacker.distanceToSquared(target) <= rangeSq;
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
    const radiusSq = radius * radius;
    return targets.filter((target) => {
      if (target.isDead) return false;
      const dx = target.position.x - centerX;
      const dz = target.position.z - centerZ;
      return dx * dx + dz * dz <= radiusSq;
    });
  }
}
