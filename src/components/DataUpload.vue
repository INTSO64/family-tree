<template>
  <div class="data-upload">
    <!-- Mode automatique (Google Sheets) -->
    <div class="upload-section">
      <div class="input-group">
        <label for="sheet-id">📊 ID du Google Sheet</label>
        <input 
          id="sheet-id"
          v-model="sheetId" 
          type="text" 
          placeholder="Entrez l'ID du Google Sheet"
          @keyup.enter="loadFromGoogle"
        />
        <button @click="loadFromGoogle" :disabled="isLoading" class="btn-primary">
          <span v-if="isLoading">⏳ Chargement...</span>
          <span v-else>📥 Charger</span>
        </button>
      </div>

      <div class="input-group">
        <label for="sheet-name">📄 Nom de la feuille</label>
        <input 
          id="sheet-name"
          v-model="sheetName" 
          type="text" 
          placeholder="Sheet1"
        />
      </div>
    </div>

    <!-- Mode manuel (fichier CSV) -->
    <div class="upload-divider">
      <span>OU</span>
    </div>

    <div class="upload-section">
      <div class="file-upload-area" 
           @dragover.prevent="dragOver = true" 
           @dragleave.prevent="dragOver = false" 
           @drop.prevent="handleDrop"
           :class="{ 'drag-over': dragOver }">
        
        <input 
          type="file" 
          ref="fileInput"
          accept=".csv,.tsv"
          @change="handleFileUpload"
          style="display: none"
        />
        
        <div class="upload-prompt" @click="$refs.fileInput.click()">
          <span class="upload-icon">📁</span>
          <p>Glissez-déposez un fichier CSV ici</p>
          <p class="upload-hint">ou cliquez pour sélectionner un fichier</p>
        </div>
      </div>

      <!-- Exemple de données -->
      <div class="example-data">
        <button @click="loadExampleData" class="btn-secondary">
          📋 Charger les données d'exemple
        </button>
      </div>
    </div>

    <!-- Statut et erreurs -->
    <div v-if="uploadStatus" class="upload-status" :class="statusClass">
      <span class="status-icon">{{ statusIcon }}</span>
      <span>{{ uploadStatus }}</span>
      <button v-if="statusType === 'error'" @click="clearStatus" class="btn-close">✕</button>
    </div>

    <!-- Aperçu des données -->
    <div v-if="previewData.length > 0" class="data-preview">
      <h4>👀 Aperçu des données ({{ previewData.length }} membres)</h4>
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th v-for="col in previewColumns" :key="col">{{ col }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, index) in previewData.slice(0, 10)" :key="index">
              <td v-for="col in previewColumns" :key="col">{{ row[col] || '-' }}</td>
            </tr>
            <tr v-if="previewData.length > 10">
              <td :colspan="previewColumns.length" class="preview-more">
                ... et {{ previewData.length - 10 }} autres membres
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, toRefs } from 'vue';
import { familyColumns, loadCSVFromGoogleSheets, transformToFamilyTreeData } from '../utils/csvParser';
import Papa from 'papaparse';

const emit = defineEmits(['dataLoaded', 'error']);

const props = defineProps({
  initialSheetId: {
    type: String,
    default: ''
  },
  initialSheetName: {
    type: String,
    default: 'Sheet1'
  }
});

const { initialSheetId, initialSheetName } = toRefs(props);

// État
const sheetId = ref(initialSheetId.value);
const sheetName = ref(initialSheetName.value);
const isLoading = ref(false);
const uploadStatus = ref('');
const statusType = ref('info'); // 'info', 'success', 'error'
const previewData = ref([]);
const previewColumns = ref([]);
const fileInput = ref(null);
const dragOver = ref(false);

// Computed
const statusIcon = computed(() => {
  switch (statusType.value) {
    case 'success': return '✅';
    case 'error': return '❌';
    default: return 'ℹ️';
  }
});

const statusClass = computed(() => {
  return {
    'status-success': statusType.value === 'success',
    'status-error': statusType.value === 'error',
    'status-info': statusType.value === 'info'
  };
});

// Méthodes
const setStatus = (message, type = 'info') => {
  uploadStatus.value = message;
  statusType.value = type;
  
  if (type === 'success') {
    setTimeout(() => {
      clearStatus();
    }, 5000);
  }
};

const clearStatus = () => {
  uploadStatus.value = '';
  statusType.value = 'info';
};

const loadFromGoogle = async () => {
  if (!sheetId.value) {
    setStatus('Veuillez entrer un ID de Google Sheet', 'error');
    return;
  }

  isLoading.value = true;
  setStatus('Chargement des données depuis Google Sheets...', 'info');

  try {
    const data = await loadCSVFromGoogleSheets(sheetId.value, sheetName.value);
    processData(data);
    setStatus(`✅ ${data.length} membres chargés avec succès depuis Google Sheets !`, 'success');
  } catch (error) {
    setStatus(`❌ Erreur : ${error.message || 'Impossible de charger les données'}`, 'error');
    emit('error', error);
  } finally {
    isLoading.value = false;
  }
};

const handleFileUpload = (event) => {
  const file = event.target.files[0];
  if (file) {
    processFile(file);
  }
  // Réinitialiser l'input pour permettre de re-sélectionner le même fichier
  if (fileInput.value) {
    fileInput.value.value = '';
  }
};

const handleDrop = (event) => {
  dragOver.value = false;
  const file = event.dataTransfer.files[0];
  if (file) {
    processFile(file);
  }
};

const processFile = (file) => {
  const validTypes = ['text/csv', 'application/csv', 'text/plain', 'application/vnd.ms-excel'];
  
  if (!validTypes.includes(file.type) && !file.name.endsWith('.csv') && !file.name.endsWith('.tsv')) {
    setStatus('❌ Veuillez sélectionner un fichier CSV valide', 'error');
    return;
  }

  isLoading.value = true;
  setStatus(`Lecture du fichier : ${file.name}...`, 'info');

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const csvData = e.target.result;
      Papa.parse(csvData, {
        header: true,
        skipEmptyLines: true,
        trimHeaders: true,
        transformHeader: (header) => header.trim().toLocaleLowerCase('fr-FR'),
        complete: (results) => {
          if (results.errors.length > 0) {
            setStatus(`❌ Erreur de parsing : ${results.errors[0].message}`, 'error');
            return;
          }
          processData(results.data);
          setStatus(`✅ ${results.data.length} membres chargés depuis ${file.name} !`, 'success');
        },
        error: (error) => {
          setStatus(`❌ Erreur de lecture : ${error.message}`, 'error');
        }
      });
    } catch (error) {
      setStatus(`❌ Erreur : ${error.message}`, 'error');
    } finally {
      isLoading.value = false;
    }
  };

  reader.onerror = () => {
    setStatus('❌ Erreur lors de la lecture du fichier', 'error');
    isLoading.value = false;
  };

  reader.readAsText(file);
};

const processData = (data) => {
  // Valider les données
  if (!data || data.length === 0) {
    setStatus('❌ Aucune donnée trouvée', 'error');
    return;
  }

  // Vérifier les colonnes nécessaires
  const firstRow = data[0];
  const requiredFields = [familyColumns.id];
  const missingFields = requiredFields.filter(field => !(field in firstRow));
  
  if (missingFields.length > 0) {
    setStatus(`❌ Colonnes manquantes : ${missingFields.join(', ')}. Veuillez vérifier le format`, 'error');
    return;
  }

  // Préparer l'aperçu
  previewColumns.value = Object.keys(firstRow);
  previewData.value = data;

  // Transformer pour FamilyTree.js
  try {
    const treeData = transformToFamilyTreeData(data);
    emit('dataLoaded', {
      raw: data,
      tree: treeData,
      count: data.length
    });
  } catch (error) {
    setStatus(`❌ Erreur de transformation : ${error.message}`, 'error');
    emit('error', error);
  }
};

const loadExampleData = () => {
  const exampleData = [
    { id: 1, name: 'Jean Dupont', parentId: null, gender: 'male', birthDate: '1950-05-15', deathDate: null, bio: 'Fondateur' },
    { id: 2, name: 'Marie Dupont', parentId: 1, gender: 'female', birthDate: '1952-08-22', deathDate: null, bio: '' },
    { id: 3, name: 'Pierre Dupont', parentId: 1, gender: 'male', birthDate: '1975-12-01', deathDate: null, bio: 'Fils aîné' },
    { id: 4, name: 'Sophie Martin', parentId: 3, gender: 'female', birthDate: '1978-06-18', deathDate: null, bio: '' },
    { id: 5, name: 'Lucas Dupont', parentId: 3, gender: 'male', birthDate: '2005-09-30', deathDate: null, bio: 'Petit-fils' },
    { id: 6, name: 'Emma Dupont', parentId: 3, gender: 'female', birthDate: '2008-03-12', deathDate: null, bio: 'Petite-fille' },
    { id: 7, name: 'Michel Dupont', parentId: null, gender: 'male', birthDate: '1920-07-03', deathDate: '1995-11-28', bio: 'Grand-père' },
    { id: 8, name: 'Jeanne Dupont', parentId: 7, gender: 'female', birthDate: '1925-02-14', deathDate: '2010-09-20', bio: 'Grand-mère' }
  ];
  
  previewData.value = exampleData;
  previewColumns.value = Object.keys(exampleData[0]);
  processData(exampleData);
  setStatus(`✅ ${exampleData.length} membres chargés (données d\'exemple)`, 'success');
};

// Exposer la méthode pour charger depuis l'extérieur
defineExpose({
  loadFromGoogle,
  loadExampleData
});
</script>

<style scoped>
.data-upload {
  background: white;
  padding: 20px;
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.08);
  max-width: 800px;
  margin: 0 auto;
}

.upload-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.input-group {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.input-group label {
  font-weight: 600;
  font-size: 14px;
  color: #2c3e50;
  min-width: 140px;
}

.input-group input {
  flex: 1;
  min-width: 150px;
  padding: 10px 14px;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  font-size: 14px;
  transition: border-color 0.3s;
}

.input-group input:focus {
  outline: none;
  border-color: #3498db;
}

.upload-divider {
  display: flex;
  align-items: center;
  margin: 15px 0;
  color: #999;
  font-size: 12px;
}

.upload-divider::before,
.upload-divider::after {
  content: '';
  flex: 1;
  border-bottom: 1px solid #e0e0e0;
}

.upload-divider::before {
  margin-right: 15px;
}

.upload-divider::after {
  margin-left: 15px;
}

.file-upload-area {
  border: 2px dashed #cbd5e1;
  border-radius: 12px;
  padding: 40px 20px;
  text-align: center;
  transition: all 0.3s;
  cursor: pointer;
  background: #f8fafc;
}

.file-upload-area:hover {
  border-color: #94a3b8;
  background: #f1f5f9;
}

.file-upload-area.drag-over {
  border-color: #3498db;
  background: #eff6ff;
}

.upload-prompt {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.upload-icon {
  font-size: 48px;
}

.upload-prompt p {
  margin: 0;
  color: #475569;
}

.upload-hint {
  font-size: 12px;
  color: #94a3b8;
}

.example-data {
  display: flex;
  justify-content: center;
  margin-top: 5px;
}

.btn-primary {
  padding: 10px 24px;
  background: #3498db;
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  transition: all 0.3s;
  white-space: nowrap;
}

.btn-primary:hover:not(:disabled) {
  background: #2980b9;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(52, 152, 219, 0.3);
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-secondary {
  padding: 8px 20px;
  background: #f1f5f9;
  color: #475569;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.3s;
}

.btn-secondary:hover {
  background: #e2e8f0;
  border-color: #94a3b8;
}

.btn-close {
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 18px;
  color: #ef4444;
  padding: 0 4px;
}

.upload-status {
  margin-top: 15px;
  padding: 12px 16px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
}

.status-success {
  background: #ecfdf5;
  color: #065f46;
  border: 1px solid #a7f3d0;
}

.status-error {
  background: #fef2f2;
  color: #991b1b;
  border: 1px solid #fecaca;
}

.status-info {
  background: #eff6ff;
  color: #1e40af;
  border: 1px solid #bfdbfe;
}

.status-icon {
  font-size: 20px;
}

.data-preview {
  margin-top: 20px;
  border-top: 1px solid #e5e7eb;
  padding-top: 20px;
}

.data-preview h4 {
  margin: 0 0 12px 0;
  color: #1e293b;
  font-size: 16px;
}

.table-wrapper {
  overflow-x: auto;
  max-height: 300px;
  overflow-y: auto;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}

.data-preview table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.data-preview th {
  background: #f1f5f9;
  padding: 10px 12px;
  text-align: left;
  font-weight: 600;
  color: #475569;
  position: sticky;
  top: 0;
  z-index: 1;
}

.data-preview td {
  padding: 8px 12px;
  border-top: 1px solid #f1f5f9;
  color: #1e293b;
}

.data-preview tr:hover td {
  background: #f8fafc;
}

.preview-more {
  text-align: center;
  color: #94a3b8;
  font-style: italic;
  padding: 12px !important;
}

@media (max-width: 768px) {
  .data-upload {
    padding: 15px;
  }
  
  .input-group {
    flex-direction: column;
    align-items: stretch;
  }
  
  .input-group label {
    min-width: auto;
  }
  
  .btn-primary {
    width: 100%;
    justify-content: center;
  }
  
  .file-upload-area {
    padding: 24px 16px;
  }
}
</style>
