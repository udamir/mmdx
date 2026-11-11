// Connections (A.4 rows 41–43, A.7 row 84): connection dots on hover / selection, drag a dot to another item to
// connect (`newDrag` → `createConnection`), end handles with magnet points to move or re-attach a connector end
// (`portDrag` → `reconnect`), bend points (`bendHandles`, `bendDrag`, `removeBendPoint`, `hoverBend`).
// Ported from prototype/app.js ~425–970 and `hoverConnect`.
import type { EditorModule } from '../../module.js';
import { CONNECT_CSS } from './css.js';
import { installConnectGestures } from './gestures.js';
import { installConnectHover } from './hover.js';
import { DoublePress } from './lib.js';
import { installConnectPainter } from './painters.js';
import type { ConnState } from './state.js';

export { createConnection, reconnect } from './lib.js';

export const connectModule: EditorModule = {
  id: 'connect',
  css: [CONNECT_CSS],
  install(scope) {
    const st: ConnState = { linking: null, magnets: null, hoverEdge: null, active: false, endPress: new DoublePress(), bendPress: new DoublePress() };
    installConnectPainter(scope, st);
    installConnectGestures(scope, st);
    installConnectHover(scope, st);
    return () => {
      st.linking = null;
      st.magnets = null;
    };
  },
};
