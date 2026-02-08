import { PlayerEntity } from "../entities/PlayerEntity";
import { MonsterEntity } from "../entities/MonsterEntity";
import { TargetType } from "../types/messages";

/**
 * Resolve a target entity by id and type.
 * Shared by attack and skill handlers to avoid duplicated lookup logic.
 */
export function resolveTarget(
  targetId: string,
  targetType: TargetType,
  playerEntities: Map<string, PlayerEntity>,
  monsterEntities: Map<string, MonsterEntity>
): PlayerEntity | MonsterEntity | undefined {
  if (targetType === "monster") {
    return monsterEntities.get(targetId);
  }
  if (targetType === "player") {
    return playerEntities.get(targetId);
  }
  return undefined;
}
