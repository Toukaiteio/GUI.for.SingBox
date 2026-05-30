<script lang="ts" setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { Exec, WriteFile, RemoveFile, AbsolutePath } from '@/bridge'
import { DraggableOptions } from '@/constant/app'
import { CoreWorkingDirectory, RulesetFormatOptions, RulesetTypeOptions } from '@/constant/kernel'
import { DefaultRouteRuleset } from '@/constant/profile'
import { Branch } from '@/enums/app'
import { RulesetFormat, RulesetType, RuleType } from '@/enums/kernel'
import { useBool } from '@/hooks'
import { useAppSettingsStore, useRulesetsStore } from '@/stores'
import { deepClone, getKernelFileName, ignoredError, message, sampleID } from '@/utils'

interface Props {
  outboundOptions: { label: string; value: string }[]
}

defineProps<Props>()

const model = defineModel<IRuleSet[]>({ required: true })

const InlineRuleTypeOptions = [
  RuleType.Domain,
  RuleType.DomainSuffix,
  RuleType.DomainKeyword,
  RuleType.DomainRegex,
  RuleType.IPCidr,
  RuleType.SourceIPCidr,
  RuleType.Port,
  RuleType.SourcePort,
  RuleType.ProcessName,
  RuleType.ProcessPath,
  RuleType.Network,
  RuleType.Protocol,
].map((v) => ({ label: 'kernel.rules.type.' + v, value: v }))

const numericTypes: string[] = [RuleType.Port, RuleType.SourcePort]

interface InlineEntry {
  id: string
  type: string
  values: string[]
}

let rulesetId = 0
const fields = ref<IRuleSet>(DefaultRouteRuleset())
const inlineEntries = ref<InlineEntry[]>([])

const { t } = useI18n()
const [showEditModal] = useBool(false)
const rulesetsStore = useRulesetsStore()
const appSettings = useAppSettingsStore()

const parseInlineRules = (str: string): InlineEntry[] => {
  try {
    const list: InlineEntry[] = []
    ;(JSON.parse(str || '[]') as Recordable[]).forEach((rule) => {
      Object.entries(rule).forEach(([type, val]) => {
        if (Array.isArray(val)) list.push({ id: sampleID(), type, values: val.map(String) })
      })
    })
    return list
  } catch {
    return []
  }
}

const buildInlineRules = (list: InlineEntry[]) =>
  list
    .filter((e) => e.values.length)
    .map((e) => ({
      [e.type]: numericTypes.includes(e.type)
        ? e.values.map(Number).filter((n) => !Number.isNaN(n))
        : e.values,
    }))

const serializeInlineRules = (list: InlineEntry[]) => JSON.stringify(buildInlineRules(list))

const handleAddInlineRule = () => {
  inlineEntries.value.unshift({ id: sampleID(), type: RuleType.DomainSuffix, values: [] })
}

const handleDeleteInlineRule = (entry: InlineEntry) => {
  const idx = inlineEntries.value.indexOf(entry)
  if (idx !== -1) inlineEntries.value.splice(idx, 1)
}

const testUrl = ref('')
const testing = ref(false)
const testHit = ref<boolean | null>(null)
const testInfo = ref('')

const handleTest = async () => {
  testHit.value = null
  if (!testUrl.value) return
  let host = testUrl.value
  try {
    const u = new URL(/^\w+:\/\//.test(testUrl.value) ? testUrl.value : 'http://' + testUrl.value)
    host = u.hostname || testUrl.value
  } catch {
    /* treat raw input as host/ip */
  }
  const tmp = 'data/.ruleset-match-test.json'
  testing.value = true
  try {
    await WriteFile(tmp, JSON.stringify({ version: 1, rules: buildInlineRules(inlineEntries.value) }))
    const isAlpha = appSettings.app.kernel.branch === Branch.Alpha
    const out = await Exec(`${CoreWorkingDirectory}/${getKernelFileName(isAlpha)}`, [
      'rule-set',
      'match',
      await AbsolutePath(tmp),
      host,
    ])
    testHit.value = out.includes('match rules')
    testInfo.value = out
  } catch (error: any) {
    message.error(error.message || error)
  } finally {
    testing.value = false
    ignoredError(RemoveFile, tmp)
  }
}

const handleAdd = () => {
  rulesetId = -1
  fields.value = DefaultRouteRuleset()
  inlineEntries.value = []
  showEditModal.value = true
}

defineExpose({ handleAdd })

const handleAddEnd = () => {
  if (fields.value.type === RulesetType.Inline) {
    fields.value.rules = serializeInlineRules(inlineEntries.value)
  }
  if (rulesetId !== -1) {
    model.value[rulesetId] = fields.value
  } else {
    model.value.unshift(fields.value)
  }
}

const handleEdit = (index: number) => {
  rulesetId = index
  fields.value = deepClone(model.value[index]!)
  inlineEntries.value = parseInlineRules(fields.value.rules)
  showEditModal.value = true
}

const handleDelete = (index: number) => {
  model.value.splice(index, 1)
}

const showLost = () => message.warn('kernel.route.rule_set.notFound')

const hasLost = (ruleset: IRuleSet) => {
  if (ruleset.type !== RulesetType.Local) return false
  return !rulesetsStore.getRulesetById(ruleset.path)
}

const handleUse = (ruleset: any) => {
  fields.value.path = ruleset.id
  fields.value.tag = ruleset.tag
  fields.value.format = ruleset.format
}
</script>

<template>
  <Empty v-if="model.length === 0">
    <template #description>
      <Button icon="add" type="primary" size="small" @click="handleAdd">
        {{ t('common.add') }}
      </Button>
    </template>
  </Empty>

  <div v-draggable="[model, DraggableOptions]">
    <Card v-for="(ruleset, index) in model" :key="ruleset.id" class="mb-2">
      <div class="flex items-center py-2">
        <div class="font-bold">
          <span
            v-if="hasLost(ruleset)"
            class="cursor-pointer"
            :style="{ color: 'rgb(200, 193, 11)' }"
            @click="showLost"
          >
            [ ! ]
          </span>
          <Tag color="cyan">{{ ruleset.tag }}</Tag>
          <Tag>
            {{ t('kernel.route.rule_set.type.' + ruleset.type) }}
            {{
              t(
                'kernel.route.rule_set.format.' +
                  (ruleset.type === RulesetType.Inline ? RulesetFormat.Source : ruleset.format),
              )
            }}
          </Tag>
        </div>
        <div class="ml-auto">
          <Button icon="edit" type="text" size="small" @click="handleEdit(index)" />
          <Button icon="delete" type="text" size="small" @click="handleDelete(index)" />
        </div>
      </div>
    </Card>
  </div>

  <Modal
    v-model:open="showEditModal"
    :on-ok="handleAddEnd"
    title="kernel.route.tab.rule_set"
    max-width="80"
    max-height="80"
  >
    <div class="form-item">
      {{ t('kernel.route.rule_set.tag') }}
      <Input v-model="fields.tag" autofocus />
    </div>
    <div class="form-item">
      {{ t('kernel.route.rule_set.type.name') }}
      <Radio v-model="fields.type" :options="RulesetTypeOptions" />
    </div>
    <template v-if="fields.type === RulesetType.Local">
      <Divider>{{ t('kernel.route.tab.rule_set') }}</Divider>
      <div class="grid grid-cols-3 gap-8">
        <Empty
          v-if="rulesetsStore.rulesets.length === 0"
          :description="t('kernel.route.rule_set.empty')"
        />
        <template v-else>
          <Card
            v-for="ruleset in rulesetsStore.rulesets"
            :key="ruleset.tag"
            v-tips="ruleset.path"
            :title="ruleset.tag"
            :selected="fields.path === ruleset.id"
            @click="handleUse(ruleset)"
          >
            <div class="text-12">
              {{ ruleset.path }}
            </div>
          </Card>
        </template>
      </div>
    </template>
    <template v-else-if="fields.type === RulesetType.Remote">
      <div class="form-item">
        {{ t('kernel.route.rule_set.format.name') }}
        <Radio v-model="fields.format" :options="RulesetFormatOptions" />
      </div>
      <div class="form-item">
        {{ t('kernel.route.rule_set.url') }}
        <Input v-model="fields.url" />
      </div>
      <div class="form-item">
        {{ t('kernel.route.rule_set.download_detour') }}
        <Select v-model="fields.download_detour" :options="outboundOptions" clearable />
      </div>
      <div class="form-item">
        {{ t('kernel.route.rule_set.update_interval') }}
        <Input v-model="fields.update_interval" editable />
      </div>
    </template>
    <template v-else-if="fields.type === RulesetType.Inline">
      <Divider>{{ t('kernel.route.tab.rule_set') }}</Divider>
      
      <!-- Match Test Row (Styled as standard form-item) -->
      <div class="form-item gap-4">
        <span v-tips="t('kernel.route.rule_set.test_match_tip')" class="cursor-help shrink-0">
          {{ t('kernel.route.rule_set.test_match') }}
        </span>
        <div class="flex items-center gap-2 max-w-[320px] flex-1 justify-end">
          <Input
            v-model="testUrl"
            placeholder="http(s)://example.com"
            clearable
            class="flex-1"
            @submit="handleTest"
          >
            <template #suffix>
              <Button :loading="testing" icon="search" size="small" type="text" @click="handleTest" />
            </template>
          </Input>
          <div v-if="testHit !== null" class="shrink-0">
            <div 
              v-tips="testInfo" 
              class="test-result-badge flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-12 font-bold cursor-help transition-all"
              :class="testHit ? 'is-hit' : 'is-miss'"
            >
              <Icon :icon="testHit ? 'messageSuccess' : 'messageInfo'" :size="10" />
              <span>{{ testHit ? t('kernel.route.rule_set.hit') : t('kernel.route.rule_set.miss') }}</span>
            </div>
          </div>
        </div>
      </div>

      <Empty v-if="inlineEntries.length === 0" />
      <Card v-for="entry in inlineEntries" :key="entry.id" class="mb-8">
        <div class="flex items-start gap-8 py-4">
          <Select v-model="entry.type" :options="InlineRuleTypeOptions" />
          <div class="flex-1">
            <InputList
              v-model="entry.values"
              :placeholder="numericTypes.includes(entry.type) ? '0' : ''"
            />
          </div>
          <Button icon="delete" type="text" size="small" @click="handleDeleteInlineRule(entry)" />
        </div>
      </Card>

      <!-- Card-style Add Button below the list -->
      <Card
        class="add-card-btn cursor-pointer mb-8"
        @click="handleAddInlineRule"
      >
        <div class="flex items-center justify-center py-6 gap-2 text-neutral-400 dark:text-neutral-500">
          <Icon icon="add" :size="14" />
          <span class="text-14 font-bold">{{ t('common.add') }}</span>
        </div>
      </Card>
    </template>
  </Modal>
</template>

<style lang="less" scoped>
.test-result-badge {
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  border: 1px solid transparent;
  
  &.is-hit {
    color: var(--level-1-color);
    background-color: rgba(41, 178, 128, 0.06);
    border-color: rgba(41, 178, 128, 0.15);
  }
  
  &.is-miss {
    color: var(--level-0-color);
    background-color: rgba(128, 128, 128, 0.06);
    border-color: rgba(128, 128, 128, 0.15);
  }
}

.add-card-btn {
  border: 1px dashed var(--divider-color);
  background-color: transparent;
  box-shadow: none;
  transition: all 0.2s ease-in-out;
  
  &:hover {
    border-color: var(--primary-color);
    background-color: var(--card-hover-bg);
    
    .flex {
      color: var(--primary-color) !important;
    }
  }
}
</style>
