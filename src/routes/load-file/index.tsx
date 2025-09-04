import { component$, useSignal, useVisibleTask$ } from '@builder.io/qwik';
import { server$, useLocation, useNavigate } from '@builder.io/qwik-city';
import { MainLogo } from '~/components/ui/logo/logo';

// Server action to download file from Singula AI API
const downloadFileFromSingulaAction = server$(
  async (sandboxId: string, filePath: string, accessToken: string) => {
    try {
      const { appConfig } = await import('~/config');
      const url = `${appConfig.singula.apiBaseUrl}/sandboxes/${sandboxId}/files/content`;

      // Ensure file path starts with /workspace if it doesn't already
      const normalizedPath = filePath.startsWith('/workspace')
        ? filePath
        : `/workspace/${filePath.replace(/^\/+/, '')}`;

      console.log('🔍 [SingulaAPI] Downloading file from Singula AI:');
      console.log(`  URL: ${url}`);
      console.log(`  Sandbox ID: ${sandboxId}`);
      console.log(`  File Path: ${normalizedPath}`);
      console.log(`  Has Token: ${accessToken ? 'Yes' : 'No'}`);

      const urlWithParams = `${url}?${new URLSearchParams({
        path: normalizedPath,
      })}`;

      const response = await fetch(urlWithParams, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        console.error('❌ [SingulaAPI] Failed to download file:');
        console.error(`  Status: ${response.status}`);
        console.error(`  Response: ${await response.text()}`);
        throw new Error(
          `Failed to download file: ${response.status} - ${response.statusText}`,
        );
      }

      const fileContent = await response.text();
      console.log(
        `✅ [SingulaAPI] Successfully downloaded file: ${fileContent.length} characters`,
      );

      return {
        success: true,
        content: fileContent,
        fileName: normalizedPath.split('/').pop() || 'data.csv',
      };
    } catch (error) {
      console.error('❌ [SingulaAPI] Error downloading file:', error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to download file',
        content: null,
        fileName: null,
      };
    }
  },
);

// Server action to create dataset from downloaded content
const createDatasetFromDownloadedContentAction = server$(
  async (content: string, fileName: string, source: string) => {
    try {
      // Import the necessary modules
      const { DatasetModel } = await import('~/services/db/models');
      const { createDatasetTableFromFile } = await import(
        '~/services/repository/tables'
      );
      const { sendTelemetry } = await import(
        '~/services/repository/hub/telemetry'
      );
      const { writeFile, mkdir } = await import('node:fs/promises');
      const { join } = await import('node:path');
      const { tmpdir } = await import('node:os');

      // Parse CSV content to get basic info
      const lines = content.trim().split('\n');
      const headers = lines[0]
        .split(',')
        .map((h) => h.trim().replace(/"/g, ''));
      const dataRows = lines.slice(1);

      // Create a temporary file
      const tempDir = join(tmpdir(), 'singula-downloads');
      await mkdir(tempDir, { recursive: true });
      const tempFilePath = join(tempDir, fileName);
      await writeFile(tempFilePath, content, 'utf-8');

      // Create a new dataset
      const model = await DatasetModel.create({
        name: `${source} - ${fileName}`,
        createdBy: 'system', // You can change this to use actual user session
      });

      // Use the existing proven file import logic
      await createDatasetTableFromFile({
        dataset: {
          id: model.id,
          name: model.name,
          createdBy: model.createdBy,
        },
        file: tempFilePath,
      });

      // Send telemetry
      sendTelemetry('dataset.import.external', 'system', {
        datasetId: model.id,
        fileName: fileName,
        source: source,
        rowCount: dataRows.length,
        columnCount: headers.length,
      });

      // Clean up temp file
      try {
        const { unlink } = await import('node:fs/promises');
        await unlink(tempFilePath);
      } catch (cleanupError) {
        console.warn('Failed to clean up temporary file:', cleanupError);
      }

      return {
        success: true,
        datasetId: model.id,
      };
    } catch (error) {
      console.error('Error creating dataset from downloaded content:', error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to create dataset',
      };
    }
  },
);

export default component$(() => {
  const location = useLocation();
  const navigate = useNavigate();

  const isLoading = useSignal(false);
  const error = useSignal<string | null>(null);
  const status = useSignal('Initializing...');

  useVisibleTask$(async () => {
    // Get URL parameters
    const sandboxId = location.url.searchParams.get('sandbox_id');
    const filePath = location.url.searchParams.get('file_path');
    const accessToken = location.url.searchParams.get('access_token');
    const source = location.url.searchParams.get('source') || 'external-app';

    // Validate required parameters
    if (!sandboxId || !filePath || !accessToken) {
      error.value =
        'Missing required parameters: sandbox_id, file_path, or access_token';
      return;
    }

    try {
      isLoading.value = true;
      status.value = 'Downloading file from Singula AI...';

      // Download file from Singula AI
      const downloadResult = await downloadFileFromSingulaAction(
        sandboxId,
        filePath,
        accessToken,
      );

      if (!downloadResult.success || !downloadResult.content) {
        throw new Error(downloadResult.error || 'Failed to download file');
      }

      status.value = 'Creating dataset...';

      // Create dataset from downloaded content
      const datasetResult = await createDatasetFromDownloadedContentAction(
        downloadResult.content,
        downloadResult.fileName!,
        source,
      );

      if (!datasetResult.success) {
        throw new Error(datasetResult.error || 'Failed to create dataset');
      }

      status.value = 'Redirecting to dataset...';

      // Redirect to the created dataset
      await navigate(`/home/dataset/${datasetResult.datasetId}`);
    } catch (err) {
      console.error('Error in load-file process:', err);
      error.value =
        err instanceof Error ? err.message : 'An unexpected error occurred';
      isLoading.value = false;
    }
  });

  return (
    <div class="min-h-screen flex flex-col items-center justify-center bg-gray-50">
      <div class="max-w-md w-full bg-white rounded-lg shadow-md p-8 text-center">
        <MainLogo class="w-16 h-16 mx-auto mb-6" />

        <h1 class="text-2xl font-semibold text-gray-900 mb-4">Loading Data</h1>

        {isLoading.value && (
          <div class="mb-6">
            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4" />
            <p class="text-gray-600">{status.value}</p>
          </div>
        )}

        {error.value && (
          <div class="mb-6">
            <div class="text-red-600 mb-4">
              <svg
                class="w-8 h-8 mx-auto"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                role="img"
                aria-label="Error icon"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h2 class="text-lg font-medium text-red-800 mb-2">
              Error Loading Data
            </h2>
            <p class="text-sm text-red-600 mb-4">{error.value}</p>
            <button
              type="button"
              class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              onClick$={() => navigate('/home')}
            >
              Go to Home
            </button>
          </div>
        )}

        {!error.value && !isLoading.value && (
          <p class="text-gray-600">
            Processing complete. You should be redirected automatically.
          </p>
        )}
      </div>
    </div>
  );
});
