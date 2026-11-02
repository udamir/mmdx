// GitHub Pages app (UC4): the studio with the bundled examples and themes.

// The demo starts in the system's light / dark on every visit: the toggle's choice lasts for the visit only, so the
// studio's and its editor's remembered choice is dropped before the studio reads it.
try {
  for (const key of ['mmdx.ui', 'mmdx.editor.ui']) localStorage.removeItem(key);
} catch {
  // no localStorage: nothing is remembered
}
void import('../../src/studio.js');
