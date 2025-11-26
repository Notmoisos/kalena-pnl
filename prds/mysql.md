# MySQL “Despesas” Integration – Code‑change Guide

> **Goal**  Augment the current Next.js P&L MVP so that the API route pulls *real* **despesas** rows from MySQL, aggregates them by `Periodo → codigo_e_descricao → categoria_descricao`, and injects the resulting hierarchy into the P&L tree (under the new root row **“Despesas”**).
>
> Everything below is **copy‑paste‑ready**.  Follow the order and you’ll be compiling in minutes.

---
## 1 .  Install new runtime dependency

Add the MySQL client to **package.json** (or run the command):

```bash
pnpm add mysql2      # or: npm i mysql2
```

Verify `package.json` shows:

```jsonc
"dependencies": {
  /* …existing… */,
  "mysql2": "^3.9.0"
}
```

---
## 2 .  Environment variables (**.env.local**)

Create **`.env.local`** at project root (already git‑ignored by Next.js):

```env
MYSQL_HOST=mysqlhost.umbler.com
MYSQL_PORT=1111
MYSQL_USER=username
MYSQL_PASSWORD=password
```

*(Hard‑coding creds inside the repo is a bad idea; use env vars instead.)*

---
## 3 .  New helper: **lib/db.ts**

```ts
// lib/db.ts
import mysql from 'mysql2/promise'

export async function getMysqlPool() {
  return mysql.createPool({
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    waitForConnections: true,
    connectionLimit: 10,
    timezone: 'Z',
  })
}
```

> ✔️ The pool is created lazily and can be reused by every request.

---
## 4 .  New data‑layer helper: **lib/despesas.ts**

```ts
// lib/despesas.ts
import { getMysqlPool } from './db'
import { Month, emptyYear } from './pnlLogic'

export type RawDespesa = {
  Periodo: string          // "YYYY-MM"
  codigo_e_descricao: string
  categoria_descricao: string
  valor_documento: number
}

const SQL = `
SELECT
    CONCAT(SUBSTRING_INDEX(cp.codigo_categoria, '.', 2), ' + ', mc.descricao) as codigo_e_descricao,
    cat.descricao as categoria_descricao,
    SUM(cp.valor_documento) as valor_documento,
    DATE_FORMAT(STR_TO_DATE(cp.data_entrada, '%d/%m/%Y'), '%Y-%m') as Periodo
FROM omie_contas_pagar_api cp
LEFT JOIN omie_categorias_api cat ON cp.codigo_categoria = cat.codigo AND cp.nome_projeto = cat.nome_projeto
LEFT JOIN (
    SELECT DISTINCT nome_projeto, codigo, descricao
    FROM omie_categorias_api
    WHERE conta_despesa = 'S'
      AND LOCATE('.', codigo) = 2
      AND LENGTH(codigo) = 4
) mc ON SUBSTRING_INDEX(cp.codigo_categoria, '.', 2) = mc.codigo AND cp.nome_projeto = mc.nome_projeto
WHERE YEAR(STR_TO_DATE(cp.data_entrada, '%d/%m/%Y')) = ?
  AND cp.status_titulo != 'CANCELADO'
GROUP BY Periodo, codigo_e_descricao, categoria_descricao;`

export async function fetchDespesas(year: number): Promise<RawDespesa[]> {
  const pool = await getMysqlPool()
  const [rows] = await pool.query<RawDespesa[]>(SQL, [year])
  return rows
}
```

**Why we aggregate in SQL:** the query already returns sums (`SUM(valor_documento)`) per *month + group + subgroup*, so the Node.js code only has to pivot into the P&L structure.

---
## 5 .  Extend **lib/pnlLogic.ts**

Add the import and a new helper that pivots the despesas rows into `PnLNode`s.

```ts
// lib/pnlLogic.ts
import { fetchDespesas } from './despesas'

// …existing code…

export async function buildPnl(year: number) {
  // 1. revenue & existing mock data
  const base = buildMockPnl(year)

  // 2. despesas from MySQL
  const despesas = await pivotDespesas(year)

  return [
    ...base,
    ...despesas
  ]
}

async function pivotDespesas(year: number) {
  const rows = await fetchDespesas(year)
  const rootId = 'exp'      // root row id for Despesas

  const months = Object.keys(emptyYear(year)) as Month[]
  const byGroup: Record<string, PnLNode> = {}
  const bySub  : PnLNode[] = []

  // ▶︎ Build/merge numbers
  for (const r of rows) {
    const m = r.Periodo as Month
    const groupId = `exp_${r.codigo_e_descricao}`
    const subId   = `${groupId}__${r.categoria_descricao}`

    byGroup[groupId] ??= {
      id: groupId,
      parentId: rootId,
      label: r.codigo_e_descricao,
      sign: '-',
      values: emptyYear(year)
    }
    byGroup[groupId].values[m] -= Number(r.valor_documento)   // expenses negative

    let sub = bySub.find((s) => s.id === subId)
    if (!sub) {
      sub = {
        id: subId,
        parentId: groupId,
        label: r.categoria_descricao,
        sign: '-',
        values: emptyYear(year)
      }
      bySub.push(sub)
    }
    sub.values[m] -= Number(r.valor_documento)
  }

  const despesasRoot: PnLNode = {
    id: rootId,
    label: 'Despesas',
    sign: '-',
    values: emptyYear(year)
  }
  // subtotal root from children
  for (const g of Object.values(byGroup)) {
    months.forEach((m) => {
      despesasRoot.values[m] += g.values[m]
    })
  }

  return [despesasRoot, ...Object.values(byGroup), ...bySub]
}
```

> **Note** – We treat every expense as **negative** (`sign: '-'`) so Net Profit can be `12 – Σ(despesas)` later.

---
## 6 .  Replace API route logic

**app/api/pnl/route.ts** becomes async/waits for DB:

```ts
import { buildPnl } from '@/lib/pnlLogic'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const year = Number(searchParams.get('year')) || new Date().getFullYear()

  // 🔥 THIS now fetches MySQL + mock revenue
  const tree = await buildPnl(year)

  return NextResponse.json(tree)
}
```

---
## 7 .  Update PnLTable’s `getSubRows`

Because nodes are now *pre‑nested via `parentId`*, the previous inline `filter` works but is O(n²).  Tiny tweak for efficiency:

```tsx
// components/PnLTable.tsx (only inside useMemo or outside component)
const childMap = useMemo(() => {
  const map: Record<string, PnLNode[]> = {}
  data.forEach((d) => {
    if (d.parentId) (map[d.parentId] ||= []).push(d)
  })
  return map
}, [data])

// … in useReactTable …
getSubRows: (row) => childMap[row.id] ?? [],
```

No other UI change is needed; expandable caret automatically appears for every node that has children (root **Despesas**, each `codigo_e_descricao` line).

---
## 8 .  TypeScript path fix in `PnlTable`

Remove the hard‑coded months array and compute from `year`:

```tsx
const months: Month[] = useMemo(() =>
  Array.from({ length: 12 }, (_, i) =>
    `${year}-${String(i + 1).padStart(2, '0')}` as Month
  ),
[year])
```

(This makes the table adapt when the year changes.)

---
### ✅  After these changes

1. Run `pnpm dev` – the API will hit MySQL, aggregate despesas, and the UI will show a new top‑level **“Despesas”** row that can be expanded into groups and subgroups.
2. Confirm totals: the sum of sub‑rows equals their parent; root Despesas value is the sum of all groups for each month.

You now have live data powering the expense side of your P&L.  Next step is integrating BigQuery for NFE revenue—but MySQL is done! 🎉

