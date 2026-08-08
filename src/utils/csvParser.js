import Papa from 'papaparse';
import axios from 'axios';

const normalizeHeader = (header) => String(header || '').trim().toLocaleLowerCase('fr-FR');

const configuredHeader = (variableName, fallback) =>
  normalizeHeader(import.meta?.env?.[variableName] || fallback);

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

export function formatImageUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed || trimmed.toLowerCase() === 'null') return null;

  // Transforme les liens de partage Google Drive en liens d'images directs
  const driveMatch = trimmed.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?.*id=)([a-zA-Z0-9_-]+)/);
  if (driveMatch && driveMatch[1]) {
    return `https://lh3.googleusercontent.com/d/${driveMatch[1]}`;
  }

  // Transforme les liens Dropbox en liens d'accès direct au fichier brut
  if (trimmed.includes('dropbox.com')) {
    return trimmed.replace('dl=0', 'raw=1');
  }

  return trimmed;
}

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
      photo: formatImageUrl(pick(row, familyColumns.photo))
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

  // Fusionner les couples dont l'un des conjoints n'a pas de photo en un seul nœud.
  const hasPhoto = (member) => Boolean(member && member.photo && String(member.photo).trim() && String(member.photo).trim().toLowerCase() !== 'null');

  const visitedPairs = new Set();
  Object.keys(members).forEach((idA) => {
    const partners = partnerOf[idA] ? [...partnerOf[idA]] : [];
    partners.forEach((idB) => {
      if (!exists(idA, members) || !exists(idB, members)) return;
      const pairKey = [idA, idB].sort().join('|');
      if (visitedPairs.has(pairKey)) return;
      visitedPairs.add(pairKey);

      const memberA = members[idA];
      const memberB = members[idB];

      const photoA = hasPhoto(memberA);
      const photoB = hasPhoto(memberB);

      // Si l'un des deux conjoints (ou les deux) n'a pas de photo, on les unit dans un seul nœud
      if (!photoA || !photoB) {
        let targetId = idA;
        let sourceId = idB;

        if (photoB && !photoA) {
          targetId = idB;
          sourceId = idA;
        } else if (!photoA && !photoB) {
          // Si aucun des deux n'a de photo, privilégier celui qui a des parents enregistrés
          const aHasParents = exists(memberA.fatherId, members) || exists(memberA.motherId, members) || exists(memberA.parentId, members);
          const bHasParents = exists(memberB.fatherId, members) || exists(memberB.motherId, members) || exists(memberB.parentId, members);
          if (bHasParents && !aHasParents) {
            targetId = idB;
            sourceId = idA;
          }
        }

        const target = members[targetId];
        const source = members[sourceId];

        // Nom combiné (ex: "Jean DUPONT & Marie MARTIN")
        if (source.name && !target.name.includes(source.name)) {
          target.name = `${target.name} & ${source.name}`;
        }

        // Photo combinée (garde la photo existante si disponible)
        target.photo = target.photo || source.photo || null;

        // Notes combinées
        target.notes = [target.notes, source.notes].filter(Boolean).join(' / ');

        // Rediriger toutes les références de `sourceId` vers `targetId`
        Object.values(members).forEach((m) => {
          if (m.fatherId === sourceId) m.fatherId = targetId;
          if (m.motherId === sourceId) m.motherId = targetId;
          if (m.spouseId === sourceId) m.spouseId = targetId;
          if (m.parentId === sourceId) m.parentId = targetId;
          if (m.spouseId === m.id) m.spouseId = null;
        });

        // Mettre à jour `partnerOf`
        if (partnerOf[sourceId]) {
          partnerOf[sourceId].forEach((otherPartner) => {
            if (otherPartner !== targetId && partnerOf[otherPartner]) {
              partnerOf[otherPartner].delete(sourceId);
              partnerOf[otherPartner].add(targetId);
              (partnerOf[targetId] ??= new Set()).add(otherPartner);
            }
          });
          delete partnerOf[sourceId];
        }
        if (partnerOf[targetId]) {
          partnerOf[targetId].delete(sourceId);
        }

        // Supprimer le membre source
        delete members[sourceId];
      }
    });
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
    if (exists(member.motherId, members) && member.motherId !== member.fatherId) node.mid = member.motherId;

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
