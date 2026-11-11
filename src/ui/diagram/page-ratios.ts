// The page ratios the pickers offer (the editor's page toolbar and canvas inspector, the theme editor's page
// presets): one table (B25; the theme editor's own list had no A4, so an A4 page preset showed an empty select).
// Labels are shown as written, or translated when they are a message key (`ratio.*`).
export const RATIOS: readonly (readonly [ratio: string, label: string])[] = [
  ['16:9', '16 : 9'], ['4:3', '4 : 3'], ['3:2', '3 : 2'], ['1:1', 'ratio.square'], ['2:3', '2 : 3'], ['3:4', '3 : 4'], ['9:16', '9 : 16'],
  ['297:210', 'ratio.a4l'], ['210:297', 'ratio.a4p'],
];
