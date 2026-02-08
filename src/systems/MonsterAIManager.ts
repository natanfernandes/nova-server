import { MonsterEntity } from "../entities/MonsterEntity";
import { PlayerEntity } from "../entities/PlayerEntity";
import { CollisionManager } from "./CollisionManager";
import { TickTimerManager } from "./TickTimerManager";
import {
  getRandomDirection,
  shouldDoAction,
  getRandomInterval,
  getDirectionToTarget,
} from "../utils/movement";

export interface MonsterAttackEvent {
  type: "monster_attack";
  monsterId: string;
  monsterName: string;
  targetId: string;
  targetName: string;
  damage: number;
  killed: boolean;
  targetHp: number;
  targetMaxHp: number;
}

export type MonsterAIEvent = MonsterAttackEvent;

/**
 * MonsterAIManager
 * Owns all monster AI logic: wander, combat, movement.
 * Returns events for the room to broadcast — no direct room dependency.
 */
export class MonsterAIManager {
  private readonly MONSTER_SPEED = 2;
  private readonly LEASH_DISTANCE = 15.0;

  // Per-monster state
  private aiTimers: Map<string, number> = new Map();
  private aggro: Map<string, string> = new Map(); // monsterId -> playerSessionId

  constructor(
    private monsterEntities: Map<string, MonsterEntity>,
    private playerEntities: Map<string, PlayerEntity>,
    private collisionManager: CollisionManager,
    private timerManager: TickTimerManager
  ) {}

  /**
   * Run one tick of monster AI. Returns events for the room to broadcast.
   */
  update(delta: number): MonsterAIEvent[] {
    const events: MonsterAIEvent[] = [];

    for (const [monsterId, entity] of this.monsterEntities) {
      if (entity.isDead) continue;

      const targetSessionId = this.aggro.get(monsterId);
      if (targetSessionId) {
        this.updateCombatAI(entity, targetSessionId, events);
      } else {
        this.updateWanderAI(entity, delta);
      }

      if (entity.isMoving()) {
        this.updateMovement(entity, delta);
      }
    }

    return events;
  }

  setAggro(monsterId: string, playerSessionId: string): void {
    this.aggro.set(monsterId, playerSessionId);
  }

  clearAggro(monsterId: string): void {
    this.aggro.delete(monsterId);
  }

  clearTimers(monsterId: string): void {
    this.aiTimers.delete(monsterId);
  }

  // ── Private AI logic ──────────────────────────────────────────────

  private updateCombatAI(
    monster: MonsterEntity,
    targetSessionId: string,
    events: MonsterAIEvent[]
  ): void {
    const targetEntity = this.playerEntities.get(targetSessionId);

    if (!targetEntity || targetEntity.isDead) {
      this.aggro.delete(monster.id);
      monster.targetId = "";
      return;
    }

    const { dirX, dirZ, distance } = getDirectionToTarget(
      monster.position.x, monster.position.z,
      targetEntity.position.x, targetEntity.position.z
    );

    if (distance > this.LEASH_DISTANCE) {
      this.aggro.delete(monster.id);
      monster.targetId = "";
      monster.stopMovement();
      return;
    }

    if (distance <= monster.stats.attackRange) {
      monster.stopMovement();
      this.tryAttack(monster, targetEntity, events);
    } else {
      monster.dirX = dirX;
      monster.dirZ = dirZ;
    }
  }

  private updateWanderAI(monster: MonsterEntity, delta: number): void {
    let timer = this.aiTimers.get(monster.id) || 0;
    timer -= delta;

    if (timer <= 0) {
      if (shouldDoAction(0.7)) {
        const direction = getRandomDirection();
        monster.dirX = direction.dirX;
        monster.dirZ = direction.dirZ;
      } else {
        monster.stopMovement();
      }
      timer = getRandomInterval(2, 5);
    }

    this.aiTimers.set(monster.id, timer);
  }

  private tryAttack(
    monster: MonsterEntity,
    target: PlayerEntity,
    events: MonsterAIEvent[]
  ): void {
    const result = monster.attack(target, Date.now());

    if (!result.success) return;

    events.push({
      type: "monster_attack",
      monsterId: monster.id,
      monsterName: monster.name,
      targetId: target.id,
      targetName: target.name,
      damage: result.damage,
      killed: result.killed,
      targetHp: target.stats.currentHp,
      targetMaxHp: target.stats.maxHp,
    });

    this.timerManager.schedule(`atk_reset:${monster.id}`, 0.1, () => {
      monster.isAttacking = false;
    });
  }

  private updateMovement(monster: MonsterEntity, delta: number): void {
    const { newX, newZ } = monster.calculateMovement(this.MONSTER_SPEED, delta);

    const slideResult = this.collisionManager.trySlideMovement(
      monster.position.x,
      monster.position.z,
      newX,
      newZ
    );

    monster.setPosition(slideResult.x, monster.position.y, slideResult.z);

    if (slideResult.collided && slideResult.x === monster.position.x && slideResult.z === monster.position.z) {
      monster.stopMovement();
      this.aiTimers.set(monster.id, 0);
    }
  }
}
