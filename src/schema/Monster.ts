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
}
