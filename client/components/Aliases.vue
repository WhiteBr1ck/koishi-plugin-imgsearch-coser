<template>
  <SchemaBase v-bind="$attrs" :schema="schema" :model-value="modelValue" :initial="initial" :disabled="disabled" :prefix="prefix" :extra="extra">
    <template #title><slot name="title" /></template>
    <template #desc><slot name="desc" /></template>
    <template #menu><slot name="menu" /></template>
    <template #control>
      <el-select :model-value="value" multiple filterable allow-create default-first-option :disabled="disabled" aria-label="指令别名" placeholder="输入后按回车" @update:model-value="$emit('update:modelValue', $event)">
        <el-option v-for="alias in value" :key="alias" :label="alias" :value="alias" />
      </el-select>
    </template>
  </SchemaBase>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { PropType } from 'vue'
import { SchemaBase } from '@koishijs/client'
import type { Schema } from '@koishijs/client'
defineOptions({ inheritAttrs: false })
const props = defineProps({ schema: {} as PropType<Schema>, modelValue: {} as PropType<string[]>, initial: {}, disabled: Boolean, prefix: String, extra: {} as PropType<any> })
defineEmits(['update:modelValue'])
const value = computed(() => props.modelValue ?? props.schema?.meta.default ?? [])
</script>
