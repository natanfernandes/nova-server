# Nova Server - Colyseus Game Server

## Project Overview

This is an authoritative multiplayer game server built with Colyseus (TypeScript/Node.js). It handles all game logic, state management, and broadcasts to connected clients.

## Architecture Principles

### 1. Server Authority (NON-NEGOTIABLE)

The server is the **single source of truth**. The server:
- **OWNS** all game state (positions, HP, cooldowns, inventory)
- **VALIDATES** all client inputs before applying
- **SIMULATES** all game logic (movement, combat, skills)
- **BROADCASTS** authoritative state to all clients
- **NEVER** trusts client-reported outcomes

```
Client sends: { action: "attack", targetId: "monster_1" }
Server validates: Is player in range? Is target alive? Is attack off cooldown?
Server simulates: Calculate damage, apply to target
Server broadcasts: { attackerId, targetId, damage, targetHp }
```

### 2. Input Validation

Every client message must be validated before processing.

```typescript
// ALWAYS validate
handlePlayerAttack(client: Client, message: any) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return; // Player doesn't exist

    const target = this.getEntity(message.targetId, message.targetType);
    if (!target) return; // Target doesn't exist

    if (target.isDead) return; // Target already dead

    const distance = this.calculateDistance(player, target);
    if (distance > player.attackRange) return; // Out of range

    if (player.attackCooldown > 0) return; // On cooldown

    // NOW we can process the attack
    this.executeAttack(player, target);
}
```

### 3. State-Based Architecture

Use Colyseus Schema for all synchronized state. Clients automatically receive updates.

```typescript
// State is the source of truth
export class GameState extends Schema {
    @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
    @type({ map: MonsterState }) monsters = new MapSchema<MonsterState>();
}

// Mutations trigger automatic sync
player.x = newX;  // Client receives this automatically
```

### 4. Entity-Component Pattern

Separate state (Schema) from behavior (Entity classes).

```typescript
// Schema = Data (synced to clients)
export class PlayerState extends Schema {
    @type("float32") x: number = 0;
    @type("float32") y: number = 0;
    @type("int32") currentHp: number = 100;
}

// Entity = Behavior (server-only)
export class PlayerEntity {
    state: PlayerState;
    attackCooldown: number = 0;

    update(deltaTime: number) {
        this.attackCooldown -= deltaTime;
    }

    canAttack(): boolean {
        return this.attackCooldown <= 0 && !this.state.isDead;
    }
}
```

## Directory Structure

```
src/
├── rooms/
│   └── WorldRoom.ts          # Main game room
├── schema/
│   ├── GameState.ts          # Root state schema
│   ├── Player.ts             # Player state schema
│   └── Monster.ts            # Monster state schema
├── entities/
│   ├── PlayerEntity.ts       # Player behavior
│   └── MonsterEntity.ts      # Monster behavior
├── systems/
│   ├── CombatManager.ts      # Combat calculations
│   ├── MovementSystem.ts     # Movement validation
│   └── SkillSystem.ts        # Skill processing
└── config/
    └── game.config.ts        # Game constants
```

## Code Patterns

### Room Setup

```typescript
export class WorldRoom extends Room<GameState> {
    // Entity management (server-only, not synced)
    private playerEntities = new Map<string, PlayerEntity>();
    private monsterEntities = new Map<string, MonsterEntity>();

    onCreate(options: any) {
        this.setState(new GameState());
        this.setSimulationInterval((dt) => this.update(dt));
        this.setupMessageHandlers();
    }

    setupMessageHandlers() {
        this.onMessage("move", (client, message) => {
            this.handleMove(client, message);
        });
        this.onMessage("attack", (client, message) => {
            this.handleAttack(client, message);
        });
    }
}
```

### Input Handling Pattern

```typescript
handleMove(client: Client, message: MoveMessage) {
    // 1. Get player
    const player = this.state.players.get(client.sessionId);
    const entity = this.playerEntities.get(client.sessionId);
    if (!player || !entity) return;

    // 2. Validate input
    const dir = message.dir;
    if (!Array.isArray(dir) || dir.length !== 3) return;

    // 3. Sanitize input (clamp values)
    const direction = {
        x: Math.max(-1, Math.min(1, dir[0])),
        y: 0,
        z: Math.max(-1, Math.min(1, dir[2]))
    };

    // 4. Apply to entity (server simulates)
    entity.setDirection(direction);

    // 5. State updates happen in update loop
}
```

### Game Loop Pattern

```typescript
update(deltaTime: number) {
    const dt = deltaTime / 1000; // Convert to seconds

    // Update all entities
    this.playerEntities.forEach((entity, id) => {
        entity.update(dt);
        this.syncPlayerState(id, entity);
    });

    this.monsterEntities.forEach((entity, id) => {
        entity.update(dt);
        this.syncMonsterState(id, entity);
    });
}

syncPlayerState(id: string, entity: PlayerEntity) {
    const state = this.state.players.get(id);
    if (!state) return;

    // Copy entity position to synced state
    state.x = entity.position.x;
    state.y = entity.position.y;
    state.z = entity.position.z;
    state.dirX = entity.direction.x;
    state.dirZ = entity.direction.z;
}
```

### Combat System Pattern

```typescript
// In CombatManager.ts
export interface AttackResult {
    damage: number;
    killed: boolean;
    targetHp: number;
}

export function calculateAttack(
    attacker: { stats: CombatStats },
    target: { stats: CombatStats }
): AttackResult {
    // Server calculates damage
    const baseDamage = attacker.stats.baseDamage;
    const defense = target.stats.defense;
    const damage = Math.max(1, baseDamage - defense);

    // Server applies damage
    target.stats.currentHp -= damage;
    const killed = target.stats.currentHp <= 0;

    if (killed) {
        target.stats.currentHp = 0;
        target.isDead = true;
    }

    return {
        damage,
        killed,
        targetHp: target.stats.currentHp
    };
}
```

### Broadcasting Events

```typescript
// Broadcast to ALL clients (they apply visual feedback)
this.broadcast("player_attacked", {
    attackerId: client.sessionId,
    targetId: targetId,
    targetType: "monster",
    damage: result.damage,
    killed: result.killed,
    targetHp: result.targetHp
});

// Broadcast to specific client
client.send("attack_failed", { reason: "out_of_range" });
```

## Rules for New Features

### Adding a New Message Type

1. Define message interface in types
2. Add handler in `setupMessageHandlers()`
3. Validate ALL input fields
4. Process on server, update state
5. Broadcast result to relevant clients

### Adding a New Entity Type

1. Create Schema in `schema/[Entity].ts`
2. Create Entity class in `entities/[Entity]Entity.ts`
3. Add to GameState schema
4. Add entity map in Room
5. Add spawn/update/sync logic

### Adding a New Skill

1. Define skill in config with: id, damage, range, cooldown, cost
2. Add skill validation in SkillSystem
3. Handle in `handlePlayerSkill()`
4. Broadcast `skill_used` with results

## Validation Checklist

Every message handler MUST check:

- [ ] Player exists and is valid
- [ ] Target exists (if applicable)
- [ ] Target is alive (if applicable)
- [ ] Player is in range (if applicable)
- [ ] Cooldown has expired
- [ ] Player has resources (mana, etc.)
- [ ] Input values are sanitized (clamped, type-checked)

## Common Mistakes to Avoid

### DON'T: Trust client-reported values
```typescript
// BAD
handleAttack(client, message) {
    const damage = message.damage; // NEVER trust this
    target.hp -= damage;
}
```

### DON'T: Skip validation
```typescript
// BAD
handleMove(client, message) {
    player.x = message.x; // Client could teleport!
    player.y = message.y;
}
```

### DON'T: Process without cooldown checks
```typescript
// BAD
handleAttack(client, message) {
    // No cooldown check = infinite attacks
    this.executeAttack(player, target);
}
```

### DO: Server calculates everything
```typescript
// GOOD
handleAttack(client, message) {
    if (!this.canAttack(player, target)) return;

    const result = CombatManager.calculateAttack(player, target);
    player.attackCooldown = player.attackSpeed;

    this.broadcast("player_attacked", {
        attackerId: client.sessionId,
        damage: result.damage, // Server calculated
        // ...
    });
}
```

## Security Considerations

### Rate Limiting
```typescript
// Limit message frequency
private lastMoveTime = new Map<string, number>();

handleMove(client, message) {
    const now = Date.now();
    const last = this.lastMoveTime.get(client.sessionId) || 0;

    if (now - last < 50) return; // Max 20 moves/second
    this.lastMoveTime.set(client.sessionId, now);

    // Process move...
}
```

### Input Sanitization
```typescript
// Always sanitize
const direction = {
    x: clamp(parseFloat(dir[0]) || 0, -1, 1),
    y: 0,
    z: clamp(parseFloat(dir[2]) || 0, -1, 1)
};

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}
```

### Sequence Validation (Optional)
```typescript
// Detect packet manipulation
private inputSequence = new Map<string, number>();

handleMove(client, message) {
    const expected = (this.inputSequence.get(client.sessionId) || 0) + 1;

    if (message.seq < expected) return; // Old/duplicate packet

    this.inputSequence.set(client.sessionId, message.seq);
    // Process...
}
```

## Testing Checklist

Before deploying:

- [ ] Client cannot move faster than server allows
- [ ] Client cannot attack faster than cooldown
- [ ] Client cannot attack out of range
- [ ] Client cannot damage dead entities
- [ ] Disconnected players are cleaned up
- [ ] State is consistent after reconnection
- [ ] No memory leaks in entity maps

## Guiding Principle

> "The server simulates the game. Clients are just fancy spectators with input devices."
