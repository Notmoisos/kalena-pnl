import { BigQuery } from '@google-cloud/bigquery';

let bq: BigQuery | null = null;

export function getBigQuery() {
  if (!bq) {
    const config: { projectId?: string } = {};
    if (process.env.BQ_PROJECT_ID) {
      config.projectId = process.env.BQ_PROJECT_ID;
    }
    bq = new BigQuery(config);
  }
  return bq;
}
