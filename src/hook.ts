/** Packet direction */
export enum Direction {
  /** Used for client to server packets */
  ClientToServer,
  /** Used for server to client packets */
  ServerToClient,
  /** Used for local events */
  Local
}

export enum EventAction {
  /** Continue processing hooks */
  Continue,
  /** Stop processing hooks, but still forward the packet */
  CancelHooks,
  /** Stop processing hooks and do not forward the packet */
  Cancel
}

/** Represents an event */
export class Event {
  /** The action taken by the current hook */
  public action: EventAction = EventAction.Continue;
  /** Direction of the associated packet */
  public direction: Direction;
  /** Type of the associated packet */
  public type: string;
  /** Associated packet data */
  public data: any;

  constructor(type: string, direction: Direction, data: any) {
    this.type = type;
    this.direction = direction;
    this.data = data;
  }

  /** Set action for event */
  setAction(action: EventAction) {
    this.action = action;
  }

  /** Prevent further hooks from running on this event */
  cancelHooks() {
    this.action = EventAction.CancelHooks;
  }

  /** Prevent further hooks from running and do not forward the packet */
  cancel() {
    this.action = EventAction.Cancel;
  }
}

export type EventHandler = (event: Event) => Promise<void>;

/** Represents a single hook */
export class Hook {
  /** Direction the hook is registered on */
  public scope: Direction;
  /** Packet type the hook is registered on */
  public type: string;
  /** Hooks object that owns this hook */
  public parent: Hooks;
  /** Hook priority (lower runs first) */
  public priority: number;
  /** Associated event handler */
  public handler: EventHandler;

  /** Associated HookList and properties */
  public _list: HookList | null = null;
  public _prev: Hook | null = null;
  public _next: Hook | null = null;

  constructor(parent: Hooks, scope: Direction, type: string, priority: number, handler: EventHandler) {
    this.scope = scope;
    this.type = type;
    this.parent = parent;
    this.priority = priority;
    this.handler = handler;
  }

  unregister() {
    this.parent.unregister(this);
  }
}

/** Linked list implementation for hooks */
export class HookList {
  public head: Hook | null = null;
  public tail: Hook | null = null;
  public length = 0;

  prepend(obj: Hook) {
    obj._list = this;
    let oldHead = this.head;
    this.head = obj;
    obj._prev = null;
    if (oldHead) {
      obj._next = oldHead;
      oldHead._prev = obj;
    } else {
      obj._next = null;
      this.tail = obj;
    }
    this.length++;
  }

  append(obj: Hook) {
    obj._list = this;
    let oldTail = this.tail;
    this.tail = obj;
    obj._next = null;
    if (oldTail) {
      obj._prev = oldTail;
      oldTail._next = obj;
    } else {
      obj._prev = null;
      this.head = obj;
    }
    this.length++;
  }

  insertAfter(target: Hook | null, obj: Hook) {
    if (!target) {
      this.prepend(obj);
      return;
    }
    obj._list = this;
    let oldNext = target._next;
    target._next = obj;
    obj._prev = target;
    target._next = oldNext;
    if (oldNext) oldNext._prev = obj;
    else this.tail = obj;
    this.length++;
  }

  insertBefore(target: Hook | null, obj: Hook) {
    if (!target) {
      this.append(obj);
      return;
    }
    obj._list = this;
    let oldPrev = target._prev;
    target._prev = obj;
    obj._next = target;
    obj._prev = oldPrev;
    if (oldPrev) oldPrev._next = obj;
    else this.head = obj;
    this.length++;
  }

  remove(obj: Hook) {
    let oldPrev = obj._prev;
    let oldNext = obj._next;
    if (oldPrev) oldPrev._next = oldNext;
    else this.head = oldNext;
    if (oldNext) oldNext._prev = oldPrev;
    else this.tail = oldPrev;
    obj._list = null;
    obj._prev = null;
    obj._next = null;
    this.length--;
  }
}

/** Hooks implementation for the proxy */
export class Hooks {
  public hooks: Map<string, HookList>[];

  constructor() {
    this.hooks = new Array(3);
    this.hooks[Direction.ClientToServer] = new Map();
    this.hooks[Direction.ServerToClient] = new Map();
    this.hooks[Direction.Local] = new Map();
  }

  register(scope: Direction, type: string, handler: EventHandler, priority = 100) {
    let hook = new Hook(this, scope, type, priority, handler);
    let hookList = this.hooks[scope].get(type);
    if (!hookList) {
      hookList = new HookList();
      hookList.append(hook);
      this.hooks[scope].set(type, hookList);
    } else {
      let targetHook = hookList.head;
      while (targetHook && targetHook.priority <= priority) targetHook = targetHook._next;
      if (!targetHook) hookList.append(hook);
      else hookList.insertAfter(targetHook, hook);
    }
    return hook;
  }

  unregister(hook: Hook) {
    let hookList = this.hooks[hook.scope].get(hook.type);
    hookList!.remove(hook);
  }

  /**
   * Run hooks
   * @param scope
   * @param type
   * @param data Packet data or other payload
   * @return False if event cancelled, true if not
   */
  async runHooks(scope: Direction, type: string, data: any): Promise<boolean> {
    let hookList = this.hooks[scope].get(type);
    if (!hookList) return true;
    let event = new Event(type, scope, data);
    for (let hook: Hook | null | undefined = hookList.head; hook; hook = hook?._next) {
      await hook.handler(event);
      switch (event.action) {
        case EventAction.Continue:
          continue;
        case EventAction.CancelHooks:
          return true;
        case EventAction.Cancel:
          return false;
        default:
          throw new Error('invalid hook action');
      }
    }
    return true;
  }
}
