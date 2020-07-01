import MinecraftProxy from './proxy';

export interface CommandDescriptor {
  /** Name of the command */
  name: string;
  /** Description of the command, including help */
  description: string;
  /** Autocomplete graph, or null if not provided */
  autocomplete: CommandGraphNode | null;
  /** Handler for the command */
  handler: CommandHandler;
}

export class CommandContext {
  /**
   * Arguments passed to the command
   * NOTE: args[0] is the command name
   */
  public args: string[];
  /** Proxy instance the command was executed on */
  public proxy: MinecraftProxy

  /**
   * The constructor
   * @param args
   */
  constructor(args: string[], proxy: MinecraftProxy) {
    this.args = args;
    this.proxy = proxy;
  }

  reply(message: string | Record<string, any>) {
    if (typeof message === 'string') {
      this.proxy.injectClient('chat', {
        message: JSON.stringify({ text: message }),
        position: 1,
        sender: '00000000-0000-0000-0000-000000000000'
      });
    } else {
      this.proxy.injectClient('chat', {
        message: JSON.stringify(message),
        position: 1,
        sender: '00000000-0000-0000-0000-000000000000'
      });
    }
  }

  sendServer(message: string) {
    this.proxy.injectServer('chat', { message });
  }
}

// TODO: maybe make this async?
export type CommandHandler = (ctx: CommandContext) => any;

/** Represents a single command */
export class Command {
  /** Name of the command */
  public name: string;
  /** Description of the command, including help */
  description: string;
  /** Autocomplete graph, or null if not provided */
  autocomplete: CommandGraphNode | null;
  /** Handler for the command */
  handler: CommandHandler;
  /** Where the command is registered */
  public registry: CommandRegistry;
  /** Descriptor of the command */
  public descriptor: CommandDescriptor;

  /**
   * The constructor
   * @param registry
   * @param name
   */
  constructor(registry: CommandRegistry, descriptor: CommandDescriptor) {
    this.registry = registry;
    this.descriptor = descriptor;
    this.name = descriptor.name;
    this.description = descriptor.description;
    this.autocomplete = descriptor.autocomplete;
    this.handler = descriptor.handler;
  }

  /** Unregister the command */
  unregister() {
    this.registry.unregister(this);
  }
}

/** Represents a node in the command graph */
export class CommandGraphNode {

}

/**
 * Command autocomplete information. Blame Dinnerbone.
 * Reference: https://wiki.vg/Command_Data
 */
export class CommandGraph {

}

/** A registry for commands */
export class CommandRegistry {
  /** Registered commands */
  public commands = new Map<string, Command>();
  /** Associated proxy instance */
  public proxy: MinecraftProxy;

  /**
   * The constructor
   * @param prefix Command prefix to use
   */
  constructor(proxy: MinecraftProxy) {
    this.proxy = proxy;
  }

  /** Prefix for the command system */
  get prefix(): string {
    return this.proxy.config.commandPrefix;
  }

  /**
   * Register a new command
   * @param descriptor
   */
  register(descriptor: CommandDescriptor) {
    descriptor.name = descriptor.name.toLowerCase();
    if (this.commands.has(descriptor.name)) {
      throw new Error('command already exists');
    }
    let command = new Command(this, descriptor);
    this.commands.set(command.name, command);
    return command;
  }

  /**
   * Unregister a previously registered command
   * @param command
   */
  unregister(command: Command) {
    if (!this.commands.has(command.name)) {
      throw new Error('no such command');
    }
    this.commands.delete(command.name);
  }

  /**
   * Execute commands
   * @param message Message to process
   * @return Whether the message was a command
   */
  execute(message: string): boolean {
    if (!message.startsWith(this.prefix)) return false;
    let args = message.split(' ');
    args[0] = args[0].slice(this.prefix.length);
    let ctx = new CommandContext(args, this.proxy);
    let command = this.commands.get(args[0].toLowerCase());
    if (!command) {
      // TODO: maybe make this configurable?
      ctx.reply({
        color: 'red',
        text: '[proxy] Command not found'
      });
      return true;
    }
    command.handler(ctx);
    return true;
  }

  /**
   * Merge autocomplete data into existing command graph
   * @param graph
   */
  mergeCommandGraph(graph: CommandGraph) {
    if (!this.prefix.startsWith('/')) return; // nothing to do here
  }
}
