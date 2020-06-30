import { inspect } from 'util';

export function fullInspect(obj: any) {
  return inspect(obj, {
    depth: null,
    maxArrayLength: null
  });
}
