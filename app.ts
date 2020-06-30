import { promises as fsP } from 'fs';
import * as os from 'os';
import * as path from 'path';
import MinecraftProxy from '.';

const MMC_ACCOUNTS_FILE = path.join(os.homedir(), '.local/share/multimc/accounts.json');

async function main() {
  let multimcAccounts = JSON.parse((await fsP.readFile(MMC_ACCOUNTS_FILE)).toString());
  let activeAccount = multimcAccounts.accounts
    .find((a: any) => a.username === multimcAccounts.activeAccount);
  let activeProfile = activeAccount.profiles
    .find((a: any) => a.id === activeAccount.activeProfile);
  let username = activeProfile.name;
  let accessToken = activeAccount.accessToken;
  let clientToken = activeAccount.clientToken;
  let uid = activeProfile.id;
  let server = process.argv[2];
  let session = {
    accessToken,
    clientToken,
    selectedProfile: {
      name: username,
      id: uid
    }
  };
  let proxy = new MinecraftProxy({
    accessToken,
    clientToken,
    serverAddress: server,
    username,
    session,
    version: '1.16.1',
    modules: ['test'],
    modulesDir: path.resolve('./build/modules'),
    moduleConfig: {
      'test': { asdf: 'hi!' }
    }
  });
}

main();
