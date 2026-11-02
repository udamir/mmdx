<script setup lang="ts">
// mmdx elements with ui="auto" follow <html data-theme>; VitePress marks dark mode with a class, so mirror it
import { onMounted, watchEffect } from 'vue';
import { useData } from 'vitepress';
import DefaultTheme from 'vitepress/theme';

const { isDark } = useData();
onMounted(() => watchEffect(() => (document.documentElement.dataset['theme'] = isDark.value ? 'dark' : 'light')));
</script>

<template>
  <DefaultTheme.Layout />
</template>
