import { readdir, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { importDatasetFromPublicFile } from '~/services/repository/datasets';

export interface AutoLoadResult {
  success: boolean;
  datasetId?: string;
  fileName?: string;
  error?: string;
}

const SUPPORTED_EXTENSIONS = [
  '.json',
  '.csv',
  '.tsv',
  '.xlsx',
  '.xls',
  '.parquet',
];

export const findMostRecentDataFile = async (): Promise<string | null> => {
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
    const supportedFiles = files.filter((file) =>
      SUPPORTED_EXTENSIONS.includes(extname(file).toLowerCase()),
    );

    if (supportedFiles.length === 0) {
      console.log('📁 No supported data files found in public/data');
      return null;
    }

    // Get file stats and find the most recent
    const fileStats = await Promise.all(
      supportedFiles.map(async (file) => {
        const filePath = join(dataDir, file);
        const stats = await stat(filePath);
        return { file, mtime: stats.mtime, path: filePath };
      }),
    );

    // Sort by modification time (most recent first)
    fileStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

    const mostRecent = fileStats[0];
    console.log(
      `📁 Found most recent data file: ${mostRecent.file} (modified: ${mostRecent.mtime.toISOString()})`,
    );

    return mostRecent.file;
  } catch (error) {
    console.error('❌ Error finding most recent data file:', error);
    return null;
  }
};

export const autoLoadMostRecentData = async (
  username: string,
): Promise<AutoLoadResult> => {
  try {
    const fileName = await findMostRecentDataFile();

    if (!fileName) {
      return {
        success: false,
        error: 'No data files found in public/data directory',
      };
    }

    // Create dataset name from filename
    const datasetName = fileName.replace(/\.[^/.]+$/, '') + ' (Auto-loaded)';

    console.log(`🚀 Auto-loading dataset: ${datasetName} from ${fileName}`);

    const dataset = await importDatasetFromPublicFile({
      name: datasetName,
      createdBy: username,
      publicFileName: `data/${fileName}`,
    });

    console.log(
      `✅ Successfully auto-loaded dataset: ${dataset.name} (ID: ${dataset.id})`,
    );

    return {
      success: true,
      datasetId: dataset.id,
      fileName: fileName,
    };
  } catch (error) {
    console.error('❌ Error auto-loading data:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
};
