import { Module } from '../module';
import { Direction } from '../hook';

/**
 * This is the module responsible for providing core functionality such as
 * commands. It should never be unloaded.
 */

export default class CoreModule extends Module {
  public name = 'core';

  async _load(_reloading: boolean) {
    this.registerHook(Direction.ClientToServer, 'chat', async event => {
      if (this.proxy.commandRegistry.execute(event.data.message)) {
        event.cancel();
      }
    });
    this.registerCommand({
      name: 'test',
      autocomplete: null,
      description: 'testing command lol',
      handler: ctx => ctx.reply('HI!!!!! :DDDD')
    });
  }

  async _unload(reloading: boolean) {
    // this will probably crash the entire system, but unloading the core module
    // would do so anyways
    if (!reloading) throw new Error('Cannot unload the core module!');
    // TODO: it is going to be very hard to make this reloadable
  }
}
