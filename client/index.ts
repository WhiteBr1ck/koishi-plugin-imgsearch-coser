import type { Context } from '@koishijs/client'
import PlatformTable from './components/PlatformTable.vue'
import CompactField from './components/CompactField.vue'
import BlockedWords from './components/BlockedWords.vue'
import Aliases from './components/Aliases.vue'
import ResultTemplate from './components/ResultTemplate.vue'

export default (ctx: Context) => {
  ctx.schema({ type: 'array', role: 'imgsearch-platforms', component: PlatformTable })
  ctx.schema({ type: 'array', role: 'imgsearch-blocked-words', component: BlockedWords })
  ctx.schema({ type: 'array', role: 'imgsearch-aliases', component: Aliases })
  ctx.schema({ type: 'string', role: 'imgsearch-result-template', component: ResultTemplate })
  for (const type of ['string', 'union', 'number', 'boolean']) ctx.schema({ type, role: 'imgsearch-field', component: CompactField })
  ctx.schema({ type: 'string', role: 'secret', important: true, validate: (_, schema) => !!schema.meta.extra?.imgsearchField, component: CompactField })
}
