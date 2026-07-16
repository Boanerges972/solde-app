---
name: codex-review
description: Revue croisée adversariale du diff courant par Codex (MCP), puis triage. À lancer AVANT tout commit touchant src/lib, src/hooks, supabase/migrations, ou l'import/export. Déclencheurs — "review codex", "revue croisée", "double check", "vérifie avec codex", ou avant de committer du code financier.
---

# Revue croisée par Codex

Un second modèle relit le diff **sans connaître l'intention de l'auteur**. C'est
ce qui rend la revue utile : l'auteur relit en sachant ce qu'il a voulu faire.

Sur ce projet, 3 passes = 3 séries de vrais défauts, dont **deux régressions
introduites par les correctifs eux-mêmes**. Ce n'est pas une formalité.

## 1. Cadrer le diff

```
git diff --stat <base>..HEAD
```

`<base>` = le dernier commit revu (ou le point de départ de la session).

## 2. Lancer Codex

Outil : `mcp__codex__codex`, `sandbox: danger-full-access` (le sandbox Windows
casse le spawn), `approval-policy: never`, `cwd` = racine du projet.

Le prompt DOIT contenir :

1. **Le contexte produit** — « PWA de finances perso EN PRODUCTION, vraies
   données bancaires ». Ça calibre la sévérité.
2. **LECTURE SEULE** — « ne modifie aucun fichier », explicite.
3. **Le périmètre** — la commande git à lire, pas un dump de code.
4. **Ce que fait le changement**, en 5-10 lignes : sans ça il devine.
5. **Ce qui a DÉJÀ été trouvé et corrigé** — sinon il re-signale, et le bruit
   noie les vraies trouvailles.
6. **Des axes de recherche précis**, pas « trouve les bugs » :
   - incohérences entre deux chemins d'un même flux
   - un solde qui peut diverger, une écriture partielle
   - concurrence / races (Realtime, retry, réponse perdue)
   - idempotence : un scénario où un doublon reste possible
   - régressions introduites PAR les correctifs
   - code mort, imports inutilisés, chemins cassés
7. **Le format** — « UNIQUEMENT les vrais problèmes, par gravité
   (BLOQUANT/MAJEUR/MINEUR), fichier:ligne + fix. Confirme en une ligne ce qui
   tient. Verdict final. »

## 3. Trier — ne pas appliquer aveuglément

Pour **chaque** finding, avant de toucher au code :

- **Vérifier contre le code réel.** Codex a déjà signalé BLOQUANT une prod
  saine parce que le *fichier* de migration avait dérivé. Le lire ≠ le croire.
- **Mesurer l'impact réel** : requêter la base si besoin. Deux « bloquants »
  se sont avérés être des mines à 0 ligne concernée — réels, mais pas urgents.
- **Assumer les refus.** Un finding correct en théorie peut être de la
  sur-ingénierie ici (ex. hash du payload dans `financial_ops` : l'id est frais
  par opération, la divergence est impossible par construction). Le dire et
  dire pourquoi.

Rendre le triage visible : accepté / nuancé / refusé, avec la raison.

## 4. Corriger, puis verrouiller

- Un test par finding accepté, qui **échoue avant le correctif**.
- Chercher le **rayon d'action** avant de corriger une classe de bug :
  `grep -rn "<motif>" src/` — sinon on corrige 2 appelants sur 5.
- Vérifier : `npx tsc --noEmit && npx vitest run && npm run build`.

## 5. Re-passer si le lot est gros

Une correction peut en créer une autre (le `catch` qui écrasait
l'`operation_id` figé est né d'un correctif). Sur un lot conséquent, relancer
une passe en donnant à Codex la liste de ce qui vient d'être corrigé.

## Limites connues

- La session Codex expire : relancer `mcp__codex__codex` crée un nouveau thread,
  il faut alors redonner le contexte.
- `codex mcp-server` (pas `codex mcp`, qui gère des serveurs externes).
- Codex ne voit ni la base ni la prod : tout ce qu'il déduit du SQL vient des
  **fichiers**. D'où l'importance qu'ils ne mentent pas.
