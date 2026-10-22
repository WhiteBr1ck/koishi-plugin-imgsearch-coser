<template>
  <SchemaBase v-bind="$attrs" :schema="schema" :model-value="modelValue" :initial="initial" :disabled="disabled" :prefix="prefix" :extra="extra" :collapsible="{ initial: true }">
    <template #title><slot name="title" /></template>
    <template #desc><slot name="desc" /></template>
    <template #menu><slot name="menu" /></template>
    <template #control><el-button plain :disabled="disabled" @click="$emit('update:modelValue', DEFAULT_RESULT_TEMPLATE)">恢复默认</el-button></template>
    <template #collapse>
      <div class="imgsearch-template">
        <el-input type="textarea" :model-value="value" :autosize="{ minRows: 8, maxRows: 16 }" :maxlength="4000" :disabled="disabled" aria-label="返回文本模板" :aria-invalid="!!error" @update:model-value="$emit('update:modelValue', $event)" />
        <p v-if="error" role="alert">{{ error }} 当前会使用默认文本。</p>
        <details><summary>可用变量</summary>
          <p><code>{results}…{/results}</code> 内的内容逐条重复，缺失字段所在行自动省略。</p>
          <dl><template v-for="(label, key) in labels" :key="key"><dt>{{ '{' + key + '}' }}</dt><dd>{{ label }}</dd></template></dl>
        </details>
      </div>
    </template>
  </SchemaBase>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { PropType } from 'vue'
import { SchemaBase } from '@koishijs/client'
import type { Schema } from '@koishijs/client'
import { DEFAULT_RESULT_TEMPLATE, templateError } from '../../src/template'
defineOptions({ inheritAttrs: false })
const props = defineProps({ schema: {} as PropType<Schema>, modelValue: String, initial: {}, disabled: Boolean, prefix: String, extra: {} as PropType<any> })
defineEmits(['update:modelValue'])
const value = computed(() => props.modelValue ?? DEFAULT_RESULT_TEMPLATE)
const error = computed(() => templateError(value.value))
const labels = { platform: '平台', match: '匹配类型', name: '显示名', account: '账号', title: '标题', linkLabel: '帖子或主页', url: '链接', index: '序号', count: '结果总数' }
</script>

<style scoped>
.imgsearch-template { padding: 0.5rem 1rem 1rem; }
details { margin-block-start: 0.75rem; font-size: 0.875rem; }
summary { cursor: pointer; width: fit-content; }
dl { display: grid; grid-template-columns: max-content 1fr; gap: 0.4rem 1.5rem; }
dt { font-family: monospace; }
dd { margin: 0; }
</style>
