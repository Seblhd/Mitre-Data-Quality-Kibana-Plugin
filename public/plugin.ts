import { i18n } from '@kbn/i18n';
import type { AppMountParameters, CoreSetup, CoreStart, Plugin } from '@kbn/core/public';
import { DEFAULT_APP_CATEGORIES } from '@kbn/core/public';
import type {
  MitreDataQualityPluginSetup,
  MitreDataQualityPluginStart,
  AppPluginStartDependencies,
} from './types';
import { PLUGIN_ID, PLUGIN_NAME } from '../common';

export class MitreDataQualityPlugin
  implements Plugin<MitreDataQualityPluginSetup, MitreDataQualityPluginStart>
{
  public setup(core: CoreSetup): MitreDataQualityPluginSetup {
    // Register an application into the Security solution navigation
    core.application.register({
      id: PLUGIN_ID,
      title: PLUGIN_NAME,
      category: DEFAULT_APP_CATEGORIES.security,
      order: 8002, // Position after Rules (8001) in the Security nav
      euiIconType: 'securityAnalyticsApp',
      async mount(params: AppMountParameters) {
        // Load application bundle
        const { renderApp } = await import('./application');
        // Get start services as specified in kibana.json
        const [coreStart, depsStart] = await core.getStartServices();
        // Render the application
        return renderApp(coreStart, depsStart as AppPluginStartDependencies, params);
      },
    });

    // Return methods that should be available to other plugins
    return {
      getGreeting() {
        return i18n.translate('mitreDataQuality.greetingText', {
          defaultMessage: 'Hello from {name}!',
          values: {
            name: PLUGIN_NAME,
          },
        });
      },
    };
  }

  public start(core: CoreStart): MitreDataQualityPluginStart {
    return {};
  }

  public stop() {}
}
