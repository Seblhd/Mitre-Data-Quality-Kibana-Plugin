/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export { ecsFieldMap, resultsFieldMap } from './field_maps';
export {
  // ECS Mapping constants
  ECS_COMPONENT_TEMPLATE_NAME,
  ECS_INDEX_TEMPLATE_NAME,
  ECS_INDEX_PATTERN,
  ECS_INDEX_NAME,
  // Results constants
  RESULTS_COMPONENT_TEMPLATE_NAME,
  RESULTS_INDEX_TEMPLATE_NAME,
  RESULTS_INDEX_PATTERN,
  RESULTS_INDEX_NAME,
  // Shared constants
  TOTAL_FIELDS_LIMIT,
  KIBANA_VERSION,
} from './configurations';
// ECS Mapping templates (for analytics ECS mapping data)
export {
  createResultsComponentTemplate,
  deleteResultsComponentTemplate,
  resultsComponentTemplateExists,
} from './create_results_component_template';
export {
  createResultsIndexTemplate,
  deleteResultsIndexTemplate,
  resultsIndexTemplateExists,
} from './create_results_index_template';
export {
  createResultsIndex,
  deleteResultsIndex,
  resultsIndexExists,
} from './create_results_index';
export { ingestEcsMappingIfEmpty } from './ingest_ecs_mapping';
// Data Quality Results templates (for quality scores)
export {
  createDataQualityResultsComponentTemplate,
  deleteDataQualityResultsComponentTemplate,
  dataQualityResultsComponentTemplateExists,
} from './create_data_quality_results_component_template';
export {
  createDataQualityResultsIndexTemplate,
  deleteDataQualityResultsIndexTemplate,
  dataQualityResultsIndexTemplateExists,
} from './create_data_quality_results_index_template';
export {
  createDataQualityResultsIndex,
  deleteDataQualityResultsIndex,
  dataQualityResultsIndexExists,
} from './create_data_quality_results_index';
// Installation
export {
  installResultsTemplates,
  uninstallResultsTemplates,
} from './install_results_templates';
