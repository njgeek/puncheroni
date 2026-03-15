import { PunchRescueGame } from "./game/PunchRescueGame.js";

const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
const connectionStatus = document.getElementById("connection-status")!;
const phaseValue = document.getElementById("phase-value")!;
const timerValue = document.getElementById("timer-value")!;
const roleValue = document.getElementById("role-value")!;
const objectiveText = document.getElementById("objective-text")!;
const extractionFill = document.getElementById("extraction-fill")!;
const punchStressValue = document.getElementById("punch-stress-value")!;
const punchMoodIcon = document.getElementById("punch-mood-icon")!;
const touchControls = document.getElementById("touch-controls")!;

const game = new PunchRescueGame({
  canvas,
  connectionStatus,
  phaseValue,
  timerValue,
  roleValue,
  objectiveText,
  extractionFill,
  punchStressValue,
  punchMoodIcon,
  touchControls,
});

game.start().catch((error) => {
  connectionStatus.textContent = `Failed to connect: ${error instanceof Error ? error.message : String(error)}`;
  console.error("[puncheroni] startup error:", error);
});
