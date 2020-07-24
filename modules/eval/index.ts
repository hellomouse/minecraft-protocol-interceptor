import { inspect } from 'util';
import * as vm from 'vm';
import { Module, CommandNode } from '../..';

const FORMAT_CHAR = '\u00a7'; // §
const FORMAT_CODES = {
  black: '0',
  darkBlue: '1',
  darkGreen: '2',
  darkAqua: '3',
  darkRed: '4',
  darkPurple: '5',
  gold: '6',
  gray: '7',
  darkGray: '8',
  blue: '9',
  green: 'a',
  aqua: 'b',
  red: 'c',
  lightPurple: 'd',
  yellow: 'e',
  white: 'f',
  obfuscated: 'k',
  bold: 'l',
  strikethrough: 'm',
  underline: 'n',
  italic: 'o',
  reset: 'r'
};

function formatMinecraft(text: string, color: keyof typeof FORMAT_CODES) {
  return `${FORMAT_CHAR}${FORMAT_CODES[color]}${text}${FORMAT_CHAR}${FORMAT_CODES.reset}`;
}

/** Evalulate JavaScript. Because why not. */

export default class EvalModule extends Module {
  public name = 'eval';
  public ctx: vm.Context | null = null;
  public statePreserveKeys: (keyof this)[] = ['ctx'];

  async _load(_reloading: boolean) {
    if (!this.ctx) {
      this.ctx = vm.createContext({
        require,
        proxy: this.proxy,
        getModule: this.getModule,
        evalModule: this
      }, { name: 'eval execution context' });
    }
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
          result = vm.runInContext(code, this.ctx!, {
            displayErrors: true,
            filename: '<eval>',
            timeout: 5000 // to prevent accidental infinite loops
          });
        } catch (err) {
          result = err;
        }
        // TODO: util.inspect() option 'stylize' is not public and should not be
        // used, however, there doesn't seem to be a better way to do this
        // see: https://github.com/nodejs/node/blob/master/lib/internal/util/inspect.js#L308
        // @ts-ignore
        result = inspect(result, {
          colors: false, // stylize only works when colors is false
          stylize(value: string, type: string) {
            switch (type) {
              case 'bigint': return formatMinecraft(value, 'gold');
              case 'boolean': return formatMinecraft(value, 'gold');
              case 'date': return formatMinecraft(value, 'lightPurple');
              case 'module': return formatMinecraft(value, 'underline');
              case 'name': return value;
              case 'null': return formatMinecraft(value, 'bold');
              case 'number': return formatMinecraft(value, 'gold');
              case 'regexp': return formatMinecraft(value, 'red');
              case 'special': return formatMinecraft(value, 'aqua');
              case 'string': return formatMinecraft(value, 'darkGreen');
              case 'symbol': return formatMinecraft(value, 'darkGreen');
              case 'undefined': return formatMinecraft(value, 'darkGray');
              default: return value;
            }
          }
        });

        if (result.length >= 10000) {
          // minecraft supports a maximum length of 262144 but anything above
          // 10k would probably overflow the chat buffer anyways
          result = `${formatMinecraft('Warning: output truncated', 'red')}\n${result.slice(0, 10000)}}`;
        }
        ctx.reply({
          text: '',
          extra: [
            {
              text: '',
              extra: [
                { text: 'eval> ', color: 'green' },
                { text: code },
                { text: '\n' }
              ],
              hoverEvent: {
                action: 'show_text',
                contents: { text: 'Input eval command' }
              },
              clickEvent: {
                action: 'suggest_command',
                value: `${this.proxy.config.commandPrefix}eval ${code}`
              }
            },
            { text: result }
          ]
        });
      }
    });
  }

  async _unload(_reloading: boolean) {}
}
