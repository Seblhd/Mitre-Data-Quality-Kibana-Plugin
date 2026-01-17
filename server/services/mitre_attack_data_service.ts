import type { Logger } from '@kbn/core/server';
import type { IncomingMessage } from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

const MITRE_ATTACK_URL =
  'https://raw.githubusercontent.com/mitre-attack/attack-stix-data/refs/heads/master/enterprise-attack/enterprise-attack-18.1.json';
const LOCAL_FILE_PATH = path.resolve(
  __dirname,
  '../../attack-stix-data/enterprise-attack/enterprise-attack.json'
);
const DOWNLOAD_TIMEOUT_MS = 30000;

export class MitreAttackDataService {
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  public async initialize(): Promise<void> {
    this.logger.info('Initializing MITRE ATT&CK data service...');

    try {
      await this.downloadMitreAttackData();
    } catch (error) {
      this.logger.warn(
        `Failed to download MITRE ATT&CK data: ${error instanceof Error ? error.message : String(error)}`
      );
      this.logger.info('Using local MITRE ATT&CK data file as fallback.');
      this.verifyLocalFileExists();
    }
  }

  private async downloadMitreAttackData(): Promise<void> {
    this.logger.info(`Attempting to download MITRE ATT&CK data from ${MITRE_ATTACK_URL}`);

    return new Promise((resolve, reject) => {
      const request = https.get(MITRE_ATTACK_URL, { timeout: DOWNLOAD_TIMEOUT_MS }, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            this.logger.debug(`Following redirect to ${redirectUrl}`);
            https
              .get(redirectUrl, { timeout: DOWNLOAD_TIMEOUT_MS }, (redirectResponse) => {
                this.handleResponse(redirectResponse, resolve, reject);
              })
              .on('error', reject)
              .on('timeout', () => {
                request.destroy();
                reject(new Error('Request timed out'));
              });
            return;
          }
        }

        this.handleResponse(response, resolve, reject);
      });

      request.on('error', reject);
      request.on('timeout', () => {
        request.destroy();
        reject(new Error('Request timed out'));
      });
    });
  }

  private handleResponse(
    response: IncomingMessage,
    resolve: () => void,
    reject: (error: Error) => void
  ): void {
    if (response.statusCode !== 200) {
      reject(new Error(`HTTP ${response.statusCode}: Failed to download MITRE ATT&CK data`));
      return;
    }

    const chunks: Buffer[] = [];
    let totalBytes = 0;

    response.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
      totalBytes += chunk.length;
    });

    response.on('end', () => {
      try {
        const data = Buffer.concat(chunks).toString('utf-8');

        JSON.parse(data);

        const dirPath = path.dirname(LOCAL_FILE_PATH);
        if (!fs.existsSync(dirPath)) {
          fs.mkdirSync(dirPath, { recursive: true });
        }

        fs.writeFileSync(LOCAL_FILE_PATH, data, 'utf-8');

        this.logger.info(
          `Successfully downloaded and saved MITRE ATT&CK data (${(totalBytes / 1024 / 1024).toFixed(2)} MB) to ${LOCAL_FILE_PATH}`
        );
        resolve();
      } catch (error) {
        reject(
          new Error(
            `Failed to process downloaded data: ${error instanceof Error ? error.message : String(error)}`
          )
        );
      }
    });

    response.on('error', reject);
  }

  private verifyLocalFileExists(): void {
    if (fs.existsSync(LOCAL_FILE_PATH)) {
      const stats = fs.statSync(LOCAL_FILE_PATH);
      this.logger.info(
        `Local MITRE ATT&CK data file exists (${(stats.size / 1024 / 1024).toFixed(2)} MB): ${LOCAL_FILE_PATH}`
      );
    } else {
      this.logger.error(`Local MITRE ATT&CK data file not found at ${LOCAL_FILE_PATH}`);
    }
  }

  public getLocalFilePath(): string {
    return LOCAL_FILE_PATH;
  }
}
