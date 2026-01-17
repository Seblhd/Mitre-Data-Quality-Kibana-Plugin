import type { PluginInitializerContext } from '@kbn/core/server';

//  This exports static code and TypeScript types,
//  as well as, Kibana Platform `plugin()` initializer.

export async function plugin(initializerContext: PluginInitializerContext) {
  const { MitreDataQualityPlugin } = await import('./plugin');
  return new MitreDataQualityPlugin(initializerContext);
}

export type { MitreDataQualityPluginSetup, MitreDataQualityPluginStart } from './types';
