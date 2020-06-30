import { EventEmitter } from 'events';
import * as path from 'path';
import mc from 'minecraft-protocol';
import { Hooks, Direction } from './hook';
import { CommandRegistry } from './command';
import { ModuleRegistry } from './module';
import CoreModule from './core-module';
import logger from './logger';

const PACKET_DEBUG = process.env.PROXY_DEBUG === '1';
const PACKET_DEBUG_TYPES = new Set();
if (PACKET_DEBUG && process.env.PROXY_DEBUG_TYPES) {
  for (let type of process.env.PROXY_DEBUG_TYPES.split(',')) {
    PACKET_DEBUG_TYPES.add(type);
  }
}
const PACKET_DEBUG_ALL = PACKET_DEBUG_TYPES.size === 0;
function shouldDebugType(type: string) {
  return PACKET_DEBUG && (PACKET_DEBUG_ALL || PACKET_DEBUG_TYPES.has(type));
}

export interface ProxyConfiguration {
  /** Proxy listen port */
  proxyPort?: number;
  /** Remote server address */
  serverAddress: string;
  /** Remote server port */
  serverPort?: number;
  /** Protocol version */
  version?: string;
  /** Proxy MotD */
  motd?: string;
  /** Username for connecting to server */
  username: string;
  /** Password for connecting to server */
  password?: string | null;
  /** Access token for authenticating to server */
  accessToken?: string | null;
  /** Client token for authenticating to server */
  clientToken?: string | null;
  /** Session information for authenticating to server */
  session?: any;
  /** Directory to load modules from */
  modulesDir?: string | null;
  /** Which modules should be loaded */
  modules?: string[];
  /** Module configuration */
  moduleConfig?: Record<string, any>;
}

type ProxyConfigurationNonOptional = Required<ProxyConfiguration>

/** Represents a proxy instance */
export default class MinecraftProxy extends EventEmitter {
  /** Local proxy server */
  public server: mc.Server;
  /** Client for connecting to remote server */
  public connectClient: mc.Client | null = null;
  /** Client currently connected to the proxy server */
  public proxyClient: mc.Client | null = null;
  /** Proxy options */
  public config: ProxyConfigurationNonOptional;
  /** Hook instance */
  public hooks: Hooks;
  /** Command registry instance */
  public commandRegistry: CommandRegistry;
  /** Module registery instance */
  public moduleRegistry: ModuleRegistry;
  /** Core module instance */
  public coreModule: CoreModule | null = null;

  /**
   * The constructor
   * @param config
   */
  constructor(config: ProxyConfiguration) {
    super();
    this.config = this.processConfig(config);
    this.server = mc.createServer({
      'online-mode': false,
      'port': this.config.proxyPort,
      'motd': this.config.motd,
      'maxPlayers': 1, // TODO: disconnects aren't fired properly
      'version': config.version
    });
    this.hooks = new Hooks();
    this.commandRegistry = new CommandRegistry();
    this.moduleRegistry = new ModuleRegistry(this);
    this._init();
  }

  /** Initialize the proxy server */
  private async _init() {
    // WARNING: RELATIVE PATHS WILL BE INTERPRETED RELATIVE TO module.js
    await this.moduleRegistry.importFromPath('./core-module');
    this.coreModule = await this.moduleRegistry.load('core');

    if (this.config.modulesDir) {
      await this.moduleRegistry.importAllFromDirectory(this.config.modulesDir);
    }
    // this will throw away module load errors, but they are logged by the
    // module loader anyways
    await Promise.all(this.config.modules!
      .map(async (moduleName: string) => {
        try {
          await this.moduleRegistry.load(moduleName);
        } catch (err) {
          logger.warn(`module [${moduleName}] failed to load`, err);
        }
      })
    );

    this.server.on('login', this._connectionHandler.bind(this));
  }

  /** Proxy connection handler */
  private async _connectionHandler(client: mc.Client): Promise<void> {
    // TODO: hook these or spam more configuration
    logger.info(`connection received from ${client.socket.remoteAddress}`);
    if (this.proxyClient) {
      client.end('too many connections');
      return;
    }
    this.proxyClient = client;
    this.proxyClient!.on('end', () => {
      this.hooks.execute(Direction.Local, 'clientDisconnected', null);
      this.proxyClient = null;
    });
    // TODO: debug purposes
    this.proxyClient!.once('error', (...args) => {
      logger.debug('proxyClient emit error event', ...args);
    });
    this.proxyClient!.once('end', (...args) => {
      logger.debug('proxyClient emit end event', ...args);
    });
    if (!this.connectClient) {
      try {
        await this.doConnect();
      } catch (err) {
        logger.warn('failed in proxy connect', err);
        this.connectClient = null;
        return;
      }
      this.connectClient!.on('end', () => {
        // TODO: hook these
        this.hooks.execute(Direction.Local, 'serverDisconnected', null);
        this.connectClient = null;
      });
    }
    this.proxyClient!.on('packet', async (data, meta) => {
      if (shouldDebugType(meta.name)) {
        logger.silly('client -> server type %s:', meta.name, data);
      }
      if (!await this.hooks.execute(Direction.ClientToServer, meta.name, data)) {
        return;
      }
      if (this.connectClient) this.connectClient.write(meta.name, data);
    });
  }

  public injectClient(type: string, data: any) {
    if (shouldDebugType(type)) {
      logger.silly('inject -> client type %s:', type, data);
    }
    if (this.proxyClient) this.proxyClient.write(type, data);
  }

  public injectServer(type: string, data: any) {
    if (shouldDebugType(type)) {
      logger.silly('inject -> server type %s:', type, data);
    }
    if (this.connectClient) this.connectClient.write(type, data);
  }

  /** Connect the proxy to the remote server */
  doConnect(): Promise<void> {
    return new Promise((resolve, reject) => {
      logger.info('connecting to remote server');
      this.connectClient = mc.createClient({
        username: this.config.username,
        password: this.config.password ?? undefined,
        accessToken: this.config.accessToken ?? undefined,
        clientToken: this.config.clientToken ?? undefined,
        // @ts-ignore no clue why this isn't defined
        session: this.config.session,
        host: this.config.serverAddress,
        port: this.config.serverPort,
        version: this.config.version
      });
      this.connectClient.on('state', (newState: string) => {
        // wait for connection to be ready
        if (newState === 'play') {
          this.connectClient!.on('packet', async (data, meta) => {
            if (shouldDebugType(meta.name)) {
              logger.silly('server -> client type %s:', meta.name, data);
            }
            if (!await this.hooks.execute(Direction.ServerToClient, meta.name, data)) {
              return;
            }
            if (this.proxyClient) this.proxyClient.write(meta.name, data);
          });
        }
      });
      let listener = () => {
        resolve();
        removeListeners();
      };
      let failListener = (reason: string) => {
        console.error('failed to connect to server:', reason);
        reject(new Error('connection failed'));
        removeListeners();
      };
      let removeListeners = () => {
          this.connectClient?.removeListener('login', listener);
          // this.connectClient?.removeListener('error', failListener);
          this.connectClient?.removeListener('end', failListener);
      };
      this.connectClient!.on('login', listener);
      // this.connectClient!.on('error', failListener);
      this.connectClient!.on('end', failListener);
      // TODO: debug purposes
      this.connectClient!.once('error', (...args) => {
        logger.debug('connectClient emit error event', ...args);
      });
      this.connectClient!.once('end', (...args) => {
        logger.debug('connectClient emit end event', ...args);
      });
    });
  }

  /**
   * Process proxy configuration, including setting default values
   * @param config
   */
  public processConfig(config: ProxyConfiguration): ProxyConfigurationNonOptional {
    let nonOptionalConfig: ProxyConfigurationNonOptional = Object.assign({
      proxyPort: 25565,
      version: '1.16.1',
      motd: 'Minecraft protocol interceptor',
      serverPort: 25565,
      modules: [],
      moduleConfig: {},
      modulesDir: './build/modules',
      password: null,
      clientToken: null,
      accessToken: null,
      session: null
    }, config);
    nonOptionalConfig.modulesDir = path.resolve(nonOptionalConfig.modulesDir!);
    return nonOptionalConfig;
  }

  public reloadConfig(newConfig: ProxyConfiguration) {
    this.config = this.processConfig(newConfig);
    this.emit('reloadConfiguration');
  }
}
