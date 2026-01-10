import { MONSTERS, MONSTERS_KEYS } from "../monsters";


export const MAPS_KEYS = {
    WORLD: 'world',
}

const WORLD_MAP = {
    id: 'world',
    name: 'World Map',
    width: 50,
    height: 50,
    availableMonsters: {
        [MONSTERS_KEYS.PORING]: {
            quantity: 10,
            ...MONSTERS[MONSTERS_KEYS.PORING],
        },
    },
   
}

export const GAME_MAPS = {
    [MAPS_KEYS.WORLD]: WORLD_MAP,
}
