import { promises as fsP } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Module, logger } from '../..';
import { Direction } from '../../src/hook';

const LAUNCHER_PROFILES = path.join(os.homedir(), '.minecraft', 'launcher_profiles.json');

/** Allows the proxy to authenticate using tokens retrieved from MultiMC */
export default class MinecraftLauncherAuthenticationModule extends Module {
  public name = 'auth-minecraftlauncher';

  public lastModifiedTime = 0;
  public statePreserveKeys: (keyof this)[] = ['lastModifiedTime'];

  async updateCredentials() {
    let stats = await fsP.stat(LAUNCHER_PROFILES);
    let mtime = +stats.mtime;
    if (mtime <= this.lastModifiedTime) {
      logger.silly('accounts file not modified, not updating credentials');
      return;
    }
    this.lastModifiedTime = mtime;
    let profiles = JSON.parse((await fsP.readFile(LAUNCHER_PROFILES)).toString());
    let account = profiles.authenticationDatabase[profiles.selectedUser.account];
    let profile = profiles.selectedUser.profile;
    let username = account.profiles[profile].displayName;
    let accessToken = account.accessToken;
    let clientToken = profiles.clientToken;
    let session = {
      accessToken,
      clientToken,
      selectedProfile: {
        name: username,
        id: profile
      }
    };
    this.proxy.config.username = username;
    this.proxy.config.clientToken = clientToken;
    this.proxy.config.accessToken = accessToken;
    this.proxy.config.session = session;
    logger.info('updating credentials from launcher_profiles.json');
  }

  async _load(_reloading: boolean) {
    this.registerHook(Direction.Local, 'beforeServerConnect', async _event => await this.updateCredentials());
  }

  async _unload(_reloading: boolean) {}
}
