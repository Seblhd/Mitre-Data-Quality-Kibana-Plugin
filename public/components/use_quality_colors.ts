/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMemo } from 'react';
import { useEuiTheme } from '@elastic/eui';

export function useQualityColors() {
  const { euiTheme } = useEuiTheme();

  const qualityColors = useMemo(
    () => [
      { threshold: 4, backgroundColor: '#00BFB3', textColor: euiTheme.colors.textInverse },
      { threshold: 3, backgroundColor: '#00BFB399', textColor: euiTheme.colors.textParagraph },
      { threshold: 2, backgroundColor: '#00BFB34D', textColor: euiTheme.colors.textParagraph },
      { threshold: 1, backgroundColor: '#00BFB326', textColor: euiTheme.colors.textParagraph },
    ],
    [euiTheme.colors.textInverse, euiTheme.colors.textParagraph]
  );

  const getColorsForScore = (score: number | null | undefined) => {
    if (score === null || score === undefined) {
      return undefined;
    }
    for (const item of qualityColors) {
      if (score >= item.threshold) {
        return item;
      }
    }
    return undefined;
  };

  return {
    qualityColors,
    getColorsForScore,
  };
}
