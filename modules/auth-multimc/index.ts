import { promises as fsP } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Module, logger } from '../..';
import { Direction } from '../../src/hook';

// TODO: figure out where this file is on windows
const MMC_ACCOUNTS_FILE = path.join(os.homedir(), '.local/share/multimc/accounts.json');

/** Allows the proxy to authenticate using tokens retrieved from MultiMC */
export default class MultiMCAuthenticationModule extends Module {
  public name = 'auth-multimc';

  public lastModifiedTime = 0;
  public statePreserveKeys: (keyof this)[] = ['lastModifiedTime'];

  async updateCredentials() {
    let stats = await fsP.stat(MMC_ACCOUNTS_FILE);
    let mtime = +stats.mtime;
    if (mtime <= this.lastModifiedTime) {
      logger.silly('accounts file not modified, not updating credentials');
      return;
    }
    this.lastModifiedTime = mtime;
    let multimcAccounts = JSON.parse((await fsP.readFile(MMC_ACCOUNTS_FILE)).toString());
    let activeAccount = multimcAccounts.accounts
      .find((a: any) => a.username === multimcAccounts.activeAccount);
    let activeProfile = activeAccount.profiles
      .find((a: any) => a.id === activeAccount.activeProfile);
    let username = activeProfile.name;
    let accessToken = activeAccount.accessToken;
    let clientToken = activeAccount.clientToken;
    let uid = activeProfile.id;
    let session = {
      accessToken,
      clientToken,
      selectedProfile: {
        name: username,
        id: uid
      }
    };
    this.proxy.config.username = username;
    this.proxy.config.clientToken = clientToken;
    this.proxy.config.accessToken = accessToken;
    this.proxy.config.session = session;
    logger.info('updating credentials from multimc instance');
  }

  async _load(_reloading: boolean) {
    this.registerHook(Direction.Local, 'beforeServerConnect', async _event => await this.updateCredentials());
  }

  async _unload(_reloading: boolean) {}
}
