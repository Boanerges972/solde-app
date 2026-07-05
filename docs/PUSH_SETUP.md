# Notifications push — configuration restante

L'infrastructure est en place (table `push_subscriptions`, service worker, Edge Function `send-notifications`, cron quotidien 12:00 UTC). Il reste **3 secrets à saisir une fois** dans le dashboard Supabase.

⚠️ **Ne jamais écrire les valeurs de secrets dans ce fichier** (il est versionné). Les valeurs vivantes sont transmises hors dépôt (chat / gestionnaire de secrets). Ce fichier ne liste que les **noms** des secrets.

**Dashboard → Project Settings → Edge Functions → Secrets** (projet `icbwiokzovrauraddstq`) :

| Secret | Rôle |
|---|---|
| `VAPID_PUBLIC_KEY` | Clé publique Web Push (identique au fallback dans `src/lib/push.ts` — publique, non secrète) |
| `VAPID_PRIVATE_KEY` | Clé privée de signature Web Push — **secret**, jamais côté client ni versionné |
| `CRON_SECRET` | Jeton partagé qui protège l'appel machine-à-machine de l'Edge Function |

Côté front, la clé **publique** VAPID a un fallback dans `src/lib/push.ts` ; optionnellement, définir `VITE_VAPID_PUBLIC_KEY` dans les variables d'environnement Vercel avec la même valeur publique.

## Rotation des secrets

Générer une nouvelle paire VAPID + un CRON_SECRET :

```bash
node -e "const c=require('crypto');const {publicKey,privateKey}=c.generateKeyPairSync('ec',{namedCurve:'prime256v1'});const pub=publicKey.export({type:'spki',format:'der'}).subarray(-65);const priv=privateKey.export({format:'jwk'}).d;const b=x=>Buffer.from(x).toString('base64url');console.log('PUBLIC='+b(pub));console.log('PRIVATE='+priv);console.log('CRON='+c.randomBytes(24).toString('base64url'));"
```

Puis : mettre à jour le fallback public dans `src/lib/push.ts`, saisir les 3 secrets dans le dashboard, et régénérer le cron avec le nouveau `CRON_SECRET` (migration `cron.unschedule` + `cron.schedule`).

## Test manuel

1. App déployée → Réglages → « Notifications push » → Activer → accepter la permission
2. Vérifier l'abonnement : `select count(*) from push_subscriptions;`
3. Déclencher la fonction à la main (remplacer `<CRON_SECRET>` par la valeur vivante) :

```bash
curl -X POST https://icbwiokzovrauraddstq.supabase.co/functions/v1/send-notifications \
  -H "x-cron-secret: <CRON_SECRET>" -H "Content-Type: application/json" -d "{}"
```

Types de notifications (préférences par appareil dans Réglages) :
- **Rappel prélèvement J-2** — « Loyer — 750 € sera prélevé le 10 »
- **Dépassement budget** — à 80 % et 100 % de l'enveloppe mensuelle
- **Résumé hebdo** — le dimanche, total dépensé + top catégorie
