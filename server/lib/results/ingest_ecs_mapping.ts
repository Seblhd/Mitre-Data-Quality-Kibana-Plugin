/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { ElasticsearchClient, Logger } from '@kbn/core/server';

import { ECS_INDEX_NAME } from './configurations';

interface EcsMappingObject {
  id: string;
  name: string;
  x_mitre_log_source_references: Array<{
    x_mitre_data_component_ref: string;
    data_component_name: string;
    name: string;
    channel: string;
    mapping: {
      ecs: {
        name_field: string;
        name_value: string;
        channel_field: string;
        channel_value: string;
      };
      status: string;
      confidence: string;
      notes: string;
      verified: boolean;
    };
  }>;
}

interface EcsMappingFile {
  metadata: {
    description: string;
    version: string;
    total_analytics: number;
    total_log_source_references: number;
    instructions: string;
  };
  objects: EcsMappingObject[];
}

export interface IngestEcsMappingOptions {
  esClient: ElasticsearchClient;
  logger: Logger;
}

export const ingestEcsMappingIfEmpty = async ({
  esClient,
  logger,
}: IngestEcsMappingOptions): Promise<void> => {
  const countResponse = await esClient.count({ index: ECS_INDEX_NAME });

  if (countResponse.count > 0) {
    logger.debug(
      `Index ${ECS_INDEX_NAME} already contains ${countResponse.count} documents, skipping ingestion`
    );
    return;
  }

  logger.info(`Ingesting ECS mapping data into ${ECS_INDEX_NAME}`);

  try {
    const mappingFilePath = resolve(
      __dirname,
      '../../../attack-stix-data/mapping/analytics_ecs_mapping_template.json'
    );
    logger.debug(`Loading ECS mapping file from: ${mappingFilePath}`);
    const fileContent = readFileSync(mappingFilePath, 'utf-8');
    const mappingData: EcsMappingFile = JSON.parse(fileContent);
    logger.debug(`Parsed ${mappingData.objects.length} objects from ECS mapping file`);

    const operations = mappingData.objects.flatMap((doc) => [
      { index: { _index: ECS_INDEX_NAME, _id: doc.id } },
      {
        id: doc.id,
        name: doc.name,
        x_mitre_log_source_references: doc.x_mitre_log_source_references,
      },
    ]);

    const bulkResponse = await esClient.bulk({
      refresh: true,
      operations,
    });

    if (bulkResponse.errors) {
      const erroredDocuments = bulkResponse.items.filter(
        (item) => item.index?.error || item.create?.error
      );
      logger.error(
        `Failed to ingest ${erroredDocuments.length} documents: ${JSON.stringify(erroredDocuments[0])}`
      );
    } else {
      logger.info(
        `Successfully ingested ${mappingData.objects.length} documents into ${ECS_INDEX_NAME}`
      );
    }
  } catch (error) {
    logger.error(`Failed to ingest ECS mapping data: ${error.message}`);
    throw error;
  }
};
