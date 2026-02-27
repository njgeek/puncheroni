import { Player, Task } from '../state/GameState';
import { MapSchema } from '@colyseus/schema';
import {
  TASK_DEFINITIONS, TASKS_PER_PLAYER,
  TASK_INTERACT_DURATION, TASK_INTERACT_RANGE,
} from '../../shared/constants';

export class TaskSystem {
  /** Create all task station entries in the tasks map. */
  initializeTasks(tasks: MapSchema<Task>) {
    tasks.clear();
    for (const def of TASK_DEFINITIONS) {
      const t = new Task();
      t.id = def.id;
      t.x = def.x;
      t.y = def.y;
      t.name = def.name;
      t.room = def.room;
      t.done = false;
      tasks.set(def.id, t);
    }
  }

  /**
   * Assign TASKS_PER_PLAYER random tasks to each crewmate.
   * Returns a map of sessionId → taskId[].
   */
  assignTasks(players: MapSchema<Player>): Map<string, string[]> {
    const result = new Map<string, string[]>();
    const allIds = TASK_DEFINITIONS.map(t => t.id);

    players.forEach((p: Player, id: string) => {
      if (p.role !== 'crewmate') return;
      const shuffled = [...allIds].sort(() => Math.random() - 0.5);
      const assigned = shuffled.slice(0, Math.min(TASKS_PER_PLAYER, shuffled.length));
      result.set(id, assigned);
      p.tasksTotal = assigned.length;
      p.tasksDone = 0;
    });

    return result;
  }

  /**
   * Called each tick when a player holds the USE key.
   * Returns the completed taskId if a task was finished, otherwise null.
   */
  processTaskInteraction(
    player: Player,
    assignedTaskIds: string[],
    tasks: MapSchema<Task>,
    deltaMs: number,
    progressMap: Map<string, number>,
  ): string | null {
    if (!player.alive || player.isGhost || player.role !== 'crewmate') return null;

    // Find the nearest assigned incomplete task within interaction range
    let nearestId: string | null = null;
    let nearestDist = TASK_INTERACT_RANGE + 1;

    for (const tid of assignedTaskIds) {
      const task = tasks.get(tid);
      if (!task || task.done) continue;
      const d = Math.sqrt((player.x - task.x) ** 2 + (player.y - task.y) ** 2);
      if (d < nearestDist) {
        nearestDist = d;
        nearestId = tid;
      }
    }

    if (!nearestId) {
      // Player not near any task — reset all their progress
      for (const tid of assignedTaskIds) {
        progressMap.delete(`${player.id}-${tid}`);
      }
      return null;
    }

    const key = `${player.id}-${nearestId}`;
    const prev = progressMap.get(key) ?? 0;
    const next = prev + deltaMs;

    if (next >= TASK_INTERACT_DURATION) {
      progressMap.delete(key);
      return nearestId;
    }

    progressMap.set(key, next);
    return null;
  }

  /** Get total and done task counts across all crewmates. */
  getTotalAndDone(players: MapSchema<Player>): { total: number; done: number } {
    let total = 0;
    let done = 0;
    players.forEach((p: Player) => {
      if (p.role !== 'crewmate') return;
      total += p.tasksTotal;
      done += p.tasksDone;
    });
    return { total, done };
  }
}
