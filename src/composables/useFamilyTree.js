import { ref, computed, onMounted } from 'vue';
import { loadCSVFromGoogleSheets, transformToFamilyTreeData } from '../utils/csvParser';

export function useFamilyTree() {
  const isLoading = ref(false);
  const error = ref(null);
  const treeData = ref(null);
  const rawData = ref([]);

  const sheetId = import.meta.env.VITE_GOOGLE_SHEETS_ID || '';
  const sheetName = import.meta.env.VITE_GOOGLE_SHEETS_NAME;

  const loadData = async (customSheetId = null) => {
    isLoading.value = true;
    error.value = null;

    try {
      const id = customSheetId || sheetId;
      if (!id) {
        throw new Error('Aucun ID de Google Sheet configuré');
      }

      const csvData = await loadCSVFromGoogleSheets(id, sheetName);
      rawData.value = csvData;
      treeData.value = transformToFamilyTreeData(csvData);

      return treeData.value;
    } catch (err) {
      error.value = err.message || 'Erreur lors du chargement des données';
      console.error(err);
      throw err;
    } finally {
      isLoading.value = false;
    }
  };

  const memberCount = computed(() => {
    if (!treeData.value) return 0;
    return Object.keys(treeData.value.members).length;
  });

  // Rechargement automatique toutes les 5 minutes
  let autoRefreshInterval = null;

  const startAutoRefresh = (intervalMs = 300000) => {
    if (autoRefreshInterval) clearInterval(autoRefreshInterval);
    autoRefreshInterval = setInterval(() => {
      loadData().catch(console.warn);
    }, intervalMs);
  };

  const stopAutoRefresh = () => {
    if (autoRefreshInterval) {
      clearInterval(autoRefreshInterval);
      autoRefreshInterval = null;
    }
  };

  onMounted(() => {
    loadData();
  });

  return {
    isLoading,
    error,
    treeData,
    rawData,
    memberCount,
    loadData,
    startAutoRefresh,
    stopAutoRefresh
  };
}
