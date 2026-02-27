import { Application } from 'pixi.js';
import { ClientConnection } from './network/ClientConnection';
import { KeyboardInput } from './input/KeyboardInput';
import { TouchInput } from './input/TouchInput';
import { GameScene } from './scenes/GameScene';
import { LobbyScene } from './scenes/LobbyScene';
import { ResultScene } from './scenes/ResultScene';
import { AudioManager } from './renderer/AudioManager';
import { showToast, showRoleBanner, hideRoleBanner } from './ui/HUD';
import { QUICK_PHRASES } from '@shared/constants';

function getScreenSize() {
  if (window.visualViewport) {
    return { w: window.visualViewport.width, h: window.visualViewport.height };
  }
  return { w: window.innerWidth, h: window.innerHeight };
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

  const lobby = new LobbyScene();
  const gameScene = new GameScene(app);
  const results = new ResultScene();
  const audio = new AudioManager();

  gameScene.init(initW, initH);

  const keyboard = new KeyboardInput(canvas);
  const touchContainer = document.getElementById('mobile-controls')!;
  const touch = new TouchInput(touchContainer);

  const connection = new ClientConnection();
  (window as any)._connection = connection;
  let currentState: any = null;
  let myRole = 'crewmate';
  let myIsGhost = false;
  let myName = '';
  let inputSeq = 0;

  // Per-player task list (received from roleReveal)
  let myTasks: Array<{ id: string; name: string; room: string; x: number; y: number }> = [];
  let impostorNames: string[] = [];

  // Vent state
  let ventOptions: Array<{ id: number; x: number; y: number }> | null = null;

  // ── State change ────────────────────────────────────────────────────────────
  connection.onStateChange = (state) => {
    currentState = state;
    const phase = state.phase;
    const playerCount = state.players?.size ?? 0;

    if (phase === 'lobby') {
      lobby.show();
      lobby.setPlayerCount(playerCount);
      results.hide();
      hideRoleBanner();
      hideMeetingOverlay();
    } else if (phase === 'countdown') {
      lobby.hide();
      results.hide();
      hideMeetingOverlay();
      const overlay = document.getElementById('countdown-overlay')!;
      const number = document.getElementById('countdown-number')!;
      const roleEl = document.getElementById('countdown-role')!;
      const objEl = document.getElementById('countdown-objective')!;
      overlay.classList.remove('hidden');
      number.textContent = String(Math.ceil(state.countdown));
      if (myRole === 'impostor') {
        roleEl.textContent = 'IMPOSTOR';
        roleEl.style.color = '#ff4444';
        objEl.textContent = 'Kill crewmates. Avoid being voted out!';
        objEl.style.color = '#ff8888';
      } else {
        roleEl.textContent = 'CREWMATE';
        roleEl.style.color = '#44ff88';
        objEl.textContent = 'Complete tasks. Find the impostors!';
        objEl.style.color = '#88ffbb';
      }
      if (state.countdown <= 0) {
        overlay.classList.add('hidden');
      }
      showRoleBanner(myRole);
    } else if (phase === 'active') {
      lobby.hide();
      results.hide();
      document.getElementById('countdown-overlay')!.classList.add('hidden');
      showRoleBanner(myRole);
      // Show task list for crewmates
      const taskPanel = document.getElementById('task-list-panel');
      if (taskPanel) taskPanel.style.display = myRole === 'crewmate' ? 'block' : 'none';

      // Update local ghost/role state
      if (currentState?.players) {
        const localPlayer = currentState.players.get(connection.sessionId);
        if (localPlayer) {
          gameScene.setLocalRole(localPlayer.role, localPlayer.isGhost);
        }
      }
    } else if (phase === 'results') {
      hideRoleBanner();
      hideMeetingOverlay();
    } else if (phase === 'meeting') {
      // Meeting overlay managed by meetingStart message
    }
  };

  connection.onPlayerCountChange = (count) => lobby.setPlayerCount(count);

  // ── Welcome ─────────────────────────────────────────────────────────────────
  connection.onWelcome = (data) => {
    myName = data.name;
    gameScene.setLocalPlayer(connection.sessionId);
    console.log(`Welcome, ${myName}!`);
  };

  // ── Update task checkmarks when state changes ─────────────────────────────
  let prevTasksDone = 0;

  // ── Role reveal ─────────────────────────────────────────────────────────────
  connection.onRoleReveal = (data) => {
    myRole = data.role;
    myIsGhost = false;
    myTasks = data.tasks ?? [];
    impostorNames = data.impostorNames ?? [];

    gameScene.setLocalRole(myRole, false);
    touch.setRole(myRole);

    // Show role reveal overlay
    showRoleReveal(myRole);

    // Populate task list panel
    populateTaskList(myTasks);

    // Show impostor teammates hint
    if (myRole === 'impostor' && impostorNames.length > 1) {
      const others = impostorNames.filter(n => n !== myName).join(', ');
      if (others) showToast(`Fellow impostors: ${others}`, '#ff6666');
    }

    gameScene.hud.showRoleHint(myRole);
  };

  // ── Meeting start ───────────────────────────────────────────────────────────
  connection.onMeetingStart = (data) => {
    audio.playKidnap(); // Repurpose as emergency alarm
    gameScene.flashScreen(0xff8800, 0.2, 0.5);
    showMeetingDiscussion(data);
  };

  connection.onMeetingPhaseChange = (data) => {
    if (data.phase === 'voting') {
      showMeetingVoting(currentState);
    }
  };

  // ── Quick phrase ────────────────────────────────────────────────────────────
  connection.onQuickPhrase = (data) => {
    appendPhraseToChat(data.name, data.phrase);
  };

  // ── Vote result ─────────────────────────────────────────────────────────────
  connection.onVoteResult = (data) => {
    showVoteResult(data);
  };

  // ── Game over ────────────────────────────────────────────────────────────────
  connection.onGameOver = (data) => {
    audio.playRoundEnd();
    hideMeetingOverlay();
    results.show({
      winningTeam: data.winner === 'crewmate' ? 'defender' : 'attacker',
      roundDuration: 0,
      mvpId: '',
      mvpName: '',
      mvpDamage: 0,
      defenderKills: data.tasksDone,
      attackerKills: data.tasksTotal,
      winner: data.winner,
      reason: data.reason,
    });
    if (data.winner === 'crewmate') {
      showToast('Crewmates win!', '#44ff88');
    } else {
      showToast('Impostors win!', '#ff4444');
    }
  };

  // ── Vent options ─────────────────────────────────────────────────────────────
  connection.onVentOptions = (data) => {
    ventOptions = data.connections;
    showVentMenu(data.ventId, data.connections);
  };

  // ── Connect ─────────────────────────────────────────────────────────────────
  const maxRetries = 5;
  let connected = false;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const lobbyStatus = document.getElementById('lobby-status')!;
      lobbyStatus.textContent = attempt === 1 ? 'Connecting...' : `Reconnecting (${attempt}/${maxRetries})...`;
      await connection.connect();
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

  // Audio resume on first interaction
  const resumeAudio = () => {
    audio.ensureResumed();
    document.removeEventListener('click', resumeAudio);
    document.removeEventListener('touchstart', resumeAudio);
  };
  document.addEventListener('click', resumeAudio);
  document.addEventListener('touchstart', resumeAudio);

  // Resize
  const handleResize = () => {
    const { w, h } = getScreenSize();
    app.renderer.resize(w, h);
    gameScene.resize(w, h);
  };
  window.addEventListener('resize', handleResize);
  window.addEventListener('orientationchange', () => setTimeout(handleResize, 150));
  if (window.visualViewport) window.visualViewport.addEventListener('resize', handleResize);

  // ── Phase change callbacks ─────────────────────────────────────────────────
  gameScene.onPhaseChange = (phase) => {
    if (phase === 'active') {
      audio.playRoundStart();
      if (myRole === 'crewmate') showToast('Complete your tasks!', '#44ff88');
      else showToast('Eliminate crewmates!', '#ff4444');
    }
  };

  // ── Game loop ──────────────────────────────────────────────────────────────
  app.ticker.add(() => {
    const useMobile = touch.active;
    const dx = useMobile ? touch.dx : keyboard.dx;
    const dy = useMobile ? touch.dy : keyboard.dy;
    const usePressed = useMobile ? touch.consumeUse() : keyboard.consumeUse();
    const killPressed = useMobile ? touch.consumeKill() : keyboard.consumeKill();
    const reportPressed = useMobile ? touch.consumeReport() : keyboard.consumeReport();

    if (currentState?.phase === 'active') {
      // Check proximity for touch UI helpers
      if (useMobile && currentState.players && currentState.bodies) {
        const local = currentState.players.get(connection.sessionId);
        if (local) {
          let nearBody = false;
          currentState.bodies.forEach((body: any) => {
            const d = Math.sqrt((local.x - body.x) ** 2 + (local.y - body.y) ** 2);
            if (d < 100) nearBody = true;
          });
          touch.setReportVisible(nearBody);

          if (myRole === 'impostor' && local.killCooldownEnd) {
            touch.setKillOnCooldown(Date.now() < local.killCooldownEnd);
          }
        }
      }

      const hasInput = dx !== 0 || dy !== 0 || usePressed || killPressed || reportPressed;
      if (hasInput || true) { // always send to keep server in sync
        connection.sendInput({
          dx, dy,
          use: usePressed,
          kill: killPressed,
          report: reportPressed,
          vote: '',
          seq: ++inputSeq,
        });
      }
    }

    // Keep track of local ghost/role state
    if (currentState?.players) {
      const local = currentState.players.get(connection.sessionId);
      if (local) {
        if (local.role !== myRole || local.isGhost !== myIsGhost) {
          myRole = local.role;
          myIsGhost = local.isGhost;
          gameScene.setLocalRole(myRole, myIsGhost);
        }
      }
    }

    // Update task list checkmarks
    if (currentState?.phase === 'active' && myRole === 'crewmate') {
      const local = currentState.players?.get(connection.sessionId);
      if (local && local.tasksDone !== prevTasksDone) {
        prevTasksDone = local.tasksDone;
        updateTaskCheckmarks(myTasks, currentState.tasks);
      }
    }

    gameScene.update(currentState, app.ticker.deltaTime / 60);
  });
}

// ── Meeting UI helpers ─────────────────────────────────────────────────────────

function showRoleReveal(role: string) {
  const overlay = document.getElementById('role-reveal-overlay')!;
  const text = document.getElementById('role-reveal-text')!;
  if (role === 'impostor') {
    text.textContent = 'YOU ARE THE IMPOSTOR';
    text.style.color = '#ff4444';
    overlay.style.borderColor = '#ff4444';
  } else {
    text.textContent = 'YOU ARE A CREWMATE';
    text.style.color = '#44ff88';
    overlay.style.borderColor = '#44ff88';
  }
  overlay.style.display = 'flex';
  setTimeout(() => { overlay.style.display = 'none'; }, 4000);
}

function showMeetingDiscussion(data: { reporterName: string; bodyName: string }) {
  const overlay = document.getElementById('meeting-overlay')!;
  overlay.style.display = 'flex';

  const title = document.getElementById('meeting-title')!;
  title.textContent = data.bodyName === 'Emergency Button'
    ? `${data.reporterName} called a meeting!`
    : `${data.reporterName} reported ${data.bodyName}'s body!`;

  // Show discussion panel, hide others
  (document.getElementById('meeting-discussion') as HTMLElement).style.display = 'flex';
  (document.getElementById('meeting-voting') as HTMLElement).style.display = 'none';
  (document.getElementById('meeting-result') as HTMLElement).style.display = 'none';

  // Clear chat
  const chat = document.getElementById('meeting-chat')!;
  chat.innerHTML = '';

  // Populate quick phrase buttons
  const phrasesEl = document.getElementById('quick-phrases')!;
  phrasesEl.innerHTML = '';
  for (const phrase of QUICK_PHRASES) {
    const btn = document.createElement('button');
    btn.className = 'phrase-btn';
    btn.textContent = phrase;
    btn.addEventListener('click', () => {
      (window as any)._connection?.sendQuickPhrase(phrase);
    });
    phrasesEl.appendChild(btn);
  }

  // Hide task list panel during meeting
  const taskPanel = document.getElementById('task-list-panel');
  if (taskPanel) taskPanel.style.display = 'none';
}

function showMeetingVoting(state: any) {
  (document.getElementById('meeting-discussion') as HTMLElement).style.display = 'none';
  (document.getElementById('meeting-voting') as HTMLElement).style.display = 'flex';
  (document.getElementById('meeting-result') as HTMLElement).style.display = 'none';

  // Build player list
  const list = document.getElementById('voting-player-list')!;
  list.innerHTML = '';
  if (!state?.players) return;

  state.players.forEach((p: any, id: string) => {
    if (p.isGhost) return;
    const btn = document.createElement('button');
    btn.className = 'vote-btn';
    btn.textContent = p.name;
    btn.dataset.id = id;
    btn.addEventListener('click', () => {
      (window as any)._connection?.sendVote(id);
      list.querySelectorAll('.vote-btn').forEach((b) => (b as HTMLElement).style.opacity = '0.5');
      btn.style.opacity = '1';
      btn.style.borderColor = '#ffcc00';
    });
    list.appendChild(btn);
  });

  // Skip button
  const skip = document.createElement('button');
  skip.className = 'vote-btn vote-skip';
  skip.textContent = 'Skip Vote';
  skip.addEventListener('click', () => {
    (window as any)._connection?.sendVote('skip');
  });
  list.appendChild(skip);
}

function showVoteResult(data: { ejectedName: string; wasImpostor: boolean; ejectedRole: string }) {
  (document.getElementById('meeting-discussion') as HTMLElement).style.display = 'none';
  (document.getElementById('meeting-voting') as HTMLElement).style.display = 'none';
  const resultEl = document.getElementById('meeting-result') as HTMLElement;
  resultEl.style.display = 'flex';

  const text = document.getElementById('meeting-result-text')!;
  if (!data.ejectedName) {
    text.textContent = 'No one was ejected. (Tie)';
    text.style.color = '#aaaaaa';
  } else {
    const wasimp = data.wasImpostor;
    text.innerHTML = `<strong>${data.ejectedName}</strong> was ejected.<br>${wasimp ? 'They were The Impostor!' : 'They were a Crewmate.'}`;
    text.style.color = wasimp ? '#ff4444' : '#aaaaaa';
  }
}

function hideMeetingOverlay() {
  const overlay = document.getElementById('meeting-overlay');
  if (overlay) overlay.style.display = 'none';
}

function appendPhraseToChat(name: string, phrase: string) {
  const chat = document.getElementById('meeting-chat');
  if (!chat) return;
  const row = document.createElement('div');
  row.className = 'chat-row';
  row.innerHTML = `<span class="chat-name">${name}:</span> ${phrase}`;
  chat.appendChild(row);
  chat.scrollTop = chat.scrollHeight;
}

function populateTaskList(tasks: Array<{ id: string; name: string; room: string }>) {
  const list = document.getElementById('task-list-items');
  if (!list) return;
  list.innerHTML = '';
  for (const t of tasks) {
    const item = document.createElement('div');
    item.className = 'task-item';
    item.id = `task-${t.id}`;
    item.innerHTML = `<span class="task-check">○</span> ${t.name} <span class="task-room">${t.room}</span>`;
    list.appendChild(item);
  }
}

function showVentMenu(currentVentId: number, connections: Array<{ id: number; x: number; y: number }>) {
  // Build a simple DOM popup for vent selection
  let popup = document.getElementById('vent-popup');
  if (!popup) {
    popup = document.createElement('div');
    popup.id = 'vent-popup';
    popup.style.cssText = `
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      background: rgba(10,14,23,0.97); border: 2px solid #444; border-radius: 12px;
      padding: 16px; z-index: 200; color: #fff; min-width: 180px;
    `;
    document.body.appendChild(popup);
  }
  popup.innerHTML = `<div style="font-weight:bold;margin-bottom:8px;">Travel via vent:</div>`;
  for (const conn of connections) {
    const btn = document.createElement('button');
    btn.style.cssText = `display:block;width:100%;margin:4px 0;padding:8px;border-radius:6px;
      background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.2);color:#fff;cursor:pointer;`;
    btn.textContent = `Vent #${conn.id}`;
    btn.addEventListener('click', () => {
      (window as any)._connection?.sendVentTravel(conn.id);
      popup!.style.display = 'none';
    });
    popup.appendChild(btn);
  }
  const closeBtn = document.createElement('button');
  closeBtn.style.cssText = `display:block;width:100%;margin-top:8px;padding:6px;border-radius:6px;
    background:rgba(255,80,80,0.15);border:1px solid rgba(255,80,80,0.4);color:#ff8888;cursor:pointer;`;
  closeBtn.textContent = 'Stay here';
  closeBtn.addEventListener('click', () => { popup!.style.display = 'none'; });
  popup.appendChild(closeBtn);
  popup.style.display = 'block';
}

main().catch(console.error);

function updateTaskCheckmarks(
  tasks: Array<{ id: string; name: string; room: string }>,
  stateTasks: any,
) {
  for (const task of tasks) {
    const el = document.getElementById(`task-${task.id}`);
    if (!el) continue;
    const serverTask = stateTasks?.get(task.id);
    const done = serverTask?.done ?? false;
    el.classList.toggle('done', done);
    const checkEl = el.querySelector('.task-check');
    if (checkEl) checkEl.textContent = done ? '✓' : '○';
  }
}
