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
  @type("int32") hp: number = 100;
}
