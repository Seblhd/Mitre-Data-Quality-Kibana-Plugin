export interface MitreTactic {
  id: string;
  name: string;
  shortName: string;
  description: string;
  externalId: string;
  url: string;
}

export interface MitreAnalytic {
  id: string;
  name: string;
  externalId: string;
  platforms: string[];
}

export interface MitreDetectionStrategy {
  id: string;
  name: string;
  externalId: string;
  url: string;
  analytics: MitreAnalytic[];
}

export interface MitreTechnique {
  id: string;
  name: string;
  externalId: string;
  url: string;
  description: string;
  tacticShortNames: string[];
  isSubtechnique: boolean;
  parentTechniqueId?: string;
  subtechniques?: MitreTechnique[];
  detectionStrategies?: MitreDetectionStrategy[];
}

export interface TacticWithTechniques {
  tactic: MitreTactic;
  techniques: MitreTechnique[];
}

export interface MitreMatrixData {
  tactics: TacticWithTechniques[];
  availablePlatforms: string[];
}

export const MITRE_TACTICS_ORDER: MitreTactic[] = [
  {
    id: 'x-mitre-tactic--daa4cbb1-b4f4-4723-a824-7f1efd6e0592',
    name: 'Reconnaissance',
    shortName: 'reconnaissance',
    description: 'The adversary is trying to gather information they can use to plan future operations.',
    externalId: 'TA0043',
    url: 'https://attack.mitre.org/tactics/TA0043',
  },
  {
    id: 'x-mitre-tactic--d679bca2-e57d-4935-8650-8031c87a4400',
    name: 'Resource Development',
    shortName: 'resource-development',
    description: 'The adversary is trying to establish resources they can use to support operations.',
    externalId: 'TA0042',
    url: 'https://attack.mitre.org/tactics/TA0042',
  },
  {
    id: 'x-mitre-tactic--ffd5bcee-6e16-4dd2-8eca-7b3beedf33ca',
    name: 'Initial Access',
    shortName: 'initial-access',
    description: 'The adversary is trying to get into your network.',
    externalId: 'TA0001',
    url: 'https://attack.mitre.org/tactics/TA0001',
  },
  {
    id: 'x-mitre-tactic--4ca45d45-df4d-4613-8980-bac22d278fa5',
    name: 'Execution',
    shortName: 'execution',
    description: 'The adversary is trying to run malicious code.',
    externalId: 'TA0002',
    url: 'https://attack.mitre.org/tactics/TA0002',
  },
  {
    id: 'x-mitre-tactic--5bc1d813-693e-4823-9961-abf9af4b0e92',
    name: 'Persistence',
    shortName: 'persistence',
    description: 'The adversary is trying to maintain their foothold.',
    externalId: 'TA0003',
    url: 'https://attack.mitre.org/tactics/TA0003',
  },
  {
    id: 'x-mitre-tactic--5e29b093-294e-49e9-a803-dab3d73b77dd',
    name: 'Privilege Escalation',
    shortName: 'privilege-escalation',
    description: 'The adversary is trying to gain higher-level permissions.',
    externalId: 'TA0004',
    url: 'https://attack.mitre.org/tactics/TA0004',
  },
  {
    id: 'x-mitre-tactic--78b23412-0651-46d7-a540-170a1ce8bd5a',
    name: 'Defense Evasion',
    shortName: 'defense-evasion',
    description: 'The adversary is trying to avoid being detected.',
    externalId: 'TA0005',
    url: 'https://attack.mitre.org/tactics/TA0005',
  },
  {
    id: 'x-mitre-tactic--2558fd61-8c75-4730-94c4-11926db2a263',
    name: 'Credential Access',
    shortName: 'credential-access',
    description: 'The adversary is trying to steal account names and passwords.',
    externalId: 'TA0006',
    url: 'https://attack.mitre.org/tactics/TA0006',
  },
  {
    id: 'x-mitre-tactic--c17c5845-175e-4421-9713-829d0573dbc9',
    name: 'Discovery',
    shortName: 'discovery',
    description: 'The adversary is trying to figure out your environment.',
    externalId: 'TA0007',
    url: 'https://attack.mitre.org/tactics/TA0007',
  },
  {
    id: 'x-mitre-tactic--7141578b-e50b-4dcc-bfa4-08a8dd689e9e',
    name: 'Lateral Movement',
    shortName: 'lateral-movement',
    description: 'The adversary is trying to move through your environment.',
    externalId: 'TA0008',
    url: 'https://attack.mitre.org/tactics/TA0008',
  },
  {
    id: 'x-mitre-tactic--d108ce10-2419-4cf9-a774-46161d6c6cfe',
    name: 'Collection',
    shortName: 'collection',
    description: 'The adversary is trying to gather data of interest to their goal.',
    externalId: 'TA0009',
    url: 'https://attack.mitre.org/tactics/TA0009',
  },
  {
    id: 'x-mitre-tactic--f72804c5-f15a-449e-a5da-2eecd181f813',
    name: 'Command and Control',
    shortName: 'command-and-control',
    description: 'The adversary is trying to communicate with compromised systems to control them.',
    externalId: 'TA0011',
    url: 'https://attack.mitre.org/tactics/TA0011',
  },
  {
    id: 'x-mitre-tactic--9a4e74ab-5008-408c-84bf-a10dfbc53462',
    name: 'Exfiltration',
    shortName: 'exfiltration',
    description: 'The adversary is trying to steal data.',
    externalId: 'TA0010',
    url: 'https://attack.mitre.org/tactics/TA0010',
  },
  {
    id: 'x-mitre-tactic--5569339b-94c2-49ee-afb3-2222936582c8',
    name: 'Impact',
    shortName: 'impact',
    description: 'The adversary is trying to manipulate, interrupt, or destroy your systems and data.',
    externalId: 'TA0040',
    url: 'https://attack.mitre.org/tactics/TA0040',
  },
];
