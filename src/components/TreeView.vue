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

    familyTreeInstance = new FamilyTree(treeContainer.value, {
      nodes,
      template: 'tommy',
      nodeBinding: {
        field_0: 'name',
        field_1: 'title'
      },
      scaleInitial: 0.8,
      scaleMin: 0.3,
      scaleMax: 2,
      enableDragDrop: true,
      enablePan: true,
      mouseScrool: FamilyTree.action.zoom,
      nodeMouseClick: FamilyTree.action.details,
      padding: 30,
      levelSeparation: 60,
      siblingSeparation: 20,
      subtreeSeparation: 40
    });

    familyTreeInstance.draw(undefined, undefined, () => {
      familyTreeInstance.fit();
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
  familyTreeInstance.fit();
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
