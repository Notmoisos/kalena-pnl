# PRD – Adjust Net Revenue Calculation to Subtract Returns

**Goal:** Modify the calculation of `Receita Líquida / Net Revenue` to subtract `Devoluções / Returns` in addition to taxes and discounts.

**Current Formula:**
`Net Revenue = Gross Revenue - Taxes (excluding IPI) - Discounts`

**Desired Formula:**
`Net Revenue = Gross Revenue - Returns - Taxes (excluding IPI) - Discounts`

---

## 1. Locate the Calculation

The calculation happens within the `pivotRevenueLines` function in `pnl-matrix/lib/pnlLogic.ts`.

Find this block:

```ts
const ipiNode = taxNodes.find(n=>n.id==='taxIPI')!;
const nonIpiTax = taxRoot.values[m] - ipiNode.values[m];
net.values[m] = nodes['1'].values[m] - nonIpiTax - nodes['5'].values[m];
```

## 2. Identify Returns Node

The node representing `Devoluções / Returns` is `nodes['2']`.

## 3. Modify the Formula

Update the line that calculates `net.values[m]` to subtract `nodes['2'].values[m]`:

```diff
 const ipiNode = taxNodes.find(n=>n.id==='taxIPI')!;
 const nonIpiTax = taxRoot.values[m] - ipiNode.values[m];
- net.values[m] = nodes['1'].values[m] - nonIpiTax - nodes['5'].values[m];
+ net.values[m] = nodes['1'].values[m] - nodes['2'].values[m] - nonIpiTax - nodes['5'].values[m];
```

**Explanation:**
- `nodes['1']` = Gross Revenue (positive)
- `nodes['2']` = Returns (positive value representing the amount returned)
- `nonIpiTax` = Taxes (positive value representing taxes, excluding IPI)
- `nodes['5']` = Discounts (positive value representing discounts)

Subtracting `nodes['2'].values[m]` correctly deducts the value of returns from the Gross Revenue.

---

## 4. Implementation Steps

1.  Open `pnl-matrix/lib/pnlLogic.ts`.
2.  Find the `pivotRevenueLines` function.
3.  Modify the calculation for `net.values[m]` as shown in the diff above.
4.  Save the file.

## 5. Validation

1.  Restart the dev server or let it hot-reload.
2.  Check the `Receita Líquida / Net Revenue` row.
3.  Verify that the value for each month matches the formula: `Gross - Returns - (Taxes excluding IPI) - Discounts` for that month.
4.  Confirm that downstream calculations using Net Revenue (like Margem Bruta %) update accordingly. 

---

## o4 comments

The PRD is on the right track—this really is a one-line tweak—but the example snippet doesn’t match your current `pivotRevenueLines` implementation. A couple of notes:

1. **No `ipiNode` in `pivotRevenueLines`**  
   Your tax‐tree builder already excludes IPI from the root (`taxRoot`), so there is no `ipiNode` or `nonIpiTax` in the `pivotRevenueLines` code. You can ignore that part of the diff—just subtract `nodes['2']` directly.

2. **Correct diff**  
   In `pnl-matrix/lib/pnlLogic.ts`, inside the `pivotRevenueLines` loop you’ll see:
   ```ts
   // current
   net.values[m] = nodes['1'].values[m] 
                 - taxRoot.values[m]
                 - nodes['5'].values[m];
   ```
   The PRD’s real change is:
   ```diff
   - net.values[m] = nodes['1'].values[m] - taxRoot.values[m] - nodes['5'].values[m];
   + net.values[m] = nodes['1'].values[m] - nodes['2'].values[m] - taxRoot.values[m] - nodes['5'].values[m];
   ```
   This matches your data model:  
   • `nodes['1']` = Gross Revenue  
   • `nodes['2']` = Returns  
   • `taxRoot` = all revenue‐taxes (excluding IPI)  
   • `nodes['5']` = Discounts  

3. **Everything else stands**  
   - Locating `pivotRevenueLines` in `lib/pnlLogic.ts`  
   - Updating the one line  
   - Reload and verify `Net Revenue = Gross – Returns – Taxes – Discounts`  

Aside from removing the spurious `ipiNode` snippet in step 1, the PRD covers all necessary steps and is correct.
