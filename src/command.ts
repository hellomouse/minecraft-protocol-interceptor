// @ts-ignore unfortunately this module does not have types
import Deque = require('collections/deque');
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

/** I apologize */
export interface SerializedCommandNode {
  /* eslint-disable @typescript-eslint/naming-convention,camelcase */
  flags: {
    unused: number;
    has_custom_suggestions: number;
    has_redirect_node: number;
    has_command: number;
    command_node_type: number;
  };
  children: number[]; // NODE POINTER
  redirectNode?: number; // NODE POINTER
  extraNodeData?: string | {
    name: string;
    parser: string;
    properties?: any; // this could be literally anything
    suggests?: string;
  };
  /* eslint-enable @typescript-eslint/naming-convention,camelcase */
}

/** Type of command node */
export enum CommandNodeType {
  /** Node is root of command tree */
  Root = 0,
  /** Node is a literal value (not specified by user) */
  Literal = 1,
  /** Node is a user-specified argument to the command */
  Argument = 2
}

/** Flags of command node */
export interface CommandNodeFlags {
  /** Node type */
  nodeType: CommandNodeType;
  /**
   * Whether or not the command, up to the current node in the graph, is
   * executable
   */
  isExecutable: boolean;
  /** If the node redirects to another node */
  hasRedirect: boolean;
  /** Whether or not the argument has custom suggestions */
  hasCustomSuggestions: boolean;
}

export enum CommandNodeSuggestions {
  /** Ask server for suggestions by tab_complete packet */
  AskServer = 'minecraft:ask_server',
  /** Suggest all availble recipes */
  Recipes = 'minecraft:all_recipes',
  /** Suggest all available sounds */
  Sounds = 'minecraft:available_sounds',
  /** Suggest all summonable entities */
  Entities = 'minecraft:summonable_entites'
}

/** Represents a node in the command graph */
export class CommandGraphNode {
  /** Flags of this node */
  public flags: CommandNodeFlags = {
    nodeType: CommandNodeType.Literal,
    isExecutable: true,
    hasRedirect: false,
    hasCustomSuggestions: false
  };
  /** Children nodes of this node */
  public children = new Set<CommandGraphNode>();
  /** Redirect node, if any */
  public redirectNode: CommandGraphNode | null = null;
  /** Node name, if the node is an argument or literal type */
  public name?: string;
  /** Custom parser for this node */
  public parser?: string;
  /** Any parser properties */
  public properties?: any;
  /** Suggestions provider for this node */
  public suggestionType?: CommandNodeSuggestions;
  /** Node id when serializing */
  public _serializedId: number | null = null;
  /** Temporary redirect node id when deserializing */
  public _serializedRedirectNodeId: number | null = null;
  /** Temporary children node ids when deserializing */
  public _serializedChildrenIds: number[] | null = null;

  /**
   * The constructor
   * @param name
   */
  constructor(name?: string) {
    this.name = name;
  }

  setName(name?: string): this {
    this.name = name;
    return this;
  }

  setParser(parser?: string): this {
    this.parser = parser;
    return this;
  }

  setProperties(properties?: any): this {
    this.properties = properties;
    return this;
  }

  setFlags(flags: CommandNodeFlags): this {
    this.flags = flags;
    return this;
  }

  asLiteral(): this {
    this.parser = undefined;
    this.properties = undefined;
    this.suggestionType = undefined;
    this.flags.hasCustomSuggestions = false;
    this.flags.nodeType = CommandNodeType.Literal;
    return this;
  }

  asArgument({ parser, properties, suggestionType }: {
    parser?: string,
    properties?: any,
    suggestionType?: CommandNodeSuggestions
  }): this {
    if (suggestionType) this.flags.hasCustomSuggestions = true;
    this.suggestionType = suggestionType;
    this.properties = properties;
    this.parser = parser;
    this.flags.nodeType = CommandNodeType.Argument;
    return this;
  }

  defineChild(child: CommandGraphNode): this {
    this.children.add(child);
    return this;
  }

  setRedirect(child: CommandGraphNode | null): this {
    this.redirectNode = child;
    if (child) this.flags.hasRedirect = true;
    return this;
  }

  /**
   * Used internally for first-stage serialization of graph to array
   * @return Serialized command node, without ids
   */
  _serialize(): SerializedCommandNode {
    /* eslint-disable @typescript-eslint/naming-convention,camelcase */
    let extraNodeData;
    switch (this.flags.nodeType) {
      case CommandNodeType.Root: {
        extraNodeData = undefined;
        break;
      }
      case CommandNodeType.Literal: {
        if (!this.name) {
          throw new Error('name required with CommandNodeType.Literal');
        }
        extraNodeData = this.name;
        break;
      }
      case CommandNodeType.Argument: {
        if (!this.name || !this.parser) {
          throw new Error('name and parser required with CommandNodeType.Argument');
        }
        extraNodeData = {
          name: this.name,
          parser: this.parser,
          properties: this.properties,
          suggests: this.suggestionType
        };
        break;
      }
    }
    return {
      children: [], // to be written later
      flags: {
        unused: 0,
        has_custom_suggestions: Number(this.flags.hasCustomSuggestions),
        has_redirect_node: Number(this.flags.hasRedirect),
        has_command: Number(this.flags.isExecutable),
        command_node_type: this.flags.nodeType
      },
      extraNodeData,
      redirectNode: undefined // to be written later
    };
    /* eslint-enable @typescript-eslint/naming-convention,camelcase */
  }

  /**
   * Used internally after serialization to write node ids
   * @param serialized
   */
  _serializeFinal(serialized: SerializedCommandNode) {
    if (this.redirectNode) {
      serialized.redirectNode = this.redirectNode._serializedId ?? undefined;
    }
    for (let child of this.children) {
      serialized.children.push(child._serializedId!);
    }
  }

  /**
   * Used internally for first-stage deserialization of graph from array
   * @param serialized
   */
  static _deserialize(serialized: SerializedCommandNode) {
    let instance = new this();
    instance.flags = {
      hasCustomSuggestions: Boolean(serialized.flags.has_custom_suggestions),
      hasRedirect: Boolean(serialized.flags.has_redirect_node),
      isExecutable: Boolean(serialized.flags.has_command),
      nodeType: serialized.flags.command_node_type as CommandNodeType
    };
    if (serialized.extraNodeData) {
      if (typeof serialized.extraNodeData === 'string') {
        instance.name = serialized.extraNodeData;
      } else {
        instance.name = serialized.extraNodeData.name;
        instance.parser = serialized.extraNodeData.parser;
        instance.properties = serialized.extraNodeData.properties;
        instance.suggestionType = serialized.extraNodeData.suggests as CommandNodeSuggestions;
      }
    }
    instance._serializedRedirectNodeId = serialized.redirectNode ?? null;
    instance._serializedChildrenIds = serialized.children;
    return instance;
  }

  /**
   * Used internally after deserialization of nodes to rehydrate links
   * @param nodes
   */
  _deserializeFinal(nodes: CommandGraphNode[]) {
    if (this._serializedRedirectNodeId) {
      this.redirectNode = nodes[this._serializedRedirectNodeId];
      this._serializedRedirectNodeId = null;
    }
    for (let id of this._serializedChildrenIds!) {
      this.children.add(nodes[id]);
    }
    this._serializedChildrenIds = null;
  }
}

/**
 * Command autocomplete information. Blame Dinnerbone.
 * Reference: https://wiki.vg/Command_Data
 */
export class CommandGraph {
  /** Root node of the command graph */
  public root: CommandGraphNode | null = new CommandGraphNode()
    .setFlags({
      nodeType: CommandNodeType.Root,
      hasCustomSuggestions: false,
      hasRedirect: false,
      isExecutable: false
    });

  /**
   * Serialize the current graph into an array
   * @return Serialized graph
   */
  serialize(): SerializedCommandNode[] {
    let unserialized: CommandGraphNode[] = [];
    let queue: any = new Deque();
    queue.unshift(this.root);
    while (queue.length) {
      let node: CommandGraphNode = queue.pop();
      unserialized.push(node);
      // visit children
      for (let child of node.children) queue.unshift(child);
      // visit redirect node, if exists
      if (node.redirectNode) queue.unshift(node.redirectNode);
    }
    // give ids to each node
    for (let i = 0; i < unserialized.length; i++) {
      unserialized[i]._serializedId = i;
    }
    // create serialized base
    let serialized = unserialized.map(node => node._serialize());
    // rewrite links
    for (let i = 0; i < unserialized.length; i++) {
      unserialized[i]._serializeFinal(serialized[i]);
    }
    return serialized;
  }

  /**
   * Deserialize command graph from array
   * @param serialized
   */
  deserialize(serialized: SerializedCommandNode[], root: number) {
    let deserialized = serialized.map(node => CommandGraphNode._deserialize(node));
    for (let node of deserialized) node._deserializeFinal(deserialized);
    this.root = deserialized[root];
  }
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
    if (
      command.autocomplete?.name &&
      this.prefix.startsWith('/') &&
      !command.autocomplete.name.startsWith(this.prefix.slice(1))
    ) {
      command.autocomplete.name = this.prefix.slice(1) + command.autocomplete.name;
    }
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
   * Get list of autocomplete nodes
   * @param graph
   */
  getAutocompleteNodes(): Set<CommandGraphNode> {
    if (!this.prefix.startsWith('/')) return new Set(); // nothing to do here
    let out = new Set<CommandGraphNode>();
    for (let command of this.commands.values()) {
      if (command.autocomplete) {
        out.add(command.autocomplete);
      }
    }
    return out;
  }
}
