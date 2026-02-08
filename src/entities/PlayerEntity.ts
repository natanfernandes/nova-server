import { BaseEntity, CombatStats, Position, AttackResult } from "./BaseEntity";
import { PlayerState } from "../schema/Player";

export interface SkillConfig {
  damage: number;
  range: number;
  requiresTarget: boolean;
  type: "target" | "area";
  radius?: number;
}

export interface SkillResult extends AttackResult {
  skillId: string;
}

export interface AreaSkillResult {
  success: boolean;
  skillId: string;
  hits: Array<{ targetId: string; damage: number; killed: boolean }>;
  x: number;
  z: number;
  reason?: string;
}

/**
 * Player Entity
 * Represents a player with combat capabilities
 */
export class PlayerEntity extends BaseEntity {
  public sessionId: string; // Colyseus client session ID
  public lastProcessedInput: number = 0;

  private skills: Map<string, SkillConfig> = new Map([
    ["fireball", { damage: 25, range: 5.0, requiresTarget: true, type: "target" }],
    ["meteor", { damage: 35, range: 8.0, requiresTarget: false, type: "area", radius: 3.0 }],
  ]);

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

  public getSkill(skillId: string): SkillConfig | undefined {
    return this.skills.get(skillId);
  }

  /**
   * Use a skill against an optional target. Validates skill, range, and applies damage.
   */
  public useSkill(skillId: string, target: BaseEntity | null, _currentTime: number): SkillResult {
    const skill = this.skills.get(skillId);
    if (!skill) {
      return { success: false, damage: 0, killed: false, skillId, reason: "Unknown skill" };
    }

    if (skill.requiresTarget && !target) {
      return { success: false, damage: 0, killed: false, skillId, reason: "Invalid target" };
    }

    if (target) {
      if (target.isDead) {
        return { success: false, damage: 0, killed: false, skillId, reason: "Target is dead" };
      }

      if (skill.range > 0) {
        const distance = this.distanceTo(target);
        if (distance > skill.range) {
          return { success: false, damage: 0, killed: false, skillId, reason: "Out of range" };
        }
      }
    }

    // Calculate and apply damage
    let damage = 0;
    let killed = false;

    if (skill.damage > 0 && target) {
      damage = Math.floor(skill.damage * this.stats.damageMultiplier);
      target.takeDamage(damage);
      killed = target.isDead;
    }

    // Set combat UI state
    this.isAttacking = true;
    this.targetId = target?.id || "";

    return { success: true, damage, killed, skillId };
  }

  /**
   * Use an area skill at a ground position. Caller must pass in targets found in radius.
   */
  public useAreaSkill(
    skillId: string,
    castX: number,
    castZ: number,
    targetsInArea: BaseEntity[],
    _currentTime: number
  ): AreaSkillResult {
    const skill = this.skills.get(skillId);
    if (!skill) {
      return { success: false, skillId, hits: [], x: castX, z: castZ, reason: "Unknown skill" };
    }
    if (skill.type !== "area") {
      return { success: false, skillId, hits: [], x: castX, z: castZ, reason: "Not an area skill" };
    }

    // Validate cast range (distance from caster to ground target)
    const dx = this.position.x - castX;
    const dz = this.position.z - castZ;
    const distToCast = Math.sqrt(dx * dx + dz * dz);
    if (distToCast > skill.range) {
      return { success: false, skillId, hits: [], x: castX, z: castZ, reason: "Cast position out of range" };
    }

    // Apply damage to all targets in the area
    const hits: AreaSkillResult["hits"] = [];
    const baseDamage = Math.floor(skill.damage * this.stats.damageMultiplier);

    for (const target of targetsInArea) {
      if (target.isDead) continue;
      target.takeDamage(baseDamage);
      hits.push({
        targetId: target.id,
        damage: baseDamage,
        killed: target.isDead,
      });
    }

    // Set combat UI state
    this.isAttacking = true;
    this.targetId = "";

    return { success: true, skillId, hits, x: castX, z: castZ };
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
