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

}

export type CommandHandler = (ctx: CommandContext) => void;

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

  /**
   * Register a new command
   * @param descriptor
   */
  register(descriptor: CommandDescriptor) {
    if (this.commands.has(descriptor.name)) {
      throw new Error('command already exists');
    }
    let command = new Command(this, descriptor);
    this.commands.set(command.name, command);
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
   * Merge autocomplete data into existing command graph
   * @param graph
   */
  mergeCommandGraph(graph: CommandGraph) {

  }
}
