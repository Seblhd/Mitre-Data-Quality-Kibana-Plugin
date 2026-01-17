/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import { DataQualityScoringService } from './data_quality_scoring_service';

export class DataQualityTaskRunner {
  private readonly esClient: ElasticsearchClient;
  private readonly logger: Logger;
  private readonly scoringService: DataQualityScoringService;
  private isRunning = false;

  constructor(esClient: ElasticsearchClient, logger: Logger, refreshDelayMs?: number) {
    this.esClient = esClient;
    this.logger = logger;
    this.scoringService = new DataQualityScoringService(esClient, logger, refreshDelayMs);
  }

  /**
   * Invalidate settings cache to force re-fetch on next scoring
   */
  invalidateSettingsCache(): void {
    this.scoringService.invalidateSettingsCache();
  }

  /**
   * Run a full calculation for all analytics
   */
  async runFullCalculation(): Promise<void> {
    if (this.isRunning) {
      this.logger.debug('Calculation already in progress, skipping');
      return;
    }

    this.isRunning = true;
    try {
      this.logger.info('Running full data quality calculation...');
      await this.scoringService.processAllAnalytics();
    } catch (error) {
      this.logger.error(
        `Failed to run full calculation: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Run a full calculation using a specific ES client for logs-* queries.
   * This allows running with user permissions (asCurrentUser) instead of kibana_system.
   * @param logsClient - ES client to use for querying logs-* indices (typically asCurrentUser)
   */
  async runFullCalculationWithClient(logsClient: ElasticsearchClient): Promise<void> {
    if (this.isRunning) {
      this.logger.debug('Calculation already in progress, skipping');
      return;
    }

    this.isRunning = true;
    try {
      this.logger.info('Running full data quality calculation with user permissions...');
      // Set the logs client to use user permissions for logs-* access
      this.scoringService.setLogsClient(logsClient);
      await this.scoringService.processAllAnalytics();
    } catch (error) {
      this.logger.error(
        `Failed to run full calculation: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      // Reset to internal client for background tasks
      this.scoringService.setLogsClient(this.esClient);
      this.isRunning = false;
    }
  }

  /**
   * Smart scoring: checks results index and decides what to run.
   * - If results index is empty → run full calculation (init)
   * - If results exist → only process analytics where next_execution has passed
   * @param logsClient - ES client to use for querying logs-* (typically asCurrentUser)
   * @returns Object indicating what action was taken
   */
  async runSmartScoringWithClient(
    logsClient: ElasticsearchClient
  ): Promise<{ action: 'init' | 'update' | 'none'; count: number }> {
    if (this.isRunning) {
      this.logger.debug('Calculation already in progress, skipping');
      return { action: 'none', count: 0 };
    }

    this.isRunning = true;
    try {
      // Set the logs client to use user permissions
      this.scoringService.setLogsClient(logsClient);

      // Check if results index exists and has documents
      const resultsIndexExists = await this.esClient.indices.exists({
        index: '.kibana-mitre-data-quality-results-default',
      });

      if (!resultsIndexExists) {
        // Results index doesn't exist - run full init
        this.logger.info('[TASK_RUNNER] Results index does not exist, running full init...');
        await this.scoringService.processAllAnalytics();
        return { action: 'init', count: -1 }; // -1 = all
      }

      const countResult = await this.esClient.count({
        index: '.kibana-mitre-data-quality-results-default',
      });

      if (countResult.count === 0) {
        // Results index is empty - run full init
        this.logger.info('[TASK_RUNNER] Results index is empty, running full init...');
        await this.scoringService.processAllAnalytics();
        return { action: 'init', count: -1 };
      }

      // Results exist - only process due analytics
      this.logger.info('[TASK_RUNNER] Results exist, checking for due analytics...');
      const dueAnalytics = await this.scoringService.getAnalyticsNeedingRecalculation();

      if (dueAnalytics.length === 0) {
        this.logger.debug('[TASK_RUNNER] No analytics due for recalculation');
        return { action: 'none', count: 0 };
      }

      this.logger.info(`[TASK_RUNNER] Found ${dueAnalytics.length} analytics due for recalculation`);

      for (const analytic of dueAnalytics) {
        try {
          const processedAnalytic = await this.scoringService.processAnalytic({
            id: analytic.id,
            name: analytic.name,
            x_mitre_log_source_references: analytic.x_mitre_log_source_references.map((ref) => ({
              x_mitre_data_component_ref: ref.x_mitre_data_component_ref,
              data_component_name: ref.data_component_name,
              name: ref.name,
              channel: ref.channel,
              mapping: {
                ecs: {
                  name_field: ref.mapping.ecs.name_field,
                  name_value: ref.mapping.ecs.name_value,
                  channel_field: ref.mapping.ecs.channel_field,
                  channel_value: ref.mapping.ecs.channel_value,
                },
                status: ref.mapping.status,
                confidence: ref.mapping.confidence,
                notes: ref.mapping.notes,
                verified: ref.mapping.verified,
              },
            })),
          });

          await this.esClient.index({
            index: '.kibana-mitre-data-quality-results-default',
            id: processedAnalytic.id,
            document: processedAnalytic,
            refresh: false,
          });
        } catch (error) {
          this.logger.error(
            `Failed to recalculate analytic ${analytic.id}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }

      await this.esClient.indices.refresh({
        index: '.kibana-mitre-data-quality-results-default',
      });

      return { action: 'update', count: dueAnalytics.length };
    } catch (error) {
      this.logger.error(
        `Smart scoring failed: ${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    } finally {
      this.scoringService.setLogsClient(this.esClient);
      this.isRunning = false;
    }
  }

}
