# GMAO SETRAM — Plan de pilote

**Objectif :** démontrer sur **une unité, pendant 12 semaines**, que la GMAO est utilisée, fiable et utile, avec des chiffres, avant de décider de la généraliser aux 7 unités.

---

## 1. Périmètre proposé

| Élément | Proposition | À arbitrer |
|---|---|---|
| Unité | **SBA** (taille réduite, équipe accessible) ou **ALG** (volume représentatif) | Direction Ingénierie de la Maintenance |
| Systèmes | CFO, CFA, BILLETTIQUE, MR (compteurs km), ED | Selon les responsables de système |
| Utilisateurs | 1 responsable, 2 chargés, 4 à 6 techniciens, 2 agents d'exploitation, 1 magasinier | |
| Durée | 12 semaines (2 de préparation, 8 d'exploitation réelle, 2 de bilan) | |
| Fonctionnement | **GMAO seule source** pour les DI / OT de l'unité pilote (pas de double saisie papier, sauf bon OT imprimé) | Validation hiérarchique indispensable |

---

## 2. Calendrier

| Semaine | Étape | Livrable |
|---|---|---|
| S1 | Installation par la DSI (§ 4 du dossier DSI), recette technique, test de restauration | PV de recette technique |
| S1-S2 | Import de l'arborescence, des articles, des intervenants et des plans préventifs (modèle Excel) ; création des compteurs km des rames | Référentiel complet, contrôlé |
| S2 | Formation : 1 h exploitation, 2 h techniciens, ½ journée chargés / responsable / magasinier ; remise du **guide utilisateur** et étiquettes QR collées | Liste d'émargement |
| S3-S10 | Exploitation réelle ; point hebdomadaire de 30 min (anomalies, demandes d'évolution) | Registre des anomalies |
| S11-S12 | Mesure des indicateurs, enquête utilisateurs, bilan | Rapport de pilote et décision |

---

## 3. Indicateurs de réussite

| Indicateur | Mesure | Cible |
|---|---|---|
| **Adoption** | Part des interventions de l'unité tracées dans la GMAO (DI / OT saisis vs. registre de l'unité) | ≥ 90 % |
| Délai de prise en charge | Temps moyen DI → OT généré | ≤ 24 h |
| Qualité des données | OT clôturés avec compte-rendu complet (panne, cause, temps, intervenant) | ≥ 95 % |
| Préventif | Taux de réalisation des OT préventifs (TMP) | ≥ 85 % |
| Compteurs | Relevés km des rames saisis au moins chaque semaine | 100 % des rames |
| Stock | Écart entre stock GMAO et inventaire physique en fin de pilote, sur les articles suivis | ≤ 5 % |
| Disponibilité de l'outil | Interruptions de service constatées (supervision `/api/health`) | 0 interruption > 1 h |
| Satisfaction | Enquête (1 à 5) : « la GMAO me fait gagner du temps » | ≥ 3,5 |

Les indicateurs DI / OT sont directement produits par l'onglet **Indicateurs** (export Excel).

---

## 4. Rôles

| Rôle | Qui | Engagement |
|---|---|---|
| Sponsor | Directeur Ingénierie de la Maintenance | Valide le périmètre et la décision finale |
| Chef de projet | Responsable SdF | Pilotage, points hebdomadaires, rapport |
| Référent unité | Responsable maintenance de l'unité | Fait appliquer la règle « tout passe par la GMAO » |
| DSI | Administrateur système | Hébergement, sauvegardes, supervision |
| Utilisateurs clés | 1 chargé + 1 technicien | Remontent les difficultés, aident leurs collègues |

---

## 5. Risques et parades

| Risque | Parade |
|---|---|
| Double saisie (papier + GMAO) qui décourage | Règle claire dès S3 : la GMAO est la référence ; bon OT imprimable pour le terrain |
| Référentiel incomplet au démarrage | Import contrôlé en S1-S2, revue par le référent avant S3 |
| Faible couverture réseau au dépôt | Vérifier en S1 ; prévoir une tablette en Wi-Fi à l'atelier |
| Dépendance à un seul développeur | Code restructuré par modules, tests automatiques, documentation ; prévoir un binôme DSI |
| Données personnelles (taux horaires, habilitations) | Droits limités aux profils concernés ; avis DPO / juriste avant le pilote |

---

## 6. Décision de fin de pilote

- **Généraliser** : cibles atteintes, aucune anomalie bloquante → déploiement unité par unité (une toutes les 2 à 4 semaines).
- **Prolonger** : cibles partiellement atteintes → corrections, puis 4 semaines supplémentaires.
- **Arrêter / réorienter** : adoption < 60 % ou anomalies bloquantes non résolues → comparer avec une solution du marché sur la base du cahier des charges issu du pilote.
