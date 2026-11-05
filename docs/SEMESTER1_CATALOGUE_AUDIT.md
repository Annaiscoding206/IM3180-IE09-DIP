# Semester 1 catalogue coverage audit

AY2026/2027; audited 2026-11-05 against the [NTUMods bulk Semester 1 dataset](https://ntumods.com/data/api/indexes/2026_1.json). Scope: all 21 courses in the local catalogue. Curricula and historical records are unchanged.

| Course | Source indexes | Local before | Missing indexes | Genuinely missing slots |
|---|---:|---:|---|---:|
| CS2024 | 2 | 2 | — | 0 |
| DA1000 | 6 | 6 | — | 0 |
| DA2002 | 1 | 1 | — | 0 |
| DA3000 | 4 | 4 | — | 0 |
| EE2005 | 7 | 7 | — | 0 |
| EE2101 | 18 | 18 | — | 0 |
| EE2102 | 9 | 9 | — | 0 |
| EE2103 | 20 | 20 | — | 0 |
| IE0005 | 4 | 4 | — | 0 |
| IE1005 | 19 | 19 | — | 0 |
| IE2104 | 15 | 15 | — | 0 |
| IE2106 | 21 | 21 | — | 0 |
| IE2107 | 9 | 9 | — | 0 |
| IE2108 | 11 | 11 | — | 0 |
| IE2110 | 11 | 11 | — | 0 |
| IE3014 | 6 | 6 | — | 0 |
| IE3102 | 4 | 4 | — | 0 |
| IE4758 | 2 | 1 | 37545 | 1 |
| MH1810 | 65 | 65 | — | 0 |
| MH1811 | 7 | 7 | — | 0 |
| SC5002 | 1 | 1 | — | 0 |

Only IE4758/37545 is imported: LECTURE, group EPLE, Monday 19:00–21:50, TR+62, weeks 1-13 (source unspecified). No course/index key collision exists. Repeat setup uses `setupCatalogue.cjs` and the `2026_1_legacy_completion.json` snapshot.

Source representation differences, not new sessions:

- CS2024/32602 tutorial uses `S2.2_B4-04` in the source versus `S2.2-B4-04` locally, at the same time/group. Source weeks are 2-13 versus the explicit local 1-13. Existing row is preserved.
- MH1810/23454 tutorial is split in the source into LHN-TR+33 (weeks 2-5) and TRX43 (weeks 6-13), at the same time/group. The existing combined `LHN-TR+33 / TRX43` row (weeks 1-13) is preserved; adding both source segments would duplicate that tutorial.
- Other legacy source-specific weeks may differ from the previously approved 1-13 defaults. This additive import does not overwrite explicit local weeks or revise existing sessions.

After import: 242 of 242 source Semester 1 index keys represented. IE0005 remains exactly 32361–32364. Full source-row equivalence is not claimed for the preserved legacy representations above.
