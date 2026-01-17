/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, Logger } from '@kbn/core/server';

import { ECS_INDEX_NAME } from './configurations';

export interface CreateResultsIndexOptions {
  esClient: ElasticsearchClient;
  logger: Logger;
}

export const createResultsIndex = async ({
  esClient,
  logger,
}: CreateResultsIndexOptions): Promise<void> => {
  const indexExists = await esClient.indices.exists({ index: ECS_INDEX_NAME });

  if (indexExists) {
    logger.debug(`Index ${ECS_INDEX_NAME} already exists`);
    return;
  }

  logger.info(`Creating index ${ECS_INDEX_NAME}`);

  try {
    await esClient.indices.create({
      index: ECS_INDEX_NAME,
    });
  } catch (error) {
    logger.error(`Failed to create index ${ECS_INDEX_NAME}: ${error.message}`);
    throw error;
  }
};

export const deleteResultsIndex = async ({
  esClient,
  logger,
}: CreateResultsIndexOptions): Promise<void> => {
  logger.info(`Deleting index ${ECS_INDEX_NAME}`);

  try {
    await esClient.indices.delete(
      { index: ECS_INDEX_NAME },
      { ignore: [404] }
    );
  } catch (error) {
    logger.error(`Failed to delete index ${ECS_INDEX_NAME}: ${error.message}`);
    throw error;
  }
};

export const resultsIndexExists = async ({
  esClient,
}: {
  esClient: ElasticsearchClient;
}): Promise<boolean> => {
  return esClient.indices.exists({ index: ECS_INDEX_NAME });
};
