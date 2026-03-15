import { Schema, MapSchema, type } from "@colyseus/schema";

export class PlayerState extends Schema {
  @type("string") sessionId = "";
  @type("string") name = "";
  @type("string") role = "";
  @type("boolean") isBot = false;
  @type("boolean") connected = false;
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") z = 0;
  @type("number") facing = 0;
}

export class PunchState extends Schema {
  @type("number") x = 0;
  @type("number") y = 0.8;
  @type("number") z = -1.5;
  @type("number") stress = 18;
  @type("string") bondedToSessionId = "";
  @type("string") mood = "calm";
}

export class ToyState extends Schema {
  @type("number") x = -2;
  @type("number") y = 0.45;
  @type("number") z = 0.5;
  @type("string") holderSessionId = "";
}

export class PunchRoomState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type(PunchState) punch = new PunchState();
  @type(ToyState) toy = new ToyState();
  @type("string") phase = "social";
  @type("number") phaseTimerMs = 60000;
  @type("string") winner = "";
  @type("string") objectiveText = "Protect Puncheroni!";
  @type("number") extractionProgress = 0;
}
