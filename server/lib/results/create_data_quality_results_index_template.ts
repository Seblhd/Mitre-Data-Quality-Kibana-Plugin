/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Metadata } from '@elastic/elasticsearch/lib/api/types';
import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import { createOrUpdateIndexTemplate } from '@kbn/alerting-plugin/server';

import {
  RESULTS_COMPONENT_TEMPLATE_NAME,
  RESULTS_INDEX_TEMPLATE_NAME,
  RESULTS_INDEX_PATTERN,
  KIBANA_VERSION,
} from './configurations';

export interface CreateDataQualityResultsIndexTemplateOptions {
  esClient: ElasticsearchClient;
  logger: Logger;
}

export const createDataQualityResultsIndexTemplate = async ({
  esClient,
  logger,
}: CreateDataQualityResultsIndexTemplateOptions): Promise<void> => {
  logger.info(`Installing index template ${RESULTS_INDEX_TEMPLATE_NAME}`);

  const indexMetadata: Metadata = {
    namespace: 'default',
    kibana: {
      version: KIBANA_VERSION,
    },
    managed: true,
  };

  await createOrUpdateIndexTemplate({
    logger,
    esClient,
    template: {
      name: RESULTS_INDEX_TEMPLATE_NAME,
      index_patterns: [RESULTS_INDEX_PATTERN],
      composed_of: [RESULTS_COMPONENT_TEMPLATE_NAME],
      priority: 8,
      template: {
        settings: {
          'index.hidden': true,
          'index.auto_expand_replicas': '0-1',
          'index.mapping.ignore_malformed': true,
        },
        mappings: {
          dynamic: false,
          _meta: indexMetadata,
        },
      },
      _meta: indexMetadata,
    },
  });
};

export const deleteDataQualityResultsIndexTemplate = async ({
  esClient,
  logger,
}: CreateDataQualityResultsIndexTemplateOptions): Promise<void> => {
  logger.info(`Deleting index template: ${RESULTS_INDEX_TEMPLATE_NAME}`);

  try {
    await esClient.indices.deleteIndexTemplate(
      { name: RESULTS_INDEX_TEMPLATE_NAME },
      { ignore: [404] }
    );
    logger.info(`Index template ${RESULTS_INDEX_TEMPLATE_NAME} deleted successfully`);
  } catch (error) {
    logger.error(`Failed to delete index template: ${error.message}`);
    throw error;
  }
};

export const dataQualityResultsIndexTemplateExists = async ({
  esClient,
}: {
  esClient: ElasticsearchClient;
}): Promise<boolean> => {
  const response = await esClient.indices.existsIndexTemplate({
    name: RESULTS_INDEX_TEMPLATE_NAME,
  });
  return response;
};
