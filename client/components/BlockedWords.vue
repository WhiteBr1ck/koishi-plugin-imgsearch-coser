<template>
  <SchemaBase v-bind="$attrs" :schema="schema" :model-value="modelValue" :initial="initial" :disabled="disabled" :prefix="prefix" :extra="extra" :collapsible="{ initial: true }">
    <template #title><slot name="title" /></template>
    <template #desc><slot name="desc" /></template>
    <template #menu><slot name="menu" /></template>
    <template #collapse>
      <div class="imgsearch-words">
        <el-input type="textarea" :model-value="text" :autosize="{ minRows: 4, maxRows: 8 }" :disabled="disabled" aria-label="过滤词，每行一个" @update:model-value="update" />
        <p>每行一个，命中后不发送该结果。</p>
      </div>
    </template>
  </SchemaBase>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { PropType } from 'vue'
import { SchemaBase } from '@koishijs/client'
import type { Schema } from '@koishijs/client'
import { DEFAULT_BLOCKED_WORDS } from '../../src/filter'
defineOptions({ inheritAttrs: false })
const props = defineProps({ schema: {} as PropType<Schema>, modelValue: {} as PropType<string[]>, initial: {}, disabled: Boolean, prefix: String, extra: {} as PropType<any> })
const emit = defineEmits(['update:modelValue'])
const text = computed(() => (props.modelValue ?? DEFAULT_BLOCKED_WORDS).join('\n'))
// Keep in-progress blank lines so Enter works while editing the list.
function update(value: string) { emit('update:modelValue', value.split('\n')) }
</script>

<style scoped>
.imgsearch-words { padding: 0.5rem 1rem 1rem; }
.imgsearch-words p { color: var(--k-text-normal); font-size: 0.875rem; }
</style>
