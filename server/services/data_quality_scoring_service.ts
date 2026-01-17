/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import { ECS_INDEX_NAME, RESULTS_INDEX_NAME } from '../lib/results/configurations';

const LOGS_INDEX_PATTERN = 'logs-*';
const DEFAULT_REFRESH_DELAY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
const SETTINGS_INDEX_NAME = '.kibana-mitre-data-quality-settings';
const DEFAULT_RETENTION_SCORE = 5.0;
const DEFAULT_DEVICE_COMPLETENESS_SCORE = 2.0;

interface EcsMapping {
  name_field: string;
  name_value: string;
  channel_field: string;
  channel_value: string;
}

interface LogSourceReference {
  x_mitre_data_component_ref: string;
  data_component_name: string;
  name: string;
  channel: string;
  mapping: {
    ecs: EcsMapping;
    status: string;
    confidence: string;
    notes: string;
    verified: boolean;
  };
}

interface AnalyticDocument {
  id: string;
  name: string;
  x_mitre_log_source_references: LogSourceReference[];
}

interface DataFieldCompletenessDetails {
  base_score: number;
  status_multiplier: number;
  confidence_multiplier: number;
  reason: string;
}

interface TimelinessDetails {
  last_doc_timestamp: string | null;
  last_doc_ingested: string | null;
  delta_seconds: number | null;
  reason: string;
}

interface ConsistencyDetails {
  reason: string;
}

interface DeviceCompletenessDetails {
  coverage_percent: number;
  reason: string;
}

interface RetentionDetails {
  retention_percent: number;
  reason: string;
}

interface Scores {
  next_execution: string;
  quality_score: number;
  data_field_completeness: {
    score: number;
    details: DataFieldCompletenessDetails;
  };
  timeliness: {
    score: number;
    details: TimelinessDetails;
  };
  consistency: {
    score: number;
    details: ConsistencyDetails;
  };
  device_completeness: {
    score: number;
    details: DeviceCompletenessDetails;
  };
  retention: {
    score: number;
    details: RetentionDetails;
  };
}

interface LogSourceReferenceWithScores extends LogSourceReference {
  mapping: LogSourceReference['mapping'] & {
    ecs: EcsMapping & {
      scores: Scores;
    };
  };
}

interface AnalyticDocumentWithScores {
  id: string;
  name: string;
  x_mitre_log_source_references: LogSourceReferenceWithScores[];
}

interface QueryResult {
  exists: boolean;
  lastDoc: Record<string, unknown> | null;
}

export class DataQualityScoringService {
  private readonly internalClient: ElasticsearchClient;
  private logsClient: ElasticsearchClient;
  private readonly logger: Logger;
  private readonly refreshDelayMs: number;
  private retentionScoresCache: Record<string, number> = {};
  private retentionScoresCacheTimestamp: number = 0;
  private readonly CACHE_TTL_MS = 60000; // 1 minute cache

  constructor(esClient: ElasticsearchClient, logger: Logger, refreshDelayMs?: number) {
    this.internalClient = esClient;
    this.logsClient = esClient; // Default to internal client, can be overridden
    this.logger = logger;
    this.refreshDelayMs = refreshDelayMs ?? DEFAULT_REFRESH_DELAY_MS;
  }

  /**
   * Fetch retention score settings from the settings index
   */
  private async fetchRetentionSettings(): Promise<Record<string, number>> {
    // Check cache
    if (Date.now() - this.retentionScoresCacheTimestamp < this.CACHE_TTL_MS) {
      return this.retentionScoresCache;
    }

    try {
      const indexExists = await this.internalClient.indices.exists({ index: SETTINGS_INDEX_NAME });
      if (!indexExists) {
        this.retentionScoresCache = {};
        this.retentionScoresCacheTimestamp = Date.now();
        return {};
      }

      const result = await this.internalClient.get({
        index: SETTINGS_INDEX_NAME,
        id: 'retention_scores',
      });

      const scores = (result._source as { scores: Record<string, number> })?.scores || {};
      this.retentionScoresCache = scores;
      this.retentionScoresCacheTimestamp = Date.now();
      return scores;
    } catch {
      // Document doesn't exist or other error
      this.retentionScoresCache = {};
      this.retentionScoresCacheTimestamp = Date.now();
      return {};
    }
  }

  /**
   * Get retention score for a specific platform
   */
  async getRetentionScoreForPlatform(platform?: string): Promise<number> {
    const settings = await this.fetchRetentionSettings();
    
    // If a specific platform is requested, return its score or default
    if (platform) {
      return settings[platform] ?? DEFAULT_RETENTION_SCORE;
    }
    
    // If no platform specified, use average of all configured scores
    const configuredScores = Object.values(settings);
    if (configuredScores.length === 0) {
      return DEFAULT_RETENTION_SCORE;
    }
    
    const averageScore = configuredScores.reduce((sum, score) => sum + score, 0) / configuredScores.length;
    return Math.round(averageScore * 10) / 10; // Round to 1 decimal
  }

  /**
   * Fetch device completeness score settings from the settings index
   */
  private deviceCompletenessCache: Record<string, number> = {};
  private deviceCompletenessCacheTimestamp: number = 0;

  private async fetchDeviceCompletenessSettings(): Promise<Record<string, number>> {
    // Check cache
    if (Date.now() - this.deviceCompletenessCacheTimestamp < this.CACHE_TTL_MS) {
      return this.deviceCompletenessCache;
    }

    try {
      const indexExists = await this.internalClient.indices.exists({ index: SETTINGS_INDEX_NAME });
      if (!indexExists) {
        this.deviceCompletenessCache = {};
        this.deviceCompletenessCacheTimestamp = Date.now();
        return {};
      }

      const result = await this.internalClient.get({
        index: SETTINGS_INDEX_NAME,
        id: 'device_completeness_scores',
      });

      const scores = (result._source as { scores: Record<string, number> })?.scores || {};
      this.deviceCompletenessCache = scores;
      this.deviceCompletenessCacheTimestamp = Date.now();
      return scores;
    } catch {
      this.deviceCompletenessCache = {};
      this.deviceCompletenessCacheTimestamp = Date.now();
      return {};
    }
  }

  /**
   * Invalidate all settings caches to force re-fetch on next scoring
   */
  invalidateSettingsCache(): void {
    this.retentionScoresCacheTimestamp = 0;
    this.deviceCompletenessCacheTimestamp = 0;
  }

  /**
   * Get device completeness score for a specific platform
   */
  async getDeviceCompletenessScoreForPlatform(platform?: string): Promise<number> {
    const settings = await this.fetchDeviceCompletenessSettings();
    
    if (platform) {
      return settings[platform] ?? DEFAULT_DEVICE_COMPLETENESS_SCORE;
    }
    
    const configuredScores = Object.values(settings);
    if (configuredScores.length === 0) {
      return DEFAULT_DEVICE_COMPLETENESS_SCORE;
    }
    
    const averageScore = configuredScores.reduce((sum, score) => sum + score, 0) / configuredScores.length;
    return Math.round(averageScore * 10) / 10;
  }

  /**
   * Set the client used for querying logs-* indices.
   * Use asCurrentUser for API-triggered scoring (uses user's permissions).
   * Use asInternalUser for background tasks (requires kibana_system to have logs-* access).
   */
  setLogsClient(client: ElasticsearchClient): void {
    this.logsClient = client;
  }

  /**
   * Calculate the next execution date
   * Formula: now + refresh_delay + random(60-360) seconds
   */
  private calculateNextExecution(): string {
    const randomSeconds = Math.floor(Math.random() * (360 - 60 + 1)) + 60;
    const nextExecutionMs = Date.now() + this.refreshDelayMs + randomSeconds * 1000;
    return new Date(nextExecutionMs).toISOString();
  }

  /**
   * Build and execute DSL query to check if fields exist in logs-* indices
   * Uses simple term queries for exact matching
   */
  async queryFieldExists(
    nameField: string,
    nameValue: string,
    channelField?: string,
    channelValue?: string
  ): Promise<QueryResult> {
    if (!nameField || !nameValue) {
      this.logger.warn(`queryFieldExists: Missing nameField or nameValue`);
      return { exists: false, lastDoc: null };
    }

    try {
      const mustClauses: Array<Record<string, unknown>> = [];

      // Add name field clause using term query
      mustClauses.push({
        term: { [nameField]: nameValue },
      });

      // Add channel field clause if both channel_field and channel_value are provided
      if (channelField && channelValue) {
        const channelValues = channelValue.split(',').map((v) => v.trim());

        if (channelValues.length === 1) {
          // Single value - use term query
          mustClauses.push({
            term: { [channelField]: channelValues[0] },
          });
        } else {
          // Multiple values - use terms query (like the user's example)
          mustClauses.push({
            terms: { [channelField]: channelValues },
          });
        }
      }

      const searchBody = {
        size: 1,
        sort: [{ '@timestamp': { order: 'desc' as const } }],
        query: {
          bool: {
            must: mustClauses,
          },
        },
      };

      const response = await this.logsClient.search({
        index: LOGS_INDEX_PATTERN,
        size: searchBody.size,
        sort: searchBody.sort as Array<Record<string, { order: 'desc' | 'asc' }>>,
        query: searchBody.query,
        ignore_unavailable: true,
        allow_no_indices: true,
        expand_wildcards: ['open', 'hidden'],
      });

      const hits = response.hits?.hits ?? [];
      if (hits.length > 0) {
        return {
          exists: true,
          lastDoc: hits[0]._source as Record<string, unknown>,
        };
      }

      return { exists: false, lastDoc: null };
    } catch (error) {
      this.logger.error(
        `[SCORE] Query error for ${nameField}=${nameValue}: ${error instanceof Error ? error.message : String(error)}`
      );
      return { exists: false, lastDoc: null };
    }
  }

  /**
   * Calculate Data Field Completeness score
   *
   * Score Rules:
   * - Base score: 5 if fields exist in ES, 0 if unmapped
   * - Status multiplier: complete=1.0, partial=0.5, unmapped=0
   * - Confidence multiplier: high=1.0, medium=0.8, low=0.4
   */
  async calculateDataFieldCompletenessScore(
    status: string,
    confidence: string,
    nameField: string,
    nameValue: string,
    channelField?: string,
    channelValue?: string
  ): Promise<{ score: number; details: DataFieldCompletenessDetails; lastDoc: Record<string, unknown> | null }> {
    const details: DataFieldCompletenessDetails = {
      base_score: 0,
      status_multiplier: 0,
      confidence_multiplier: 0,
      reason: '',
    };

    // Check status
    if (status === 'unmapped') {
      details.reason = 'Status is unmapped';
      return { score: 0, details, lastDoc: null };
    }

    // Status multipliers
    const statusMultipliers: Record<string, number> = {
      complete: 1.0,
      partial: 0.5,
      unmapped: 0.0,
    };

    // Confidence multipliers
    const confidenceMultipliers: Record<string, number> = {
      high: 1.0,
      medium: 0.8,
      low: 0.4,
      '': 0.0,
    };

    details.status_multiplier = statusMultipliers[status] ?? 0;
    details.confidence_multiplier = confidenceMultipliers[confidence] ?? 0;

    // Query Elasticsearch
    const queryResult = await this.queryFieldExists(nameField, nameValue, channelField, channelValue);

    if (queryResult.exists) {
      details.base_score = 5;
    } else {
      details.base_score = 0;
      details.reason = 'Fields not found in Elasticsearch';
    }

    // Calculate final score
    const finalScore = details.base_score * details.status_multiplier * details.confidence_multiplier;

    return {
      score: Math.round(finalScore * 100) / 100,
      details,
      lastDoc: queryResult.lastDoc,
    };
  }

  /**
   * Calculate Timeliness score based on delta between @timestamp and event.ingested
   *
   * Score Rules:
   * - If event.ingested doesn't exist: 0
   * - Delta < 5 minutes: 5
   * - Delta 5-15 minutes: 3
   * - Delta 15 minutes - 1 hour: 1
   * - Delta > 1 hour: 0
   */
  calculateTimelinessScore(lastDoc: Record<string, unknown> | null): {
    score: number;
    details: TimelinessDetails;
  } {
    const details: TimelinessDetails = {
      last_doc_timestamp: null,
      last_doc_ingested: null,
      delta_seconds: null,
      reason: '',
    };

    if (!lastDoc) {
      details.reason = 'No document available';
      return { score: 0, details };
    }

    const timestampStr = lastDoc['@timestamp'] as string | undefined;
    const eventObj = lastDoc['event'] as Record<string, unknown> | undefined;
    const ingestedStr = eventObj?.['ingested'] as string | undefined;

    if (!ingestedStr) {
      details.reason = 'event.ingested field not found';
      return { score: 0, details };
    }

    if (!timestampStr) {
      details.reason = '@timestamp field not found';
      return { score: 0, details };
    }

    try {
      const timestamp = new Date(timestampStr);
      const ingested = new Date(ingestedStr);

      const deltaSeconds = (ingested.getTime() - timestamp.getTime()) / 1000;
      const deltaMinutes = deltaSeconds / 60;

      details.last_doc_timestamp = timestampStr;
      details.last_doc_ingested = ingestedStr;
      details.delta_seconds = Math.round(deltaSeconds * 100) / 100;

      let score: number;
      if (deltaMinutes < 5) {
        score = 5.0;
        details.reason = `Delta < 5 minutes (${deltaMinutes.toFixed(2)}m)`;
      } else if (deltaMinutes < 15) {
        score = 3.0;
        details.reason = `Delta 5-15 minutes (${deltaMinutes.toFixed(2)}m)`;
      } else if (deltaMinutes < 60) {
        score = 1.0;
        details.reason = `Delta 15m-1h (${deltaMinutes.toFixed(2)}m)`;
      } else {
        score = 0.0;
        details.reason = `Delta > 1 hour (${deltaMinutes.toFixed(2)}m)`;
      }

      return { score, details };
    } catch (error) {
      details.reason = `Error parsing timestamps: ${error instanceof Error ? error.message : String(error)}`;
      return { score: 0, details };
    }
  }

  /**
   * Calculate Consistency score based on ECS field standardization
   *
   * Score Rules:
   * - If field exists in ES: 5 (fully standardized to ECS)
   * - If field doesn't exist: 0 (not standardized)
   */
  calculateConsistencyScore(fieldExists: boolean): {
    score: number;
    details: ConsistencyDetails;
  } {
    if (fieldExists) {
      return {
        score: 5.0,
        details: { reason: 'Fields standardized to ECS format' },
      };
    }

    return {
      score: 0.0,
      details: { reason: 'Fields not found or not standardized' },
    };
  }

  /**
   * Calculate Device Completeness score representing device coverage
   *
   * Score Rules:
   * - 0: 0% coverage (field not found)
   * - configuredScore: User-configured score for the platform (default 2.0)
   */
  calculateDeviceCompletenessScore(fieldExists: boolean, configuredScore: number = DEFAULT_DEVICE_COMPLETENESS_SCORE): {
    score: number;
    details: DeviceCompletenessDetails;
  } {
    if (!fieldExists) {
      return {
        score: 0.0,
        details: {
          coverage_percent: 0,
          reason: 'Field not found - 0% coverage',
        },
      };
    }

    const coveragePercent = Math.round((configuredScore / 5.0) * 100);
    return {
      score: configuredScore,
      details: {
        coverage_percent: coveragePercent,
        reason: configuredScore === DEFAULT_DEVICE_COMPLETENESS_SCORE
          ? 'Default score - adjust in settings based on actual device coverage'
          : 'Configured device completeness score for platform',
      },
    };
  }

  /**
   * Calculate Retention score representing data retention period coverage
   *
   * Score Rules:
   * - 0: 0% of desired retention period (field not found)
   * - configuredScore: User-configured score for the platform (default 5.0)
   */
  calculateRetentionScore(fieldExists: boolean, configuredScore: number = DEFAULT_RETENTION_SCORE): {
    score: number;
    details: RetentionDetails;
  } {
    if (!fieldExists) {
      return {
        score: 0.0,
        details: {
          retention_percent: 0,
          reason: 'Field not found - no data retention',
        },
      };
    }

    const retentionPercent = Math.round((configuredScore / 5.0) * 100);
    return {
      score: configuredScore,
      details: {
        retention_percent: retentionPercent,
        reason: configuredScore === DEFAULT_RETENTION_SCORE
          ? 'Default score - adjust in settings if retention limitations exist'
          : `Configured retention score for platform`,
      },
    };
  }

  /**
   * Calculate all scores for a single log source reference
   */
  async calculateScoresForLogSource(
    logSourceRef: LogSourceReference,
    platform?: string
  ): Promise<Scores> {
    const { mapping } = logSourceRef;
    const { ecs, status, confidence } = mapping;
    const { name_field, name_value, channel_field, channel_value } = ecs;

    this.logger.debug(
      `[SCORE]     Log source: ${logSourceRef.name} - ${name_field}=${name_value}, status=${status}`
    );

    // Calculate data field completeness score
    const useChannel = status === 'complete';
    const completenessResult = await this.calculateDataFieldCompletenessScore(
      status,
      confidence,
      name_field,
      name_value,
      useChannel ? channel_field : undefined,
      useChannel ? channel_value : undefined
    );

    this.logger.debug(
      `[SCORE]     Completeness: ${completenessResult.score}/5 (base=${completenessResult.details.base_score})`
    );

    const fieldExists = completenessResult.details.base_score > 0;

    // Calculate other scores
    const timelinessResult = this.calculateTimelinessScore(completenessResult.lastDoc);
    const consistencyResult = this.calculateConsistencyScore(fieldExists);

    // Get configured device completeness score for platform
    const configuredDeviceCompletenessScore = await this.getDeviceCompletenessScoreForPlatform(platform);
    const deviceCompletenessResult = this.calculateDeviceCompletenessScore(fieldExists, configuredDeviceCompletenessScore);

    // Get configured retention score for platform (uses average if no platform specified)
    const configuredRetentionScore = await this.getRetentionScoreForPlatform(platform);
    const retentionResult = this.calculateRetentionScore(fieldExists, configuredRetentionScore);

    // Calculate quality score (average of all scores)
    const qualityScore = Math.round(
      ((completenessResult.score +
        timelinessResult.score +
        consistencyResult.score +
        deviceCompletenessResult.score +
        retentionResult.score) /
        5) *
        10
    ) / 10;

    return {
      next_execution: this.calculateNextExecution(),
      quality_score: qualityScore,
      data_field_completeness: {
        score: completenessResult.score,
        details: completenessResult.details,
      },
      timeliness: {
        score: timelinessResult.score,
        details: timelinessResult.details,
      },
      consistency: {
        score: consistencyResult.score,
        details: consistencyResult.details,
      },
      device_completeness: {
        score: deviceCompletenessResult.score,
        details: deviceCompletenessResult.details,
      },
      retention: {
        score: retentionResult.score,
        details: retentionResult.details,
      },
    };
  }

  /**
   * Process a single analytic document and calculate scores for all log sources
   */
  async processAnalytic(analytic: AnalyticDocument, platform?: string): Promise<AnalyticDocumentWithScores> {
    this.logger.debug(`[SCORE] Processing analytic: ${analytic.name} (${analytic.id})`);

    const logSourcesWithScores: LogSourceReferenceWithScores[] = [];

    for (const logSourceRef of analytic.x_mitre_log_source_references) {
      const scores = await this.calculateScoresForLogSource(logSourceRef, platform);

      logSourcesWithScores.push({
        ...logSourceRef,
        mapping: {
          ...logSourceRef.mapping,
          ecs: {
            ...logSourceRef.mapping.ecs,
            scores,
          },
        },
      });

      this.logger.debug(
        `  Log source: ${logSourceRef.name} - Quality: ${scores.quality_score}/5`
      );
    }

    return {
      id: analytic.id,
      name: analytic.name,
      x_mitre_log_source_references: logSourcesWithScores,
    };
  }

  /**
   * Check if an analytic needs recalculation based on next_execution dates
   */
  analyticNeedsRecalculation(analytic: AnalyticDocumentWithScores): boolean {
    const now = new Date();

    for (const logSourceRef of analytic.x_mitre_log_source_references) {
      const nextExecution = logSourceRef.mapping.ecs.scores?.next_execution;
      if (!nextExecution) {
        return true; // No next_execution set, needs calculation
      }

      const nextExecutionDate = new Date(nextExecution);
      if (now >= nextExecutionDate) {
        return true; // Past next_execution date
      }
    }

    return false;
  }

  /**
   * Fetch all analytics from ECS index and process those that need recalculation
   */
  async processAllAnalytics(): Promise<void> {
    this.logger.debug('[SCORE] Starting data quality score calculation...');

    try {
      // Check if ECS index exists
      const indexExists = await this.internalClient.indices.exists({ index: ECS_INDEX_NAME });
      if (!indexExists) {
        this.logger.warn(`[SCORE] ECS index ${ECS_INDEX_NAME} does not exist yet`);
        return;
      }

      // Fetch all analytics from ECS index
      this.logger.debug(`[SCORE] Fetching analytics from ${ECS_INDEX_NAME}...`);
      const scrollResponse = await this.internalClient.search<AnalyticDocument>({
        index: ECS_INDEX_NAME,
        size: 100,
        scroll: '1m',
        query: { match_all: {} },
      });

      this.logger.debug(`[SCORE] Found ${scrollResponse.hits.hits.length} analytics in first batch`);

      let hits = scrollResponse.hits.hits;
      let scrollId = scrollResponse._scroll_id;
      let processedCount = 0;
      let updatedCount = 0;

      this.logger.debug(`[SCORE] Starting to process ${hits.length} analytics...`);

      while (hits.length > 0) {
        for (const hit of hits) {
          if (!hit._source) {
            this.logger.warn(`[SCORE] Skipping hit without _source`);
            continue;
          }

          const analytic = hit._source;
          this.logger.debug(`[SCORE] Processing ${processedCount + 1}: ${analytic.name} (${analytic.id})`);

          // Check if analytic has log source references
          if (!analytic.x_mitre_log_source_references || analytic.x_mitre_log_source_references.length === 0) {
            this.logger.warn(`[SCORE] Analytic ${analytic.name} has no log source references`);
            processedCount++;
            continue;
          }

          this.logger.debug(`[SCORE]   Has ${analytic.x_mitre_log_source_references.length} log source references`);

          try {
            // Process the analytic (calculate scores for all log sources)
            const processedAnalytic = await this.processAnalytic(analytic);

            // Store in results index
            await this.internalClient.index({
              index: RESULTS_INDEX_NAME,
              id: processedAnalytic.id,
              document: processedAnalytic,
              refresh: false,
            });

            updatedCount++;
            this.logger.debug(`[SCORE] Saved ${analytic.name} to results index`);
          } catch (analyticError) {
            this.logger.error(
              `[SCORE] Error processing ${analytic.name}: ${analyticError instanceof Error ? analyticError.message : String(analyticError)}`
            );
          }

          processedCount++;

          // Log progress every 10 analytics
          if (processedCount % 10 === 0) {
            this.logger.debug(`[SCORE] Progress: ${processedCount} processed, ${updatedCount} updated`);
          }
        }

        // Continue scrolling
        if (scrollId) {
          const nextScrollResponse = await this.internalClient.scroll<AnalyticDocument>({
            scroll_id: scrollId,
            scroll: '1m',
          });
          hits = nextScrollResponse.hits.hits;
          scrollId = nextScrollResponse._scroll_id;
          if (hits.length > 0) {
            this.logger.debug(`[SCORE] Fetched next batch: ${hits.length} analytics`);
          }
        } else {
          break;
        }
      }

      // Clear scroll
      if (scrollId) {
        await this.internalClient.clearScroll({ scroll_id: scrollId });
      }

      // Refresh index to make changes visible
      await this.internalClient.indices.refresh({ index: RESULTS_INDEX_NAME });

      this.logger.debug(
        `[SCORE] Calculation complete. Processed: ${processedCount}, Updated: ${updatedCount}`
      );
    } catch (error) {
      this.logger.error(
        `Failed to process analytics: ${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    }
  }

  /**
   * Get analytics that need recalculation (next_execution has passed)
   */
  async getAnalyticsNeedingRecalculation(): Promise<AnalyticDocumentWithScores[]> {
    try {
      const now = new Date().toISOString();

      const response = await this.internalClient.search<AnalyticDocumentWithScores>({
        index: RESULTS_INDEX_NAME,
        size: 100,
        query: {
          bool: {
            should: [
              {
                nested: {
                  path: 'x_mitre_log_source_references',
                  query: {
                    range: {
                      'x_mitre_log_source_references.mapping.ecs.scores.next_execution': {
                        lte: now,
                      },
                    },
                  },
                },
              },
            ],
          },
        },
      });

      return response.hits.hits
        .filter((hit) => hit._source)
        .map((hit) => hit._source as AnalyticDocumentWithScores);
    } catch (error) {
      this.logger.error(
        `Failed to get analytics needing recalculation: ${error instanceof Error ? error.message : String(error)}`
      );
      return [];
    }
  }
}
