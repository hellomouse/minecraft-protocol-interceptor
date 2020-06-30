import { Module, logger, Direction } from '../..';

/**
 * Testing module. Do not treat seriously.
 */

export default class TestModule extends Module {
  public name = 'test';

  async _load(_reloading: boolean) {
    logger.info('test module config', this.config.asdf);
    this.registerHook(Direction.ClientToServer, 'chat', async event => {
      let message = event.data.message;
      this.proxy.injectServer('chat', { message: `[proxy] chat: ${message}` });
      this.proxy.injectClient('chat', {
        message: JSON.stringify({
          extra: [{ text: `[proxy] chat: ${message}` }],
          text: ''
        }),
        position: 0,
        sender: '00000000-0000-0000-0000-000000000000'
      });
    });
  }

  async _unload(reloading: boolean) {
    logger.info('unloading');
  }
}
