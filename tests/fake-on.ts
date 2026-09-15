// A minimal stand-in for the real `On` the engine passes to `register()`:
// records each hook by event name so a test can call it directly, without
// a running engine. Good enough for testing our own registerX(on) functions
// - it does not validate matchers or chain hooks the way the real engine
// dispatcher does.
export interface FakeOn {
  on: (event: string, ...rest: unknown[]) => { catch: () => void };
  handlers: Record<string, Array<(...args: any[]) => unknown>>;
}

export function fakeOn(): FakeOn {
  const handlers: Record<string, Array<(...args: any[]) => unknown>> = {};
  const on = (event: string, ...rest: unknown[]) => {
    const hook = (typeof rest[rest.length - 1] === 'function' ? rest[rest.length - 1] : rest[0]) as (...args: any[]) => unknown;
    (handlers[event] ??= []).push(hook);
    return { catch: () => {} };
  };
  return { on: on as FakeOn['on'], handlers };
}
