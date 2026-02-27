import { Player, DeadBody } from '../state/GameState';
import { MapSchema } from '@colyseus/schema';
import { KILL_RANGE, KILL_COOLDOWN, VENT_RANGE, REPORT_RANGE, VENT_GRAPH } from '../../shared/constants';

type VentNode = { id: number; x: number; y: number; connections: number[] };

export class KillSystem {
  /** Impostor kills nearest in-range crewmate. Returns true on success. */
  processKill(
    killer: Player,
    players: MapSchema<Player>,
    bodies: MapSchema<DeadBody>,
    now: number,
  ): boolean {
    if (killer.role !== 'impostor') return false;
    if (killer.isGhost || !killer.alive) return false;
    if (killer.inVent) return false;
    if (now < killer.killCooldownEnd) return false;

    let target: Player | null = null;
    let minDist = KILL_RANGE;

    players.forEach((p: Player) => {
      if (p.id === killer.id) return;
      if (p.role === 'impostor') return;
      if (!p.alive || p.isGhost) return;
      const dist = this.dist(killer.x, killer.y, p.x, p.y);
      if (dist < minDist) {
        minDist = dist;
        target = p;
      }
    });

    if (!target) return false;

    // Kill
    (target as Player).alive = false;
    (target as Player).isGhost = true;

    const body = new DeadBody();
    body.id = (target as Player).id;
    body.x = (target as Player).x;
    body.y = (target as Player).y;
    body.playerName = (target as Player).name;
    bodies.set(body.id, body);

    killer.killCooldownEnd = now + KILL_COOLDOWN;
    return true;
  }

  /** Returns nearest body within REPORT_RANGE if one exists. */
  processReport(reporter: Player, bodies: MapSchema<DeadBody>): DeadBody | null {
    if (!reporter.alive || reporter.isGhost) return null;

    let found: DeadBody | null = null;
    bodies.forEach((body: DeadBody) => {
      if (found) return;
      if (this.dist(reporter.x, reporter.y, body.x, body.y) <= REPORT_RANGE) {
        found = body;
      }
    });
    return found;
  }

  /**
   * Impostor requests to enter/exit a vent.
   * Returns { entered: true, ventId, connections } on enter,
   *         { entered: false } on exit, or null if not near any vent.
   */
  processVentUse(
    player: Player,
  ): { entered: boolean; ventId?: number; connections?: VentNode[] } | null {
    if (player.role !== 'impostor' || player.isGhost) return null;

    if (player.inVent) {
      player.inVent = false;
      return { entered: false };
    }

    const nearest = this.nearestVent(player.x, player.y);
    if (!nearest || this.dist(player.x, player.y, nearest.x, nearest.y) > VENT_RANGE) {
      return null;
    }

    player.inVent = true;
    player.x = nearest.x;
    player.y = nearest.y;

    const connections = nearest.connections.map(cid => VENT_GRAPH.find(v => v.id === cid)!);
    return { entered: true, ventId: nearest.id, connections };
  }

  /** Teleport player from current vent to a connected vent. */
  travelVent(player: Player, targetVentId: number): boolean {
    if (!player.inVent || player.role !== 'impostor') return false;

    const currentVent = this.nearestVent(player.x, player.y);
    if (!currentVent) return false;
    if (!currentVent.connections.includes(targetVentId)) return false;

    const dest = VENT_GRAPH.find(v => v.id === targetVentId);
    if (!dest) return false;

    player.x = dest.x;
    player.y = dest.y;
    return true;
  }

  private nearestVent(x: number, y: number): VentNode | null {
    let nearest: VentNode | null = null;
    let minDist = VENT_RANGE + 1;
    for (const v of VENT_GRAPH) {
      const d = this.dist(x, y, v.x, v.y);
      if (d < minDist) { minDist = d; nearest = v; }
    }
    return nearest;
  }

  private dist(ax: number, ay: number, bx: number, by: number): number {
    return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);
  }
}
