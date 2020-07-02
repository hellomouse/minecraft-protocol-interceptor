import { promises as fsP } from 'fs';
import * as path from 'path';
import { Hook, Direction, EventHandler } from './hook';
import { Command, CommandDescriptor } from './command';
import MinecraftProxy from './proxy';
import logger from './logger';

/** Base class for modules */
export abstract class Module {
  /** Name of the module */
  public name = 'INVALID MODULE';
  /** Proxy object this module belongs to */
  public proxy: MinecraftProxy;
  /** Hooks registered by the module */
  public hooks = new Set<Hook>();
  /** Commands registered by the module */
  public commands = new Set<Command>();
  /** Array of keys to preserve from old state in reload */
  public statePreserveKeys: (keyof this)[] = [];
  /** Whether the module is currently loaded */
  public loaded = false;
  /** Module configuration */
  public config: any = null;
  /**
   * If this module was unloaded in favor of a new version during reload, this
   * property will be set to allow old callbacks to find the new module
   */
  public current: this | null = null;
  /**
   * If this module superseded an older instance of itself, this property will
   * contain the previous instance
   */
  public previous: this | null = null;

  /**
   * Full path to the module on the filesystem, used internally by the module
   * loader for reloading purposes
   */
  public _modulePath: string | null = null;
  /** Full path to the path require() was called on when loading this module */
  public _originalImportPath: string | null = null;

  /**
   * The constructor
   * @param name Name of the module
   */
  constructor(proxy: MinecraftProxy) {
    this.proxy = proxy;
  }

  /**
   * Function to migrate module state during reload
   * @param oldState Old module object
   */
  async migrateState(oldState: this): Promise<void> {
    for (let key of this.statePreserveKeys) {
      logger.silly(`migrateState: copying key [${key}]`);
      this[key] = oldState[key];
    }
  }

  /** Method called when the module is loaded */
  abstract async _load(reloading: boolean): Promise<void>;

  /**
   * Load the module. Will call _load, which should be overrided by modules to
   * actually register hooks and commands.
   * @param reloading True if the module was reloaded
   */
  async load(reloading = false) {
    await this._load(reloading);
    this.loaded = true;
  }

  /** Method called when the module is unloaded */
  abstract async _unload(reloading: boolean): Promise<void>;

  /**
   * Unload the module. Will call _unload, which should be overrided by modules
   * to perform cleanup.
   * @param reloading True if the module will be reloaded
   */
  async unload(reloading = false) {
    await this._unload(reloading);
    for (let hook of this.hooks) this.unregisterHook(hook);
    for (let command of this.commands) this.unregisterCommand(command);
    this.loaded = false;
  }

  /**
   * Register a hook that belongs to the module. The hook will be unregistered
   * automatically on module unload.
   * @param scope
   * @param type
   * @param handler
   * @param priority
   */
  registerHook(scope: Direction, type: string, handler: EventHandler, priority = 100) {
    let hook = this.proxy.hooks.register(scope, type, handler, priority);
    this.hooks.add(hook);
    return hook;
  }

  /**
   * Unregister a module hook
   * @param hook
   */
  unregisterHook(hook: Hook) {
    hook.unregister();
    this.hooks.delete(hook);
  }

  /**
   * Register a command that belongs to the module. The command will be
   * unregistered automatically on module unload.
   */
  registerCommand(descriptor: CommandDescriptor) {
    let command = this.proxy.commandRegistry.register(descriptor);
    this.commands.add(command);
    return command;
  }

  /**
   * Unregister a module command
   * @param command
   */
  unregisterCommand(command: Command) {
    command.unregister();
    this.commands.delete(command);
  }

  /** Return a callback to call a method on the module, will survive reloads */
  bindCallback(callbackKey: keyof this) {
    return (...args: any[]): any => {
      if (this.current) return (this.current[callbackKey] as any).apply(this.current, args);
      else return (this[callbackKey] as any).apply(this, args);
    };
  }
}

export class ModuleRegistry {
  public modules = new Map<string, Module>();

  /**
   * The constructor
   * @param moduleConfig Per-module configuration
   */
  constructor(public proxy: MinecraftProxy) {}

  /**
   * Import all modules from a directory, but do not load them
   * @param dir
   */
  async importAllFromDirectory(dir: string) {
    let files = await fsP.readdir(dir);
    for (let file of files) {
      let modulePath = path.join(dir, file);
      this.importFromPath(modulePath, false);
    }
  }

  /**
   * Set needed properties on module
   * @param module
   */
  _hydrateModule(module: Module) {
    module.proxy = this.proxy;
    module.config = this.proxy.config.moduleConfig[module.name] ?? null;
  }

  /**
   * Import a single module from a given path
   * @param path
   * @param throwOnNotFound Whether to throw if the module was not found
   */
  importFromPath(path: string, throwOnNotFound = true) {
    logger.debug(`importing module at [${path}]`);
    // no good way to type this :(
    let moduleClass: any;
    try {
      moduleClass = require(path); // eslint-disable-line @typescript-eslint/no-var-requires
    } catch (err) {
      if (throwOnNotFound) throw err;
      return;
    }
    if (moduleClass.default) moduleClass = moduleClass.default;
    if (!moduleClass) {
      if (throwOnNotFound) throw new Error('invalid module');
      return;
    }
    let module: Module = new moduleClass(); // eslint-disable-line new-cap
    this._hydrateModule(module);
    module._originalImportPath = path;
    module._modulePath = require.resolve(path);
    // TODO: debug
    if (!require.cache[module._modulePath]) {
      logger.debug(`module [${module.name}] not in require cache?`);
      logger.debug(`module path is [${module._modulePath}]`);
    }
    this._doModuleObjectImport(module);
  }

  /**
   * Actually import a module object
   * @param module
   */
  private _doModuleObjectImport(module: Module) {
    if (this.modules.has(module.name)) {
      throw new Error(`duplicate module name: ${module.name}`);
    }
    this.modules.set(module.name, module);
    logger.debug(`imported module [${module.name}]`);
  }

  /**
   * Reload a module
   * @param module
   */
  async reload(moduleName: string) {
    logger.info(`reloading module [${moduleName}]`);
    let oldModule = this.modules.get(moduleName);
    if (!oldModule) throw new Error('no such module');
    if (!oldModule._modulePath) throw new Error('not possible to reload module');
    let nodeModule = require.cache[oldModule._modulePath];
    if (nodeModule) {
      let toDelete = new Set<string>();
      let toTraverse: NodeJS.Module[] = [nodeModule];
      while (toTraverse.length) {
        if (toTraverse.length > 1e6) {
          // we have problems!
          throw new Error('too many things on the stack');
        }
        let module = toTraverse.pop()!;
        if (module.id.startsWith(oldModule._modulePath)) {
          if (!toDelete.has(module.id)) toTraverse.push(...module!.children);
          toDelete.add(module.id);
        }
      }
      for (let moduleId of toDelete) {
        logger.silly(`delete cache for module [${moduleId}]`);
        delete require.cache[moduleId];
      }
    }
    // if module path changes this will die
    let moduleClass: any = require(oldModule._modulePath); // eslint-disable-line @typescript-eslint/no-var-requires
    if (moduleClass.default) moduleClass = moduleClass.default;
    if (!moduleClass) throw new Error('reloaded module is invalid');
    let newModule: Module = new moduleClass(); // eslint-disable-line new-cap
    this._hydrateModule(newModule);
    await oldModule.unload(true);
    await newModule.migrateState(oldModule);
    await newModule.load(true);
    oldModule.current = newModule;
    if (oldModule.previous) {
      oldModule.previous.current = newModule;
      oldModule.previous = null; // allow old modules to be gc'd
    }
    newModule.previous = oldModule;
    if (oldModule.name !== newModule.name) {
      // this can and probably will break
      this.modules.delete(oldModule.name);
    }
    this.modules.set(newModule.name, newModule);
  }

  /**
   * Load a module after importing
   * @param moduleName Name of the module
   */
  async load(moduleName: string): Promise<Module> {
    logger.info(`loading module [${moduleName}]`);
    let module = this.modules.get(moduleName);
    if (!module) throw new Error('no such module');
    if (module.loaded) throw new Error('module is already loaded');
    await module.load(false);
    return module;
  }

  async unload(moduleName: string) {
    logger.info(`unloading module [${moduleName}]`);
    let module = this.modules.get(moduleName);
    if (!module) throw new Error('no such module');
    if (module.loaded) throw new Error('module is already unloaded');
    await module.unload(false);
  }

  getModule(moduleName: string): Module | null {
    let module = this.modules.get(moduleName);
    if (!module) return null;
    if (!module.loaded) return null; // don't return unloaded modules
    return module;
  }
}
