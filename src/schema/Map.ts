import { Schema, type, MapSchema } from "@colyseus/schema";
import { PlayerState } from "./Player";
import { MonsterState } from "./Monster";

export class MapState extends Schema {
    @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
    @type({ map: MonsterState }) monsters = new MapSchema<MonsterState>();
}
