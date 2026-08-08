<template>
  <div class="tree-container">
    <div v-if="isLoading" class="loader">
      <div class="spinner"></div>
      <p>Chargement de l'arbre généalogique...</p>
    </div>

    <div v-else-if="error" class="error">
      <h3>⚠️ Erreur</h3>
      <p>{{ error }}</p>
      <button @click="$emit('refresh')" class="btn-retry">Réessayer</button>
    </div>

    <div v-else class="tree-wrapper">
      <div class="toolbar">
        <div class="stats">
          <span>👨‍👩‍👧‍👦 {{ memberCount }} membres</span>
          <span class="last-update">🔄 Mise à jour automatique</span>
        </div>
        <div class="controls">
          <button @click="zoomIn" class="btn-icon">➕</button>
          <button @click="zoomOut" class="btn-icon">➖</button>
          <button @click="resetView" class="btn-icon">⌂</button>
          <button @click="exportImage" class="btn-export">📸 Exporter</button>
          <button @click="$emit('refresh')" class="btn-refresh">🔄</button>
        </div>
      </div>

      <div id="family-tree" ref="treeContainer"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch, nextTick, onBeforeUnmount } from 'vue';

const props = defineProps({
  treeData: {
    type: Object,
    default: null
  },
  isLoading: {
    type: Boolean,
    default: false
  },
  error: {
    type: String,
    default: ''
  },
  memberCount: {
    type: Number,
    default: 0
  }
});

defineEmits(['refresh']);

const treeContainer = ref(null);
let familyTreeInstance = null;
let initCounter = 0;

// Ajuste le zoom pour que l'arbre entier tienne dans l'écran (tous les
// nœuds, y compris la fratrie après expansion, restent visibles). Utilise
// la bounding box calculée par FamilyTree au lieu de `fit()`, qui relance un
// rendu complet et peut laisser une vue vide selon le timing d'animation.
const fitTreeToScreen = () => {
  if (!familyTreeInstance?.response?.boundary) return;

  const bounds = familyTreeInstance.response.boundary;
  const svg = familyTreeInstance.getSvg();
  if (!svg) return;

  const containerW = parseFloat(svg.getAttribute('width'));
  const containerH = parseFloat(svg.getAttribute('height'));
  if (!containerW || !containerH) return;

  const margin = 40;
  const treeW = bounds.maxX - bounds.minX + margin * 2;
  const treeH = bounds.maxY - bounds.minY + margin * 2;
  const scaleMax = familyTreeInstance.config?.scaleMax ?? 2;
  const scale = Math.min(containerW / treeW, containerH / treeH, scaleMax);
  if (!Number.isFinite(scale)) return;

  const viewW = containerW / scale;
  const viewH = containerH / scale;
  const minX = bounds.minX - margin + (treeW - viewW) / 2;
  const minY = bounds.minY - margin + (treeH - viewH) / 2;

  familyTreeInstance.setViewBox([minX, minY, viewW, viewH]);
};

const initTree = () => {
  if (!treeContainer.value || !props.treeData) return;

  if (familyTreeInstance) {
    familyTreeInstance.destroy();
    familyTreeInstance = null;
  }

  const nodes = props.treeData.getNodes();
  const currentInit = ++initCounter;

  import('@balkangraph/familytree.js').then(module => {
    if (currentInit !== initCounter) return;

    const FamilyTree = module.default || module;

    // Personnalisation de l'en-tête du panneau de détails (photo en haut, nom en dessous)
    FamilyTree.editUI.renderHeaderContent = function (title, photo) {
      return `<div id="bft-avatar" class="bft-edit-form-avatar">${photo}</div>
              <h1 class="bft-edit-form-title">${FamilyTree._escapeGreaterLessSign(title)}</h1>`;
    };

    // Personnalisation des gabarits pour des cartes élégantes et très lisibles
    FamilyTree.templates.tommy.node = '<rect x="0" y="0" height="{h}" width="{w}" fill="#2d3748" rx="12" ry="12" stroke="#1a202c" stroke-width="1.5"></rect>';
    FamilyTree.templates.tommy_male.node = '<rect x="0" y="0" height="{h}" width="{w}" fill="#1d4ed8" rx="12" ry="12" stroke="#1e40af" stroke-width="1.5"></rect>';
    FamilyTree.templates.tommy_female.node = '<rect x="0" y="0" height="{h}" width="{w}" fill="#be185d" rx="12" ry="12" stroke="#9d174d" stroke-width="1.5"></rect>';

    ['tommy', 'tommy_male', 'tommy_female'].forEach((templateName) => {
      const t = FamilyTree.templates[templateName];
      t.size = [290, 150];

      // Cadre photo (intégré à droite dans la carte, sans débordement)
      t.img_0 =
        '<rect x="176" y="13" width="100" height="124" rx="10" ry="10" fill="rgba(0,0,0,0.2)" stroke="rgba(255,255,255,0.7)" stroke-width="2"></rect>' +
        '<image preserveAspectRatio="xMidYMid slice" xlink:href="{val}" x="178" y="15" width="96" height="120" style="border-radius: 8px;"></image>';

      // Nom (texte en gras à gauche, gestion des retours à la ligne sans chevauchement)
      t.field_0 =
        '<text data-width="155" style="font-size:16px;font-weight:700;line-height:1.3;" fill="#ffffff" x="15" y="45" text-anchor="start">{val}</text>';

      // Notes / Titres
      t.field_1 =
        '<text data-width="155" style="font-size:13px;font-weight:400;" fill="rgba(255,255,255,0.85)" x="15" y="98" text-anchor="start">{val}</text>';
    });

    const childrenByParent = new Map();
    const partnersByMember = new Map();

    const addToSet = (map, id, value) => {
      if (id === undefined || id === null || value === undefined || value === null) return;
      if (!map.has(id)) map.set(id, new Set());
      map.get(id).add(value);
    };

    // Un enfant appartient à ses deux parents : ce mapping permet donc de
    // commander la même fratrie depuis le père ou la mère.
    nodes.forEach((node) => {
      [node.pid, node.fid, node.mid].forEach((parentId) => addToSet(childrenByParent, parentId, node.id));
      (node.pids || []).forEach((partnerId) => {
        addToSet(partnersByMember, node.id, partnerId);
        addToSet(partnersByMember, partnerId, node.id);
      });
    });

    const expandedFamilies = new Set();
    const getFamily = (id) => new Set([id, ...(partnersByMember.get(id) || [])]);
    const getFamilyKey = (family) => [...family].map(String).sort().join('|');
    const getChildren = (family) => [...new Set(
      [...family].flatMap((id) => [...(childrenByParent.get(id) || [])])
    )];

    // Centre le nœud cliqué en haut et ajuste le zoom pour que toute la fratrie tienne dans la largeur de l'écran
    const centerNodeAtTop = (memberId, childrenIds = []) => {
      if (!familyTreeInstance) return;
      const parentNode = familyTreeInstance.getNode(memberId);
      if (!parentNode || parentNode.x === undefined || parentNode.y === undefined) return;

      const svg = familyTreeInstance.getSvg();
      if (!svg) return;

      const containerW = parseFloat(svg.getAttribute('width'));
      const containerH = parseFloat(svg.getAttribute('height'));
      if (!containerW || !containerH) return;

      // Englober le parent, ses conjoints et tous les enfants dépliés
      const partnerIds = partnersByMember.get(memberId) ? [...partnersByMember.get(memberId)] : [];
      const relevantIds = [memberId, ...partnerIds, ...childrenIds];

      let groupMinX = parentNode.x;
      let groupMaxX = parentNode.x + (parentNode.w || 290);

      relevantIds.forEach((id) => {
        const n = familyTreeInstance.getNode(id);
        if (n && n.x !== undefined) {
          const w = n.w || 290;
          groupMinX = Math.min(groupMinX, n.x);
          groupMaxX = Math.max(groupMaxX, n.x + w);
        }
      });

      const margin = 50; // Marge minimale aux bords gauche et droit de l'écran
      const groupWidth = (groupMaxX - groupMinX) + margin * 2;

      const scaleMax = familyTreeInstance.config?.scaleMax ?? 2;
      const scaleMin = familyTreeInstance.config?.scaleMin ?? 0.15;
      const currentScale = familyTreeInstance.getScale() || 0.8;

      // Calculer l'échelle maximale autorisée pour que la fratrie ne déborde pas
      const fitScale = containerW / groupWidth;
      const targetScale = Math.min(currentScale, fitScale, scaleMax);
      const scale = Math.max(targetScale, scaleMin);

      const viewW = containerW / scale;
      const viewH = containerH / scale;

      const parentW = parentNode.w || 280;
      const parentCenterX = parentNode.x + parentW / 2;

      // Centrer sur le parent tout en s'assurant qu'aucun enfant ne sorte de l'écran
      let minX = parentCenterX - viewW / 2;
      if (groupMinX - margin < minX) {
        minX = groupMinX - margin;
      }
      if (groupMaxX + margin > minX + viewW) {
        minX = groupMaxX + margin - viewW;
      }

      const topMargin = 50; // Marge en haut
      const minY = parentNode.y - topMargin;

      familyTreeInstance.setViewBox([minX, minY, viewW, viewH]);
    };

    // Tous les descendants (petits-enfants, arrière-petits-enfants, …) d'un
    // ensemble de nœuds, utilisés pour replier ce qui doit rester masqué.
    const getAllDescendants = (ids) => {
      const result = new Set();
      const stack = [...ids];
      while (stack.length) {
        const current = stack.pop();
        (childrenByParent.get(current) || []).forEach((childId) => {
          if (!result.has(childId)) {
            result.add(childId);
            stack.push(childId);
          }
        });
      }
      return result;
    };

    // Replie les descendants directs des enfants affichés : seul le niveau
    // des enfants directs du parent cliqué doit apparaître. La clé de
    // « famille dépliée » correspondante est aussi retirée pour que le clic
    // suivant sur ces nœuds les redéplie correctement.
    const hideSubtree = (ids) => {
      getAllDescendants(ids).forEach((id) => {
        const node = familyTreeInstance.getNode(id);
        if (node) node.collapsed = true;
        expandedFamilies.delete(getFamilyKey(getFamily(id)));
      });
    };

    familyTreeInstance = new FamilyTree(treeContainer.value, {
      nodes,
      template: 'tommy',
      orientation: FamilyTree.orientation.top,
      nodeBinding: {
        field_0: 'name',
        field_1: 'title',
        img_0: 'img'
      },
      editForm: {
        readOnly: true,
        titleBinding: 'name',
        photoBinding: 'img',
        elements: [
          { type: 'textbox', label: 'Nom & Prénoms', binding: 'name' },
          { type: 'textbox', label: 'Notes', binding: 'title' }
        ]
      },
      scaleInitial: 0.8,
      scaleMin: 0.15,
      scaleMax: 2,
      enableDragDrop: true,
      enablePan: true,
      mouseScrool: FamilyTree.action.zoom,
      nodeMouseClick: FamilyTree.action.none,
      // Au départ, seules les racines (les premières souches) sont visibles.
      collapse: { level: 1 },
      padding: 30,
      levelSeparation: 60,
      siblingSeparation: 20,
      subtreeSeparation: 40
    });

    // Clic droit sur un nœud : affichage du formulaire de détails natif de FamilyTree
    if (treeContainer.value) {
      treeContainer.value.addEventListener('contextmenu', (e) => {
        const nodeEl = e.target?.closest?.('[data-n-id]');
        if (nodeEl && familyTreeInstance) {
          e.preventDefault();
          const nodeId = nodeEl.getAttribute('data-n-id');
          if (nodeId !== null && nodeId !== undefined) {
            familyTreeInstance.editUI.show(nodeId, true);
          }
        }
      });
    }

    // FamilyTree traite normalement chaque conjoint comme un nœud distinct.
    // Cette gestion partagée rend le clic symétrique pour le couple.
    familyTreeInstance.on('click', (_sender, args) => {
      const memberId = args?.node?.id;
      if (memberId === undefined || memberId === null) return;

      const family = getFamily(memberId);
      const children = getChildren(family);
      
      if (children.length === 0) {
        centerNodeAtTop(memberId, []);
        return;
      }

      const familyKey = getFamilyKey(family);
      if (expandedFamilies.has(familyKey)) {
        familyTreeInstance.collapse(memberId, children, () => centerNodeAtTop(memberId, []));
        expandedFamilies.delete(familyKey);
      } else {
        // Replie les petits-enfants pour n'afficher que les enfants directs
        // du parent cliqué (aucune génération suivante n'apparaît).
        hideSubtree(children);
        // Déplie et positionne le nœud cliqué en haut au centre avec calcul d'échelle
        familyTreeInstance.expand(memberId, children, () => centerNodeAtTop(memberId, children));
        expandedFamilies.add(familyKey);
      }
    });

    familyTreeInstance.draw(undefined, undefined, () => {
      fitTreeToScreen();
    });
  });
};

// Surveiller les changements de données
watch(() => props.treeData, () => {
  nextTick(() => {
    initTree();
  });
}, { deep: true });

const zoomIn = () => {
  if (!familyTreeInstance) return;
  familyTreeInstance.setScale(familyTreeInstance.getScale() + 0.2);
};

const zoomOut = () => {
  if (!familyTreeInstance) return;
  familyTreeInstance.setScale(familyTreeInstance.getScale() - 0.2);
};

const resetView = () => {
  if (!familyTreeInstance) return;
  fitTreeToScreen();
};

const exportImage = () => {
  if (!familyTreeInstance) return;
  familyTreeInstance.exportPNG({
    filename: 'arbre-genealogique',
    openInNewTab: false,
    scale: 'fit'
  });
};

onMounted(() => {
  initTree();
});

onBeforeUnmount(() => {
  initCounter++;
  if (familyTreeInstance) {
    familyTreeInstance.destroy();
    familyTreeInstance = null;
  }
});
</script>

<style scoped>
.tree-container {
  width: 100%;
  height: 100vh;
  position: relative;
  background: #f5f7fa;
}

.tree-wrapper {
  width: 100%;
  height: calc(100vh - 60px);
}

#family-tree {
  width: 100%;
  height: 100%;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 20px;
  background: white;
  border-bottom: 1px solid #e0e0e0;
  position: sticky;
  top: 0;
  z-index: 10;
  flex-wrap: wrap;
  gap: 10px;
}

.stats {
  display: flex;
  gap: 20px;
  font-size: 14px;
  color: #555;
}

.last-update {
  font-size: 12px;
  color: #999;
}

.controls {
  display: flex;
  gap: 8px;
  align-items: center;
}

.btn-icon {
  width: 36px;
  height: 36px;
  border: 1px solid #ddd;
  background: white;
  border-radius: 6px;
  cursor: pointer;
  font-size: 18px;
  transition: all 0.2s;
}

.btn-icon:hover {
  background: #f0f0f0;
  border-color: #aaa;
}

.btn-export, .btn-refresh {
  padding: 8px 16px;
  border: 1px solid #ddd;
  background: white;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.btn-export:hover, .btn-refresh:hover {
  background: #f0f0f0;
}

.loader {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
}

.spinner {
  border: 4px solid #f3f3f3;
  border-top: 4px solid #3498db;
  border-radius: 50%;
  width: 40px;
  height: 40px;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  padding: 20px;
  text-align: center;
}

.btn-retry {
  margin-top: 20px;
  padding: 10px 30px;
  background: #3498db;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 16px;
}

@media (max-width: 768px) {
  .toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .stats {
    justify-content: center;
  }

  .controls {
    justify-content: center;
    flex-wrap: wrap;
  }
}
</style>

<style>
/* Style global pour le panneau de détails natif (editUI) de FamilyTree */
.bft-edit-form-header {
  height: auto !important;
  min-height: 230px !important;
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  justify-content: center !important;
  padding: 25px 20px 20px 20px !important;
  background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%) !important;
  position: relative !important;
}

.bft-edit-form-avatar {
  position: relative !important;
  top: auto !important;
  left: auto !important;
  transform: none !important;
  width: 120px !important;
  height: 120px !important;
  margin: 0 auto 14px auto !important;
  border-radius: 50% !important;
  border: 4px solid #ffffff !important;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35) !important;
  flex-shrink: 0 !important;
}

.bft-edit-form-title {
  position: relative !important;
  color: #ffffff !important;
  font-size: 18px !important;
  font-weight: 700 !important;
  line-height: 1.4 !important;
  text-align: center !important;
  margin: 0 !important;
  padding: 0 10px !important;
  word-break: break-word !important;
  overflow-wrap: break-word !important;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5) !important;
}
</style>
