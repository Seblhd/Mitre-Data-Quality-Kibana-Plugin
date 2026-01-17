/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, Logger } from '@kbn/core/server';

import { RESULTS_INDEX_NAME } from './configurations';

export interface CreateDataQualityResultsIndexOptions {
  esClient: ElasticsearchClient;
  logger: Logger;
}

export const createDataQualityResultsIndex = async ({
  esClient,
  logger,
}: CreateDataQualityResultsIndexOptions): Promise<void> => {
  const indexExists = await esClient.indices.exists({ index: RESULTS_INDEX_NAME });

  if (indexExists) {
    logger.debug(`Index ${RESULTS_INDEX_NAME} already exists`);
    return;
  }

  logger.info(`Creating index ${RESULTS_INDEX_NAME}`);

  try {
    await esClient.indices.create({
      index: RESULTS_INDEX_NAME,
    });
  } catch (error) {
    logger.error(`Failed to create index ${RESULTS_INDEX_NAME}: ${error.message}`);
    throw error;
  }
};

export const deleteDataQualityResultsIndex = async ({
  esClient,
  logger,
}: CreateDataQualityResultsIndexOptions): Promise<void> => {
  logger.info(`Deleting index ${RESULTS_INDEX_NAME}`);

  try {
    await esClient.indices.delete(
      { index: RESULTS_INDEX_NAME },
      { ignore: [404] }
    );
  } catch (error) {
    logger.error(`Failed to delete index ${RESULTS_INDEX_NAME}: ${error.message}`);
    throw error;
  }
};

export const dataQualityResultsIndexExists = async ({
  esClient,
}: {
  esClient: ElasticsearchClient;
}): Promise<boolean> => {
  return esClient.indices.exists({ index: RESULTS_INDEX_NAME });
};
