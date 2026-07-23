-- Revenus récurrents : distinguer prélèvements (debit) et revenus (credit).
-- next_debits ne stockait que des débits (amount toujours positif). La colonne
-- kind porte désormais la direction ; amount reste positif.
-- Les lignes existantes deviennent 'debit' → aucun changement de comportement.
alter table next_debits
  add column if not exists kind text not null default 'debit'
  check (kind in ('debit', 'credit'));
