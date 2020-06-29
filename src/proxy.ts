import { EventEmitter } from 'events';
import mc, { states } from 'minecraft-protocol';

interface ProxyOptions {
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
  password?: string;
  /** Access token for authenticating to server */
  accessToken?: string;
  /** Client token for authenticating to server */
  clientToken?: string;
  /** Session information for authenticating to server */
  session?: any;
}

/** Represents a proxy instance */
export default class MinecraftProxy extends EventEmitter {
  /** Local proxy server */
  public server: mc.Server;
  /** Client for connecting to remote server */
  public connectClient: mc.Client | null = null;
  /** Client currently connected to the proxy server */
  public proxyClient: mc.Client | null = null;
  /** Proxy options */
  public opts: ProxyOptions;

  /**
   * The constructor
   * @param opts
   */
  constructor(opts: ProxyOptions) {
    super();
    opts = Object.assign({
      proxyPort: 25565,
      version: '1.16.1',
      motd: 'Minecraft protocol interceptor',
      serverPort: 25565
    }, opts);
    this.opts = opts;
    this.server = mc.createServer({
      'online-mode': false,
      'port': opts.proxyPort,
      'motd': opts.motd,
      'maxPlayers': 5, // TODO: disconnects aren't fired properly
      'version': opts.version
    });
    this.init();
  }

  /** Proxy connection handler */
  private async _connectionHandler(client: mc.Client): Promise<void> {
    console.log('connection received from', client.socket.remoteAddress);
    if (this.proxyClient) {
      client.end('too many connections');
      return;
    }
    this.proxyClient = client;
    try {
      await this.doConnect();
    } catch (err) {
      if (this.proxyClient) this.proxyClient.end(err.stack);
      if (this.connectClient) this.connectClient.end('');
      console.error('failed in proxy connect');
      console.error(err);
      this.proxyClient = null;
      this.connectClient = null;
      return;
    }
    let connectClientDisconnectHandler = (reason: string) => {
      if (this.proxyClient) this.proxyClient.end(reason);
      this._handleClose(reason);
    };
    this.connectClient!.on('end', connectClientDisconnectHandler);
    this.connectClient!.on('error', connectClientDisconnectHandler);
    let proxyClientDisconnectHandler = (reason: string) => {
      if (this.connectClient) this.connectClient.end('');
      this._handleClose(reason);
    };
    this.proxyClient!.on('end', proxyClientDisconnectHandler);
    this.proxyClient!.on('error', proxyClientDisconnectHandler);
    // TODO: debug purposes
    this.proxyClient!.once('error', (...args) => {
      console.log('proxyClient emit error event', ...args);
    });
    this.proxyClient!.once('end', (...args) => {
      console.log('proxyClient emit end event', ...args);
    });
  }

  private _setupProxying() {
    this.proxyClient!.on('packet', (data, meta) => {
      console.log('client -> server', meta, data);
      // if (this.connectClient?.state === states.PLAY && meta.state === states.PLAY) {
      if (this.connectClient) this.connectClient.write(meta.name, data);
    });
    this.connectClient!.on('packet', (data, meta) => {
      console.log('server -> client', meta, data);
      if (this.proxyClient) this.proxyClient.write(meta.name, data);
    });
  }

  /** Handle connection closed from either end */
  private _handleClose(reason: string) {
    console.log('connection ended:', reason);
    this.connectClient = null;
    this.proxyClient = null;
  }

  /** Initialize the proxy server */
  private async init() {
    this.server.on('login', this._connectionHandler.bind(this));
  }

  /** Connect the proxy to the remote server */
  private doConnect(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log('connecting to remote server');
      this.connectClient = mc.createClient({
        username: this.opts.username,
        password: this.opts.password,
        accessToken: this.opts.accessToken,
        clientToken: this.opts.clientToken,
        // @ts-ignore no clue why this isn't defined
        session: this.opts.session,
        host: this.opts.serverAddress,
        port: this.opts.serverPort,
        version: this.opts.version
      });
      this.connectClient.on('state', (newState: string) => {
        // wait for connection to be ready
        console.log('connectClient new state', newState);
        if (newState === 'play') {
          this._setupProxying();
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
        this.connectClient?.removeListener('error', failListener);
        this.connectClient?.removeListener('end', failListener);
      };
      this.connectClient!.on('login', listener);
      this.connectClient!.on('error', failListener);
      this.connectClient!.on('end', failListener);
      // TODO: debug purposes
      this.connectClient!.once('error', (...args) => {
        console.log('connectClient emit error event', ...args);
      });
      this.connectClient!.once('end', (...args) => {
        console.log('connectClient emit end event', ...args);
      });
    });
  }
}
