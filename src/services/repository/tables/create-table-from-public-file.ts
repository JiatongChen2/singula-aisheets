import { connectAndClose } from '~/services/db/duckdb';
import { ColumnModel } from '~/services/db/models';
import type { Column, ColumnKind } from '~/state';
import {
  getColumnName,
  getDatasetRowSequenceName,
  getDatasetTableName,
} from './utils';
import { join } from 'node:path';

export const createDatasetTableFromPublicFile = async (
  {
    dataset,
    publicFileName,
  }: {
    dataset: {
      id: string;
      name: string;
      createdBy: string;
    };
    publicFileName: string; // e.g., "candidates.json"
  },
  options?: {
    limit?: number;
  },
): Promise<Column[]> => {
  return await connectAndClose(async (db) => {
    const tableName = getDatasetTableName(dataset);
    const sequenceName = getDatasetRowSequenceName(dataset);

    // Construct the path to the public file
    // Handle both direct files (e.g., "candidates.json") and subdirectory files (e.g., "data/candidates.json")
    const publicFilePath = publicFileName.startsWith('data/')
      ? join(process.cwd(), 'public', publicFileName)
      : join(process.cwd(), 'public', publicFileName);

    await db.run(`
      BEGIN TRANSACTION;
    `);

    // Use DuckDB to read the JSON file directly
    const results = await db.run(`
      DESCRIBE (SELECT * FROM '${publicFilePath}');
    `);

    const columns = await results.getRowObjects();

    const dbColumns = await ColumnModel.bulkCreate(
      columns.map((column) => ({
        datasetId: dataset.id,
        name: column.column_name as string,
        type: column.column_type as string,
        kind: 'static',
      })),
    );

    const selectColumnNames = dbColumns
      .map((column) => `"${column.name}" as ${getColumnName(column)}`)
      .join(', ');

    let selectStatement = `SELECT ${selectColumnNames}, nextval('${sequenceName}') as rowIdx FROM '${publicFilePath}'`;

    if (options?.limit) selectStatement += ` LIMIT ${options?.limit}`;

    await db.run(`
      CREATE OR REPLACE SEQUENCE ${sequenceName} START 0 INCREMENT 1 MINVALUE 0;

      CREATE TABLE ${tableName} AS (${selectStatement});

      SHOW ${tableName};

      COMMIT;
    `);

    return dbColumns.map((column) => {
      return {
        id: column.id,
        name: column.name,
        type: column.type,
        kind: column.kind as ColumnKind,
        visible: column.visible,
        dataset,
        cells: [],
      };
    });
  });
};
