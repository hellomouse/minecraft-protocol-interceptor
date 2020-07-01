import { Module } from '../module';
import { Direction } from '../hook';
import logger from '../logger';
import { CommandGraphNode, SerializedCommandNode, CommandGraph } from '../command';

/**
 * This is the module responsible for providing core functionality such as
 * commands. It should never be unloaded.
 */

/**
 * Convert a javascript integer (53 bits) to two 32-bit numbers
 * @param n
 * @return [most significant (64 - 53) bits, least significant 32 bits]
 */
function to64BitNumber(n: number): [number, number] {
  return [n & ((2 ** 53 - 1) - (2 ** 32 - 1)), n & (2 ** 32 - 1)];
}

export default class CoreModule extends Module {
  /** Module name */
  public name = 'core';

  /** Client to Proxy keep-alive timeout */
  public clientKeepAliveTimeout: NodeJS.Timeout | null = null;
  /** Interval for proxy to send proxy to client keepalive */
  public clientKeepAliveCheckInterval: NodeJS.Timeout | null = null;
  /** Last sent proxy to client keepalive value  */
  public clientKeepAliveLastValue: [number, number] | null = null;
  /** Proxy to Server keep-alive timeout */
  public serverKeepAliveTimeout: NodeJS.Timeout | null = null;

  /** Commands declared by the server */ // TODO: this probably doesn't need to exist
  public serverDeclaredCommands: SerializedCommandNode[] | null = null;
  /** Current command graph */
  public commandGraph: CommandGraph | null = null;
  /** Nodes regsitered in the command graph belonging to local commands */
  public localCommandNodes = new Set<CommandGraphNode>();

  // if this works color me surprised
  public statePreserveKeys: (keyof this)[] = [
    'clientKeepAliveTimeout',
    'clientKeepAliveCheckInterval',
    'clientKeepAliveLastValue',
    'serverKeepAliveTimeout',
    'serverDeclaredCommands',
    'commandGraph',
    'localCommandNodes'
  ];

  /** Update the command graph with local commands */
  updateCommandGraph() {
    if (!this.commandGraph) return; // nothing to do
    if (!this.commandGraph.root) throw new Error('graph has no root?');
    for (let node of this.localCommandNodes) {
      this.commandGraph.root.children.delete(node);
    }
    this.localCommandNodes = this.proxy.commandRegistry.getAutocompleteNodes();
    for (let node of this.localCommandNodes) {
      this.commandGraph.root.children.add(node);
    }
    logger.silly('updated command graph: %d local commands, %d remote commands',
      this.localCommandNodes.size,
      this.commandGraph.root.children.size - this.localCommandNodes.size);
  }

  async _load(_reloading: boolean) {
    // register command handler
    this.registerHook(Direction.ClientToServer, 'chat', async event => {
      if (this.proxy.commandRegistry.execute(event.data.message)) {
        event.cancel();
      }
    });

    this.registerCommand({
      name: 'test',
      autocomplete: new CommandGraphNode('test').asLiteral(),
      description: 'testing command lol',
      handler: ctx => ctx.reply('HI!!!!! :DDDD')
    });

    this.registerHook(Direction.Local, 'clientConnected', async _event => {
      // register keepalive handlers
      if (this.clientKeepAliveTimeout) {
        // TODO: debugging purposes
        logger.error('clientKeepAliveTimeout was not null when client connected?');
        clearTimeout(this.clientKeepAliveTimeout);
        this.clientKeepAliveTimeout = null;
      }
      if (this.clientKeepAliveCheckInterval) {
        logger.error('clientKeepAliveCheckInterval was not null when client connected?');
        clearInterval(this.clientKeepAliveCheckInterval);
        this.clientKeepAliveCheckInterval = null;
      }
      this.clientKeepAliveCheckInterval = setInterval(() => {
        // notchian server sends keepalive to client every 15 seconds
        this.clientKeepAliveLastValue = to64BitNumber(Date.now());
        logger.silly('sending keep_alive to client', this.clientKeepAliveLastValue);
        this.proxy.injectClient('keep_alive', { keepAliveId: this.clientKeepAliveLastValue });
        this.clientKeepAliveTimeout = setTimeout(() => {
          logger.warn('client timed out');
          this.proxy.proxyClient?.end('Timed out');
          this.clientKeepAliveTimeout = null;
          this.clientKeepAliveLastValue = null;
        }, 20 * 1000);
      }, 15 * 1000);

      // if we have a command graph, send it
      if (this.commandGraph) {
        this.proxy.injectClient('declare_commands', {
          nodes: this.commandGraph.serialize(),
          rootIndex: 0
        });
      }
    });
    this.registerHook(Direction.Local, 'clientDisconnected', async _event => {
      // keepalive handlers
      if (this.clientKeepAliveCheckInterval) {
        clearInterval(this.clientKeepAliveCheckInterval);
        this.clientKeepAliveCheckInterval = null;
      }
      if (this.clientKeepAliveTimeout) {
        clearTimeout(this.clientKeepAliveTimeout);
        this.clientKeepAliveTimeout = null;
      }
      this.clientKeepAliveLastValue = null;
    });
    this.registerHook(Direction.Local, 'serverConnected', async _event => {
      // keepalive handlers
      if (this.serverKeepAliveTimeout) {
        logger.warn('serverKeepAliveTimeout was not null when connected to server?');
        clearTimeout(this.serverKeepAliveTimeout);
        this.serverKeepAliveTimeout = null;
      }
      this.serverKeepAliveTimeout = setTimeout(() => {
        logger.warn('server connection timed out');
        this.proxy.connectClient?.end('');
        this.serverKeepAliveTimeout = null;
      }, 30 * 1000);
    });
    this.registerHook(Direction.Local, 'serverDisconnected', async _event => {
      // keepalive handlers
      if (this.serverKeepAliveTimeout) {
        clearTimeout(this.serverKeepAliveTimeout);
        this.serverKeepAliveTimeout = null;
      }

      // reset local command graph
      this.commandGraph = null;
      this.localCommandNodes.clear();
    });
    this.registerHook(Direction.ClientToServer, 'keep_alive', async event => {
      // I WILL LOG EVERYTHING AND YOU WILL NOT STOP ME
      logger.silly('received keep_alive response from client', event.data);
      if (this.clientKeepAliveTimeout) {
        clearTimeout(this.clientKeepAliveTimeout);
        this.clientKeepAliveTimeout = null;
      }
      let currentValue = event.data.keepAliveId;
      let lastValue = this.clientKeepAliveLastValue;
      if (lastValue) {
        if (lastValue[0] === currentValue[0] && lastValue[1] === currentValue[1]) {
          // all is fine
        } else {
          logger.warn('received different keep_alive value from client than what was sent',
            lastValue, currentValue);
        }
      } else {
        logger.warn('received keep_alive from client but server did not send one?');
      }
      this.clientKeepAliveLastValue = null;
      event.cancel();
    });
    this.registerHook(Direction.ServerToClient, 'keep_alive', async event => {
      logger.silly('responding to keep_alive from server', event.data);
      this.proxy.injectServer('keep_alive', event.data);
      this.serverKeepAliveTimeout?.refresh();
      event.cancel();
    });

    this.registerHook(Direction.ServerToClient, 'declare_commands', async event => {
      // merge local command graph with server-side graph and send to client
      // this is for autocomplete
      // is this way too much effort for just autocomplete? yes
      logger.silly('processing command graph from server');
      this.commandGraph = new CommandGraph();
      this.commandGraph.deserialize(event.data.nodes, event.data.rootIndex);
      this.localCommandNodes.clear();
      this.updateCommandGraph();
      event.cancel();
      this.proxy.injectClient('declare_commands', {
        nodes: this.commandGraph.serialize(),
        rootIndex: 0
      });
    });
  }

  async _unload(reloading: boolean) {
    // this will probably crash the entire system, but unloading the core module
    // would do so anyways
    if (!reloading) throw new Error('Cannot unload the core module!');
    // TODO: it is going to be very hard to make this reloadable
  }
}
