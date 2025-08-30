import { autoLoadMostRecentData } from '../auto-loader';

export const initializeAutoLoader = async (defaultUsername = 'system') => {
  console.log('🚀 Initializing AI Sheets Auto-Loader...');

  try {
    const result = await autoLoadMostRecentData(defaultUsername);

    if (result.success) {
      console.log('✅ Auto-loader initialized successfully!');
      console.log(
        `📊 Dataset loaded: ${result.fileName} (ID: ${result.datasetId})`,
      );
      console.log(
        `🔗 You can now access it at: /home/dataset/${result.datasetId}`,
      );
    } else {
      console.log(
        `ℹ️ Auto-loader initialized (no data to load): ${result.error}`,
      );
    }
  } catch (error) {
    console.error('❌ Error during auto-loader initialization:', error);
  }

  console.log('🚀 AI Sheets Auto-Loader initialization complete!');
};
