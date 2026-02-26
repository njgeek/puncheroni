import { Application, Graphics } from 'pixi.js';
import { ClientConnection } from './network/ClientConnection';
import { KeyboardInput } from './input/KeyboardInput';
import { TouchInput } from './input/TouchInput';
import { GameScene } from './scenes/GameScene';
import { LobbyScene } from './scenes/LobbyScene';
import { ResultScene } from './scenes/ResultScene';
import { AudioManager } from './renderer/AudioManager';

function getScreenSize() {
  // Use visualViewport on mobile for accurate size (accounts for browser chrome)
  if (window.visualViewport) {
    return { w: window.visualViewport.width, h: window.visualViewport.height };
  }
  return { w: window.innerWidth, h: window.innerHeight };
}

async function main() {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;

  // Prevent all default touch behavior on canvas to avoid scrolling/zooming
  canvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
  canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  canvas.addEventListener('touchend', (e) => e.preventDefault(), { passive: false });

  // Prevent iOS Safari pull-to-refresh and overscroll
  document.body.addEventListener('touchmove', (e) => {
    if (e.touches.length === 1) e.preventDefault();
  }, { passive: false });

  const { w: initW, h: initH } = getScreenSize();

  // Initialize PixiJS
  const app = new Application();
  await app.init({
    canvas,
    width: initW,
    height: initH,
    backgroundColor: 0x0a0e17,
    antialias: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2), // cap at 2x for performance
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
  let inputSeq = 0;
  let wasPunchKidnapped = false;

  connection.onStateChange = (state) => {
    currentState = state;

    const phase = state.phase;
    const playerCount = state.players?.size || 0;

    if (phase === 'lobby') {
      lobby.show();
      lobby.setPlayerCount(playerCount);
      results.hide();
    } else if (phase === 'countdown') {
      lobby.hide();
      results.hide();
      const countdownOverlay = document.getElementById('countdown-overlay')!;
      const countdownNumber = document.getElementById('countdown-number')!;
      countdownOverlay.classList.remove('hidden');
      countdownNumber.textContent = String(Math.ceil(state.countdown));
      if (state.countdown <= 0) {
        countdownOverlay.classList.add('hidden');
      }
    } else if (phase === 'active') {
      lobby.hide();
      results.hide();
      document.getElementById('countdown-overlay')!.classList.add('hidden');
    } else if (phase === 'results') {
      // Results shown via message handler
    }
  };

  connection.onWelcome = (data) => {
    console.log(`Welcome, ${data.name}! Team: ${data.team}`);
    myTeam = data.team;
    lobby.setTeam(data.team);
    gameScene.setLocalPlayer(connection.sessionId);
  };

  connection.onRoundResults = (data) => {
    results.show(data);
    audio.playRoundEnd();
  };

  // Listen for rescue event
  connection.onPunchRescued = () => {
    audio.playRescue();
    wasPunchKidnapped = false;
  };

  gameScene.onKnockback = () => audio.playKnockback();
  gameScene.onPhaseChange = (phase) => {
    if (phase === 'active') {
      audio.playRoundStart();
      wasPunchKidnapped = false;
    }
  };

  // Connect with auto-retry
  const lobbyTeamEl = document.getElementById('lobby-team')!;
  const maxRetries = 5;
  let connected = false;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      lobbyTeamEl.textContent = attempt === 1 ? 'Connecting...' : `Reconnecting (${attempt}/${maxRetries})...`;
      lobbyTeamEl.className = 'team-name';
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
    lobbyTeamEl.textContent = 'Could not connect — tap to retry';
    lobbyTeamEl.style.cursor = 'pointer';
    lobbyTeamEl.addEventListener('click', () => window.location.reload(), { once: true });
    return;
  }

  // Ensure audio context starts on ANY user interaction (lobby tap, canvas, etc.)
  const resumeAudio = () => {
    audio.ensureResumed();
    document.removeEventListener('click', resumeAudio);
    document.removeEventListener('touchstart', resumeAudio);
  };
  document.addEventListener('click', resumeAudio);
  document.addEventListener('touchstart', resumeAudio);

  // Handle resize + orientation change (mobile)
  const handleResize = () => {
    const { w, h } = getScreenSize();
    app.renderer.resize(w, h);
    gameScene.resize(w, h);
  };
  window.addEventListener('resize', handleResize);
  window.addEventListener('orientationchange', () => {
    // Delay to let browser settle after orientation change
    setTimeout(handleResize, 150);
  });
  // Visual viewport resize (handles mobile keyboard, browser chrome changes)
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', handleResize);
  }

  // Game loop
  app.ticker.add((ticker) => {
    const dt = ticker.deltaTime / 60; // normalize to seconds

    // Gather input
    const useMobile = touch.active;
    const dx = useMobile ? touch.dx : keyboard.dx;
    const dy = useMobile ? touch.dy : keyboard.dy;
    const attackPressed = useMobile ? touch.consumeAttack() : keyboard.consumeAttack();
    const dashPressed = useMobile ? touch.consumeDash() : keyboard.consumeDash();
    const barrierPressed = useMobile ? touch.consumeBarrier() : keyboard.consumeBarrier();

    const attackAngle = useMobile
      ? touch.attackAngle
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

      // Play sounds
      if (attackPressed) audio.playHit();
      if (dashPressed) audio.playDash();
      if (barrierPressed) audio.playBarrierPlace();
    } else if (currentState?.phase === 'active') {
      // Still send position updates even when idle
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

    // Check for kidnap event (play sound once)
    if (currentState?.punch) {
      const isNowKidnapped = currentState.punch.isKidnapped && currentState.punch.carriedBy;
      if (isNowKidnapped && !wasPunchKidnapped) {
        audio.playKidnap();
      }
      wasPunchKidnapped = !!isNowKidnapped;
    }

    // Update game scene
    gameScene.update(currentState, dt);
  });
}

main().catch(console.error);
