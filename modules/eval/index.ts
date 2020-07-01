import { Module, logger, Direction } from '../..';

/** Evalulate JavaScript. Because why not. */

export default class EvalModule extends Module {
  public name = 'eval';

  async _load(_reloading: boolean) {
    
  }

  async _unload(reloading: boolean) {}
}
