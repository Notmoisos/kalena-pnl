export function unifiedNfeSourceSql() {
  return `
  (
    SELECT * FROM \`${process.env.BQ_TABLE_OMIE}\`
    UNION ALL
    SELECT * FROM \`${process.env.BQ_TABLE_BLING}\`
  )
  `;
}