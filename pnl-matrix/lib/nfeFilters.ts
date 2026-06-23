export const SALES_BASE_FILTER = `
  TRIM(tipo_operacao) = 'Saída'
  AND TRIM(finalidade) = 'Normal/Venda'
  AND TRIM(cancelada) = 'Não'
  AND (
    (
      doc_source = 'OMIE'
      AND TRIM(nome_cenario) = 'Venda'
    )
    OR
    (
      doc_source = 'BLING'
      AND COALESCE(TRIM(nome_cenario), 'Venda') = 'Venda'
    )
  )
`;

export const RETURNS_BASE_FILTER = `
  TRIM(finalidade) = 'Devolução'
  AND TRIM(cancelada) = 'Não'
`;

export const DISCOUNT_BASE_FILTER = `${SALES_BASE_FILTER}
  AND SAFE_CAST(parsed_desconto_proportional_value AS FLOAT64) > 0`;
