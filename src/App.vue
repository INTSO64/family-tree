<template>
  <div id="app">
    <header class="app-header no-print">
      <div class="header-content">
        <h1>🌳 Arbre Généalogique</h1>
        <div class="header-actions">
          <button @click="showUpload = !showUpload" class="btn-toggle-upload">
            {{ showUpload ? '✕ Fermer' : '📊 Importer des données' }}
          </button>
        </div>
      </div>
    </header>

    <main>
      <div v-if="showUpload" class="upload-wrapper">
        <DataUpload 
          @dataLoaded="handleDataLoaded" 
          @error="handleError"
        />
      </div>

      <div class="tree-wrapper">
        <div v-if="memberCount > 0" class="tree-stats">
          <span>👨‍👩‍👧‍👦 {{ memberCount }} membres</span>
          <span class="separator">|</span>
          <span>🔄 Mis à jour : {{ lastUpdated }}</span>
        </div>
        
        <TreeView
          :tree-data="treeData"
          :is-loading="isLoading"
          :error="error"
          :member-count="memberCount"
          @refresh="handleRefresh"
        />
      </div>
    </main>

    <footer class="app-footer no-print">
      <p>Arbre Généalogique - Propulsé par Vue.js & FamilyTree.js</p>
    </footer>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import TreeView from './components/TreeView.vue';
import DataUpload from './components/DataUpload.vue';
import { useFamilyTree } from './composables/useFamilyTree';

const showUpload = ref(false);
const lastUpdated = ref('');

const {
  treeData,
  isLoading,
  error,
  memberCount,
  loadData,
  startAutoRefresh,
  stopAutoRefresh
} = useFamilyTree();

const handleDataLoaded = (data) => {
  if (data && data.tree) {
    treeData.value = data.tree;
  }
  lastUpdated.value = new Date().toLocaleString('fr-FR');

  // Fermer automatiquement l'upload après chargement
  setTimeout(() => {
    showUpload.value = false;
  }, 2000);
};

const handleRefresh = async () => {
  try {
    await loadData();
    lastUpdated.value = new Date().toLocaleString('fr-FR');
  } catch (err) {
    console.error('Erreur lors du rafraîchissement:', err);
  }
};

const handleError = (error) => {
  console.error('Erreur:', error);
};

// Rechargement automatique des données toutes les 5 minutes
onMounted(() => {
  startAutoRefresh(300000);
});

onBeforeUnmount(() => {
  stopAutoRefresh();
});
</script>

<style>
@import './assets/styles.css';

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

#app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f0f2f5;
}

.app-header {
  background: linear-gradient(135deg, #1a2a3a, #2c3e50);
  color: white;
  padding: 12px 24px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.2);
  position: sticky;
  top: 0;
  z-index: 100;
}

.header-content {
  max-width: 1400px;
  margin: 0 auto;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.app-header h1 {
  font-size: 22px;
  font-weight: 600;
  letter-spacing: 0.5px;
}

.header-actions {
  display: flex;
  gap: 10px;
}

.btn-toggle-upload {
  padding: 8px 18px;
  background: rgba(255,255,255,0.15);
  color: white;
  border: 1px solid rgba(255,255,255,0.2);
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.3s;
  backdrop-filter: blur(10px);
}

.btn-toggle-upload:hover {
  background: rgba(255,255,255,0.25);
  transform: translateY(-1px);
}

main {
  flex: 1;
  max-width: 1400px;
  width: 100%;
  margin: 0 auto;
  padding: 16px 20px;
}

.upload-wrapper {
  margin-bottom: 20px;
  animation: fadeIn 0.4s ease-out;
}

.tree-wrapper {
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.06);
  overflow: hidden;
  min-height: 500px;
}

.tree-stats {
  padding: 12px 20px;
  background: #f8fafc;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  gap: 16px;
  align-items: center;
  font-size: 14px;
  color: #475569;
}

.tree-stats .separator {
  color: #cbd5e1;
}

.app-footer {
  background: white;
  padding: 12px 24px;
  text-align: center;
  color: #94a3b8;
  font-size: 13px;
  border-top: 1px solid #e5e7eb;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Responsive */
@media (max-width: 768px) {
  .app-header {
    padding: 10px 16px;
  }
  
  .app-header h1 {
    font-size: 18px;
  }
  
  .header-content {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }
  
  .header-actions {
    justify-content: stretch;
  }
  
  .btn-toggle-upload {
    width: 100%;
    text-align: center;
  }
  
  main {
    padding: 10px 12px;
  }
  
  .tree-stats {
    flex-direction: column;
    gap: 4px;
    align-items: center;
    font-size: 13px;
    padding: 8px 16px;
  }
  
  .tree-stats .separator {
    display: none;
  }
}
</style>