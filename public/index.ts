import { MitreDataQualityPlugin } from './plugin';

// This exports static code and TypeScript types,
// as well as, Kibana Platform `plugin()` initializer.
export function plugin() {
  return new MitreDataQualityPlugin();
}
export type { MitreDataQualityPluginSetup, MitreDataQualityPluginStart } from './types';
