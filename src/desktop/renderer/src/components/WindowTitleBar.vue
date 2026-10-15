<script setup lang="ts">
import { Minus, Square, X } from "@lucide/vue";

import { desktopApi } from "../lib/desktop-api";
</script>

<template>
  <header class="window-titlebar">
    <div class="window-titlebar-drag" />
    <div class="window-titlebar-controls no-drag">
      <button
        type="button"
        class="window-control"
        :aria-label="$t('最小化')"
        @click="desktopApi.window.minimize()"
      >
        <Minus :size="14" :stroke-width="1.6" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="window-control"
        :aria-label="$t('最大化')"
        @click="desktopApi.window.toggleMaximize()"
      >
        <Square :size="11" :stroke-width="1.6" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="window-control window-control-close"
        :aria-label="$t('关闭')"
        @click="desktopApi.window.close()"
      >
        <X :size="14" :stroke-width="1.6" aria-hidden="true" />
      </button>
    </div>
  </header>
</template>
