DECLARE view_sql STRING;

SET view_sql = (
  WITH
    canon AS (
      SELECT
        column_name,
        data_type,
        ordinal_position
      FROM `kalenapnl.kalena`.INFORMATION_SCHEMA.COLUMNS
      WHERE table_name = 'etl_notas_view'
    ),
    bling_cols AS (
      SELECT column_name
      FROM `kalenapnl.kalena`.INFORMATION_SCHEMA.COLUMNS
      WHERE table_name = 'etl_notas_bling'
    )

  SELECT
    'CREATE OR REPLACE VIEW `kalenapnl.kalena.etl_notas_unificada` AS\n' ||

    -- OMIE
    'SELECT\n' ||
    '  ''OMIE'' AS doc_source,\n' ||
    STRING_AGG(FORMAT('  `%s`', c.column_name) ORDER BY c.ordinal_position) || '\n' ||
    'FROM `kalenapnl.kalena.etl_notas_view`\n' ||

    '\nUNION ALL\n\n' ||

    -- BLING
    'SELECT\n' ||
    '  ''BLING'' AS doc_source,\n' ||
    STRING_AGG(
      FORMAT(
        '  %s AS `%s`',
        IF(b.column_name IS NOT NULL,
           FORMAT('`%s`', c.column_name),
           FORMAT('CAST(NULL AS %s)', c.data_type)
        ),
        c.column_name
      )
      ORDER BY c.ordinal_position
    ) || '\n' ||
    'FROM `kalenapnl.kalena.etl_notas_bling`;\n'
  FROM canon c
  LEFT JOIN bling_cols b
    ON b.column_name = c.column_name
);

EXECUTE IMMEDIATE view_sql;