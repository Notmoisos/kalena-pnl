
# CPV > Família Percentage Enhancement  
_Product & Technical Requirements Document (PRD + TRD)_

---

## 1. Context

Today, expanding any of the four COGS top–level rows—  

* CPV  
* CPV Bonificações e Amostras  
* Perdas e Descartes  
* CPV Devoluções  

—triggers a single request to `/api/cogs-details` and renders:

```
Família value
% value / Receita Bruta   ← shown for all four groups (current behaviour)
```

We must:

1. Show the percentage line **only** under the **“CPV”** tree.  
2. Compute that percentage as:

```
safeDivision(CPV_Valor_Família, ReceitaBruta_Família)   // same ym period
```

Receita Bruta comes from a second endpoint:

```
GET /api/nfe-details?year={YYYY}&kind=ReceitaBruta&breakdown=family
```

Both requests must run asynchronously, and the UI should render only after **both** are fulfilled.

---

## 2. User Story

*As a finance analyst*  
*I want to expand “CPV > Família” and immediately see each Família’s value and its share of Receita Bruta,*  
*so that I can gauge cost efficiency.*  

---

## 3. Functional Requirements

FR-1  Expand “CPV > Família” → parallel requests to  
 a. `GET /api/cogs-details?…` (existing)  
 b. `GET /api/nfe-details?year={year}&kind=ReceitaBruta&breakdown=family`

FR-2  Wait for both responses; then map by **(família, ym)**.

FR-3  Render:

```
Edamame       R$ 261,92   R$ 1.562,59 …
              0,2%        0,1%        …   // percentage row
```

FR-4  Do **not** render the percentage row for the other three COGS groups.

FR-5  Division must be *safe*: `0 / 0 → 0`, `X / 0 → 0`.

FR-6  Maintain current lazy-loading behaviour (no prefetch).

---

## 4. Non-Functional Requirements

NFR-1  Concurrent fetch; no extra round-trips.  
NFR-2  No visible flicker—use a single “loading” placeholder under CPV.  
NFR-3  Typescript-strict & ESLint-clean.  
NFR-4  ≤ 100 ms JS processing for datasets ≤ 10 k rows.  

---

## 5. Data Contracts

### 5.1 `/api/cogs-details`   (unchanged)
```json
[
  { "familia": "Edamame", "ym": "2025-01", "valor": 261.92 },
  …
]
```

### 5.2 `/api/nfe-details … kind=ReceitaBruta`
```json
[
  { "familia": "Edamame", "ym": "2025-01", "valor": 3147.21 },
  …
]
```

---

## 6. High-Level Design

```
┌── UI Row: CPV
│   onExpand()
│
│   Promise.all([ fetchCogs(year), fetchReceita(year) ])
│        ↓
│   mergeByFamíliaAndYm()
│        ↓
│   setState({ rows, hasPercent = true })
└──────────────────────────────────────────────

┌── UI Row: CPV Bonificações e Amostras (etc.)
│   onExpand() → fetchCogs(year)
│        ↓
│   setState({ rows, hasPercent = false })
└──────────────────────────────────────────────
```

---

## 7. Step-by-Step Implementation

| # | Task | Code Pointer / Example |
|---|------|------------------------|
|1|Create `safeDivision(a, b)` util.|```ts\nexport const safeDivision = (a: number, b: number) => (b ? a / b : 0);\n```|
|2|Add `fetchReceitaBruta(year)` service.|```ts\nexport const fetchReceitaBruta = (year: number) =>\n  api.get<NFE[]>(`/nfe-details`, { params: { year, kind: 'ReceitaBruta', breakdown: 'family' } });\n```|
|3|Refactor row-expand handler.|```ts\nconst loadFamiliaDetails = async (group: string, year: number) => {\n  if (group !== 'CPV') {\n    const { data } = await fetchCogs(year);\n    return { rows: data, hasPercent: false };\n  }\n  const [cogs, receita] = await Promise.all([\n    fetchCogs(year),\n    fetchReceitaBruta(year)\n  ]);\n  const receitaMap = _.keyBy(receita.data, r => `${r.familia}-${r.ym}`);\n  const rows = cogs.data.map(c => ({\n    ...c,\n    percent: safeDivision(c.valor, receitaMap[`${c.familia}-${c.ym}`]?.valor ?? 0)\n  }));\n  return { rows, hasPercent: true };\n};\n```|
|4|Update Familia table component to show `%` line only when `hasPercent` prop is true.|Minimal JSX change: render a `<tr>` below if prop present.|
|5|Display loading placeholder until `loadFamiliaDetails` resolves.|Existing skeleton can be reused.|
|6|Unit tests: `safeDivision`, merge logic.|Jest tests for edge cases.|
|7|Integration test: expand CPV row → expect percent cell; expand other rows → no percent.|Cypress.|
|8|Code cleanup + ESLint.|`npm run lint --fix`.|

---

## 8. Edge Cases & Notes

1. Receita Bruta record missing → denominator = 0 → percent = 0.  
2. ym mismatch: only join on exact string; unmatched pairs skipped (percent = 0).  
3. Future years: `year` already supplied by parent component, reuse.  
4. Performance: both endpoints already cached by BE; front-end still batches via `Promise.all`.

---

## 9. Rollback Plan

Feature guarded by a prop flag `enableCpvPercent`; toggle off to revert to single-request behaviour.

---

## 10. Open Questions

1. Should we hide the percent row when Receita Bruta = 0 instead of showing “0 %”?  
2. Desired decimal precision (current UI shows `0,0%`).  

---

### Appendix A — Minimal diff illustration

```diff
- const data = await fetchCogs(year);
- setRows(data);
+ const { rows, hasPercent } = await loadFamiliaDetails(group, year);
+ setRows(rows);
+ setShowPercent(hasPercent);
```

---

*Prepared by:* Senior Front-End Dev  
*Date:* 2025-06-04
