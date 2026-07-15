-- ============================================================
-- QDQ — Snapshot de réconciliation financière (LECTURE SEULE)
-- ============================================================
-- But : détecter dérive des soldes et doublons AVANT/APRÈS tout
-- changement de logique financière (RPC atomiques, fix import).
--
-- Exécuter via MCP Supabase (execute_sql) ou SQL editor.
-- Ne modifie RIEN. À relancer après chaque déploiement sensible
-- et comparer aux valeurs de référence ci-dessous.
--
-- RÉFÉRENCE (baseline 2026-07-14, projet icbwiokzovrauraddstq) :
--   Boursorama  bso                    solde 3249.00  Σtx    12.40  écart  3236.60  (1 tx)
--   Crédit Mutuel crédit_mutuel_29d8a5 solde  -25.15  Σtx  1116.17  écart -1141.32  (1536 tx)
--   BNP         bnp                    solde  452.39  Σtx  -122.00  écart   574.39  (2 tx)
--   Crédit Agricole ca                 solde   66.00  Σtx   -18.50  écart    84.50  (1 tx)
--   Nickel      nickel_29d8a5_mdoq     solde   32.84  Σtx    0.00   écart    32.84  (0 tx)
--   Doublons : 0 groupe / 0 ligne en trop  ← INVARIANT : doit rester 0
--
-- NOTE : l'écart = solde initial implicite (aucune colonne solde_initial
-- en base). Il est NORMAL et stable tant qu'aucun import ne recalcule
-- balance = Σtx. Si un écart CHANGE sans nouvelle tx correspondante,
-- ou si balance se rapproche brutalement de Σtx → bug import déclenché.
-- ============================================================

-- 1) Réconciliation par compte : solde vs somme des transactions
SELECT
  a.id,
  a.name,
  a.balance                               AS solde_enregistre,
  COALESCE(SUM(t.amount), 0)              AS somme_transactions,
  a.balance - COALESCE(SUM(t.amount), 0)  AS ecart,
  COUNT(t.id)                             AS nb_tx,
  a.reserved,
  a.free
FROM accounts a
LEFT JOIN transactions t ON t.account_id = a.id
GROUP BY a.id, a.name, a.balance, a.reserved, a.free
ORDER BY ABS(a.balance - COALESCE(SUM(t.amount), 0)) DESC;

-- 2) Détection de doublons (proxy du bug offline replay)
--    INVARIANT ATTENDU : 0 partout.
WITH dups AS (
  SELECT account_id, tx_date, amount, merchant, COUNT(*) AS n
  FROM transactions
  GROUP BY account_id, tx_date, amount, merchant
  HAVING COUNT(*) > 1
)
SELECT
  (SELECT COUNT(*) FROM dups)                     AS groupes_dupliques,
  (SELECT COALESCE(SUM(n-1),0) FROM dups)         AS lignes_en_trop,
  (SELECT COALESCE(SUM((n-1)*amount),0) FROM dups) AS impact_montant_si_doublons;

-- 3) Cohérence free/reserved (free doit = balance - reserved)
SELECT id, name, balance, reserved, free,
       balance - COALESCE(reserved,0) - COALESCE(free,0) AS incoherence_free
FROM accounts
WHERE balance - COALESCE(reserved,0) - COALESCE(free,0) <> 0;
