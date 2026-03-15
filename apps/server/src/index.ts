import { defineServer, defineRoom } from "colyseus";
import { ROOM_NAME, SERVER_PORT } from "@puncheroni/shared";
import { PunchRoom } from "./rooms/PunchRoom.js";

const server = defineServer({
  rooms: {
    [ROOM_NAME]: defineRoom(PunchRoom),
  },
});

server.listen(SERVER_PORT);
console.log(`[puncheroni] game server listening on ws://localhost:${SERVER_PORT}`);
