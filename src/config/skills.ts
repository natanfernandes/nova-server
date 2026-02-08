import { SkillConfig } from "../entities/PlayerEntity";

/**
 * Centralized skill registry. All skill definitions live here
 * instead of being hardcoded inside PlayerEntity.
 */
export const SKILL_REGISTRY: Record<string, SkillConfig> = {
  fireball: { damage: 25, range: 5.0, requiresTarget: true, type: "target" },
  meteor: { damage: 35, range: 8.0, requiresTarget: false, type: "area", radius: 3.0 },
};

export function getSkill(skillId: string): SkillConfig | undefined {
  return SKILL_REGISTRY[skillId];
}
