# Smart Grid Solver

[![Python](https://img.shields.io/badge/Python-3.9+-blue.svg)](https://python.org)
[![React](https://img.shields.io/badge/React-18.0+-61DAFB.svg)](https://reactjs.org)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

**Résolution numérique de systèmes linéaires appliquée aux réseaux électriques intelligents**

Application web interactive de simulation de flux de puissance (Power Flow) utilisant les méthodes directes d'algèbre linéaire : **Factorisation LU**, **Élimination de Gauss** et **Cholesky**.

## Table des matières

- [Contexte Mathématique](#contexte-mathématique)
- [Fonctionnalités](#fonctionnalités)
- [Prérequis](#prérequis)
- [Installation](#installation)
- [Lancement](#lancement)
- [Architecture Technique](#architecture-technique)
- [API Reference](#api-reference)
- [Développement](#développement)
- [Dépannage](#dépannage)

## Contexte Mathématique

### Le Problème du Smart Grid

Un réseau électrique intelligent peut être modélisé comme un graphe où :
- **Nœuds** : Centrales électriques, quartiers, postes de transformation
- **Arêtes** : Lignes de transmission (câbles électriques)

### Modèle Mathématique

Le problème se ramène à la résolution du système linéaire :

$$A\theta = b$$

Où :
- **$A \in \mathbb{R}^{n \times n}$** : Matrice des susceptances nodales (symétrique, creuse, définie positive)
  - $A_{ii} = \sum_{j \in \mathcal{N}(i)} b_{ij}$ (somme des susceptances des lignes connectées au nœud $i$)
  - $A_{ij} = -b_{ij}$ si une ligne existe entre $i$ et $j$, 0 sinon
  
- **$\theta \in \mathbb{R}^n$** : Vecteur des angles de phase (inconnues)
  
- **$b \in \mathbb{R}^n$** : Vecteur des puissances nettes injectées
  - $b_i &gt; 0$ : Production (centrale)
  - $b_i &lt; 0$ : Consommation (quartier)
  - $b_i = 0$ : Nœud de transit

### Méthodes Directes Implémentées

| Méthode | Complexité | Avantage | Condition |
|---------|-----------|----------|-----------|
| **LU** (Pivot Partiel) | $\frac{2}{3}n^3$ | Stable numériquement | Matrice inversible |
| **Gauss** | $\frac{2}{3}n^3$ | Simple, éducatif | Pivot non nul |
| **Cholesky** | $\frac{1}{3}n^3$ | 2× plus rapide, économique mémoire | $A$ symétrique définie positive |

## Fonctionnalités

- **Résolution temps réel** avec visualisation progressive de l'algorithme
- **Comparaison automatique** des méthodes avec recommandation intelligente
- **Cas tests IEEE standards** : 14, 30 et 118 nœuds
- **Simulation de pannes** (N-1 contingency analysis) avec dispatching d'urgence
- **Scénarios temporels** : Matin (pic), Soir (réduit), Standard
- **Visualisation graphique** du réseau s'allumant pendant le calcul
- **Affichage des matrices** $A$, $b$ et solution $\theta$ en temps réel
- **Métriques de performance** : Temps d'exécution, résidu, conditionnement

## 🛠 Prérequis

- **Système** : Windows 10/11 avec WSL2, ou Linux/macOS
- **Python** : 3.9 ou supérieur
- **Node.js** : 18.x LTS ou supérieur
- **Git** : Pour le clonage
- **VS Code** : Recommandé (avec extension WSL)

## Installation

### Méthode recommandée : WSL (Ubuntu)

```bash
# 1. Cloner le repository
git clone https://github.com/aya-sakroufi/smartgrid
cd smartgrid

# 2. Rendre les scripts exécutables
chmod +x install.sh start.sh stop.sh

# 3. Installation automatique
./install.sh

# 4. Lancement 
./start.sh 

# 5. Arrêt 
./stop.sh 

# 6. Dépannage 

# Permission denied : 
sudo chown -R $USER:$USER ~/smart-grid-solver 

# Port occupé :
pkill -f "python app.py"
pkill -f "npm start" 

# Dubious ownership 
git config --global --add safe.directory /home/$USER/smart-grid-solver
