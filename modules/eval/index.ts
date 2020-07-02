import { Module } from '../..';
import { inspect } from 'util';
import { CommandNode } from '../..';

/** Evalulate JavaScript. Because why not. */

export default class EvalModule extends Module {
  public name = 'eval';

  async _load(_reloading: boolean) {
    this.registerCommand({
      name: 'eval',
      description: 'evaluate javascript on the proxy',
      autocomplete: new CommandNode('eval')
        .asLiteral()
        .defineChild(
          new CommandNode('code')
            .asArgument({
              parser: 'brigadier:string',
              properties: 2
            })),
      handler: ctx => {
        let code = ctx.args.slice(1).join(' ');
        let result: any;
        try {
          result = eval(code);
        } catch (err) {
          result = err;
        }
        result = inspect(result);
        ctx.reply(result);
      }
    });
  }

  async _unload(_reloading: boolean) {}
}
