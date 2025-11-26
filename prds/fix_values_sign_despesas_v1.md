# PRD ▸ Phase 2 – Make **Despesas** Values Positive

The previous phase removed artificial negatives from NFe‑derived rows; Despesa lines (MySQL) are still shown with a “‑” because the pivot subtracts them as they are added.  We will:

1. **Leave SQL untouched** (values come in positive).  
2. **Change only one line** in the `pivotDespesas` helper so we store them **positive**.  
3. Totals remain correct because the aggregation step already looks at each node’s `sign`.

---
## 1  File & exact edit
| File | Action | Line to change |
|------|--------|----------------|
| `lib/pnlLogic.ts` *(inside `pivotDespesas`)* | **MODIFY** | replace `-= row.valor_documento` with `+= row.valor_documento` |

### 1.1  Diff
```diff
-    // keep running sum in the leaf node (was negative)
-    sub.values[m] -= row.valor_documento;
+    // store positive value; node.sign === '-' will flip it in totals
+    sub.values[m] += row.valor_documento;
```
> **Do NOT** remove or change `sub.sign = '-'` – that flag still tells higher‑level totals to subtract the expense.

---
## 2  Why totals still work
All total builders use the existing pattern:
```ts
total += node.sign === '-' ? -node.values[m] : node.values[m];
```
So when a Despesa node (`sign:'-'`) contributes, its positive stored amount is multiplied by −1 at aggregation time – final math is unchanged.

---
## 3  Validation checklist
1. Reload `/pnl?year=2025` – every Despesa cell now shows a **positive** number.  
2. Sum of a Despesa parent equals the sum of its (positive) children.  
3. Operating Income and Net Profit totals are **unchanged** vs previous spreadsheet.  
4. Clicking a Despesa leaf still opens the same MySQL drill‑down list (values also positive).

**Nothing else changes.** This single‑line edit makes the entire table positive.  Commit, deploy, verify checklist.

