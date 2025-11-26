import { BigQuery } from '@google-cloud/bigquery'

let bq: BigQuery | null = null

export function getBigQuery() {
  if (!bq) {
    const config: { projectId?: string; keyFilename?: string } = {}
    if (process.env.BQ_PROJECT_ID) config.projectId = process.env.BQ_PROJECT_ID
    if (process.env.BQ_KEYFILE) config.keyFilename = process.env.BQ_KEYFILE
    bq = new BigQuery(config)
  }
  return bq
} 