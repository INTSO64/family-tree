<template>
  <div class="family-member" :class="[genderClass, { 'is-selected': selected }]" @click="toggleDetails">
    <!-- En-tête du membre -->
    <div class="member-header">
      <div class="avatar">
        <span class="gender-emoji">{{ genderEmoji }}</span>
      </div>
      <div class="member-name">
        <h3>{{ member.name }}</h3>
        <span class="member-relation" v-if="relation">{{ relation }}</span>
      </div>
      <button class="btn-toggle" @click.stop="toggleDetails">
        {{ expanded ? '−' : '+' }}
      </button>
    </div>

    <!-- Détails (expandables) -->
    <div class="member-details" v-if="expanded">
      <div class="detail-row" v-if="member.birth">
        <span class="detail-label">📅 Naissance</span>
        <span class="detail-value">{{ formatDate(member.birth) }}</span>
      </div>
      
      <div class="detail-row" v-if="member.death">
        <span class="detail-label">⚰️ Décès</span>
        <span class="detail-value">{{ formatDate(member.death) }}</span>
      </div>
      
      <div class="detail-row" v-if="member.bio">
        <span class="detail-label">📝 Biographie</span>
        <span class="detail-value bio-text">{{ member.bio }}</span>
      </div>
      
      <div class="detail-row" v-if="age">
        <span class="detail-label">🎂 Âge</span>
        <span class="detail-value">{{ age }}</span>
      </div>

      <div class="detail-row" v-if="childrenCount > 0">
        <span class="detail-label">👨‍👧‍👦 Enfants</span>
        <span class="detail-value">{{ childrenCount }}</span>
      </div>

      <div class="member-actions">
        <button class="btn-action" @click.stop="editMember">✏️ Modifier</button>
        <button class="btn-action btn-danger" @click.stop="deleteMember">🗑️ Supprimer</button>
      </div>
    </div>

    <!-- Statut de connexion -->
    <div v-if="showConnectionStatus" class="connection-status" :class="connectionClass">
      <span>{{ connectionStatus }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';

const props = defineProps({
  member: {
    type: Object,
    required: true,
    validator: (obj) => obj.id && obj.name
  },
  relation: {
    type: String,
    default: ''
  },
  selected: {
    type: Boolean,
    default: false
  },
  children: {
    type: Array,
    default: () => []
  },
  spouse: {
    type: Object,
    default: null
  },
  showConnectionStatus: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['edit', 'delete', 'select', 'toggle']);

const expanded = ref(false);

// Computed
const genderClass = computed(() => {
  const gender = props.member.gender || props.member.Genre || 'unknown';
  return {
    'male': gender === 'male' || gender === 'M' || gender === 'Homme',
    'female': gender === 'female' || gender === 'F' || gender === 'Femme',
    'unknown': !gender || gender === 'unknown'
  };
});

const genderEmoji = computed(() => {
  if (genderClass.value.male) return '👨';
  if (genderClass.value.female) return '👩';
  return '👤';
});

const age = computed(() => {
  const birthDate = props.member.birth || props.member.birthdate || props.member['Date de naissance'];
  if (!birthDate) return null;
  
  const birth = new Date(birthDate);
  const death = props.member.death || props.member.deathdate || props.member['Date de décès'];
  const endDate = death ? new Date(death) : new Date();
  
  if (isNaN(birth.getTime())) return null;
  
  let age = endDate.getFullYear() - birth.getFullYear();
  const monthDiff = endDate.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && endDate.getDate() < birth.getDate())) {
    age--;
  }
  
  return age > 0 ? `${age} ans` : 'Né(e) récemment';
});

const childrenCount = computed(() => {
  return props.children ? props.children.length : 0;
});

const connectionStatus = computed(() => {
  // À personnaliser selon votre logique de connexion
  return props.member.connected ? '🟢 Connecté' : '⚪ Hors ligne';
});

const connectionClass = computed(() => {
  return {
    'status-connected': props.member.connected,
    'status-disconnected': !props.member.connected
  };
});

// Méthodes
const formatDate = (dateString) => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString('fr-FR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

const toggleDetails = () => {
  expanded.value = !expanded.value;
  emit('toggle', { member: props.member, expanded: expanded.value });
};

const editMember = () => {
  emit('edit', props.member);
};

const deleteMember = () => {
  if (confirm(`Voulez-vous vraiment supprimer ${props.member.name} ?`)) {
    emit('delete', props.member);
  }
};
</script>

<style scoped>
.family-member {
  background: white;
  border-radius: 12px;
  padding: 12px 16px;
  margin-bottom: 10px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
  border-left: 4px solid #cbd5e1;
  transition: all 0.3s;
  cursor: pointer;
}

.family-member:hover {
  box-shadow: 0 4px 16px rgba(0,0,0,0.1);
  transform: translateX(4px);
}

.family-member.is-selected {
  box-shadow: 0 0 0 2px #3498db, 0 4px 16px rgba(52, 152, 219, 0.2);
}

.family-member.male {
  border-left-color: #4a90d9;
}

.family-member.female {
  border-left-color: #e87a90;
}

.family-member.unknown {
  border-left-color: #94a3b8;
}

.member-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.avatar {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #f1f5f9;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
}

.male .avatar {
  background: #dbeafe;
}

.female .avatar {
  background: #fce4ec;
}

.member-name {
  flex: 1;
  min-width: 0;
}

.member-name h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #1e293b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.member-relation {
  font-size: 12px;
  color: #94a3b8;
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.btn-toggle {
  background: #f1f5f9;
  border: none;
  border-radius: 50%;
  width: 28px;
  height: 28px;
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  flex-shrink: 0;
}

.btn-toggle:hover {
  background: #e2e8f0;
  transform: scale(1.1);
}

.member-details {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #f1f5f9;
  animation: slideDown 0.3s ease-out;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.detail-row {
  display: flex;
  padding: 4px 0;
  gap: 12px;
  align-items: baseline;
}

.detail-label {
  font-size: 13px;
  font-weight: 600;
  color: #64748b;
  min-width: 100px;
  flex-shrink: 0;
}

.detail-value {
  font-size: 13px;
  color: #1e293b;
  word-break: break-word;
}

.bio-text {
  font-style: italic;
  color: #475569;
}

.member-actions {
  margin-top: 12px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.btn-action {
  padding: 4px 12px;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-action:hover {
  background: #e2e8f0;
  transform: scale(1.02);
}

.btn-action.btn-danger {
  color: #ef4444;
}

.btn-action.btn-danger:hover {
  background: #fef2f2;
  border-color: #fecaca;
}

.connection-status {
  margin-top: 8px;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  display: inline-block;
}

.status-connected {
  background: #dcfce7;
  color: #166534;
}

.status-disconnected {
  background: #f3f4f6;
  color: #6b7280;
}

@media (max-width: 640px) {
  .family-member {
    padding: 10px 12px;
  }
  
  .detail-row {
    flex-direction: column;
    gap: 2px;
  }
  
  .detail-label {
    min-width: auto;
    font-size: 12px;
  }
  
  .detail-value {
    font-size: 12px;
    padding-left: 8px;
  }
  
  .member-actions {
    justify-content: stretch;
  }
  
  .btn-action {
    flex: 1;
    text-align: center;
  }
}
</style>