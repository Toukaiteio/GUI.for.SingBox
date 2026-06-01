<script setup lang="ts">
import { useI18n, I18nT } from 'vue-i18n'

import { ClipboardSetText } from '@/bridge'
import { DraggableOptions, ViewOptions } from '@/constant/app'
import { View } from '@/enums/app'
import {
  useProfilesStore,
  useAppSettingsStore,
  useKernelApiStore,
  useSubscribesStore,
  usePluginsStore,
  useAppStore,
} from '@/stores'
import { debounce, deepClone, generateConfig, message, sampleID, alert } from '@/utils'

import { useModal } from '@/components/Modal'

import type { Menu } from '@/types/app'

import ProfileEditor from './components/ProfileEditor.vue'
import ProfileForm from './components/ProfileForm.vue'

const { t } = useI18n()
const [Modal, modalApi] = useModal({})
const appStore = useAppStore()
const profilesStore = useProfilesStore()
const subscribesStore = useSubscribesStore()
const appSettingsStore = useAppSettingsStore()
const kernelApiStore = useKernelApiStore()
const pluginsStore = usePluginsStore()

const menuList: Menu[] = [
  { label: 'profile.step.general', icon: 'settings' },
  { label: 'profile.step.inbounds', icon: 'edit' },
  { label: 'profile.step.outbounds', icon: 'edit' },
  { label: 'profile.step.route', icon: 'rulesets' },
  { label: 'profile.step.dns', icon: 'settings' },
  { label: 'profile.step.mixin-script', icon: 'code' },
].map((v, i) => {
  return {
    ...v,
    handler: (id: string) => {
      const p = profilesStore.getProfileById(id)
      p && handleShowProfileForm(p.id, i)
    },
  }
})

const secondaryMenusList: Menu[] = [
  {
    label: 'profiles.start',
    icon: 'play',
    handler: async (id: string) => {
      appSettingsStore.app.kernel.profile = id
      try {
        const e = await kernelApiStore.stopCore().catch((e) => e)
        if (e && e !== 'The core is not running') {
          throw e
        }
        await kernelApiStore.startCore()
      } catch (error: any) {
        message.error(error)
        console.error(error)
      }
    },
  },
  {
    label: 'profiles.copy',
    icon: 'copy',
    handler: async (id: string) => {
      const p = deepClone(profilesStore.getProfileById(id)!)
      p.id = sampleID()
      p.name = p.name + '(Copy)'
      profilesStore.addProfile(p)
      message.success('common.success')
    },
  },
  {
    label: 'profiles.copytoClipboard',
    icon: 'link',
    handler: async (id: string) => {
      const p = profilesStore.getProfileById(id)!
      try {
        const config = await generateConfig(p)
        const str = JSON.stringify(config, null, 2)
        const ok = await ClipboardSetText(str)
        if (!ok) throw 'ClipboardSetText Error'
        message.success('common.success')
      } catch (error: any) {
        message.error(error.message || error)
      }
    },
  },
  {
    label: 'profiles.generateAndView',
    icon: 'preview',
    handler: async (id: string) => {
      const p = profilesStore.getProfileById(id)!
      try {
        const config = await generateConfig(p)
        alert(p.name, JSON.stringify(config, null, 2))
      } catch (error: any) {
        message.error(error.message || error)
      }
    },
  },
  {
    label: 'profiles.editSourceFile',
    icon: 'code',
    handler: async (id: string) => {
      const profile = profilesStore.getProfileById(id)!
      modalApi.setProps({ title: profile.name, width: '90', height: '90' })
      modalApi.setContent(ProfileEditor, { profile }).open()
    },
  },
]

const generateMenus = (profile: IProfile) => {
  const isCurrent = appSettingsStore.app.kernel.profile === profile.id

  const moreMenus: Menu[] = secondaryMenusList.map((v) => ({
    ...v,
    handler: () => v.handler?.(profile.id),
  }))

  const builtInMenus: Menu[] = []

  // 1. Core action: Use / Activate (if not already current)
  if (!isCurrent) {
    builtInMenus.push({
      label: 'common.use',
      icon: 'play',
      handler: () => handleUseProfile(profile),
    })
    builtInMenus.push({
      label: '',
      separator: true,
    })
  }

  // 2. Edit subtabs
  builtInMenus.push(...menuList.map((v) => ({ ...v, handler: () => v.handler?.(profile.id) })))

  // 3. Divider
  builtInMenus.push({
    label: '',
    separator: true,
  })

  // 4. More actions sub-menu
  builtInMenus.push({
    label: 'common.more',
    icon: 'more',
    children: moreMenus,
  })

  // 5. Danger zone Divider & Delete Action
  builtInMenus.push({
    label: '',
    separator: true,
  })
  builtInMenus.push({
    label: 'common.delete',
    icon: 'delete',
    role: 'danger',
    handler: () => handleDeleteProfile(profile),
  })

  const contextMenus = pluginsStore.plugins.filter(
    (plugin) => Object.keys(plugin.context.profiles).length !== 0,
  )

  if (contextMenus.length !== 0) {
    moreMenus.push(
      {
        label: '',
        separator: true,
      },
      ...contextMenus.reduce((prev, plugin) => {
        const menus = Object.entries(plugin.context.profiles)
        return prev.concat(
          menus.map(([title, fn]) => {
            return {
              label: title,
              icon: 'sparkle', // Use custom plugin sparkle icon
              handler: async () => {
                try {
                  plugin.running = true
                  await pluginsStore.manualTrigger(plugin.id, fn as any, profile)
                } catch (error: any) {
                  message.error(error)
                } finally {
                  plugin.running = false
                }
              },
            }
          }),
        )
      }, [] as Menu[]),
    )
  }

  return builtInMenus
}

const handleShowProfileForm = (id?: string, step = 0) => {
  modalApi.setProps({ width: '90', height: '90' })
  modalApi.setContent(ProfileForm, { id, step }).open()
}

const handleDeleteProfile = async (p: IProfile) => {
  const { profile } = appSettingsStore.app.kernel
  if (profile === p.id && kernelApiStore.running) {
    message.warn('profiles.shouldStop')
    return
  }

  try {
    await profilesStore.deleteProfile(p.id)
  } catch (error: any) {
    console.error('deleteProfile: ', error)
    message.error(error)
  }
}

const handleUseProfile = async (p: IProfile) => {
  if (appSettingsStore.app.kernel.profile === p.id) return

  appSettingsStore.app.kernel.profile = p.id

  if (kernelApiStore.running) {
    await kernelApiStore.restartCore()
  }
}

const isCreatedBySubscription = (id: string) => {
  return !!subscribesStore.getSubscribeById(id)
}

const showAuto = () => alert('Tips', 'profile.auto')

const onSortUpdate = debounce(profilesStore.saveProfiles, 1000)
</script>

<template>
  <div v-if="profilesStore.profiles.length === 0" class="grid-list-empty">
    <Empty>
      <template #description>
        <I18nT keypath="profiles.empty" tag="div" scope="global" class="flex items-center mt-12">
          <template #action>
            <Button type="link" @click="handleShowProfileForm()">{{ t('common.add') }}</Button>
          </template>
        </I18nT>
        <div class="flex items-center">
          <CustomAction :actions="appStore.customActions.profiles_header" />
        </div>
      </template>
    </Empty>
  </div>

  <div v-else class="grid-list-header">
    <Radio v-model="appSettingsStore.app.profilesView" :options="ViewOptions" class="mr-auto" />
    <CustomAction :actions="appStore.customActions.profiles_header" />
    <Button type="primary" icon="add" @click="handleShowProfileForm()">
      {{ t('common.add') }}
    </Button>
  </div>

  <div
    v-draggable="[profilesStore.profiles, { ...DraggableOptions, onUpdate: onSortUpdate }]"
    :class="['grid-list-' + appSettingsStore.app.profilesView, 'profiles-list-container']"
  >
    <Card
      v-for="(p, i) in profilesStore.profiles"
      :key="p.id"
      v-menu="generateMenus(p)"
      :title="p.name"
      :selected="appSettingsStore.app.kernel.profile === p.id"
      :style="{ '--i': i }"
      class="grid-list-item"
      @dblclick="handleUseProfile(p)"
    >
      <template #title-prefix>
        <Tag
          v-if="isCreatedBySubscription(p.id)"
          color="primary"
          size="small"
          style="margin-left: 0"
          @click="showAuto"
        >
          {{ t('common.auto') }}
        </Tag>
      </template>

      <template v-if="appSettingsStore.app.profilesView === View.Grid" #extra>
        <Dropdown>
          <Button type="link" size="small" icon="more" />
          <template #overlay>
            <div class="gui-menu flex flex-col gap-4 p-4 min-w-100">
              <Button type="text" size="small" class="gui-menu-btn" @click="handleUseProfile(p)">
                <div class="flex items-center gap-10">
                  <Icon icon="play" :size="16" class="menu-item-icon" />
                  <span>{{ t('common.use') }}</span>
                </div>
              </Button>
              <Button type="text" size="small" class="gui-menu-btn" @click="handleShowProfileForm(p.id)">
                <div class="flex items-center gap-10">
                  <Icon icon="edit" :size="16" class="menu-item-icon" />
                  <span>{{ t('common.edit') }}</span>
                </div>
              </Button>
              <div class="menu-separator" />
              <Button type="text" size="small" class="gui-menu-btn menu-item-danger" @click="handleDeleteProfile(p)">
                <div class="flex items-center gap-10">
                  <Icon icon="delete" :size="16" class="menu-item-icon" />
                  <span>{{ t('common.delete') }}</span>
                </div>
              </Button>
            </div>
          </template>
        </Dropdown>
      </template>

      <template v-else #extra>
        <Button type="text" size="small" @click="handleUseProfile(p)">
          {{ t('common.use') }}
        </Button>
        <Button type="text" size="small" @click="handleShowProfileForm(p.id)">
          {{ t('common.edit') }}
        </Button>
        <Button type="text" size="small" @click="handleDeleteProfile(p)">
          {{ t('common.delete') }}
        </Button>
      </template>
      <div>
        {{ t('profiles.inbounds') }}
        :
        {{ p.inbounds.length }}
        /
        {{ t('profiles.outbounds') }}
        :
        {{ p.outbounds.length }}
      </div>
      <div>
        {{ t('kernel.route.tab.rule_set') }}
        :
        {{ p.route.rule_set.length }}
        /
        {{ t('kernel.route.tab.rules') }}
        :
        {{ p.route.rules.length }}
      </div>
      <div>
        {{ t('profiles.dnsServers') }}
        :
        {{ p.dns.servers.length }}
        /
        {{ t('profiles.dnsRules') }}
        :
        {{ p.dns.rules.length }}
      </div>
    </Card>
  </div>

  <Modal />
</template>
