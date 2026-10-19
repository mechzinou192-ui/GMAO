# Mettre la démonstration en ligne gratuitement (sur un site web)

Objectif : donner à vos clients **un lien** (https://…) où ils essaient l'application avec des données fictives,
sans rien installer. Coût : **0 DA**.

> ⚠️ **Démonstration uniquement.** Les mots de passe des profils sont affichés sur l'écran de connexion et les données
> sont fictives. N'y mettez **jamais** de vraies données. Pour votre exploitation réelle : serveur privé (README.md).

## Ce que verront vos clients

Un écran de connexion avec un bandeau « Version de démonstration » et des boutons de profils : **Super administrateur,
Responsable maintenance, Technicien, Exploitation, Magasinier, Direction.** Un clic remplit l'identifiant et le mot de passe.
Données réalistes : 68 équipements dans 7 unités, 86 DI, 93 OT, préventif, magasin, habilitations avec alertes, indicateurs
sur 3 mois. Tous les écrans fonctionnent : création de DI et d'OT, indicateurs, import Excel, photos, étiquettes QR,
impression du ordre de travail, affichage sur téléphone.

---

## Option 1 — Site statique (la plus simple : un dossier à déposer, 5 minutes, aucun compte technique)

Le fichier `gmao-setram-demo-site.zip` contient le dossier **`site`** : un site complet de 5 fichiers (1,5 Mo). Il n'a besoin
d'**aucun serveur et d'aucune base de données** : le « serveur » est simulé dans le navigateur du visiteur, avec exactement les
mêmes règles que le vrai (droits par unité / système / volet, numérotation des DI et OT, conflits, import tout-ou-rien).

### Avec Netlify Drop (le plus rapide)
1. Dézippez `gmao-setram-demo-site.zip` : vous obtenez un dossier **`site`**.
2. Ouvrez **https://app.netlify.com/drop** (créez un compte gratuit si on vous le demande).
3. **Glissez le dossier `site`** sur la page.
4. Netlify affiche l'adresse du site (`https://xxxx.netlify.app`) : **c'est le lien à envoyer à vos clients.**
   Vous pouvez la renommer dans *Site configuration → Change site name*.

Limites actuelles de l'offre gratuite Netlify (vérifiées en 2026, susceptibles de changer) : 300 « crédits » par mois, bien
au-delà de ce qu'une démonstration consomme ; si le quota était dépassé, le site serait suspendu jusqu'au mois suivant.

### Alternatives, même dossier `site`
- **Cloudflare Pages** (gratuit, trafic non limité) : *Workers & Pages → Create → Pages → Upload assets*, déposez le dossier `site`.
- **GitHub Pages** (gratuit) : créez un dépôt public, envoyez le contenu du dossier `site` à la racine, puis
  *Settings → Pages → Deploy from a branch → main / (root)*. L'adresse est `https://votrenom.github.io/nom-du-depot/`.

Vérifiez sur le site de l'hébergeur que l'offre gratuite n'a pas changé. **N'ouvrez pas `index.html` en double-cliquant dessus** :
un navigateur refuse de charger l'application depuis un simple fichier ; il faut qu'elle soit servie par un site (ci-dessus).

### Comportement à connaître
- **Chaque visiteur a sa propre copie** de la démonstration, dans son navigateur : ses modifications ne sont vues de
  personne d'autre. Elles restent le temps de l'onglet (un rechargement les conserve) et **disparaissent à la fermeture
  de l'onglet** : la démo repart toujours propre.
- La création de comptes et le changement de mot de passe sont désactivés dans la démonstration.
- Les photos ajoutées ne sont gardées que tant que la page n'est pas rechargée.
- C'est **la même application** que le vrai serveur, mais ce n'est pas le vrai serveur : pour montrer le travail à plusieurs
  en même temps sur les mêmes données, utilisez l'option 2.

### Mettre à jour la démonstration
`./scripts/construire-site-demo.sh` (nécessite Node 20) reconstruit le dossier `web/dist-demo` ; redéposez-le sur l'hébergeur.

---

## Option 2 — Vrai serveur gratuit (plusieurs visiteurs sur les mêmes données) : GitHub + Neon + Render

À choisir si vous voulez que vos clients **travaillent ensemble** sur les mêmes données, avec le vrai serveur.
Trois comptes gratuits ; environ 20 minutes.

1. **GitHub** : créez un dépôt privé et envoyez-y le dossier `gmao-setram-server` **ainsi que le fichier `render.yaml`**,
   à la racine du dépôt (*Add file → Upload files*). Render ne lit `render.yaml` qu'à la racine du dépôt.
2. **Neon** (https://neon.com) : *Create project*, puis *Connect* → copiez la *connection string* (`postgresql://…`). Si elle
   se termine par `&channel_binding=require`, supprimez cette partie.
3. **Render** (https://render.com) : *New → Blueprint* → choisissez le dépôt → collez la chaîne Neon dans **DATABASE_URL** → *Apply*.
   Après 3 à 5 minutes, Render donne l'adresse `https://gmao-setram-demo-xxxx.onrender.com`.
   *Sans Blueprint* (*New → Web Service*, langage **Docker**) : **Root Directory** = `gmao-setram-server/server`,
   **Health Check Path** = `/api/health`, et les variables de `render.yaml` (`JWT_SECRET` : 40 caractères aléatoires).
   `DATABASE_URL` est facultatif : sans lui, la base intégrée est utilisée (données perdues à chaque redéploiement).

À savoir : le service gratuit **s'endort après ~15 minutes** sans visite (la visite suivante met environ une minute) ;
les photos sont temporaires ; les données de démonstration sont remises à zéro toutes les 24 h ; n'utilisez pas la base
gratuite *de Render* (elle expire au bout de 30 jours — d'où Neon). Offres gratuites susceptibles de changer.
En cas d'erreur : onglet **Logs** de Render.

---

## Passer ensuite à la vraie exploitation

Ne transformez pas la démo en production : créez une instance séparée **sans** `DEMO=1` (README.md : serveur privé avec
Docker), avec de vrais comptes et des sauvegardes.
