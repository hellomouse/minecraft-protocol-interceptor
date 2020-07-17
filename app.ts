import * as path from 'path';
import MinecraftProxy from '.';

// TODO: read a configuration file or something
async function main() {
  let server = process.argv[2];
  let serverPort = +process.argv[3] ?? 25565;
  let proxy = new MinecraftProxy({
    serverAddress: server,
    serverPort,
    username: '', // placeholder for authentication modules
    // password: '', // if not using external authentication, load password
    version: '1.16.1',
    modules: [
      'eval',
      'auth-multimc'
      // 'auth-minecraftlauncher' // uncomment if using the minecraft launcher
    ],
    modulesDir: path.resolve('./build/modules'),
    moduleConfig: {
      // 'test': { asdf: 'hi!' }
    },
    commandPrefix: '/p:'
  });
}

main();
