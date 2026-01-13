/**
 * Base Entity Class
 * Handles common properties and behaviors for Players and Monsters
 */

export interface CombatStats {
  maxHp: number;
  currentHp: number;
  baseDamage: number;
  attackSpeed: number; // attacks per second
  attackRange: number; // range for attacks (melee = 2.0, ranged = 10.0+)
  defense: number;
  damageMultiplier: number; // percentage multiplier (1.0 = 100%)
  damageReduction: number; // percentage reduction (0.1 = 10% reduction)
}

export interface Position {
  x: number;
  y: number;
  z: number;
}

export abstract class BaseEntity {
  public id: string;
  public name: string;
  public position: Position;
  public stats: CombatStats;
  public lastAttackTime: number = 0;
  public isDead: boolean = false;

  constructor(
    id: string,
    name: string,
    position: Position,
    stats: CombatStats
  ) {
    this.id = id;
    this.name = name;
    this.position = position;
    this.stats = stats;
  }

  /**
   * Check if entity can attack based on attack speed cooldown
   */
  public canAttack(currentTime: number): boolean {
    if (this.isDead) return false;

    const attackCooldown = 1000 / this.stats.attackSpeed; // milliseconds
    return currentTime - this.lastAttackTime >= attackCooldown;
  }

  /**
   * Calculate final damage output with multipliers
   */
  public calculateDamage(): number {
    const baseDamage = this.stats.baseDamage;
    const finalDamage = baseDamage * this.stats.damageMultiplier;
    return Math.round(finalDamage);
  }

  /**
   * Take damage with defense and reduction calculations
   */
  public takeDamage(incomingDamage: number): number {
    if (this.isDead) return 0;

    // Apply defense reduction
    const damageAfterDefense = Math.max(1, incomingDamage - this.stats.defense);

    // Apply damage reduction percentage
    const finalDamage = Math.round(
      damageAfterDefense * (1 - this.stats.damageReduction)
    );

    // Update HP
    this.stats.currentHp = Math.max(0, this.stats.currentHp - finalDamage);

    // Check death
    if (this.stats.currentHp <= 0) {
      this.isDead = true;
      this.onDeath();
    }

    return finalDamage;
  }

  /**
   * Heal the entity
   */
  public heal(amount: number): void {
    if (this.isDead) return;
    this.stats.currentHp = Math.min(
      this.stats.maxHp,
      this.stats.currentHp + amount
    );
  }

  /**
   * Update position
   */
  public setPosition(x: number, y: number, z: number): void {
    this.position.x = x;
    this.position.y = y;
    this.position.z = z;
  }

  /**
   * Calculate distance to another entity
   */
  public distanceTo(other: BaseEntity): number {
    const dx = this.position.x - other.position.x;
    const dz = this.position.z - other.position.z;
    return Math.sqrt(dx * dx + dz * dz);
  }

  /**
   * Update last attack time (call after successful attack)
   */
  public registerAttack(currentTime: number): void {
    this.lastAttackTime = currentTime;
  }

  /**
   * Reset entity to full health
   */
  public reset(): void {
    this.stats.currentHp = this.stats.maxHp;
    this.isDead = false;
    this.lastAttackTime = 0;
  }

  /**
   * Abstract method - override in subclasses for death behavior
   */
  protected abstract onDeath(): void;

  /**
   * Get HP percentage for UI
   */
  public getHpPercentage(): number {
    return (this.stats.currentHp / this.stats.maxHp) * 100;
  }
}
