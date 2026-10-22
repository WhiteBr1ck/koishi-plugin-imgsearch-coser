<template>
  <SchemaBase v-bind="$attrs" :schema="schema" :model-value="modelValue" :initial="initial" :disabled="disabled" :prefix="prefix" :extra="extra">
    <template #title><slot name="title" /></template>
    <template #desc><p>{{ schema?.meta.comment || schema?.meta.description }}</p></template>
    <template #menu><slot name="menu" /></template>
    <template #control>
      <el-switch v-if="schema?.type === 'boolean'" :model-value="value" :disabled="disabled" :aria-label="label" @update:model-value="$emit('update:modelValue', $event)" />
      <el-input-number v-else-if="schema?.type === 'number'" :model-value="value" :min="schema.meta.min" :max="schema.meta.max" :step="schema.meta.step || 1" :precision="0" :disabled="disabled" :aria-label="label" @update:model-value="$emit('update:modelValue', $event ?? schema.meta.default)" />
      <el-select v-else-if="schema?.type === 'union'" :model-value="value" :disabled="disabled" :aria-label="label" @update:model-value="$emit('update:modelValue', $event)">
        <el-option v-for="option in schema.list" :key="String(option.value)" :value="option.value" :label="option.meta.description || option.value" />
      </el-select>
      <el-input v-else :model-value="value" :disabled="disabled" :aria-label="label" :type="secret ? 'password' : 'text'" :show-password="secret" autocomplete="off" @update:model-value="$emit('update:modelValue', $event)" />
    </template>
  </SchemaBase>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { PropType } from 'vue'
import { SchemaBase } from '@koishijs/client'
import type { Schema } from '@koishijs/client'
defineOptions({ inheritAttrs: false })
const props = defineProps({ schema: {} as PropType<Schema>, modelValue: {} as PropType<any>, initial: {}, disabled: Boolean, prefix: String, extra: {} as PropType<any> })
defineEmits(['update:modelValue'])
const label = computed(() => String(props.schema?.meta.description || ''))
const value = computed(() => props.modelValue ?? props.schema?.meta.default ?? '')
const secret = computed(() => props.schema?.meta.role === 'secret')
</script>
