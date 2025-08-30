import type { RequestHandler } from '@builder.io/qwik-city';
import { importDatasetFromPublicFile } from '~/services/repository/datasets';
import { useServerSession } from '~/state';

export const onPost: RequestHandler = async (event) => {
  const { request, json } = event;

  try {
    const session = useServerSession(event);
    const { publicFileName, datasetName } = await request.json();

    if (!publicFileName || !datasetName) {
      json(400, { error: 'publicFileName and datasetName are required' });
      return;
    }

    const newDataset = await importDatasetFromPublicFile({
      name: datasetName,
      createdBy: session.user.username,
      publicFileName,
    });

    json(201, newDataset);
  } catch (error) {
    console.error('Error loading public file:', error);
    json(500, { error: 'Failed to load public file' });
  }
};
