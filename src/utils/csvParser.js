import Papa from 'papaparse';
import axios from 'axios';

const normalizeHeader = (header) => String(header || '').trim().toLocaleLowerCase('fr-FR');

const configuredHeader = (variableName, fallback) =>
  normalizeHeader(import.meta.env[variableName] || fallback);

export const familyColumns = {
  id: configuredHeader('VITE_COLUMN_ID', 'Id'),
  lastName: configuredHeader('VITE_COLUMN_LAST_NAME', 'Nom'),
  firstNames: configuredHeader('VITE_COLUMN_FIRST_NAMES', 'Prénoms'),
  father: configuredHeader('VITE_COLUMN_FATHER', 'Père'),
  mother: configuredHeader('VITE_COLUMN_MOTHER', 'Mère'),
  spouse: configuredHeader('VITE_COLUMN_SPOUSE', 'Époux(se)'),
  notes: configuredHeader('VITE_COLUMN_NOTES', 'Notes'),
  photo: configuredHeader('VITE_COLUMN_PHOTO', 'Photo'),
  gender: configuredHeader('VITE_COLUMN_GENDER', 'Genre')
};

export async function loadCSVFromGoogleSheets(sheetId, sheetName = 'Sheet1') {
  const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&sheet=${sheetName}`;

  try {
    const response = await axios.get(csvUrl);
    return new Promise((resolve, reject) => {
      Papa.parse(response.data, {
        header: true,
        skipEmptyLines: true,
        transformHeader: normalizeHeader,
        complete: (results) => results.errors.length > 0 ? reject(results.errors) : resolve(results.data),
        error: reject
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

const pick = (row, header) => {
  const value = row[normalizeHeader(header)];
  return isBlank(value) ? null : String(value).trim();
};

const exists = (id, members) => id !== null && Object.hasOwn(members, id);

const normalizeGender = (gender) => {
  const g = String(gender || '').trim().toLocaleLowerCase('fr-FR');
  if (['m', 'masculin', 'male', 'homme', 'mâle'].includes(g)) return 'male';
  if (['f', 'féminin', 'feminin', 'female', 'femme'].includes(g)) return 'female';
  return 'unknown';
};

const lookupKey = (row, headers) => {
  for (const header of headers) {
    const value = pick(row, header);
    if (value !== null) return value;
  }
  return null;
};

const splitIds = (value) => String(value || '').split(',').map((v) => v.trim()).filter(Boolean);

export function transformToFamilyTreeData(csvData) {
  const members = {};

  csvData.forEach((row) => {
    const id = pick(row, familyColumns.id);
    if (!id) return;

    const lastName = pick(row, familyColumns.lastName);
    const firstNames = pick(row, familyColumns.firstNames);
    const name = [firstNames, lastName].filter(Boolean).join(' ') || id;

    const fatherId = pick(row, familyColumns.father);
    const motherId = pick(row, familyColumns.mother);
    const spouseId = pick(row, familyColumns.spouse);
    const parentId = lookupKey(row, ['parentid', 'parent_id', 'parent', 'parentId', 'id du parent']);

    members[id] = {
      id,
      name,
      gender: normalizeGender(pick(row, familyColumns.gender)),
      fatherId,
      motherId,
      spouseId,
      parentId,
      notes: pick(row, familyColumns.notes),
      photo: pick(row, familyColumns.photo)
    };
  });

  // Dériver le genre à partir des références Père/Mère quand il n'est pas fourni.
  Object.values(members).forEach((member) => {
    if (member.gender === 'unknown') {
      if (exists(member.fatherId, members) && members[member.fatherId].gender === 'unknown') {
        members[member.fatherId].gender = 'male';
      }
      if (exists(member.motherId, members) && members[member.motherId].gender === 'unknown') {
        members[member.motherId].gender = 'female';
      }
    }
  });

  // Liens de couple : colonne Époux(se) + inférence via enfants partagés.
  const partnerOf = {};
  const ensurePartner = (a, b) => {
    if (a === b || !exists(a, members) || !exists(b, members)) return;
    (partnerOf[a] ??= new Set()).add(b);
    (partnerOf[b] ??= new Set()).add(a);
  };
  Object.values(members).forEach((member) => {
    splitIds(member.spouseId).forEach((spouse) => ensurePartner(member.id, spouse));
    if (exists(member.fatherId, members) && exists(member.motherId, members)) {
      ensurePartner(member.fatherId, member.motherId);
    }
  });

  const rootIds = Object.values(members)
    .filter((member) => !exists(member.fatherId, members)
      && !exists(member.motherId, members)
      && !(member.parentId && exists(member.parentId, members)))
    .filter((member) => {
      const partners = partnerOf[member.id] || new Set();
      return partners.size === 0 || [...partners].every((p) => p > member.id);
    })
    .map((member) => member.id);

  const toFamilyNode = (member) => {
    const node = {
      id: member.id,
      name: member.name,
      gender: member.gender,
      title: member.notes || '',
      img: member.photo || undefined
    };

    if (exists(member.fatherId, members)) node.fid = member.fatherId;
    if (exists(member.motherId, members)) node.mid = member.motherId;

    // Rétro-compatibilité schéma à parent unique (`parentId`).
    if (!member.fatherId && !member.motherId && exists(member.parentId, members)) {
      const parent = members[member.parentId];
      if (parent.gender === 'female') node.mid = member.parentId;
      else node.fid = member.parentId;
    }

    const partners = [...(partnerOf[member.id] || [])];
    if (partners.length) node.pids = partners;

    return node;
  };

  return {
    members,
    rootIds,
    getNodes: () => Object.values(members).map(toFamilyNode)
  };
}
