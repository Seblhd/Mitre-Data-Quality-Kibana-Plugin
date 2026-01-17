/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ClusterPutComponentTemplateRequest } from '@elastic/elasticsearch/lib/api/types';
import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import { createOrUpdateComponentTemplate } from '@kbn/alerting-plugin/server';
import { mappingFromFieldMap } from '@kbn/alerting-plugin/common';

import { resultsFieldMap } from './field_maps';
import { RESULTS_COMPONENT_TEMPLATE_NAME, TOTAL_FIELDS_LIMIT } from './configurations';

export interface CreateDataQualityResultsComponentTemplateOptions {
  esClient: ElasticsearchClient;
  logger: Logger;
}

export const createDataQualityResultsComponentTemplate = async ({
  esClient,
  logger,
}: CreateDataQualityResultsComponentTemplateOptions): Promise<void> => {
  logger.info(`Installing component template ${RESULTS_COMPONENT_TEMPLATE_NAME}`);

  const template: ClusterPutComponentTemplateRequest = {
    name: RESULTS_COMPONENT_TEMPLATE_NAME,
    _meta: {
      managed: true,
    },
    template: {
      settings: {
        'index.number_of_shards': 1,
        'index.mapping.total_fields.limit': TOTAL_FIELDS_LIMIT,
      },
      mappings: mappingFromFieldMap(resultsFieldMap, 'strict'),
    },
  };

  await createOrUpdateComponentTemplate({
    logger,
    esClient,
    template,
    totalFieldsLimit: TOTAL_FIELDS_LIMIT,
  });
};

export const deleteDataQualityResultsComponentTemplate = async ({
  esClient,
  logger,
}: CreateDataQualityResultsComponentTemplateOptions): Promise<void> => {
  logger.info(`Deleting component template: ${RESULTS_COMPONENT_TEMPLATE_NAME}`);

  try {
    await esClient.cluster.deleteComponentTemplate(
      { name: RESULTS_COMPONENT_TEMPLATE_NAME },
      { ignore: [404] }
    );
    logger.info(`Component template ${RESULTS_COMPONENT_TEMPLATE_NAME} deleted successfully`);
  } catch (error) {
    logger.error(`Failed to delete component template: ${error.message}`);
    throw error;
  }
};

export const dataQualityResultsComponentTemplateExists = async ({
  esClient,
}: {
  esClient: ElasticsearchClient;
}): Promise<boolean> => {
  const response = await esClient.cluster.existsComponentTemplate({
    name: RESULTS_COMPONENT_TEMPLATE_NAME,
  });
  return response;
};
