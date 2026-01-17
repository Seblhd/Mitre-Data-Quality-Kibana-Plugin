import React, { useState, useCallback, useMemo, useEffect } from 'react';
import type { HttpSetup } from '@kbn/core/public';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiText,
  EuiToolTip,
  EuiAccordion,
  EuiSpacer,
  EuiPopover,
  EuiPopoverTitle,
  EuiButtonEmpty,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { useEuiTheme } from '@elastic/eui';
import type {
  MitreTechnique,
  TacticWithTechniques,
  MitreMatrixData,
  MitreDetectionStrategy,
  MitreAnalytic,
} from '../../common';
import type { PlatformFilterState, SortOrder, ScoreFilter } from './app';
import { useQualityColors } from './use_quality_colors';

interface ScoreDetails {
  score: number;
  details: Record<string, unknown>;
}

interface Scores {
  next_execution: string;
  quality_score: number;
  data_field_completeness: ScoreDetails;
  timeliness: ScoreDetails;
  consistency: ScoreDetails;
  device_completeness: ScoreDetails;
  retention: ScoreDetails;
}

interface EcsMapping {
  name_field: string;
  name_value: string;
  channel_field: string;
  channel_value: string;
  scores?: Scores;
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

interface AnalyticResultsData {
  id: string;
  name: string;
  x_mitre_log_source_references: LogSourceReference[];
}

const PANEL_WIDTH = 160;

const ScoreDisplay: React.FC<{ scores: Scores }> = ({ scores }) => {
  const { euiTheme } = useEuiTheme();

  const getScoreColor = (score: number, max: number = 5) => {
    const ratio = score / max;
    if (ratio >= 0.8) return euiTheme.colors.success;
    if (ratio >= 0.5) return euiTheme.colors.warning;
    return euiTheme.colors.danger;
  };

  return (
    <div
      css={css`
        margin-top: 4px;
        padding: 6px 8px;
        background: ${euiTheme.colors.lightestShade};
        border-radius: 4px;
      `}
    >
      <EuiFlexGroup gutterSize="xs" alignItems="center" wrap>
        <EuiFlexItem grow={false}>
          <EuiText
            size="xs"
            css={css`
              font-weight: 700;
              font-size: 14px;
              color: ${getScoreColor(scores.quality_score)};
            `}
          >
            {scores.quality_score.toFixed(1)}
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiText size="xs" color="subdued">
            /5
          </EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiFlexGroup gutterSize="xs" wrap>
        <EuiFlexItem grow={false}>
          <EuiToolTip content="Data Field Completeness">
            <EuiText
              size="xs"
              css={css`
                color: ${getScoreColor(scores.data_field_completeness.score)};
              `}
            >
              C:{scores.data_field_completeness.score.toFixed(1)}
            </EuiText>
          </EuiToolTip>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiToolTip content="Timeliness">
            <EuiText
              size="xs"
              css={css`
                color: ${getScoreColor(scores.timeliness.score)};
              `}
            >
              T:{scores.timeliness.score.toFixed(1)}
            </EuiText>
          </EuiToolTip>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiToolTip content="Consistency">
            <EuiText
              size="xs"
              css={css`
                color: ${getScoreColor(scores.consistency.score)};
              `}
            >
              Co:{scores.consistency.score.toFixed(1)}
            </EuiText>
          </EuiToolTip>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiToolTip content="Device Completeness">
            <EuiText
              size="xs"
              css={css`
                color: ${getScoreColor(scores.device_completeness.score)};
              `}
            >
              D:{scores.device_completeness.score.toFixed(1)}
            </EuiText>
          </EuiToolTip>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiToolTip content="Retention">
            <EuiText
              size="xs"
              css={css`
                color: ${getScoreColor(scores.retention.score)};
              `}
            >
              R:{scores.retention.score.toFixed(1)}
            </EuiText>
          </EuiToolTip>
        </EuiFlexItem>
      </EuiFlexGroup>
    </div>
  );
};

interface AnalyticAccordionContentProps {
  analyticId: string;
  http: HttpSetup;
}

const AnalyticAccordionContent: React.FC<AnalyticAccordionContentProps> = ({
  analyticId,
  http,
}) => {
  const [resultsData, setResultsData] = useState<AnalyticResultsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchResults = async () => {
      try {
        setLoading(true);
        const data = await http.get<AnalyticResultsData>(
          `/api/mitre_data_quality/results/${encodeURIComponent(analyticId)}`
        );
        setResultsData(data);
        setError(null);
      } catch (err) {
        setError('No scores available');
      } finally {
        setLoading(false);
      }
    };

    fetchResults();
  }, [analyticId, http]);

  if (loading) {
    return (
      <EuiText size="xs" color="subdued">
        Loading...
      </EuiText>
    );
  }

  if (error || !resultsData) {
    return (
      <EuiText size="xs" color="subdued">
        {error || 'No data available'}
      </EuiText>
    );
  }

  return (
    <div>
      {resultsData.x_mitre_log_source_references.map((ref, index) => {
        const ecsLine1 =
          ref.mapping.ecs.name_field && ref.mapping.ecs.name_value
            ? `${ref.mapping.ecs.name_field}: ${ref.mapping.ecs.name_value}`
            : '';
        const ecsLine2 =
          ref.mapping.ecs.channel_field && ref.mapping.ecs.channel_value
            ? `${ref.mapping.ecs.channel_field}: ${ref.mapping.ecs.channel_value}`
            : '';

        return (
          <div key={`${ref.x_mitre_data_component_ref}-${index}`} style={{ marginBottom: 12 }}>
            <EuiText size="xs">
              <strong>Data Component: {ref.data_component_name}</strong>
            </EuiText>
            <EuiText size="xs" color="subdued">
              ECS:
              <br />
              {ecsLine1}
              {ecsLine2 && (
                <>
                  <br />
                  {ecsLine2}
                </>
              )}
              {!ecsLine1 && !ecsLine2 && <span>(not mapped)</span>}
            </EuiText>
            {ref.mapping.ecs.scores && <ScoreDisplay scores={ref.mapping.ecs.scores} />}
          </div>
        );
      })}
    </div>
  );
};

interface DetectionStrategyPopoverContentProps {
  strategy: MitreDetectionStrategy;
  platformFilter: PlatformFilterState;
  http: HttpSetup;
}

const AverageScoreBadge: React.FC<{ score: number | null; loading: boolean }> = ({
  score,
  loading,
}) => {
  const { euiTheme } = useEuiTheme();

  const getScoreColor = (s: number) => {
    const ratio = s / 5;
    if (ratio >= 0.8) return euiTheme.colors.success;
    if (ratio >= 0.5) return euiTheme.colors.warning;
    return euiTheme.colors.danger;
  };

  if (loading) {
    return (
      <EuiText size="xs" color="subdued">
        Loading scores...
      </EuiText>
    );
  }

  if (score === null) {
    return (
      <EuiText size="xs" color="subdued">
        No scores
      </EuiText>
    );
  }

  return (
    <EuiFlexGroup gutterSize="xs" alignItems="center">
      <EuiFlexItem grow={false}>
        <EuiText size="xs" color="subdued">
          Avg Quality:
        </EuiText>
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiText
          size="s"
          css={css`
            font-weight: 700;
            color: ${getScoreColor(score)};
          `}
        >
          {score.toFixed(1)}/5
        </EuiText>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};

const DetectionStrategyPopoverContent: React.FC<DetectionStrategyPopoverContentProps> = ({
  strategy,
  platformFilter,
  http,
}) => {
  const { euiTheme } = useEuiTheme();
  const [analyticScores, setAnalyticScores] = useState<Map<string, number | null>>(new Map());
  const [loadingScores, setLoadingScores] = useState(true);

  const filteredAnalytics = useMemo(() => {
    if (platformFilter.size === 0) {
      return strategy.analytics;
    }

    return strategy.analytics.filter((analytic) => {
      return analytic.platforms.some((p) => platformFilter.has(p));
    });
  }, [strategy.analytics, platformFilter]);

  // Fetch scores for all filtered analytics
  useEffect(() => {
    const fetchAllScores = async () => {
      setLoadingScores(true);
      const newScores = new Map<string, number | null>();

      await Promise.all(
        filteredAnalytics.map(async (analytic) => {
          try {
            const data = await http.get<AnalyticResultsData>(
              `/api/mitre_data_quality/results/${encodeURIComponent(analytic.id)}`
            );
            if (data.x_mitre_log_source_references.length > 0) {
              const scores = data.x_mitre_log_source_references
                .map((ref) => ref.mapping.ecs.scores?.quality_score)
                .filter((s): s is number => s !== undefined);
              if (scores.length > 0) {
                const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
                newScores.set(analytic.id, avgScore);
              } else {
                newScores.set(analytic.id, null);
              }
            } else {
              newScores.set(analytic.id, null);
            }
          } catch {
            newScores.set(analytic.id, null);
          }
        })
      );

      setAnalyticScores(newScores);
      setLoadingScores(false);
    };

    if (filteredAnalytics.length > 0) {
      fetchAllScores();
    } else {
      setLoadingScores(false);
    }
  }, [filteredAnalytics, http]);

  // Calculate average score across all analytics
  const averageScore = useMemo(() => {
    const validScores = Array.from(analyticScores.values()).filter(
      (s): s is number => s !== null
    );
    if (validScores.length === 0) return null;
    return validScores.reduce((a, b) => a + b, 0) / validScores.length;
  }, [analyticScores]);

  return (
    <>
      <EuiPopoverTitle
        css={css`
          min-width: 300px;
        `}
      >
        <EuiButtonEmpty
          flush="left"
          iconType="popout"
          iconSide="right"
          href={strategy.url}
          target="_blank"
          size="s"
        >
          <EuiText size="s">
            <h4>{strategy.name}</h4>
          </EuiText>
        </EuiButtonEmpty>
      </EuiPopoverTitle>
      <div
        css={css`
          max-height: 400px;
          overflow-y: auto;
          padding: 8px 0;
        `}
      >
        {filteredAnalytics.length > 0 ? (
          <>
            <EuiFlexGroup justifyContent="spaceBetween" alignItems="center">
              <EuiFlexItem grow={false}>
                <EuiText size="xs" color="subdued">
                  <strong>{filteredAnalytics.length} Analytics</strong>
                </EuiText>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <AverageScoreBadge score={averageScore} loading={loadingScores} />
              </EuiFlexItem>
            </EuiFlexGroup>
            <EuiSpacer size="xs" />
            {filteredAnalytics.map((analytic) => {
              const analyticScore = analyticScores.get(analytic.id);
              return (
                <EuiAccordion
                  key={analytic.id}
                  id={`analytic-${analytic.id}`}
                  buttonContent={
                    <EuiFlexGroup gutterSize="s" alignItems="center">
                      <EuiFlexItem grow>
                        <EuiText size="xs">{analytic.name}</EuiText>
                      </EuiFlexItem>
                      {analyticScore !== undefined && analyticScore !== null && (
                        <EuiFlexItem grow={false}>
                          <EuiText
                            size="xs"
                            css={css`
                              color: ${analyticScore >= 4
                                ? euiTheme.colors.success
                                : analyticScore >= 2.5
                                  ? euiTheme.colors.warning
                                  : euiTheme.colors.danger};
                            `}
                          >
                            {analyticScore.toFixed(1)}
                          </EuiText>
                        </EuiFlexItem>
                      )}
                    </EuiFlexGroup>
                  }
                  paddingSize="s"
                  css={css`
                    .euiAccordion__button {
                      padding: 4px 0;
                    }
                    border-bottom: 1px solid ${euiTheme.colors.lightShade};
                  `}
                >
                  <AnalyticAccordionContent analyticId={analytic.id} http={http} />
                </EuiAccordion>
              );
            })}
          </>
        ) : (
          <EuiText size="xs" color="subdued">
            No analytics available
          </EuiText>
        )}
      </div>
    </>
  );
};

interface TechniquePanelWithPopoverProps {
  technique: MitreTechnique;
  isSubtechnique?: boolean;
  platformFilter: PlatformFilterState;
  http: HttpSetup;
  averageScore?: number | null;
}

const TechniquePanelWithPopover: React.FC<TechniquePanelWithPopoverProps> = ({
  technique,
  isSubtechnique = false,
  platformFilter,
  http,
  averageScore,
}) => {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const { euiTheme } = useEuiTheme();
  const { getColorsForScore } = useQualityColors();

  const hasDetectionStrategies =
    technique.detectionStrategies && technique.detectionStrategies.length > 0;

  const closePopover = useCallback(() => setIsPopoverOpen(false), []);
  const togglePopover = useCallback(() => setIsPopoverOpen((prev) => !prev), []);

  const handlePanelClick = useCallback(() => {
    if (hasDetectionStrategies) {
      togglePopover();
    } else {
      window.open(technique.url, '_blank');
    }
  }, [hasDetectionStrategies, technique.url, togglePopover]);

  const scoreColors = getColorsForScore(averageScore);

  const panelContent = (
    <EuiPanel
      hasShadow={false}
      hasBorder={!isSubtechnique}
      paddingSize={isSubtechnique ? 'xs' : 's'}
      onClick={handlePanelClick}
      css={css`
        width: ${isSubtechnique ? '100%' : `${PANEL_WIDTH}px`};
        box-sizing: border-box;
        cursor: pointer;
        ${scoreColors ? `background: ${scoreColors.backgroundColor};` : ''}
        ${isSubtechnique
          ? `
          border-left: 2px solid ${euiTheme.colors.lightShade};
        `
          : ''}
        &:hover {
          ${scoreColors
            ? `filter: brightness(0.95);`
            : `background: ${euiTheme.colors.lightestShade};`}
        }
      `}
    >
      <EuiText size="xs">
        {isSubtechnique ? (
          <span
            css={css`
              font-weight: 600;
              color: ${scoreColors?.textColor ?? euiTheme.colors.text};
              word-wrap: break-word;
              overflow-wrap: break-word;
            `}
          >
            {technique.name}
          </span>
        ) : (
          <h4
            css={css`
              font-weight: 600;
              color: ${scoreColors?.textColor ?? euiTheme.colors.text};
              margin: 0;
              word-wrap: break-word;
              overflow-wrap: break-word;
            `}
          >
            {technique.name}
          </h4>
        )}
      </EuiText>
      <EuiText
        size="xs"
        css={css`
          color: ${scoreColors?.textColor ?? euiTheme.colors.subduedText};
        `}
      >
        {technique.externalId}
      </EuiText>
      {hasDetectionStrategies && (
        <EuiText
          size="xs"
          css={css`
            color: ${scoreColors?.textColor ?? euiTheme.colors.subduedText};
          `}
        >
          {technique.detectionStrategies![0].externalId}
        </EuiText>
      )}
    </EuiPanel>
  );

  if (!hasDetectionStrategies) {
    return panelContent;
  }

  return (
    <EuiPopover
      button={panelContent}
      isOpen={isPopoverOpen}
      closePopover={closePopover}
      anchorPosition="rightCenter"
      ownFocus={false}
      panelPaddingSize="s"
    >
      <DetectionStrategyPopoverContent
        strategy={technique.detectionStrategies![0]}
        platformFilter={platformFilter}
        http={http}
      />
    </EuiPopover>
  );
};

interface TechniqueItemProps {
  technique: MitreTechnique;
  platformFilter: PlatformFilterState;
  http: HttpSetup;
  analyticScores: Record<string, number>;
}

// Helper to calculate average score for a technique's analytics
const calculateTechniqueScore = (
  technique: MitreTechnique,
  platformFilter: PlatformFilterState,
  analyticScores: Record<string, number>
): number | null => {
  if (!technique.detectionStrategies?.length) return null;

  const analytics = technique.detectionStrategies[0].analytics;
  const filteredAnalytics =
    platformFilter.size === 0
      ? analytics
      : analytics.filter((a) => a.platforms.some((p) => platformFilter.has(p)));

  const scores = filteredAnalytics
    .map((a) => analyticScores[a.id])
    .filter((s): s is number => s !== undefined);

  if (scores.length === 0) return null;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
};

const TechniqueItem: React.FC<TechniqueItemProps> = ({
  technique,
  platformFilter,
  http,
  analyticScores,
}) => {
  const { euiTheme } = useEuiTheme();
  const hasSubtechniques = technique.subtechniques && technique.subtechniques.length > 0;
  const hasDetectionStrategies =
    technique.detectionStrategies && technique.detectionStrategies.length > 0;

  const techniqueScore = useMemo(
    () => calculateTechniqueScore(technique, platformFilter, analyticScores),
    [technique, platformFilter, analyticScores]
  );

  if (!hasSubtechniques) {
    return (
      <TechniquePanelWithPopover
        technique={technique}
        platformFilter={platformFilter}
        http={http}
        averageScore={techniqueScore}
      />
    );
  }

  if (hasDetectionStrategies) {
    return (
      <EuiPanel
        hasShadow={false}
        hasBorder
        paddingSize="s"
        css={css`
          width: ${PANEL_WIDTH}px;
        `}
      >
        <TechniquePanelWithPopover
          technique={technique}
          platformFilter={platformFilter}
          http={http}
          averageScore={techniqueScore}
        />
        <EuiAccordion
          id={`accordion-${technique.id}`}
          buttonContent={
            <EuiText size="xs" color="subdued">
              {technique.subtechniques!.length} subtechniques
            </EuiText>
          }
          paddingSize="none"
          arrowDisplay="right"
          css={css`
            .euiAccordion__button {
              padding: 2px 0;
            }
            .euiAccordion__iconButton {
              margin-left: 4px;
            }
          `}
        >
          <EuiSpacer size="xs" />
          <EuiFlexGroup
            direction="column"
            gutterSize="xs"
            css={css`
              margin-left: 8px;
            `}
          >
            {technique.subtechniques!.map((sub) => {
              const subScore = calculateTechniqueScore(sub, platformFilter, analyticScores);
              return (
                <EuiFlexItem key={sub.id} grow={false}>
                  <TechniquePanelWithPopover
                    technique={sub}
                    isSubtechnique
                    platformFilter={platformFilter}
                    http={http}
                    averageScore={subScore}
                  />
                </EuiFlexItem>
              );
            })}
          </EuiFlexGroup>
        </EuiAccordion>
      </EuiPanel>
    );
  }

  return (
    <EuiPanel
      hasShadow={false}
      hasBorder
      paddingSize="s"
      css={css`
        width: ${PANEL_WIDTH}px;
      `}
    >
      <EuiText
        size="xs"
        onClick={() => window.open(technique.url, '_blank')}
        css={css`
          cursor: pointer;
          &:hover {
            text-decoration: underline;
          }
        `}
      >
        <h4
          css={css`
            font-weight: 600;
            color: ${euiTheme.colors.text};
            margin: 0;
            word-wrap: break-word;
            overflow-wrap: break-word;
          `}
        >
          {technique.name}
        </h4>
      </EuiText>
      <EuiText size="xs" color="subdued">
        {technique.externalId}
      </EuiText>
      <EuiAccordion
        id={`accordion-${technique.id}`}
        buttonContent={
          <EuiText size="xs" color="subdued">
            {technique.subtechniques!.length} subtechniques
          </EuiText>
        }
        paddingSize="none"
        arrowDisplay="right"
        css={css`
          .euiAccordion__button {
            padding: 2px 0;
          }
          .euiAccordion__iconButton {
            margin-left: 4px;
          }
        `}
      >
        <EuiSpacer size="xs" />
        <EuiFlexGroup
          direction="column"
          gutterSize="xs"
          css={css`
            margin-left: 8px;
          `}
        >
          {technique.subtechniques!.map((sub) => {
            const subScore = calculateTechniqueScore(sub, platformFilter, analyticScores);
            return (
              <EuiFlexItem key={sub.id} grow={false}>
                <TechniquePanelWithPopover
                  technique={sub}
                  isSubtechnique
                  platformFilter={platformFilter}
                  http={http}
                  averageScore={subScore}
                />
              </EuiFlexItem>
            );
          })}
        </EuiFlexGroup>
      </EuiAccordion>
    </EuiPanel>
  );
};

interface TacticColumnProps {
  tacticData: TacticWithTechniques;
  platformFilter: PlatformFilterState;
  http: HttpSetup;
  analyticScores: Record<string, number>;
}

const TacticColumn: React.FC<TacticColumnProps> = ({
  tacticData,
  platformFilter,
  http,
  analyticScores,
}) => {
  const { euiTheme } = useEuiTheme();
  const { tactic, techniques } = tacticData;

  return (
    <EuiFlexGroup direction="column" gutterSize="s">
      <EuiFlexItem grow={false}>
        <EuiPanel
          hasShadow={false}
          hasBorder
          paddingSize="s"
          css={css`
            background: ${euiTheme.colors.lightestShade};
            border-color: ${euiTheme.colors.mediumShade};
            width: ${PANEL_WIDTH}px;
          `}
        >
          <EuiToolTip content={tactic.description} position="top">
            <EuiText
              css={css`
                h4 {
                  white-space: nowrap;
                  overflow: hidden;
                  text-overflow: ellipsis;
                }
              `}
              size="xs"
            >
              <h4>{tactic.name}</h4>
            </EuiText>
          </EuiToolTip>
          <EuiText size="xs" color="success">
            <h5>{techniques.length} techniques</h5>
          </EuiText>
        </EuiPanel>
      </EuiFlexItem>
      {techniques.map((technique) => (
        <EuiFlexItem key={technique.id} grow={false}>
          <TechniqueItem
            technique={technique}
            platformFilter={platformFilter}
            http={http}
            analyticScores={analyticScores}
          />
        </EuiFlexItem>
      ))}
    </EuiFlexGroup>
  );
};

interface TacticsGridProps {
  matrixData: MitreMatrixData;
  platformFilter: PlatformFilterState;
  http: HttpSetup;
  sortOrder: SortOrder;
  scoreFilter: ScoreFilter;
}

const filterAnalyticsByPlatform = (
  analytics: MitreAnalytic[],
  platformFilter: PlatformFilterState
): MitreAnalytic[] => {
  if (platformFilter.size === 0) {
    return analytics;
  }

  return analytics.filter((analytic) => {
    return analytic.platforms.some((p) => platformFilter.has(p));
  });
};

const filterTechniqueByPlatform = (
  technique: MitreTechnique,
  platformFilter: PlatformFilterState
): MitreTechnique | null => {
  if (!technique.detectionStrategies || technique.detectionStrategies.length === 0) {
    return null;
  }

  const filteredStrategies = technique.detectionStrategies
    .map((strategy) => ({
      ...strategy,
      analytics: filterAnalyticsByPlatform(strategy.analytics, platformFilter),
    }))
    .filter((strategy) => strategy.analytics.length > 0);

  if (filteredStrategies.length === 0) {
    return null;
  }

  return {
    ...technique,
    detectionStrategies: filteredStrategies,
  };
};

interface AllScoresResponse {
  scores: Record<string, number>;
  nextExecutions: Record<string, string>;
}

export const TacticsGrid: React.FC<TacticsGridProps> = React.memo(({
  matrixData,
  platformFilter,
  http,
  sortOrder,
  scoreFilter,
}) => {
  const [analyticScores, setAnalyticScores] = useState<Record<string, number>>({});

  // Fetch all scores once on mount
  useEffect(() => {
    const fetchAllScores = async () => {
      try {
        const response = await http.get<AllScoresResponse>('/api/mitre_data_quality/all_scores');
        setAnalyticScores(response.scores);
      } catch {
        // Scores not available yet
      }
    };

    fetchAllScores();
  }, [http]);

  // Helper to get technique score for sorting
  const getTechniqueScore = useCallback(
    (technique: MitreTechnique): number | null => {
      return calculateTechniqueScore(technique, platformFilter, analyticScores);
    },
    [platformFilter, analyticScores]
  );

  // Sort techniques based on sortOrder
  const sortTechniques = useCallback(
    (techniques: MitreTechnique[]): MitreTechnique[] => {
      const sorted = [...techniques];
      if (sortOrder === 'alphabetical') {
        sorted.sort((a, b) => a.name.localeCompare(b.name));
      } else {
        // Sort by score descending (highest first), null scores at the end
        sorted.sort((a, b) => {
          const scoreA = getTechniqueScore(a);
          const scoreB = getTechniqueScore(b);
          if (scoreA === null && scoreB === null) return 0;
          if (scoreA === null) return 1;
          if (scoreB === null) return -1;
          return scoreB - scoreA;
        });
      }
      return sorted;
    },
    [sortOrder, getTechniqueScore]
  );

  // Filter technique by score range
  const filterByScore = useCallback(
    (technique: MitreTechnique): boolean => {
      if (!scoreFilter) return true;

      const score = getTechniqueScore(technique);
      
      // For "<1 or N/A" filter (min=0, max=1)
      if (scoreFilter.min === 0 && scoreFilter.max === 1) {
        return score === null || score < 1;
      }

      // For other ranges
      if (score === null) return false;
      return score >= scoreFilter.min && score < scoreFilter.max;
    },
    [scoreFilter, getTechniqueScore]
  );

  const filteredTactics = useMemo(() => {
    const baseTactics =
      platformFilter.size === 0
        ? matrixData.tactics
        : matrixData.tactics.map((tacticData) => {
            const filteredTechniques = tacticData.techniques
              .map((technique) => {
                const filteredTechnique = filterTechniqueByPlatform(technique, platformFilter);
                if (!filteredTechnique) {
                  return null;
                }

                if (technique.subtechniques && technique.subtechniques.length > 0) {
                  const filteredSubtechniques = technique.subtechniques
                    .map((sub) => filterTechniqueByPlatform(sub, platformFilter))
                    .filter((sub): sub is MitreTechnique => sub !== null);

                  return {
                    ...filteredTechnique,
                    subtechniques: filteredSubtechniques,
                  };
                }

                return filteredTechnique;
              })
              .filter((t): t is MitreTechnique => t !== null);

            return {
              ...tacticData,
              techniques: filteredTechniques,
            };
          });

    // Apply score filtering
    const scoreFilteredTactics = baseTactics.map((tacticData) => ({
      ...tacticData,
      techniques: tacticData.techniques.filter(filterByScore),
    }));

    // Apply sorting to techniques within each tactic
    return scoreFilteredTactics.map((tacticData) => ({
      ...tacticData,
      techniques: sortTechniques(tacticData.techniques),
    }));
  }, [matrixData.tactics, platformFilter, sortTechniques, filterByScore]);

  return (
    <EuiFlexGroup
      gutterSize="s"
      wrap={false}
      responsive={false}
      alignItems="flexStart"
      css={css`
        overflow-x: auto;
        padding-bottom: 16px;
      `}
    >
      {filteredTactics.map((tacticData) => (
        <EuiFlexItem
          key={tacticData.tactic.id}
          grow={false}
          css={css`
            width: ${PANEL_WIDTH}px;
            min-width: ${PANEL_WIDTH}px;
            max-width: ${PANEL_WIDTH}px;
          `}
        >
          <TacticColumn
            tacticData={tacticData}
            platformFilter={platformFilter}
            http={http}
            analyticScores={analyticScores}
          />
        </EuiFlexItem>
      ))}
    </EuiFlexGroup>
  );
});
