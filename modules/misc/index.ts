import { Module, CommandNode } from '../..';

/** Miscellaneous commands and utilities */

export default class MiscModule extends Module {
  public name = 'misc';

  async _load(_reloading: boolean) {
    this.registerCommand({
      name: 'server',
      description: 'Set which server the proxy will connect to',
      autocomplete: new CommandNode('server')
        .asLiteral()
        .setExecutable(false)
        .defineChild(new CommandNode('new-server')
          .asArgument({
            parser: 'brigadier:string',
            properties: 0
          })),
      handler: async ctx => {
        let target = ctx.args[1];
        if (!target) {
          ctx.reply({ color: 'red', text: 'No server specified' });
          return;
        }
        let [server, portString] = target.split(':');
        let port: number;
        if (portString) {
          port = +portString;
          if (Number.isNaN(port)) {
            ctx.reply({ color: 'red', text: 'Invalid port' });
            return;
          }
        } else port = 25565;
        this.proxy.config.serverAddress = server;
        this.proxy.config.serverPort = port;
        this.proxy.kickClient('[proxy] New server set, please reconnect');
        this.proxy.disconnectServer();
      }
    });
  }

  async _unload(_reloading: boolean) {}
}
