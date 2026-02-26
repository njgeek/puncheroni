import { Application } from 'pixi.js';
import { ClientConnection } from './network/ClientConnection';
import { KeyboardInput } from './input/KeyboardInput';
import { TouchInput } from './input/TouchInput';
import { GameScene } from './scenes/GameScene';
import { LobbyScene } from './scenes/LobbyScene';
import { ResultScene } from './scenes/ResultScene';
import { AudioManager } from './renderer/AudioManager';
import { showToast, showRoleBanner, hideRoleBanner, showRespawnTimer, hideRespawnTimer } from './ui/HUD';
import { RESPAWN_TIME, PUNCH_X, PUNCH_Y } from '@shared/constants';

function getScreenSize() {
  if (window.visualViewport) {
    return { w: window.visualViewport.width, h: window.visualViewport.height };
  }
  return { w: window.innerWidth, h: window.innerHeight };
}

/**
 * Rotate screen-space joystick direction to iso game direction.
 * "Up" on screen = northwest in game space.
 * We rotate by -pi/4 and scale Y by 2 to correct for iso vertical squish.
 */
function screenDirToGameDir(sdx: number, sdy: number): { dx: number; dy: number } {
  // Rotate by -45 degrees
  const cos45 = Math.SQRT1_2;
  const sin45 = Math.SQRT1_2;
  const rx = sdx * cos45 + sdy * sin45;
  const ry = -sdx * sin45 + sdy * cos45;
  // Scale Y by 2 to correct for iso vertical squish
  const gx = rx;
  const gy = ry * 2;
  // Normalize to maintain magnitude
  const origMag = Math.sqrt(sdx * sdx + sdy * sdy);
  const newMag = Math.sqrt(gx * gx + gy * gy);
  if (newMag === 0 || origMag === 0) return { dx: 0, dy: 0 };
  const scale = origMag / newMag;
  return { dx: gx * scale, dy: gy * scale };
}

async function main() {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;

  canvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
  canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  canvas.addEventListener('touchend', (e) => e.preventDefault(), { passive: false });

  document.body.addEventListener('touchmove', (e) => {
    if (e.touches.length === 1) e.preventDefault();
  }, { passive: false });

  const { w: initW, h: initH } = getScreenSize();

  const app = new Application();
  await app.init({
    canvas,
    width: initW,
    height: initH,
    backgroundColor: 0x0a0e17,
    antialias: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
  });

  // Scenes & UI
  const lobby = new LobbyScene();
  const gameScene = new GameScene(app);
  const results = new ResultScene();
  const audio = new AudioManager();

  gameScene.init(initW, initH);

  // Input
  const keyboard = new KeyboardInput(canvas);
  const touchContainer = document.getElementById('mobile-controls')!;
  const touch = new TouchInput(touchContainer);

  // Network
  const connection = new ClientConnection();
  let currentState: any = null;
  let myTeam = 'defender';
  let preferredTeam = '';
  let inputSeq = 0;
  let wasPunchKidnapped = false;
  let respawnEndTime = 0;

  connection.onStateChange = (state) => {
    currentState = state;

    const phase = state.phase;
    const playerCount = state.players?.size || 0;

    if (phase === 'lobby') {
      lobby.show();
      lobby.setPlayerCount(playerCount);
      results.hide();
      hideRoleBanner();
    } else if (phase === 'countdown') {
      lobby.hide();
      results.hide();
      const countdownOverlay = document.getElementById('countdown-overlay')!;
      const countdownNumber = document.getElementById('countdown-number')!;
      const countdownObjective = document.getElementById('countdown-objective')!;
      const countdownRole = document.getElementById('countdown-role')!;
      countdownOverlay.classList.remove('hidden');
      countdownNumber.textContent = String(Math.ceil(state.countdown));

      if (myTeam === 'defender') {
        countdownRole.textContent = "PUNCH'S FRIEND";
        countdownRole.style.color = '#88bbff';
        countdownObjective.textContent = 'Block enemies! Keep Punch safe for 90 seconds!';
        countdownObjective.style.color = '#88bbff';
      } else {
        countdownRole.textContent = "PUNCH'S FOE";
        countdownRole.style.color = '#ff8888';
        countdownObjective.textContent = 'Grab Punch! Carry him to a red EXIT zone!';
        countdownObjective.style.color = '#ff8888';
      }
      if (state.countdown <= 0) {
        countdownOverlay.classList.add('hidden');
      }

      showRoleBanner(myTeam);
    } else if (phase === 'active') {
      lobby.hide();
      results.hide();
      document.getElementById('countdown-overlay')!.classList.add('hidden');
      showRoleBanner(myTeam);
    } else if (phase === 'results') {
      hideRoleBanner();
      hideRespawnTimer();
    }
  };

  lobby.onTeamSelect = (team) => {
    preferredTeam = team;
    connection.sendTeamPreference(team);
  };

  connection.onWelcome = (data) => {
    console.log(`Welcome, ${data.name}! Team: ${data.team}`);
    myTeam = data.team;
    lobby.setTeam(data.team);
    touch.setRole(data.team);
    gameScene.setLocalPlayer(connection.sessionId);

    // Show assigned message if different from preference
    if (preferredTeam && preferredTeam !== data.team) {
      lobby.showAssignedMessage(preferredTeam, data.team);
    }
  };

  connection.onTeamUpdate = (data) => {
    myTeam = data.team;
    lobby.setTeam(data.team);
    touch.setRole(data.team);
  };

  connection.onTeamCounts = (data) => {
    lobby.setTeamCounts(data.friends, data.foes);
  };

  connection.onPlayerEliminated = (data) => {
    const isLocalDeath = data.victimId === connection.sessionId;
    if (isLocalDeath) {
      showToast(`Eliminated by ${data.killerName}`, '#ff4444');
      gameScene.flashScreen(0xff0000, 0.3, 0.5);
      respawnEndTime = Date.now() + RESPAWN_TIME;
    } else if (data.killerId === connection.sessionId) {
      showToast(`Eliminated ${data.victimName}`, '#44ff44');
    } else {
      showToast(`${data.killerName} eliminated ${data.victimName}`, '#aaaaaa');
    }
  };

  connection.onRoundResults = (data) => {
    results.show(data);
    audio.playRoundEnd();
  };

  connection.onPunchRescued = () => {
    audio.playRescue();
    showToast('Punch rescued!', '#44aaff');
    gameScene.flashScreen(0x4488ff, 0.15, 0.4);
    wasPunchKidnapped = false;
  };

  gameScene.onKnockback = () => audio.playKnockback();
  gameScene.onPhaseChange = (phase) => {
    if (phase === 'active') {
      audio.playRoundStart();
      wasPunchKidnapped = false;
      gameScene.hud.showRoleHint(myTeam);
      if (myTeam === 'defender') {
        showToast('Guard the center!', '#88bbff');
      } else {
        showToast('Rush to grab Punch!', '#ff8888');
      }
    }
  };

  // Connect with auto-retry
  const lobbyTeamEl = document.getElementById('lobby-team')!;
  const maxRetries = 5;
  let connected = false;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const lobbyStatus = document.getElementById('lobby-status')!;
      lobbyStatus.textContent = attempt === 1 ? 'Connecting...' : `Reconnecting (${attempt}/${maxRetries})...`;
      await connection.connect();
      console.log('Connected! Session:', connection.sessionId);
      connected = true;
      break;
    } catch (err) {
      console.warn(`Connection attempt ${attempt} failed:`, err);
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 1500 * attempt));
      }
    }
  }
  if (!connected) {
    const lobbyStatus = document.getElementById('lobby-status')!;
    lobbyStatus.textContent = 'Could not connect — tap to retry';
    lobbyStatus.style.cursor = 'pointer';
    lobbyStatus.addEventListener('click', () => window.location.reload(), { once: true });
    return;
  }

  // Audio context resume on first interaction
  const resumeAudio = () => {
    audio.ensureResumed();
    document.removeEventListener('click', resumeAudio);
    document.removeEventListener('touchstart', resumeAudio);
  };
  document.addEventListener('click', resumeAudio);
  document.addEventListener('touchstart', resumeAudio);

  // Resize handling
  const handleResize = () => {
    const { w, h } = getScreenSize();
    app.renderer.resize(w, h);
    gameScene.resize(w, h);
  };
  window.addEventListener('resize', handleResize);
  window.addEventListener('orientationchange', () => {
    setTimeout(handleResize, 150);
  });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', handleResize);
  }

  // Game loop
  app.ticker.add((ticker) => {
    const dt = ticker.deltaTime / 60;

    // Gather input
    const useMobile = touch.active;
    const rawDx = useMobile ? touch.dx : keyboard.dx;
    const rawDy = useMobile ? touch.dy : keyboard.dy;
    const attackPressed = useMobile ? touch.consumeAttack() : keyboard.consumeAttack();
    const dashPressed = useMobile ? touch.consumeDash() : keyboard.consumeDash();
    const barrierPressed = useMobile ? touch.consumeBarrier() : keyboard.consumeBarrier();

    // Rotate joystick input to iso game direction
    const { dx, dy } = screenDirToGameDir(rawDx, rawDy);

    const attackAngle = useMobile
      ? (() => {
          // Rotate touch attack angle similarly
          const rawAngle = touch.attackAngle;
          const sdx2 = Math.cos(rawAngle);
          const sdy2 = Math.sin(rawAngle);
          const gd = screenDirToGameDir(sdx2, sdy2);
          return Math.atan2(gd.dy, gd.dx);
        })()
      : gameScene.getAttackAngle(keyboard.mouseX, keyboard.mouseY);

    // Send input to server
    if (dx !== 0 || dy !== 0 || attackPressed || dashPressed || barrierPressed) {
      connection.sendInput({
        dx,
        dy,
        attack: attackPressed,
        attackAngle,
        dash: dashPressed,
        placeBarrier: barrierPressed,
        seq: ++inputSeq,
      });

      if (attackPressed) audio.playHit();
      if (dashPressed) audio.playDash();
      if (barrierPressed) audio.playBarrierPlace();
    } else if (currentState?.phase === 'active') {
      connection.sendInput({
        dx: 0,
        dy: 0,
        attack: false,
        attackAngle,
        dash: false,
        placeBarrier: false,
        seq: ++inputSeq,
      });
    }

    // Kidnap event (play sound + toast once)
    if (currentState?.punch) {
      const isNowKidnapped = currentState.punch.isKidnapped && currentState.punch.carriedBy;
      if (isNowKidnapped && !wasPunchKidnapped) {
        audio.playKidnap();
        showToast('Punch kidnapped!', '#ff4444');
        gameScene.flashScreen(0xff0000, 0.2, 0.4);
      }
      wasPunchKidnapped = !!isNowKidnapped;
    }

    // Respawn timer
    if (currentState?.phase === 'active' && respawnEndTime > 0) {
      const remaining = (respawnEndTime - Date.now()) / 1000;
      if (remaining > 0) {
        showRespawnTimer(remaining);
      } else {
        hideRespawnTimer();
        respawnEndTime = 0;
      }
    }

    // Update game scene
    gameScene.update(currentState, dt);

    // Objective arrow
    if (currentState?.phase === 'active') {
      const localPlayer = currentState.players?.get(connection.sessionId);
      if (localPlayer && localPlayer.alive) {
        const punchX = currentState.punch?.x ?? PUNCH_X;
        const punchY = currentState.punch?.y ?? PUNCH_Y;
        const punchIsKidnapped = currentState.punch ? !currentState.punch.isHome : false;
        gameScene.hud.updateObjectiveArrow(
          myTeam,
          localPlayer.x,
          localPlayer.y,
          punchX,
          punchY,
          punchIsKidnapped,
          localPlayer.isCarryingPunch,
        );
      }
    }
  });
}

main().catch(console.error);
