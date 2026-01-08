import { Room, Client } from "colyseus";
import { PlayerState } from "../schema/Player";
import { prisma } from "../db";
import { v4 as uuidv4 } from "uuid";
import { MapState } from "../schema/Map";
import { GAME_MAPS, MAPS_KEYS } from "../db/maps";
import { MonsterState } from "../schema/Monster";
import { getRandomFloat } from "../utils/random";

export class WorldRoom extends Room<MapState> {
  maxClients = 100;
  SPEED = 5;
  TICK_RATE = 50; // 50ms = 20 ticks per second
  state = new MapState();

  onCreate() {
    console.log("🌍 WorldRoom created");
    this.spawnMonstersOnCreate();
    // Loop principal (20Hz = 50ms per tick)
    this.setSimulationInterval((deltaMs) => this.update(deltaMs / 1000), this.TICK_RATE);

    this.onMessage("*", (client: Client, type: string|number, message: any) => {
        console.log(client.sessionId, "sent 'action' message: ", message);
          const player = this.state.players.get(client.sessionId);
          if (!player) return;

          switch (type) {
            case "move":
              const [dx, dy, dz] = message.dir;
              // Always update direction, even if it's zero (stopped)
              player.dirX = dx;
              player.dirY = dy;
              player.dirZ = dz;
              player.last_processed_input = message.seq;

              if (dx !== 0 || dy !== 0 || dz !== 0) {
                console.log(`Player ${player.name} is moving to direction:`, dx, dy, dz);
              } else {
                console.log(`Player ${player.name} stopped moving`);
              }
              break;
            case "damage":
              player.hp -= message.amount;
              if (player.hp < 0) player.hp = 0;
              break;
          }
    });
  }

  spawnMonstersOnCreate() {
    const worldMap = GAME_MAPS[MAPS_KEYS.WORLD];
    const monsterEntries = Object.entries(worldMap.availableMonsters);
    if (monsterEntries.length === 0) return;
    monsterEntries.forEach(([_monsterKey, monsterData]) => {
      for (let i = 0; i < monsterData.quantity; i++) {
        const monster = new MonsterState();
        monster.id = `monster_${i}`;
        monster.name = monsterData.name;
        monster.x = getRandomFloat(-worldMap.width/2, worldMap.width/2);
        monster.y = getRandomFloat(-worldMap.height/2, worldMap.height/2);
        this.state.monsters.set(monster.id, monster);
      }
    });
  }
  
 update(delta: number) {
    for (const player of this.state.players.values()) {
      // Only move if there's input direction
      const isPlayerMoving = player.dirX !== 0 || player.dirY !== 0 || player.dirZ !== 0;
      if (isPlayerMoving) {
        const newPositionX = player.dirX * this.SPEED * delta;
        const newPositionY = player.dirY * this.SPEED * delta;
        const newPositionZ = player.dirZ * this.SPEED * delta;

        if(newPositionX !== 0){
          player.x += newPositionX;
          console.log(`Player ${player.name} moved to x:`, player.x);
        }
        if(newPositionY !== 0){
          player.y += newPositionY;
          console.log(`Player ${player.name} moved to y:`, player.y);
        }
        if(newPositionZ !== 0){
          player.z += newPositionZ;
          console.log(`Player ${player.name} moved to z:`, player.z);
        }
      }
    }
  }

  async onJoin(client: Client, options: any) {
    const playerName = options.name || `Player_${client.sessionId.slice(0, 4)}`;
    
    // tenta carregar player do banco ou cria novo
    let player = await prisma.player.findUnique({
      where: { id: playerName },
    });

    if (!player) {
      player = await prisma.player.create({
        data: { id: uuidv4(), name: playerName, x: 0, y: 1, hp: 100 },
      });
    }

    const p = new PlayerState();
    p.id = player.id;
    p.name = player.name;
    p.x = player.x;
    p.y = player.y;
    p.z = player.z;
    p.hp = player.hp;

    this.state.players.set(client.sessionId, p);
    console.log(`👤 ${p.name} entrou no mundo`);
  }

  async onLeave(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (player) {
      await prisma.player.update({
        where: { id: player.id },
        data: { x: player.x, y: player.y, hp: player.hp },
      });
      console.log(`💾 Salvou ${player.name}`);
      this.state.players.delete(client.sessionId);
    }
  }

  async onDispose() {
    console.log("🧹 Room disposed");
  }
}
