/**
 * Client → Server message type definitions.
 * Replaces `any` in message handlers with validated, typed payloads.
 */

export type TargetType = "player" | "monster";

export interface MoveMessage {
  dir: [number, number, number];
  seq: number;
}

export interface AttackMessage {
  targetId: string;
  targetType: TargetType;
}

export interface TargetedSkillMessage {
  skillId: string;
  targetId: string;
  targetType: TargetType;
}

export interface AreaSkillMessage {
  skillId: string;
  targetType: "ground";
  x: number;
  z: number;
}

export type SkillMessage = TargetedSkillMessage | AreaSkillMessage;

export interface DamageMessage {
  amount: number;
}

// -- Validation helpers --

export function isValidTargetType(value: unknown): value is TargetType {
  return value === "player" || value === "monster";
}

export function isValidMoveMessage(msg: unknown): msg is MoveMessage {
  if (typeof msg !== "object" || msg === null) return false;
  const m = msg as Record<string, unknown>;
  return (
    Array.isArray(m.dir) &&
    m.dir.length === 3 &&
    m.dir.every((v: unknown) => typeof v === "number") &&
    typeof m.seq === "number"
  );
}

export function isValidAttackMessage(msg: unknown): msg is AttackMessage {
  if (typeof msg !== "object" || msg === null) return false;
  const m = msg as Record<string, unknown>;
  return typeof m.targetId === "string" && isValidTargetType(m.targetType);
}

export function isValidSkillMessage(msg: unknown): msg is SkillMessage {
  if (typeof msg !== "object" || msg === null) return false;
  const m = msg as Record<string, unknown>;
  if (typeof m.skillId !== "string") return false;

  // Area skill
  if (m.targetType === "ground") {
    return typeof m.x === "number" && typeof m.z === "number";
  }

  // Targeted skill
  return typeof m.targetId === "string" && isValidTargetType(m.targetType);
}

export function isValidDamageMessage(msg: unknown): msg is DamageMessage {
  if (typeof msg !== "object" || msg === null) return false;
  const m = msg as Record<string, unknown>;
  return typeof m.amount === "number";
}
