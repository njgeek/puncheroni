import { MeetingState, Player, GameState } from '../state/GameState';
import { MapSchema } from '@colyseus/schema';
import { MEETING_DISCUSSION_TIME, MEETING_VOTE_TIME, SAFE_SPAWN_POINTS } from '../../shared/constants';

export class MeetingSystem {
  /** Transition the room to meeting phase. */
  startMeeting(state: GameState, reporterName: string, bodyName: string) {
    state.meeting.active = true;
    state.meeting.phase = 'discussion';
    state.meeting.reporterName = reporterName;
    state.meeting.bodyName = bodyName;
    state.meeting.timer = MEETING_DISCUSSION_TIME;
    state.meeting.ejectedName = '';
    state.meeting.ejectedWasImpostor = false;
    state.meeting.ejectedRole = '';

    // Clear all votes
    state.players.forEach((p: Player) => { p.votedFor = ''; });

    // Teleport all alive non-ghost players to spread-out spawn points
    let idx = 0;
    state.players.forEach((p: Player) => {
      if (!p.isGhost && p.alive) {
        const sp = SAFE_SPAWN_POINTS[idx % SAFE_SPAWN_POINTS.length];
        p.x = sp.x;
        p.y = sp.y;
        idx++;
      }
    });
  }

  /**
   * Called every tick during meeting phase.
   * Returns 'discussion_end' when discussion → voting,
   *         'voting_end' when voting is resolved,
   *         'result_end' when result display is done,
   *         or null.
   */
  tick(
    meeting: MeetingState,
    players: MapSchema<Player>,
    deltaMs: number,
  ): 'discussion_end' | 'voting_end' | 'result_end' | null {
    if (!meeting.active) return null;

    meeting.timer -= deltaMs / 1000;

    if (meeting.phase === 'discussion' && meeting.timer <= 0) {
      meeting.phase = 'voting';
      meeting.timer = MEETING_VOTE_TIME;
      return 'discussion_end';
    }

    if (meeting.phase === 'voting') {
      const allVoted = this.allAliveVoted(players);
      if (allVoted || meeting.timer <= 0) {
        this.resolveVotes(meeting, players);
        meeting.phase = 'result';
        meeting.timer = 5;
        return 'voting_end';
      }
    }

    if (meeting.phase === 'result' && meeting.timer <= 0) {
      return 'result_end';
    }

    return null;
  }

  /** Record a player's vote. Returns true if accepted. */
  processVote(
    meeting: MeetingState,
    voterId: string,
    targetId: string,
    players: MapSchema<Player>,
  ): boolean {
    if (meeting.phase !== 'voting') return false;
    const voter = players.get(voterId);
    if (!voter || voter.isGhost || !voter.alive) return false;
    if (voter.votedFor !== '') return false; // already voted
    voter.votedFor = targetId; // 'skip' is valid
    return true;
  }

  /** Tally votes and eject the plurality winner (if any). */
  resolveVotes(meeting: MeetingState, players: MapSchema<Player>) {
    const counts = new Map<string, number>();
    players.forEach((p: Player) => {
      if (!p.votedFor) return;
      counts.set(p.votedFor, (counts.get(p.votedFor) ?? 0) + 1);
    });

    let maxVotes = 0;
    let topId = '';
    let tied = false;

    counts.forEach((count, id) => {
      if (count > maxVotes) {
        maxVotes = count;
        topId = id;
        tied = false;
      } else if (count === maxVotes) {
        tied = true;
      }
    });

    // No ejection on tie, zero votes, or skip
    if (tied || maxVotes === 0 || topId === 'skip' || topId === '') {
      meeting.ejectedName = '';
      meeting.ejectedWasImpostor = false;
      meeting.ejectedRole = '';
      return;
    }

    const ejected = players.get(topId);
    if (!ejected) return;

    meeting.ejectedName = ejected.name;
    meeting.ejectedWasImpostor = ejected.role === 'impostor';
    meeting.ejectedRole = ejected.role;
    ejected.alive = false;
    ejected.isGhost = true;
  }

  /** Reset meeting state and clean up bodies. */
  endMeeting(state: GameState) {
    state.meeting.active = false;
    state.meeting.phase = '';
    state.bodies.clear();

    // Give ghost players a safe spawn position so they can wander
    state.players.forEach((p: Player) => {
      if (p.isGhost) {
        const sp = SAFE_SPAWN_POINTS[Math.floor(Math.random() * SAFE_SPAWN_POINTS.length)];
        p.x = sp.x;
        p.y = sp.y;
      }
    });
  }

  private allAliveVoted(players: MapSchema<Player>): boolean {
    let allVoted = true;
    players.forEach((p: Player) => {
      if (!p.isGhost && p.alive && p.votedFor === '') {
        allVoted = false;
      }
    });
    return allVoted;
  }
}
