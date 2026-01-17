/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiFacetButton,
  EuiBetaBadge,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiText,
} from '@elastic/eui';
import { css } from '@emotion/react';
import React, { useCallback, useMemo } from 'react';
import { useQualityColors } from './use_quality_colors';
import type { ScoreFilter } from './app';

interface LegendLabelProps {
  label: string;
  color?: string;
  isSelected?: boolean;
  onClick?: () => void;
}

const LegendLabel: React.FC<LegendLabelProps> = ({ label, color, isSelected, onClick }) => (
  <EuiFacetButton
    size="xs"
    element="span"
    css={css`
      padding: 0;
      ${onClick ? 'cursor: pointer;' : ''}
      ${isSelected ? 'outline: 2px solid #006BB4; outline-offset: 1px; border-radius: 4px;' : ''}
    `}
    onClick={onClick}
    icon={
      <EuiBetaBadge
        css={{ background: color, boxShadow: color != null ? 'none' : undefined }}
        label={label}
        iconType="empty"
        size="s"
      />
    }
  >
    {label}
  </EuiFacetButton>
);

interface QualityLegendProps {
  selectedFilter: ScoreFilter;
  onFilterChange: (filter: ScoreFilter) => void;
}

export const QualityLegend: React.FC<QualityLegendProps> = ({
  selectedFilter,
  onFilterChange,
}) => {
  const { qualityColors } = useQualityColors();

  const handleFilterClick = useCallback(
    (min: number, max: number) => {
      // Toggle off if same filter is clicked
      if (selectedFilter?.min === min && selectedFilter?.max === max) {
        onFilterChange(null);
      } else {
        onFilterChange({ min, max });
      }
    },
    [selectedFilter, onFilterChange]
  );

  const thresholdItems = useMemo(
    () =>
      qualityColors.map(({ threshold, backgroundColor }, index, thresholdsMap) => {
        const min = threshold;
        const max = index === 0 ? 5 : thresholdsMap[index - 1].threshold;
        const isSelected = selectedFilter?.min === min && selectedFilter?.max === max;
        const label =
          index === 0 ? `\u2265${threshold}` : `${threshold}-${thresholdsMap[index - 1].threshold}`;

        return (
          <LegendLabel
            key={index}
            label={label}
            color={backgroundColor}
            isSelected={isSelected}
            onClick={() => handleFilterClick(min, max)}
          />
        );
      }),
    [qualityColors, selectedFilter, handleFilterClick]
  );

  const isNullFilterSelected = selectedFilter?.min === 0 && selectedFilter?.max === 1;

  return (
    <EuiPanel hasBorder paddingSize="s">
      <EuiFlexGroup gutterSize="xs" direction="column">
        <EuiFlexItem>
          <EuiText size="xs">
            <strong>Quality Score Legend</strong>{' '}
            <span style={{ fontWeight: 'normal', color: '#69707D' }}>(click to filter)</span>
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiFlexGroup gutterSize="xs" wrap responsive={false}>
            {thresholdItems}
            <LegendLabel
              label="<1 or N/A"
              isSelected={isNullFilterSelected}
              onClick={() => handleFilterClick(0, 1)}
            />
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiPanel>
  );
};
