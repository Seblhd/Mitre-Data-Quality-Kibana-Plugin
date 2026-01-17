import type { NavigationPublicPluginStart } from '@kbn/navigation-plugin/public';

export interface MitreDataQualityPluginSetup {
  getGreeting: () => string;
}
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface MitreDataQualityPluginStart {}

export interface AppPluginStartDependencies {
  navigation: NavigationPublicPluginStart;
}
