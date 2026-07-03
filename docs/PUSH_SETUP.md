# Notifications push — configuration restante

L'infrastructure est en place (table `push_subscriptions`, service worker, Edge Function `send-notifications`, cron quotidien 12:00 UTC). Il reste **3 secrets à saisir une fois** dans le dashboard Supabase :

**Dashboard → Project Settings → Edge Functions → Secrets** (projet `icbwiokzovrauraddstq`) :

| Secret | Valeur |
|---|---|
| `VAPID_PUBLIC_KEY` | `BKTcY6goAJJ97SJ_hKHVAiLhWX0t7KLQ5fmtEyyPiUmpgotOQYldHtskKou9-cTQfLU3b8YaH4DI4tDCq8t5SIA` |
| `VAPID_PRIVATE_KEY` | `Nnft-BLvnDBg_deTq8XGLL7IIt6h1B3U_I72maTCyQA` |
| `CRON_SECRET` | `d9XVYiS8jth58D7EW1Zr7DWuYSqXr5jy` |

Côté front, la clé publique a un fallback codé en dur dans `src/lib/push.ts` — optionnellement, ajouter `VITE_VAPID_PUBLIC_KEY` dans les variables d'environnement Vercel avec la même valeur publique.

## Test manuel

1. App déployée → Réglages → « Notifications push » → Activer → accepter la permission
2. Vérifier l'abonnement : `select * from push_subscriptions;`
3. Déclencher la fonction à la main :

```bash
curl -X POST https://icbwiokzovrauraddstq.supabase.co/functions/v1/send-notifications \
  -H "x-cron-secret: d9XVYiS8jth58D7EW1Zr7DWuYSqXr5jy" -H "Content-Type: application/json" -d "{}"
```

Types de notifications (préférences par appareil dans Réglages) :
- **Rappel prélèvement J-2** — « Loyer — 750 € sera prélevé le 10 »
- **Dépassement budget** — à 80 % et 100 % de l'enveloppe mensuelle
- **Résumé hebdo** — le dimanche, total dépensé + top catégorie

⚠️ Ce fichier contient des secrets — ne pas partager le dépôt publiquement, ou déplacer ces valeurs et supprimer ce fichier après configuration.
