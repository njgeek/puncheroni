import { Scoreboard } from '../ui/Scoreboard';

export class ResultScene {
  private scoreboard: Scoreboard;

  constructor() {
    this.scoreboard = new Scoreboard();
  }

  show(data: any) {
    this.scoreboard.show(data);
  }

  hide() {
    this.scoreboard.hide();
  }
}
