/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, Logger } from '@kbn/core/server';

import {
  createResultsComponentTemplate,
  deleteResultsComponentTemplate,
} from './create_results_component_template';
import {
  createResultsIndexTemplate,
  deleteResultsIndexTemplate,
} from './create_results_index_template';
import { createResultsIndex, deleteResultsIndex } from './create_results_index';
import { ingestEcsMappingIfEmpty } from './ingest_ecs_mapping';
import {
  createDataQualityResultsComponentTemplate,
  deleteDataQualityResultsComponentTemplate,
} from './create_data_quality_results_component_template';
import {
  createDataQualityResultsIndexTemplate,
  deleteDataQualityResultsIndexTemplate,
} from './create_data_quality_results_index_template';
import {
  createDataQualityResultsIndex,
  deleteDataQualityResultsIndex,
} from './create_data_quality_results_index';

export interface InstallResultsTemplatesOptions {
  esClient: ElasticsearchClient;
  logger: Logger;
}

export const installResultsTemplates = async ({
  esClient,
  logger,
}: InstallResultsTemplatesOptions): Promise<void> => {
  try {
    // Install ECS mapping templates and index
    await createResultsComponentTemplate({ esClient, logger });
    await createResultsIndexTemplate({ esClient, logger });
    await createResultsIndex({ esClient, logger });
    await ingestEcsMappingIfEmpty({ esClient, logger });

    // Install Data Quality Results templates and index
    await createDataQualityResultsComponentTemplate({ esClient, logger });
    await createDataQualityResultsIndexTemplate({ esClient, logger });
    await createDataQualityResultsIndex({ esClient, logger });
  } catch (error) {
    logger.error(`Failed to install results templates: ${error.message}`);
    throw error;
  }
};

export const uninstallResultsTemplates = async ({
  esClient,
  logger,
}: InstallResultsTemplatesOptions): Promise<void> => {
  try {
    // Uninstall ECS mapping templates and index
    await deleteResultsIndex({ esClient, logger });
    await deleteResultsIndexTemplate({ esClient, logger });
    await deleteResultsComponentTemplate({ esClient, logger });

    // Uninstall Data Quality Results templates and index
    await deleteDataQualityResultsIndex({ esClient, logger });
    await deleteDataQualityResultsIndexTemplate({ esClient, logger });
    await deleteDataQualityResultsComponentTemplate({ esClient, logger });
  } catch (error) {
    logger.error(`Failed to uninstall results templates: ${error.message}`);
    throw error;
  }
};
