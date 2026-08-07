import Papa from 'papaparse';
import axios from 'axios';

export async function loadCSVFromGoogleSheets(sheetId, sheetName = 'Sheet1') {
  // URL d'export CSV de Google Sheets
  const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&sheet=${sheetName}`;

  try {
    const response = await axios.get(csvUrl);
    return new Promise((resolve, reject) => {
      Papa.parse(response.data, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header) => header.trim().toLowerCase(),
        complete: (results) => {
          if (results.errors.length > 0) {
            reject(results.errors);
          } else {
            resolve(results.data);
          }
        },
        error: (error) => reject(error)
      });
    });
  } catch (error) {
    console.error('Erreur de chargement CSV:', error);
    throw error;
  }
}

const isBlank = (value) => {
  if (value === undefined || value === null) return true;
  const str = String(value).trim();
  return !str || str.toLowerCase() === 'null';
};

const pick = (row, keys) => {
  for (const key of keys) {
    const value = row[key];
    if (!isBlank(value)) {
      return String(value).trim();
    }
  }
  return null;
};

const normalizeGender = (value) => {
  const gender = (value || '').toLowerCase();
  if (gender === 'male' || gender === 'm' || gender === 'homme' || gender === 'masculin') return 'male';
  if (gender === 'female' || gender === 'f' || gender === 'femme' || gender === 'féminin') return 'female';
  return 'unknown';
};

export function transformToFamilyTreeData(csvData) {
  const members = {};
  const rootIds = [];

  csvData.forEach(row => {
    const id = pick(row, ['id', 'identifiant']);
    if (!id) return;

    const parentId = pick(row, ['parentid', 'parent_id', 'parent']);
    const name = pick(row, ['name', 'nom']);
    const gender = normalizeGender(pick(row, ['gender', 'genre', 'sexe']));
    const birthDate = pick(row, ['birthdate', 'date de naissance', 'date_naissance', 'birth']);
    const deathDate = pick(row, ['deathdate', 'date de décès', 'date_deces', 'death']);
    const bio = pick(row, ['bio', 'biographie', 'biography']);

    const title = [birthDate, deathDate].filter(Boolean).join(' - ') || bio || '';

    members[id] = {
      id,
      pid: parentId,
      name,
      gender,
      birthDate,
      deathDate,
      bio,
      title,
      children: [],
      spouse: null
    };
  });

  Object.values(members).forEach(member => {
    if (member.pid && members[member.pid]) {
      members[member.pid].children.push(member.id);
    } else {
      member.pid = null;
      rootIds.push(member.id);
    }
  });

  return {
    members,
    rootIds,
    getNodes: () => Object.values(members).map(m => ({
      id: m.id,
      pid: m.pid,
      name: m.name,
      gender: m.gender,
      title: m.title,
      birthDate: m.birthDate,
      deathDate: m.deathDate,
      bio: m.bio
    }))
  };
}
