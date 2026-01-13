import { BaseEntity } from "../entities/BaseEntity";
import { MonsterEntity } from "../entities/MonsterEntity";

export interface AttackResult {
  success: boolean;
  damage: number;
  killed: boolean;
  reason?: string; // error reason if failed
}

/**
 * Combat Manager
 * Handles all combat logic, validation, and calculations
 */
export class CombatManager {
  constructor() {
    // No default attack range - each entity has their own range
  }

  /**
   * Process an attack from attacker to target
   */
  public processAttack(
    attacker: BaseEntity,
    target: BaseEntity,
    currentTime: number
  ): AttackResult {
    // Validation checks
    const validation = this.validateAttack(attacker, target, currentTime);
    if (!validation.success) {
      return validation;
    }

    // Calculate damage
    const damage = attacker.calculateDamage();

    // Apply damage to target
    const actualDamage = target.takeDamage(damage);

    // Register attack on attacker (set cooldown)
    attacker.registerAttack(currentTime);

    const killed = target.isDead;

    console.log(
      `⚔️ ${attacker.name} attacked ${target.name} for ${actualDamage} damage! (${target.stats.currentHp}/${target.stats.maxHp} HP remaining)`
    );

    if (killed) {
      console.log(`💀 ${target.name} was killed by ${attacker.name}!`);
    }

    return {
      success: true,
      damage: actualDamage,
      killed,
    };
  }

  /**
   * Validate if attack can be performed
   */
  private validateAttack(
    attacker: BaseEntity,
    target: BaseEntity,
    currentTime: number
  ): AttackResult {
    // Check if attacker is dead
    if (attacker.isDead) {
      return {
        success: false,
        damage: 0,
        killed: false,
        reason: "Attacker is dead",
      };
    }

    // Check if target is dead
    if (target.isDead) {
      return {
        success: false,
        damage: 0,
        killed: false,
        reason: "Target is already dead",
      };
    }

    // Check attack cooldown
    if (!attacker.canAttack(currentTime)) {
      const cooldown = 1000 / attacker.stats.attackSpeed;
      const timeLeft = cooldown - (currentTime - attacker.lastAttackTime);
      return {
        success: false,
        damage: 0,
        killed: false,
        reason: `Attack on cooldown (${Math.ceil(timeLeft)}ms remaining)`,
      };
    }

    // Check range (use attacker's attack range)
    const distance = attacker.distanceTo(target);
    const attackRange = attacker.stats.attackRange;
    if (distance > attackRange) {
      return {
        success: false,
        damage: 0,
        killed: false,
        reason: `Target out of range (${distance.toFixed(2)} > ${attackRange})`,
      };
    }

    // Attack is valid
    return {
      success: true,
      damage: 0,
      killed: false,
    };
  }

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
}
