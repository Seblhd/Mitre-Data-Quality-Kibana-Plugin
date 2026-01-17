import type { Logger } from '@kbn/core/server';
import * as fs from 'fs';
import * as path from 'path';
import type {
  MitreTechnique,
  TacticWithTechniques,
  MitreMatrixData,
  MitreDetectionStrategy,
  MitreAnalytic,
} from '../../common';
import { MITRE_TACTICS_ORDER } from '../../common';

const LOCAL_FILE_PATH = path.resolve(
  __dirname,
  '../../attack-stix-data/enterprise-attack/enterprise-attack.json'
);

interface StixExternalReference {
  source_name: string;
  external_id?: string;
  url?: string;
}

interface StixKillChainPhase {
  kill_chain_name: string;
  phase_name: string;
}

interface StixAttackPattern {
  type: 'attack-pattern';
  id: string;
  name: string;
  description: string;
  external_references: StixExternalReference[];
  kill_chain_phases?: StixKillChainPhase[];
  x_mitre_is_subtechnique?: boolean;
  x_mitre_deprecated?: boolean;
  revoked?: boolean;
}

interface StixDetectionStrategy {
  type: 'x-mitre-detection-strategy';
  id: string;
  name: string;
  external_references: StixExternalReference[];
  x_mitre_analytic_refs?: string[];
  x_mitre_deprecated?: boolean;
}

interface StixAnalytic {
  type: 'x-mitre-analytic';
  id: string;
  name: string;
  external_references: StixExternalReference[];
  x_mitre_platforms?: string[];
  x_mitre_deprecated?: boolean;
}

interface StixRelationship {
  type: 'relationship';
  id: string;
  relationship_type: string;
  source_ref: string;
  target_ref: string;
  x_mitre_deprecated?: boolean;
}

interface StixObject {
  type: string;
  id: string;
  name?: string;
  description?: string;
  external_references?: StixExternalReference[];
  kill_chain_phases?: StixKillChainPhase[];
  x_mitre_is_subtechnique?: boolean;
  x_mitre_deprecated?: boolean;
  revoked?: boolean;
  x_mitre_analytic_refs?: string[];
  x_mitre_platforms?: string[];
  relationship_type?: string;
  source_ref?: string;
  target_ref?: string;
}

interface StixBundle {
  type: 'bundle';
  objects: StixObject[];
}

export class MitreMatrixParser {
  private readonly logger: Logger;
  private cachedMatrix: MitreMatrixData | null = null;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  public async getMatrix(): Promise<MitreMatrixData> {
    if (this.cachedMatrix) {
      return this.cachedMatrix;
    }

    this.cachedMatrix = await this.parseMatrix();
    return this.cachedMatrix;
  }

  public clearCache(): void {
    this.cachedMatrix = null;
  }

  private async parseMatrix(): Promise<MitreMatrixData> {
    this.logger.info('Parsing MITRE ATT&CK matrix data...');

    const stixData = this.loadStixData();
    if (!stixData) {
      this.logger.error('Failed to load STIX data');
      return { tactics: this.getEmptyTactics(), availablePlatforms: [] };
    }

    const attackPatterns = this.extractAttackPatterns(stixData);
    this.logger.info(`Found ${attackPatterns.length} attack patterns`);

    const detectionStrategies = this.extractDetectionStrategies(stixData);
    this.logger.info(`Found ${detectionStrategies.size} detection strategies`);

    const analytics = this.extractAnalytics(stixData);
    this.logger.info(`Found ${analytics.size} analytics`);

    const detectsRelationships = this.extractDetectsRelationships(stixData);
    this.logger.info(`Found ${detectsRelationships.length} detects relationships`);

    const techniques = this.convertToTechniques(attackPatterns);
    this.logger.info(
      `Converted to ${techniques.filter((t) => !t.isSubtechnique).length} techniques and ${techniques.filter((t) => t.isSubtechnique).length} subtechniques`
    );

    this.linkDetectionStrategiesToTechniques(
      techniques,
      detectionStrategies,
      analytics,
      detectsRelationships
    );

    const availablePlatforms = this.collectAvailablePlatforms(analytics);
    this.logger.info(`Found ${availablePlatforms.length} unique platforms`);

    const matrix = this.buildMatrix(techniques, availablePlatforms);
    this.logger.info('MITRE ATT&CK matrix parsing complete');

    return matrix;
  }

  private loadStixData(): StixBundle | null {
    try {
      if (!fs.existsSync(LOCAL_FILE_PATH)) {
        this.logger.error(`MITRE ATT&CK data file not found at ${LOCAL_FILE_PATH}`);
        return null;
      }

      const rawData = fs.readFileSync(LOCAL_FILE_PATH, 'utf-8');
      return JSON.parse(rawData) as StixBundle;
    } catch (error) {
      this.logger.error(
        `Failed to read MITRE ATT&CK data: ${error instanceof Error ? error.message : String(error)}`
      );
      return null;
    }
  }

  private extractAttackPatterns(stixData: StixBundle): StixAttackPattern[] {
    return stixData.objects
      .filter(
        (obj) =>
          obj.type === 'attack-pattern' &&
          !obj.x_mitre_deprecated &&
          !obj.revoked &&
          obj.name &&
          obj.external_references
      )
      .map((obj) => ({
        type: 'attack-pattern' as const,
        id: obj.id,
        name: obj.name!,
        description: obj.description || '',
        external_references: obj.external_references!,
        kill_chain_phases: obj.kill_chain_phases,
        x_mitre_is_subtechnique: obj.x_mitre_is_subtechnique,
        x_mitre_deprecated: obj.x_mitre_deprecated,
        revoked: obj.revoked,
      }));
  }

  private convertToTechniques(attackPatterns: StixAttackPattern[]): MitreTechnique[] {
    return attackPatterns.map((pattern) => {
      const mitreRef = pattern.external_references.find(
        (ref) => ref.source_name === 'mitre-attack' && ref.external_id
      );

      const externalId = mitreRef?.external_id || '';
      const isSubtechnique = pattern.x_mitre_is_subtechnique === true;

      let parentTechniqueId: string | undefined;
      if (isSubtechnique && externalId.includes('.')) {
        parentTechniqueId = externalId.split('.')[0];
      }

      const tacticShortNames = (pattern.kill_chain_phases || [])
        .filter((phase) => phase.kill_chain_name === 'mitre-attack')
        .map((phase) => phase.phase_name);

      return {
        id: pattern.id,
        name: pattern.name,
        externalId,
        url: mitreRef?.url || `https://attack.mitre.org/techniques/${externalId.replace('.', '/')}`,
        description: pattern.description || '',
        tacticShortNames,
        isSubtechnique,
        parentTechniqueId,
      };
    });
  }

  private collectAvailablePlatforms(analyticsMap: Map<string, StixAnalytic>): string[] {
    const platformsSet = new Set<string>();
    for (const analytic of analyticsMap.values()) {
      if (analytic.x_mitre_platforms) {
        for (const platform of analytic.x_mitre_platforms) {
          platformsSet.add(platform);
        }
      }
    }
    return Array.from(platformsSet).sort();
  }

  private buildMatrix(techniques: MitreTechnique[], availablePlatforms: string[]): MitreMatrixData {
    const parentTechniques = techniques.filter((t) => !t.isSubtechnique);
    const subtechniques = techniques.filter((t) => t.isSubtechnique);

    const techniqueMap = new Map<string, MitreTechnique>();
    for (const technique of parentTechniques) {
      techniqueMap.set(technique.externalId, { ...technique, subtechniques: [] });
    }

    for (const subtechnique of subtechniques) {
      if (subtechnique.parentTechniqueId) {
        const parent = techniqueMap.get(subtechnique.parentTechniqueId);
        if (parent && parent.subtechniques) {
          parent.subtechniques.push(subtechnique);
        }
      }
    }

    for (const technique of techniqueMap.values()) {
      if (technique.subtechniques) {
        technique.subtechniques.sort((a, b) => a.name.localeCompare(b.name));
      }
    }

    const tactics: TacticWithTechniques[] = MITRE_TACTICS_ORDER.map((tactic) => {
      const tacticTechniques = Array.from(techniqueMap.values())
        .filter((technique) => technique.tacticShortNames.includes(tactic.shortName))
        .sort((a, b) => a.name.localeCompare(b.name));

      return {
        tactic,
        techniques: tacticTechniques,
      };
    });

    return { tactics, availablePlatforms };
  }

  private getEmptyTactics(): TacticWithTechniques[] {
    return MITRE_TACTICS_ORDER.map((tactic) => ({
      tactic,
      techniques: [],
    }));
  }

  private extractDetectionStrategies(stixData: StixBundle): Map<string, StixDetectionStrategy> {
    const strategies = new Map<string, StixDetectionStrategy>();
    for (const obj of stixData.objects) {
      if (
        obj.type === 'x-mitre-detection-strategy' &&
        !obj.x_mitre_deprecated &&
        obj.name &&
        obj.external_references
      ) {
        strategies.set(obj.id, {
          type: 'x-mitre-detection-strategy',
          id: obj.id,
          name: obj.name,
          external_references: obj.external_references,
          x_mitre_analytic_refs: obj.x_mitre_analytic_refs,
          x_mitre_deprecated: obj.x_mitre_deprecated,
        });
      }
    }
    return strategies;
  }

  private extractAnalytics(stixData: StixBundle): Map<string, StixAnalytic> {
    const analyticsMap = new Map<string, StixAnalytic>();
    for (const obj of stixData.objects) {
      if (
        obj.type === 'x-mitre-analytic' &&
        !obj.x_mitre_deprecated &&
        obj.name &&
        obj.external_references
      ) {
        analyticsMap.set(obj.id, {
          type: 'x-mitre-analytic',
          id: obj.id,
          name: obj.name,
          external_references: obj.external_references,
          x_mitre_platforms: obj.x_mitre_platforms,
          x_mitre_deprecated: obj.x_mitre_deprecated,
        });
      }
    }
    return analyticsMap;
  }

  private extractDetectsRelationships(stixData: StixBundle): StixRelationship[] {
    return stixData.objects
      .filter(
        (obj) =>
          obj.type === 'relationship' &&
          obj.relationship_type === 'detects' &&
          !obj.x_mitre_deprecated &&
          obj.source_ref &&
          obj.target_ref
      )
      .map((obj) => ({
        type: 'relationship' as const,
        id: obj.id,
        relationship_type: obj.relationship_type!,
        source_ref: obj.source_ref!,
        target_ref: obj.target_ref!,
        x_mitre_deprecated: obj.x_mitre_deprecated,
      }));
  }

  private linkDetectionStrategiesToTechniques(
    techniques: MitreTechnique[],
    detectionStrategies: Map<string, StixDetectionStrategy>,
    analyticsMap: Map<string, StixAnalytic>,
    detectsRelationships: StixRelationship[]
  ): void {
    const techniqueIdMap = new Map<string, MitreTechnique>();
    for (const technique of techniques) {
      techniqueIdMap.set(technique.id, technique);
    }

    for (const relationship of detectsRelationships) {
      const technique = techniqueIdMap.get(relationship.target_ref);
      const strategy = detectionStrategies.get(relationship.source_ref);

      if (technique && strategy) {
        if (!technique.detectionStrategies) {
          technique.detectionStrategies = [];
        }

        const mitreRef = strategy.external_references.find(
          (ref) => ref.source_name === 'mitre-attack' && ref.external_id
        );

        const analyticsForStrategy: MitreAnalytic[] = [];
        if (strategy.x_mitre_analytic_refs) {
          for (const analyticRef of strategy.x_mitre_analytic_refs) {
            const analytic = analyticsMap.get(analyticRef);
            if (analytic) {
              const analyticMitreRef = analytic.external_references.find(
                (ref) => ref.source_name === 'mitre-attack' && ref.external_id
              );
              analyticsForStrategy.push({
                id: analytic.id,
                name: analytic.name,
                externalId: analyticMitreRef?.external_id || '',
                platforms: analytic.x_mitre_platforms || [],
              });
            }
          }
        }

        technique.detectionStrategies.push({
          id: strategy.id,
          name: strategy.name,
          externalId: mitreRef?.external_id || '',
          url: mitreRef?.url || '',
          analytics: analyticsForStrategy,
        });
      }
    }
  }
}
