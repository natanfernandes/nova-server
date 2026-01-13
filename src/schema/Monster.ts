import { Schema, type } from "@colyseus/schema";

export class MonsterState extends Schema {
  @type("string") id: string = "";
  @type("string") name: string = "";
  @type("float32") x: number = 0;
  @type("float32") y: number = 0;
  @type("float32") z: number = 0;
  @type("int32") maxHp: number = 100;
  @type("int32") currentHp: number = 100;

  // Direction for server-controlled movement
  @type("float32") dirX: number = 0;
  @type("float32") dirZ: number = 0;

  // Combat stats
  @type("int32") baseDamage: number = 5;
  @type("float32") attackSpeed: number = 1.0; // attacks per second
  @type("float32") attackRange: number = 2.0; // attack range
  @type("int32") defense: number = 0;

  // State
  @type("boolean") isDead: boolean = false;
  @type("boolean") isAttacking: boolean = false;
  @type("string") targetId: string = ""; // ID of current attack target (player session ID)
}
