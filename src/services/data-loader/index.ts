import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

export interface DataFileInfo {
  fileName: string;
  fullPath: string;
  modifiedTime: Date;
  size: number;
}

const SUPPORTED_EXTENSIONS = [
  '.json',
  '.csv',
  '.tsv',
  '.xlsx',
  '.xls',
  '.parquet',
];

export const findMostRecentDataFile =
  async (): Promise<DataFileInfo | null> => {
    try {
      const dataDir = join(process.cwd(), 'public', 'data');

      // Check if directory exists
      try {
        await stat(dataDir);
      } catch {
        console.log('📁 No public/data directory found');
        return null;
      }

      const files = await readdir(dataDir);

      // Filter for supported file types
      const supportedFiles = files.filter((file) => {
        const ext = file.toLowerCase();
        return SUPPORTED_EXTENSIONS.some((supportedExt) =>
          ext.endsWith(supportedExt),
        );
      });

      if (supportedFiles.length === 0) {
        console.log('📁 No supported data files found in public/data/');
        return null;
      }

      // Get file stats and find the most recent
      let mostRecentFile: DataFileInfo | null = null;

      for (const file of supportedFiles) {
        const fullPath = join(dataDir, file);
        const stats = await stat(fullPath);

        if (!mostRecentFile || stats.mtime > mostRecentFile.modifiedTime) {
          mostRecentFile = {
            fileName: file,
            fullPath,
            modifiedTime: stats.mtime,
            size: stats.size,
          };
        }
      }

      if (mostRecentFile) {
        console.log(
          `📁 Found most recent data file: ${mostRecentFile.fileName} (modified: ${mostRecentFile.modifiedTime.toISOString()})`,
        );
      }

      return mostRecentFile;
    } catch (error) {
      console.error('❌ Error finding most recent data file:', error);
      return null;
    }
  };
