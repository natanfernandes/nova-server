import { Schema, type } from "@colyseus/schema";

export class PlayerState extends Schema {
  @type("string") id: string = "";
  @type("string") name: string = "";
  @type("float32") x: number = 0;
  @type("float32") y: number = 0;
  @type("float32") z: number = 0;
  @type("number") dirX = 0;
  @type("number") dirY = 0;
  @type("number") dirZ = 0;
  @type("int32") last_processed_input: number = 0;
  @type("int32") currentHp: number = 100;
  @type("int32") maxHp: number = 100;
  @type("float32") walkSpeed: number = 5.0;

  // Combat stats
  @type("int32") baseDamage: number = 10;
  @type("float32") attackSpeed: number = 2.0; // attacks per second
  @type("float32") attackRange: number = 2.0; // attack range
  @type("int32") defense: number = 0;
  @type("float32") damageMultiplier: number = 1.0;
  @type("float32") damageReduction: number = 0;

  // Attack state
  @type("boolean") isAttacking: boolean = false;
  @type("string") targetId: string = ""; // ID of current attack target
}
