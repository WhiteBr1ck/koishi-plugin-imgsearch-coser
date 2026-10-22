<template>
  <SchemaBase v-bind="$attrs" :schema="schema" :model-value="modelValue" :disabled="disabled" :prefix="prefix" :initial="initial" :extra="extra">
    <template #title><slot name="title" /></template>
    <template #desc><slot name="desc" /></template>
    <template #menu><slot name="menu" /></template>
    <template #control><el-button plain :disabled="disabled" @click="restore">恢复默认</el-button></template>
    <div class="imgsearch-platform-table-wrap">
      <table class="imgsearch-platform-table" aria-label="平台返回设置">
        <colgroup><col class="check-column"><col><col class="limit-column"><col class="type-column"><col class="actions-column"></colgroup>
        <thead><tr><th scope="col">启用</th><th scope="col">平台</th><th scope="col">返回数量</th><th scope="col">结果类型</th><th scope="col">操作</th></tr></thead>
        <tbody>
          <tr v-for="(row, index) in rows" :key="row.platform">
            <td class="checkbox-cell"><el-checkbox :model-value="row.enabled" :disabled="disabled" :aria-label="`启用 ${labels[row.platform]}`" @update:model-value="update(index, 'enabled', $event)" /></td>
            <td class="platform-cell">{{ labels[row.platform] }}</td>
            <td class="limit-cell"><el-input-number :model-value="row.limit" :min="1" :max="10" :precision="0" :disabled="disabled" controls-position="right" :aria-label="`${labels[row.platform]} 返回数量`" @update:model-value="update(index, 'limit', $event ?? 1)" /></td>
            <td><el-select :model-value="row.content" :disabled="disabled" :aria-label="`${labels[row.platform]} 结果类型`" @update:model-value="update(index, 'content', $event)"><el-option label="帖子及主页" value="all" /><el-option label="仅帖子" value="posts" /></el-select></td>
            <td class="actions-cell">
              <el-button text circle :disabled="disabled || index === 0" :aria-label="`上移 ${labels[row.platform]}`" title="上移" @click="move(index, -1)"><IconArrowUp /></el-button>
              <el-button text circle :disabled="disabled || index === rows.length - 1" :aria-label="`下移 ${labels[row.platform]}`" title="下移" @click="move(index, 1)"><IconArrowDown /></el-button>
            </td>
          </tr>
        </tbody>
      </table>
      <span role="status" class="imgsearch-sr">{{ status }}</span>
    </div>
  </SchemaBase>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { PropType } from 'vue'
import { IconArrowUp, IconArrowDown, SchemaBase } from '@koishijs/client'
import type { Schema } from '@koishijs/client'
import { DEFAULT_RULES, PLATFORM_LABELS, platformLimit } from '../../src/platforms'
import type { PlatformRule } from '../../src/types'

defineOptions({ inheritAttrs: false })
const props = defineProps({ schema: {} as PropType<Schema>, modelValue: {} as PropType<PlatformRule[]>, disabled: Boolean, prefix: String, initial: {} as PropType<PlatformRule[]>, extra: {} as PropType<any> })
const emit = defineEmits<{ (event: 'update:modelValue', value: PlatformRule[]): void }>()
const labels = PLATFORM_LABELS
const status = ref('')
const rows = computed(() => {
  const configured = Array.isArray(props.modelValue) ? props.modelValue : DEFAULT_RULES
  const seen = new Set<string>()
  const normalized = configured.filter(row => row && row.platform in labels && !seen.has(row.platform) && seen.add(row.platform)).map(row => ({ ...row, limit: platformLimit(row) }))
  return [...normalized, ...DEFAULT_RULES.filter(row => !seen.has(row.platform)).map(row => ({ ...row, enabled: false }))]
})
function update(index: number, key: keyof PlatformRule, value: unknown) {
  emit('update:modelValue', rows.value.map((row, i) => i === index ? { ...row, [key]: value } : { ...row }))
}
function move(index: number, delta: number) {
  const target = index + delta
  if (target < 0 || target >= rows.value.length) return
  const next = rows.value.map(row => ({ ...row }))
  ;[next[index], next[target]] = [next[target], next[index]]
  emit('update:modelValue', next)
  status.value = `${labels[next[target].platform]} 已移到第 ${target + 1} 位。`
}
function restore() {
  emit('update:modelValue', DEFAULT_RULES.map(row => ({ ...row })))
  status.value = '已恢复默认平台设置。'
}
</script>

<style scoped>
.imgsearch-platform-table-wrap { overflow-x: auto; padding: 0.5rem 1rem 1rem; }
.imgsearch-platform-table { width: 100%; min-width: 500px; border-collapse: collapse; table-layout: fixed; font-size: 13px; }
.imgsearch-platform-table th, .imgsearch-platform-table td { border: 1px solid var(--el-border-color); }
.imgsearch-platform-table th { padding: 0.55rem 0.65rem; color: var(--k-text-normal); font-size: 13px; font-weight: 600; line-height: 1.25rem; text-align: center; white-space: nowrap; }
.imgsearch-platform-table td { height: 40px; padding: 0; background: var(--k-card-bg); font-weight: 400; }
.check-column { width: 64px; }
.limit-column { width: 112px; }
.type-column { width: 28%; }
.actions-column { width: 96px; }
.imgsearch-platform-table .platform-cell { padding-inline: 12px; }
.checkbox-cell, .actions-cell { text-align: center; }
.actions-cell { white-space: nowrap; }
.actions-cell :deep(.el-button + .el-button) { margin-left: 0; }
.actions-cell :deep(.k-icon) { width: 15px; height: 15px; }
.actions-cell :deep(.el-button) { min-width: 28px; min-height: 28px; }
.checkbox-cell :deep(.el-checkbox) { min-width: 28px; min-height: 28px; justify-content: center; }
.limit-cell :deep(.el-input-number) { width: 100%; }
.limit-cell :deep(.el-input__wrapper) { min-height: 40px; border-radius: 0; box-shadow: none; background: transparent; }
.limit-cell :deep(.el-input__wrapper.is-focus) { box-shadow: inset 0 0 0 2px var(--el-color-primary); }
.imgsearch-platform-table :deep(.el-select__wrapper) { min-height: 40px; border-radius: 0; box-shadow: none; background: transparent; }
.imgsearch-platform-table :deep(.el-select__wrapper.is-focused) { box-shadow: inset 0 0 0 2px var(--el-color-primary); }
.imgsearch-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
</style>
