import type {
  PluginInitializerContext,
  CoreSetup,
  CoreStart,
  Plugin,
  Logger,
} from '@kbn/core/server';

import type { MitreDataQualityPluginSetup, MitreDataQualityPluginStart } from './types';
import { defineRoutes, setDataQualityTaskRunner } from './routes';
import { MitreAttackDataService } from './services/mitre_attack_data_service';
import { MitreMatrixParser } from './services/mitre_matrix_parser';
import { DataQualityTaskRunner } from './services/data_quality_task_runner';
import { installResultsTemplates } from './lib/results';

export class MitreDataQualityPlugin
  implements Plugin<MitreDataQualityPluginSetup, MitreDataQualityPluginStart>
{
  private readonly logger: Logger;
  private mitreAttackDataService: MitreAttackDataService | undefined;
  private matrixParser: MitreMatrixParser | undefined;
  private dataQualityTaskRunner: DataQualityTaskRunner | undefined;

  constructor(initializerContext: PluginInitializerContext) {
    this.logger = initializerContext.logger.get();
  }

  public setup(core: CoreSetup) {
    this.logger.debug('mitreDataQuality: Setup');
    const router = core.http.createRouter();

    this.matrixParser = new MitreMatrixParser(this.logger);

    // Register server side APIs
    defineRoutes(router, this.matrixParser);

    return {};
  }

  public start(core: CoreStart) {
    this.logger.debug('mitreDataQuality: Started');

    const esClient = core.elasticsearch.client.asInternalUser;

    // Install templates, then start task runner
    installResultsTemplates({
      esClient,
      logger: this.logger,
    })
      .then(() => {
        // Initialize the data quality task runner (on-demand scoring via user page access)
        this.dataQualityTaskRunner = new DataQualityTaskRunner(esClient, this.logger);
        setDataQualityTaskRunner(this.dataQualityTaskRunner);
        this.logger.info(
          'Data quality task runner initialized. Scoring runs on-demand via GET /api/mitre_data_quality/trigger_scoring'
        );
      })
      .catch((error: Error) => {
        this.logger.error(
          `Failed to install templates: ${error instanceof Error ? error.message : String(error)}`
        );
      });

    this.mitreAttackDataService = new MitreAttackDataService(this.logger);
    this.mitreAttackDataService.initialize().catch((error) => {
      this.logger.error(
        `Failed to initialize MITRE ATT&CK data service: ${error instanceof Error ? error.message : String(error)}`
      );
    });

    return {};
  }

  public stop() {
    // No cleanup needed - scoring is on-demand
  }
}
