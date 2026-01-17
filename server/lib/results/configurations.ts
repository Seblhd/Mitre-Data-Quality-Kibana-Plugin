/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// ECS Mapping templates (for analytics ECS mapping data)
export const ECS_COMPONENT_TEMPLATE_NAME = '.kibana-mitre-data-quality-ecs-mappings';
export const ECS_INDEX_TEMPLATE_NAME = '.kibana-mitre-data-quality-ecs-index-template';
export const ECS_INDEX_PATTERN = '.kibana-mitre-data-quality-ecs-*';
export const ECS_INDEX_NAME = '.kibana-mitre-data-quality-ecs-default';

// Results templates (for data quality results with scores)
export const RESULTS_COMPONENT_TEMPLATE_NAME = '.kibana-mitre-data-quality-results-mappings';
export const RESULTS_INDEX_TEMPLATE_NAME = '.kibana-mitre-data-quality-results-index-template';
export const RESULTS_INDEX_PATTERN = '.kibana-mitre-data-quality-results-*';
export const RESULTS_INDEX_NAME = '.kibana-mitre-data-quality-results-default';

export const TOTAL_FIELDS_LIMIT = 1500;
export const KIBANA_VERSION = '9.2.3';
