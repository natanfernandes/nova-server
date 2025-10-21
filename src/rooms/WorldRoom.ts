import { Room, Client } from "colyseus";
import { WorldState, PlayerState } from "../schema/Player";
import { prisma } from "../db";
import { v4 as uuidv4 } from "uuid";

export class WorldRoom extends Room<WorldState> {
  maxClients = 100;
  state = new WorldState();

  onCreate() {
    console.log("🌍 WorldRoom created");
     this.onMessage("*", (client: Client, type: string|number, message: any) => {
        console.log(client.sessionId, "sent 'action' message: ", message);
          const player = this.state.players.get(client.sessionId);
          if (!player) return;

          switch (type) {
            case "move":
              player.x += message.x;
              player.y += message.y;
              break;
            case "damage":
              player.hp -= message.amount;
              if (player.hp < 0) player.hp = 0;
              break;
          }
    });
  }
  
  async onJoin(client: Client, options: any) {
    const playerName = options.name || `Player_${client.sessionId.slice(0, 4)}`;
    
    // tenta carregar player do banco ou cria novo
    let player = await prisma.player.findUnique({
      where: { id: playerName },
    });

    if (!player) {
      player = await prisma.player.create({
        data: { id: uuidv4(), name: playerName, x: 0, y: 0, hp: 100 },
      });
    }

    const p = new PlayerState();
    p.id = player.id;
    p.name = player.name;
    p.x = player.x;
    p.y = player.y;
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
