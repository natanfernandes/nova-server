import { BaseEntity, CombatStats, Position } from "./BaseEntity";
import { MonsterState } from "../schema/Monster";

export interface MonsterConfig {
  name: string;
  maxHp: number;
  baseDamage: number;
  attackSpeed: number;
  attackRange: number;
  defense: number;
  respawnTime: number; // seconds
}

/**
 * Monster Entity
 * Represents a monster/enemy with combat capabilities
 */
export class MonsterEntity extends BaseEntity {
  public respawnTime: number; // in seconds
  public deathTime: number = 0; // timestamp when died
  public canRespawn: boolean = true;
  public spawnPosition: Position; // original spawn point

  constructor(
    id: string,
    name: string,
    position: Position,
    config: Partial<MonsterConfig> = {}
  ) {
    // Default monster stats (melee by default)
    const defaultStats: CombatStats = {
      maxHp: config.maxHp || 50,
      currentHp: config.maxHp || 50,
      baseDamage: config.baseDamage || 5,
      attackSpeed: config.attackSpeed || 1.0, // 1 attack per second
      attackRange: config.attackRange || 2.0, // melee range
      defense: config.defense || 0,
      damageMultiplier: 1.0,
      damageReduction: 0,
      walkSpeed: 2.0,
    };

    super(id, name, position, defaultStats);
    this.respawnTime = config.respawnTime || 30; // 30 seconds default
    this.spawnPosition = { ...position }; // Store original spawn point
  }

  /**
   * Sync all entity state to the Colyseus schema for network replication.
   * Does NOT overwrite id/name (immutable after creation).
   */
  public syncToSchema(schema: MonsterState): void {
    // Position
    schema.x = this.position.x;
    schema.y = this.position.y;
    schema.z = this.position.z;

    // Direction (MonsterState has no dirY)
    schema.dirX = this.dirX;
    schema.dirZ = this.dirZ;

    // Combat stats
    schema.currentHp = this.stats.currentHp;
    schema.maxHp = this.stats.maxHp;
    schema.baseDamage = this.stats.baseDamage;
    schema.attackSpeed = this.stats.attackSpeed;
    schema.attackRange = this.stats.attackRange;
    schema.defense = this.stats.defense;

    // State
    schema.isDead = this.isDead;
    schema.isAttacking = this.isAttacking;
    schema.targetId = this.targetId;
  }

  /**
   * Death behavior for monsters
   */
  protected onDeath(): void {
    this.deathTime = Date.now();
    console.log(`💀 Monster ${this.name} died! Will respawn in ${this.respawnTime}s`);
  }

  /**
   * Check if monster should respawn
   */
  public shouldRespawn(currentTime: number): boolean {
    if (!this.isDead || !this.canRespawn) return false;

    const timeSinceDeath = (currentTime - this.deathTime) / 1000; // convert to seconds
    return timeSinceDeath >= this.respawnTime;
  }

  /**
   * Respawn monster at original spawn position
   */
  public respawn(): void {
    this.reset();
    this.position = { ...this.spawnPosition };
    console.log(`🔄 Monster ${this.name} respawned at (${this.position.x}, ${this.position.y}, ${this.position.z})`);
  }

  /**
   * Set as boss (no respawn, higher stats)
   */
  public setAsBoss(multiplier: number = 5): void {
    this.canRespawn = false;
    this.stats.maxHp *= multiplier;
    this.stats.currentHp = this.stats.maxHp;
    this.stats.baseDamage *= multiplier;
    this.stats.defense *= 2;
    console.log(`👹 ${this.name} is now a BOSS! HP: ${this.stats.maxHp}, Damage: ${this.stats.baseDamage}`);
  }
}
