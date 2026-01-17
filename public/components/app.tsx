import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { I18nProvider } from '@kbn/i18n-react';
import { BrowserRouter as Router } from '@kbn/shared-ux-router';
import {
  EuiTitle,
  EuiSpacer,
  EuiText,
  EuiComboBox,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingSpinner,
  EuiPanel,
  EuiButtonGroup,
  EuiButton,
  EuiFlyout,
  EuiFlyoutHeader,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiSelect,
  EuiRange,
  EuiFormRow,
} from '@elastic/eui';
import type { EuiComboBoxOptionOption } from '@elastic/eui';

import type { CoreStart } from '@kbn/core/public';
import type { NavigationPublicPluginStart } from '@kbn/navigation-plugin/public';

import { PLUGIN_NAME } from '../../common';
import type { MitreMatrixData } from '../../common';
import { TacticsGrid } from './tactics_grid';
import { QualityLegend } from './quality_legend';

const COMBOBOX_WIDTH = 300;

export type SortOrder = 'alphabetical' | 'score';

export type ScoreFilter = {
  min: number;
  max: number;
} | null;

interface MitreDataQualityAppDeps {
  basename: string;
  notifications: CoreStart['notifications'];
  http: CoreStart['http'];
  navigation: NavigationPublicPluginStart;
}

export type PlatformFilterState = Set<string>;

export const MitreDataQualityApp = ({
  basename,
  notifications,
  http,
  navigation,
}: MitreDataQualityAppDeps) => {
  const [matrixData, setMatrixData] = useState<MitreMatrixData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [platformOptions, setPlatformOptions] = useState<EuiComboBoxOptionOption[]>([]);
  const [selectedPlatforms, setSelectedPlatforms] = useState<EuiComboBoxOptionOption[]>([]);
  const [sortOrder, setSortOrder] = useState<SortOrder>('alphabetical');
  const [scoreFilter, setScoreFilter] = useState<ScoreFilter>(null);
  const [isSettingsFlyoutOpen, setIsSettingsFlyoutOpen] = useState(false);
  const [retentionScores, setRetentionScores] = useState<Record<string, number>>({});
  const [deviceCompletenessScores, setDeviceCompletenessScores] = useState<Record<string, number>>({});
  const [selectedSettingsPlatform, setSelectedSettingsPlatform] = useState<string>('');
  const [currentRetentionScore, setCurrentRetentionScore] = useState<number>(5.0);
  const [currentDeviceCompletenessScore, setCurrentDeviceCompletenessScore] = useState<number>(2.0);

  const sortOrderOptions = [
    { id: 'alphabetical', label: 'A-Z' },
    { id: 'score', label: 'By Score' },
  ];

  const fetchMatrix = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await http.get<MitreMatrixData>('/api/mitre_data_quality/matrix');
      setMatrixData(response);
      setPlatformOptions(
        response.availablePlatforms.map((platform) => ({
          label: platform,
        }))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load MITRE ATT&CK data');
    } finally {
      setLoading(false);
    }
  }, [http]);

  const triggerScoring = useCallback(async () => {
    try {
      await http.get('/api/mitre_data_quality/trigger_scoring');
    } catch (err) {
      // Scoring trigger is best-effort, don't block page load
      console.warn('Failed to trigger scoring:', err);
    }
  }, [http]);

  const fetchRetentionSettings = useCallback(async () => {
    try {
      const response = await http.get<{ retentionScores: Record<string, number>; defaultScore: number }>(
        '/api/mitre_data_quality/settings/retention'
      );
      setRetentionScores(response.retentionScores);
      return response.retentionScores;
    } catch (err) {
      console.warn('Failed to fetch retention settings:', err);
      return {};
    }
  }, [http]);

  const fetchDeviceCompletenessSettings = useCallback(async () => {
    try {
      const response = await http.get<{ deviceCompletenessScores: Record<string, number>; defaultScore: number }>(
        '/api/mitre_data_quality/settings/device_completeness'
      );
      setDeviceCompletenessScores(response.deviceCompletenessScores);
      return response.deviceCompletenessScores;
    } catch (err) {
      console.warn('Failed to fetch device completeness settings:', err);
      return {};
    }
  }, [http]);

  const saveSettings = useCallback(async () => {
    if (!selectedSettingsPlatform) return;
    try {
      // Save retention score
      await http.post('/api/mitre_data_quality/settings/retention', {
        body: JSON.stringify({
          platform: selectedSettingsPlatform,
          score: currentRetentionScore,
        }),
      });
      setRetentionScores((prev) => ({
        ...prev,
        [selectedSettingsPlatform]: currentRetentionScore,
      }));

      // Save device completeness score
      await http.post('/api/mitre_data_quality/settings/device_completeness', {
        body: JSON.stringify({
          platform: selectedSettingsPlatform,
          score: currentDeviceCompletenessScore,
        }),
      });
      setDeviceCompletenessScores((prev) => ({
        ...prev,
        [selectedSettingsPlatform]: currentDeviceCompletenessScore,
      }));

      notifications.toasts.addSuccess('Settings saved. Recalculating scores...');

      // Invalidate cache and force full recalculation
      await http.post('/api/mitre_data_quality/settings/invalidate_cache');
      await http.post('/internal/mitre_data_quality/force_quality_check');
      
      // Notify user to refresh to see new scores
      notifications.toasts.addInfo('Score recalculation started. Refresh the page in a few seconds to see updated scores.');
    } catch (err) {
      notifications.toasts.addError(err instanceof Error ? err : new Error('Unknown error'), {
        title: 'Failed to save settings',
      });
    }
  }, [http, selectedSettingsPlatform, currentRetentionScore, currentDeviceCompletenessScore, notifications]);

  const handleOpenSettings = useCallback(() => {
    // Set initial values from cached settings (already pre-fetched on page load)
    if (matrixData?.availablePlatforms.length) {
      const firstPlatform = matrixData.availablePlatforms[0];
      setSelectedSettingsPlatform(firstPlatform);
      setCurrentRetentionScore(retentionScores[firstPlatform] ?? 5.0);
      setCurrentDeviceCompletenessScore(deviceCompletenessScores[firstPlatform] ?? 2.0);
    }
    // Open flyout - no network calls here, uses cached values
    setIsSettingsFlyoutOpen(true);
  }, [matrixData, retentionScores, deviceCompletenessScores]);

  const handlePlatformSettingsChange = useCallback(
    (platform: string) => {
      setSelectedSettingsPlatform(platform);
      setCurrentRetentionScore(retentionScores[platform] ?? 5.0);
      setCurrentDeviceCompletenessScore(deviceCompletenessScores[platform] ?? 2.0);
    },
    [retentionScores, deviceCompletenessScores]
  );

  useEffect(() => {
    fetchMatrix();
    triggerScoring();
  }, [fetchMatrix, triggerScoring]);

  // Pre-fetch settings after initial load (non-blocking)
  useEffect(() => {
    if (!loading && matrixData) {
      fetchRetentionSettings();
      fetchDeviceCompletenessSettings();
    }
  }, [loading, matrixData, fetchRetentionSettings, fetchDeviceCompletenessSettings]);

  const handlePlatformChange = useCallback((selected: EuiComboBoxOptionOption[]) => {
    setSelectedPlatforms(selected);
  }, []);

  const platformFilterState = useMemo((): PlatformFilterState => {
    return new Set(selectedPlatforms.map((opt) => opt.label));
  }, [selectedPlatforms]);

  const settingsPlatformOptions = useMemo(
    () => matrixData?.availablePlatforms.map((p) => ({ value: p, text: p })) || [],
    [matrixData?.availablePlatforms]
  );

  if (loading) {
    return (
      <Router basename={basename}>
        <I18nProvider>
          <div style={{ padding: '16px 24px' }}>
            <EuiFlexGroup justifyContent="center" alignItems="center">
              <EuiFlexItem grow={false}>
                <EuiLoadingSpinner size="xl" />
              </EuiFlexItem>
            </EuiFlexGroup>
          </div>
        </I18nProvider>
      </Router>
    );
  }

  if (error) {
    return (
      <Router basename={basename}>
        <I18nProvider>
          <div style={{ padding: '16px 24px' }}>
            <EuiPanel color="danger">
              <EuiText color="danger">{error}</EuiText>
            </EuiPanel>
          </div>
        </I18nProvider>
      </Router>
    );
  }

  if (!matrixData) {
    return null;
  }

  return (
    <Router basename={basename}>
      <I18nProvider>
        <div style={{ padding: '16px 24px' }}>
          <EuiFlexGroup justifyContent="spaceBetween" alignItems="flexStart">
            <EuiFlexItem grow={false}>
              <EuiTitle size="l">
                <h1>{PLUGIN_NAME}</h1>
              </EuiTitle>
              <EuiText color="subdued" size="s">
                <p>
                  Analyze data quality coverage for MITRE ATT&CK® techniques based on your data
                  sources.
                </p>
              </EuiText>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButton
                iconType="controls"
                onClick={handleOpenSettings}
                style={{ backgroundColor: '#00BFB34D', borderColor: '#00BFB34D', color: 'black' }}
              >
                Edit settings
              </EuiButton>
            </EuiFlexItem>
          </EuiFlexGroup>
          <EuiSpacer size="m" />
          <EuiPanel hasShadow paddingSize="m">
            <EuiFlexGroup alignItems="stretch" gutterSize="m" responsive={false}>
              <EuiFlexItem grow={false} style={{ width: COMBOBOX_WIDTH }}>
                <EuiFlexGroup direction="column" gutterSize="s">
                  <EuiFlexItem>
                    <EuiComboBox
                      placeholder="Filter by platform..."
                      options={platformOptions}
                      selectedOptions={selectedPlatforms}
                      onChange={handlePlatformChange}
                      isClearable
                      fullWidth
                    />
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiButtonGroup
                      legend="Sort order"
                      options={sortOrderOptions}
                      idSelected={sortOrder}
                      onChange={(id) => setSortOrder(id as SortOrder)}
                      buttonSize="compressed"
                      isFullWidth
                    />
                  </EuiFlexItem>
                </EuiFlexGroup>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <QualityLegend
                  selectedFilter={scoreFilter}
                  onFilterChange={setScoreFilter}
                />
              </EuiFlexItem>
              <EuiFlexItem grow />
            </EuiFlexGroup>
          </EuiPanel>
          <EuiSpacer size="l" />
          <TacticsGrid
            matrixData={matrixData}
            platformFilter={platformFilterState}
            http={http}
            sortOrder={sortOrder}
            scoreFilter={scoreFilter}
          />
        </div>

        {isSettingsFlyoutOpen && (
          <EuiFlyout
            onClose={() => setIsSettingsFlyoutOpen(false)}
            size="m"
          >
            <EuiFlyoutHeader hasBorder>
              <EuiTitle size="m">
                <h2>Data Quality Settings</h2>
              </EuiTitle>
            </EuiFlyoutHeader>
            <EuiFlyoutBody>
              <EuiTitle size="s">
                <h3>Scoring Settings</h3>
              </EuiTitle>
              <EuiSpacer size="m" />

              {/* Platform Selection */}
              <EuiFormRow label="Platform" style={{ maxWidth: 200 }}>
                <EuiSelect
                  options={settingsPlatformOptions}
                  value={selectedSettingsPlatform}
                  onChange={(e) => handlePlatformSettingsChange(e.target.value)}
                  style={{ color: 'black' }}
                  fullWidth
                />
              </EuiFormRow>

              <EuiSpacer size="l" />

              {/* Data Retention Score */}
              <EuiText size="s">
                <h4 style={{ color: 'black' }}>Data Retention Score</h4>
              </EuiText>
              <EuiSpacer size="s" />
              <EuiFormRow
                label={`Current saved value: ${retentionScores[selectedSettingsPlatform] ?? 5.0}`}
              >
                <EuiRange
                  min={0}
                  max={5}
                  step={0.1}
                  value={currentRetentionScore}
                  onChange={(e) => setCurrentRetentionScore(parseFloat(e.currentTarget.value))}
                  showLabels
                  showValue
                  showTicks
                  tickInterval={1}
                  style={{
                    // @ts-expect-error - custom CSS variable for track color
                    '--eui-range-track-color': '#00BFB3',
                  }}
                />
              </EuiFormRow>

              <EuiSpacer size="l" />

              {/* Device Completeness Score */}
              <EuiText size="s">
                <h4 style={{ color: 'black' }}>Device Completeness Score</h4>
              </EuiText>
              <EuiSpacer size="s" />
              <EuiFormRow
                label={`Current saved value: ${deviceCompletenessScores[selectedSettingsPlatform] ?? 2.0}`}
              >
                <EuiRange
                  min={0}
                  max={5}
                  step={0.1}
                  value={currentDeviceCompletenessScore}
                  onChange={(e) => setCurrentDeviceCompletenessScore(parseFloat(e.currentTarget.value))}
                  showLabels
                  showValue
                  showTicks
                  tickInterval={1}
                  style={{
                    // @ts-expect-error - custom CSS variable for track color
                    '--eui-range-track-color': '#00BFB3',
                  }}
                />
              </EuiFormRow>
            </EuiFlyoutBody>
            <EuiFlyoutFooter>
              <EuiFlexGroup justifyContent="flexEnd" gutterSize="s">
                <EuiFlexItem grow={false}>
                  <EuiButton
                    onClick={() => setIsSettingsFlyoutOpen(false)}
                    style={{ backgroundColor: '#00BFB34D', borderColor: '#00BFB34D', color: 'black' }}
                  >
                    Cancel
                  </EuiButton>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiButton
                    iconType="save"
                    onClick={() => {
                      saveSettings();
                      setIsSettingsFlyoutOpen(false);
                    }}
                    style={{ backgroundColor: '#00BFB3', borderColor: '#00BFB3', color: 'white' }}
                  >
                    Save
                  </EuiButton>
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiFlyoutFooter>
          </EuiFlyout>
        )}
      </I18nProvider>
    </Router>
  );
};
