<script setup>
import { onMounted, ref } from 'vue';
import {supabase} from './lib/supabaseClient.js'
const instruments = ref([])
async function getInstruments() {
  const {data} = await supabase.from('instruments').select();
  instruments.value = data
}

onMounted(() => {
  getInstruments()
})

</script>

<template>
  <ul>
    <li v-for="instrument in instruments" :key="instrument.id">
      {{ instrument.name }}
    </li>
  </ul>
  <!-- <h1>You did it!</h1>
  <p>
    Visit <a href="https://vuejs.org/" target="_blank" rel="noopener">vuejs.org</a> to read the
    documentation
  </p> -->
</template>

<style scoped></style>
