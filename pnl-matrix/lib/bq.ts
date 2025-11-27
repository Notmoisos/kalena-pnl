import { BigQuery } from '@google-cloud/bigquery';

let bq: BigQuery;

export function getBigQuery() {
  if (!bq) {
    const config: { projectId?: string; keyFilename?: string; credentials?: any } = {};

    if (process.env.BQ_PROJECT_ID) {
      config.projectId = process.env.BQ_PROJECT_ID;
    }

    // 1º – em produção (App Hosting): usa JSON da env
    if (process.env.BQ_KEYFILE_JSON) {
      config.credentials = JSON.parse(process.env.BQ_KEYFILE_JSON);
    }
    // 2º – em dev local: usa caminho de arquivo (como já está hoje)
    else if (process.env.BQ_KEYFILE) {
      config.keyFilename = process.env.BQ_KEYFILE;
    }

    bq = new BigQuery(config);
  }
  return bq;
}
