import type { IRouter } from '@kbn/core/server';
import { schema } from '@kbn/config-schema';
import type { MitreMatrixParser } from '../services/mitre_matrix_parser';
import type { DataQualityTaskRunner } from '../services/data_quality_task_runner';
import { ECS_INDEX_NAME, RESULTS_INDEX_NAME } from '../lib/results/configurations';

const SETTINGS_INDEX_NAME = '.kibana-mitre-data-quality-settings';

interface RetentionSettings {
  [platform: string]: number;
}

let dataQualityTaskRunner: DataQualityTaskRunner | null = null;

export function setDataQualityTaskRunner(runner: DataQualityTaskRunner) {
  dataQualityTaskRunner = runner;
}

export function defineRoutes(router: IRouter, matrixParser: MitreMatrixParser) {
  router.get(
    {
      path: '/api/mitre_data_quality/matrix',
      security: {
        authz: {
          requiredPrivileges: ['mitreDataQuality'],
        },
      },
      validate: false,
    },
    async (context, request, response) => {
      try {
        const matrix = await matrixParser.getMatrix();
        return response.ok({
          body: matrix,
        });
      } catch (error) {
        return response.customError({
          statusCode: 500,
          body: {
            message: `Failed to get MITRE matrix: ${error instanceof Error ? error.message : String(error)}`,
          },
        });
      }
    }
  );

  router.get(
    {
      path: '/api/mitre_data_quality/ecs_mapping/{analyticId}',
      security: {
        authz: {
          requiredPrivileges: ['mitreDataQuality'],
        },
      },
      validate: {
        params: schema.object({
          analyticId: schema.string(),
        }),
      },
    },
    async (context, request, response) => {
      try {
        const { analyticId } = request.params;
        const esClient = (await context.core).elasticsearch.client.asCurrentUser;

        const result = await esClient.get({
          index: ECS_INDEX_NAME,
          id: analyticId,
        });

        return response.ok({
          body: result._source as Record<string, unknown>,
        });
      } catch (error: unknown) {
        if (error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 404) {
          return response.notFound({
            body: {
              message: `ECS mapping not found for analytic: ${request.params.analyticId}`,
            },
          });
        }
        return response.customError({
          statusCode: 500,
          body: {
            message: `Failed to get ECS mapping: ${error instanceof Error ? error.message : String(error)}`,
          },
        });
      }
    }
  );

  router.get(
    {
      path: '/api/mitre_data_quality/ecs_mapping_status',
      security: {
        authz: {
          requiredPrivileges: ['mitreDataQuality'],
        },
      },
      validate: false,
    },
    async (context, request, response) => {
      try {
        const esClient = (await context.core).elasticsearch.client.asCurrentUser;

        const indexExists = await esClient.indices.exists({
          index: ECS_INDEX_NAME,
        });

        if (!indexExists) {
          return response.ok({
            body: { available: false, count: 0 },
          });
        }

        const countResult = await esClient.count({
          index: ECS_INDEX_NAME,
        });

        return response.ok({
          body: { available: true, count: countResult.count },
        });
      } catch (error) {
        return response.customError({
          statusCode: 500,
          body: {
            message: `Failed to check ECS mapping status: ${error instanceof Error ? error.message : String(error)}`,
          },
        });
      }
    }
  );

  router.get(
    {
      path: '/api/mitre_data_quality/all_scores',
      security: {
        authz: {
          requiredPrivileges: ['mitreDataQuality'],
        },
      },
      validate: false,
    },
    async (context, request, response) => {
      try {
        const esClient = (await context.core).elasticsearch.client.asCurrentUser;

        // Check if results index exists
        const indexExists = await esClient.indices.exists({
          index: RESULTS_INDEX_NAME,
        });

        if (!indexExists) {
          return response.ok({
            body: { scores: {}, nextExecutions: {} },
          });
        }

        // Fetch all results with scores
        const searchResponse = await esClient.search({
          index: RESULTS_INDEX_NAME,
          size: 10000,
          _source: ['id', 'x_mitre_log_source_references.mapping.ecs.scores'],
        });

        const scores: Record<string, number> = {};
        const nextExecutions: Record<string, string> = {};

        for (const hit of searchResponse.hits.hits) {
          const source = hit._source as {
            id: string;
            x_mitre_log_source_references?: Array<{
              mapping: {
                ecs: {
                  scores?: {
                    quality_score: number;
                    next_execution: string;
                  };
                };
              };
            }>;
          };

          if (source.x_mitre_log_source_references?.length) {
            const logSourceScores = source.x_mitre_log_source_references
              .map((ref) => ref.mapping.ecs.scores?.quality_score)
              .filter((s): s is number => s !== undefined);

            if (logSourceScores.length > 0) {
              scores[source.id] = logSourceScores.reduce((a, b) => a + b, 0) / logSourceScores.length;

              // Get earliest next_execution
              const executions = source.x_mitre_log_source_references
                .map((ref) => ref.mapping.ecs.scores?.next_execution)
                .filter((e): e is string => e !== undefined);
              if (executions.length > 0) {
                nextExecutions[source.id] = executions.sort()[0];
              }
            }
          }
        }

        return response.ok({
          body: { scores, nextExecutions },
        });
      } catch (error) {
        return response.customError({
          statusCode: 500,
          body: {
            message: `Failed to fetch scores: ${error instanceof Error ? error.message : String(error)}`,
          },
        });
      }
    }
  );

  router.get(
    {
      path: '/api/mitre_data_quality/results/{analyticId}',
      security: {
        authz: {
          requiredPrivileges: ['mitreDataQuality'],
        },
      },
      validate: {
        params: schema.object({
          analyticId: schema.string(),
        }),
      },
    },
    async (context, request, response) => {
      try {
        const { analyticId } = request.params;
        const esClient = (await context.core).elasticsearch.client.asCurrentUser;

        const result = await esClient.get({
          index: RESULTS_INDEX_NAME,
          id: analyticId,
        });

        return response.ok({
          body: result._source as Record<string, unknown>,
        });
      } catch (error: unknown) {
        if (error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 404) {
          return response.notFound({
            body: {
              message: `Results not found for analytic: ${request.params.analyticId}`,
            },
          });
        }
        return response.customError({
          statusCode: 500,
          body: {
            message: `Failed to get results: ${error instanceof Error ? error.message : String(error)}`,
          },
        });
      }
    }
  );

  router.get(
    {
      path: '/api/mitre_data_quality/trigger_scoring',
      security: {
        authz: {
          requiredPrivileges: ['mitreDataQuality'],
        },
      },
      validate: false,
    },
    async (context, request, response) => {
      try {
        if (!dataQualityTaskRunner) {
          return response.customError({
            statusCode: 503,
            body: {
              message: 'Data quality task runner is not initialized yet',
            },
          });
        }

        // Get the current user's ES client for querying logs-*
        const coreContext = await context.core;
        const userEsClient = coreContext.elasticsearch.client.asCurrentUser;

        // Run smart scoring: init if empty, update due analytics if not
        const result = await dataQualityTaskRunner.runSmartScoringWithClient(userEsClient);

        return response.ok({
          body: {
            action: result.action,
            count: result.count,
            message:
              result.action === 'init'
                ? 'Initial scoring started. Refresh page to see results.'
                : result.action === 'update'
                  ? `Updated ${result.count} analytics that were due for recalculation.`
                  : 'No analytics need recalculation at this time.',
          },
        });
      } catch (error) {
        return response.customError({
          statusCode: 500,
          body: {
            message: `Failed to run scoring: ${error instanceof Error ? error.message : String(error)}`,
          },
        });
      }
    }
  );

  // Invalidate settings cache to force re-fetch on next scoring
  router.post(
    {
      path: '/api/mitre_data_quality/settings/invalidate_cache',
      security: {
        authz: {
          requiredPrivileges: ['mitreDataQuality'],
        },
      },
      validate: false,
    },
    async (context, request, response) => {
      try {
        if (!dataQualityTaskRunner) {
          return response.customError({
            statusCode: 503,
            body: {
              message: 'Data quality task runner is not initialized yet',
            },
          });
        }

        dataQualityTaskRunner.invalidateSettingsCache();

        return response.ok({
          body: {
            message: 'Settings cache invalidated',
          },
        });
      } catch (error) {
        return response.customError({
          statusCode: 500,
          body: {
            message: `Failed to invalidate cache: ${error instanceof Error ? error.message : String(error)}`,
          },
        });
      }
    }
  );

  router.post(
    {
      path: '/internal/mitre_data_quality/force_quality_check',
      security: {
        authz: {
          enabled: false,
          reason: 'This route is available to all authenticated users',
        },
      },
      validate: false,
    },
    async (context, request, response) => {
      try {
        if (!dataQualityTaskRunner) {
          return response.customError({
            statusCode: 503,
            body: {
              message: 'Data quality task runner is not initialized yet',
            },
          });
        }

        // Get the current user's ES client for querying logs-*
        const coreContext = await context.core;
        const userEsClient = coreContext.elasticsearch.client.asCurrentUser;

        // Run the full calculation with user's permissions
        dataQualityTaskRunner.runFullCalculationWithClient(userEsClient).catch((error: Error) => {
          console.error(
            `Force quality check failed: ${error instanceof Error ? error.message : String(error)}`
          );
        });

        return response.ok({
          body: {
            message: 'Full data quality check started',
            status: 'running',
          },
        });
      } catch (error) {
        return response.customError({
          statusCode: 500,
          body: {
            message: `Failed to start data quality check: ${error instanceof Error ? error.message : String(error)}`,
          },
        });
      }
    }
  );

  // Get retention score settings
  router.get(
    {
      path: '/api/mitre_data_quality/settings/retention',
      security: {
        authz: {
          requiredPrivileges: ['mitreDataQuality'],
        },
      },
      validate: false,
    },
    async (context, request, response) => {
      try {
        const coreContext = await context.core;
        const esClient = coreContext.elasticsearch.client.asInternalUser;

        // Check if settings index exists
        const indexExists = await esClient.indices.exists({ index: SETTINGS_INDEX_NAME });

        if (!indexExists) {
          // Return default settings
          return response.ok({
            body: {
              retentionScores: {} as RetentionSettings,
              defaultScore: 5.0,
            },
          });
        }

        // Get settings document
        try {
          const result = await esClient.get({
            index: SETTINGS_INDEX_NAME,
            id: 'retention_scores',
          });

          return response.ok({
            body: {
              retentionScores: (result._source as { scores: RetentionSettings })?.scores || {},
              defaultScore: 5.0,
            },
          });
        } catch {
          // Document doesn't exist, return defaults
          return response.ok({
            body: {
              retentionScores: {} as RetentionSettings,
              defaultScore: 5.0,
            },
          });
        }
      } catch (error) {
        return response.customError({
          statusCode: 500,
          body: {
            message: `Failed to get retention settings: ${error instanceof Error ? error.message : String(error)}`,
          },
        });
      }
    }
  );

  // Save retention score settings
  router.post(
    {
      path: '/api/mitre_data_quality/settings/retention',
      security: {
        authz: {
          requiredPrivileges: ['mitreDataQuality'],
        },
      },
      validate: {
        body: schema.object({
          platform: schema.string(),
          score: schema.number({ min: 0, max: 5 }),
        }),
      },
    },
    async (context, request, response) => {
      try {
        const coreContext = await context.core;
        const esClient = coreContext.elasticsearch.client.asInternalUser;
        const { platform, score } = request.body;

        // Create index if it doesn't exist
        const indexExists = await esClient.indices.exists({ index: SETTINGS_INDEX_NAME });
        if (!indexExists) {
          await esClient.indices.create({
            index: SETTINGS_INDEX_NAME,
            settings: {
              number_of_shards: 1,
              number_of_replicas: 0,
            },
            mappings: {
              properties: {
                scores: { type: 'object', enabled: true },
              },
            },
          });
        }

        // Get existing settings or create new
        let currentScores: RetentionSettings = {};
        try {
          const result = await esClient.get({
            index: SETTINGS_INDEX_NAME,
            id: 'retention_scores',
          });
          currentScores = (result._source as { scores: RetentionSettings })?.scores || {};
        } catch {
          // Document doesn't exist yet
        }

        // Update the score for this platform
        currentScores[platform] = score;

        // Save updated settings
        await esClient.index({
          index: SETTINGS_INDEX_NAME,
          id: 'retention_scores',
          body: {
            scores: currentScores,
            updated_at: new Date().toISOString(),
          },
          refresh: true,
        });

        return response.ok({
          body: {
            message: 'Retention score saved',
            platform,
            score,
          },
        });
      } catch (error) {
        return response.customError({
          statusCode: 500,
          body: {
            message: `Failed to save retention settings: ${error instanceof Error ? error.message : String(error)}`,
          },
        });
      }
    }
  );

  // Get device completeness score settings
  router.get(
    {
      path: '/api/mitre_data_quality/settings/device_completeness',
      security: {
        authz: {
          requiredPrivileges: ['mitreDataQuality'],
        },
      },
      validate: false,
    },
    async (context, request, response) => {
      try {
        const coreContext = await context.core;
        const esClient = coreContext.elasticsearch.client.asInternalUser;

        const indexExists = await esClient.indices.exists({ index: SETTINGS_INDEX_NAME });

        if (!indexExists) {
          return response.ok({
            body: {
              deviceCompletenessScores: {} as RetentionSettings,
              defaultScore: 2.0,
            },
          });
        }

        try {
          const result = await esClient.get({
            index: SETTINGS_INDEX_NAME,
            id: 'device_completeness_scores',
          });

          return response.ok({
            body: {
              deviceCompletenessScores: (result._source as { scores: RetentionSettings })?.scores || {},
              defaultScore: 2.0,
            },
          });
        } catch {
          return response.ok({
            body: {
              deviceCompletenessScores: {} as RetentionSettings,
              defaultScore: 2.0,
            },
          });
        }
      } catch (error) {
        return response.customError({
          statusCode: 500,
          body: {
            message: `Failed to get device completeness settings: ${error instanceof Error ? error.message : String(error)}`,
          },
        });
      }
    }
  );

  // Save device completeness score settings
  router.post(
    {
      path: '/api/mitre_data_quality/settings/device_completeness',
      security: {
        authz: {
          requiredPrivileges: ['mitreDataQuality'],
        },
      },
      validate: {
        body: schema.object({
          platform: schema.string(),
          score: schema.number({ min: 0, max: 5 }),
        }),
      },
    },
    async (context, request, response) => {
      try {
        const coreContext = await context.core;
        const esClient = coreContext.elasticsearch.client.asInternalUser;
        const { platform, score } = request.body;

        const indexExists = await esClient.indices.exists({ index: SETTINGS_INDEX_NAME });
        if (!indexExists) {
          await esClient.indices.create({
            index: SETTINGS_INDEX_NAME,
            settings: {
              number_of_shards: 1,
              number_of_replicas: 0,
            },
            mappings: {
              properties: {
                scores: { type: 'object', enabled: true },
              },
            },
          });
        }

        let currentScores: RetentionSettings = {};
        try {
          const result = await esClient.get({
            index: SETTINGS_INDEX_NAME,
            id: 'device_completeness_scores',
          });
          currentScores = (result._source as { scores: RetentionSettings })?.scores || {};
        } catch {
          // Document doesn't exist yet
        }

        currentScores[platform] = score;

        await esClient.index({
          index: SETTINGS_INDEX_NAME,
          id: 'device_completeness_scores',
          body: {
            scores: currentScores,
            updated_at: new Date().toISOString(),
          },
          refresh: true,
        });

        return response.ok({
          body: {
            message: 'Device completeness score saved',
            platform,
            score,
          },
        });
      } catch (error) {
        return response.customError({
          statusCode: 500,
          body: {
            message: `Failed to save device completeness settings: ${error instanceof Error ? error.message : String(error)}`,
          },
        });
      }
    }
  );
}
