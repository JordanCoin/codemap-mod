import type { Register } from 'claude-code';
import { registerAttach } from './attach';
import { registerBand } from './band';
import { registerContextLine } from './context-line';
import { registerHubCheck } from './hub-check';
import { registerCommand, registerPane } from './pane';
import { registerSessionStart } from './session-start';
import { registerTurnRefresh } from './turn-refresh';

export const register: Register = (on, options) => {
  registerSessionStart(on, options);
  registerHubCheck(on);
  registerAttach(on);
  registerBand(on);
  registerPane(on);
  registerCommand(on);
  registerContextLine(on);
  registerTurnRefresh(on);
};
