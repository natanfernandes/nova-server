import { BaseEntity, CombatStats, Position } from "./BaseEntity";
import { PlayerState } from "../schema/Player";

/**
 * Player Entity
 * Represents a player with combat capabilities
 */
export class PlayerEntity extends BaseEntity {
  public sessionId: string; // Colyseus client session ID
  public lastProcessedInput: number = 0;

  constructor(
    id: string,
    sessionId: string,
    name: string,
    position: Position,
    stats?: Partial<CombatStats>
  ) {
    // Default player stats (melee by default)
    const defaultStats: CombatStats = {
      maxHp: 100,
      currentHp: 100,
      baseDamage: 10,
      attackSpeed: 2.0, // 2 attacks per second (0.5s cooldown)
      attackRange: 2.0, // melee range
      walkSpeed: 5.0,
      defense: 0,
      damageMultiplier: 1.0,
      damageReduction: 0,
    };

    super(id, name, position, { ...defaultStats, ...stats });
    this.sessionId = sessionId;
  }

  /**
   * Sync all entity state to the Colyseus schema for network replication.
   * Does NOT overwrite id/name (immutable after creation).
   */
  public syncToSchema(schema: PlayerState): void {
    // Position
    schema.x = this.position.x;
    schema.y = this.position.y;
    schema.z = this.position.z;

    // Direction
    schema.dirX = this.dirX;
    schema.dirY = this.dirY;
    schema.dirZ = this.dirZ;

    // Input sequence
    schema.last_processed_input = this.lastProcessedInput;

    // Combat stats
    schema.currentHp = this.stats.currentHp;
    schema.maxHp = this.stats.maxHp;
    schema.walkSpeed = this.stats.walkSpeed;
    schema.baseDamage = this.stats.baseDamage;
    schema.attackSpeed = this.stats.attackSpeed;
    schema.attackRange = this.stats.attackRange;
    schema.defense = this.stats.defense;
    schema.damageMultiplier = this.stats.damageMultiplier;
    schema.damageReduction = this.stats.damageReduction;

    // Combat UI state
    schema.isAttacking = this.isAttacking;
    schema.targetId = this.targetId;
  }

  /**
   * Death behavior for players
   */
  protected onDeath(): void {
    console.log(`💀 Player ${this.name} died!`);
    // Players can respawn, so we don't remove them
  }

  /**
   * Apply a damage buff (e.g., from equipment or skill)
   */
  public applyDamageBuff(multiplier: number): void {
    this.stats.damageMultiplier = Math.max(0.1, multiplier);
    console.log(`⚔️ ${this.name} damage multiplier: ${this.stats.damageMultiplier}x`);
  }

  /**
   * Apply damage reduction (e.g., from armor or skill)
   */
  public applyDamageReduction(reduction: number): void {
    // Cap reduction at 90% (0.9)
    this.stats.damageReduction = Math.min(0.9, Math.max(0, reduction));
    console.log(`🛡️ ${this.name} damage reduction: ${this.stats.damageReduction * 100}%`);
  }

  /**
   * Increase attack speed
   */
  public applyAttackSpeedBuff(attacksPerSecond: number): void {
    this.stats.attackSpeed = Math.max(0.5, attacksPerSecond); // Min 0.5 attacks/sec
    console.log(`⚡ ${this.name} attack speed: ${this.stats.attackSpeed} attacks/sec`);
  }

  /**
   * Increase defense (flat damage reduction)
   */
  public applyDefenseBuff(defense: number): void {
    this.stats.defense = Math.max(0, defense);
    console.log(`🛡️ ${this.name} defense: ${this.stats.defense}`);
  }

  /**
   * Set attack range (for weapon switching)
   */
  public setAttackRange(range: number): void {
    this.stats.attackRange = Math.max(0.5, range);
    const rangeType = range <= 3 ? "melee" : "ranged";
    console.log(`🎯 ${this.name} attack range: ${this.stats.attackRange} (${rangeType})`);
  }

  /**
   * Respawn player at a position
   */
  public respawn(x: number, y: number, z: number): void {
    this.reset();
    this.setPosition(x, y, z);
    console.log(`🔄 ${this.name} respawned at (${x}, ${y}, ${z})`);
  }
}
