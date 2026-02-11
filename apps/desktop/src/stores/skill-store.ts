import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { useSettingsStore } from './settings-store';
import type {
  SkillManifest,
  SkillEligibility,
  SkillCategory,
  InstalledSkillConfig,
} from '@gemini-cowork/shared';

// ============================================================================
// Types
// ============================================================================

interface SkillStoreState {
  // Available skills from all sources
  availableSkills: SkillManifest[];
  lastDiscoveredAt: number | null;
  lastWorkingDirectory: string | null;

  // Eligibility status for each skill
  eligibilityMap: Map<string, SkillEligibility>;

  // UI State
  isDiscovering: boolean;
  isInstalling: Set<string>;
  isCheckingEligibility: Set<string>;

  // Filters
  searchQuery: string;
  selectedCategory: SkillCategory | 'all';
  activeTab: 'available' | 'installed';

  // Selected skill for details panel
  selectedSkillId: string | null;

  // Error state
  error: string | null;
}

/**
 * Parameters for creating a custom skill
 */
interface CreateSkillParams {
  name: string;
  description: string;
  emoji?: string;
  category?: string;
  content: string;
  requirements?: {
    bins?: string[];
    env?: string[];
    os?: string[];
  };
}

interface SkillStoreActions {
  // Discovery
  discoverSkills: (
    workingDirectory?: string,
    options?: { force?: boolean }
  ) => Promise<void>;

  // Installation
  installSkill: (skillId: string) => Promise<void>;
  uninstallSkill: (skillId: string) => Promise<void>;

  // Creation
  createSkill: (params: CreateSkillParams) => Promise<string>;

  // Eligibility
  checkEligibility: (skillId: string) => Promise<SkillEligibility | null>;
  checkAllEligibility: () => Promise<void>;

  // Enable/Disable (for installed skills)
  toggleSkill: (skillId: string) => void;
  enableSkill: (skillId: string) => void;
  disableSkill: (skillId: string) => void;

  // UI Actions
  setSearchQuery: (query: string) => void;
  setCategory: (category: SkillCategory | 'all') => void;
  setActiveTab: (tab: 'available' | 'installed') => void;
  selectSkill: (skillId: string | null) => void;

  // Selectors (computed)
  getFilteredSkills: () => SkillManifest[];
  getInstalledSkills: () => SkillManifest[];
  getInstalledCount: () => number;
  getEnabledCount: () => number;
  isSkillInstalled: (skillId: string) => boolean;
  isSkillEnabled: (skillId: string) => boolean;
  getSkillEligibility: (skillId: string) => SkillEligibility | undefined;

  clearError: () => void;
  reset: () => void;
}

// ============================================================================
// Initial State
// ============================================================================

const initialState: SkillStoreState = {
  availableSkills: [],
  lastDiscoveredAt: null,
  lastWorkingDirectory: null,
  eligibilityMap: new Map(),
  isDiscovering: false,
  isInstalling: new Set(),
  isCheckingEligibility: new Set(),
  searchQuery: '',
  selectedCategory: 'all',
  activeTab: 'available',
  selectedSkillId: null,
  error: null,
};

const DISCOVERY_CACHE_TTL_MS = 30_000;

// ============================================================================
// Store
// ============================================================================

export const useSkillStore = create<SkillStoreState & SkillStoreActions>()(
  (set, get) => ({
    ...initialState,

    // ========================================================================
    // Discovery
    // ========================================================================

    discoverSkills: async (workingDirectory, options) => {
      const force = options?.force === true;
      const normalizedWorkingDirectory = workingDirectory?.trim() || null;
      const cacheState = get();
      if (
        !force &&
        cacheState.lastDiscoveredAt !== null &&
        cacheState.lastWorkingDirectory === normalizedWorkingDirectory &&
        Date.now() - cacheState.lastDiscoveredAt < DISCOVERY_CACHE_TTL_MS
      ) {
        return;
      }

      set({ isDiscovering: true, error: null });

      try {
        const skills = await invoke<SkillManifest[]>('agent_discover_skills', {
          workingDirectory,
        });

        set({
          availableSkills: skills,
          isDiscovering: false,
          lastDiscoveredAt: Date.now(),
          lastWorkingDirectory: normalizedWorkingDirectory,
        });

        // Sync installed configs with actual managed skills
        // Remove stale configs that don't have corresponding managed skills
        // (but never remove platform configs - they are managed by discovery)
        const managedSkillNames = new Set(
          skills
            .filter((s) => s.source.type === 'managed')
            .map((s) => s.frontmatter.name)
        );
        const { installedSkillConfigs, removeInstalledSkillConfig, addInstalledSkillConfig } = useSettingsStore.getState();
        for (const config of installedSkillConfigs) {
          // Skip platform configs - they persist as long as the platform dir exists
          if (config.source === 'platform') continue;
          if (!managedSkillNames.has(config.name)) {
            removeInstalledSkillConfig(config.id);
          }
        }

        // Auto-create disabled configs for newly discovered platform skills
        const existingConfigNames = new Set(installedSkillConfigs.map((c) => c.name));
        const platformSkills = skills.filter((s) => s.source.type === 'platform');
        for (const skill of platformSkills) {
          if (!existingConfigNames.has(skill.frontmatter.name)) {
            addInstalledSkillConfig({
              id: skill.id,
              name: skill.frontmatter.name,
              enabled: false,
              installedAt: Date.now(),
              source: 'platform',
            });
          }
        }

        // Check eligibility for all skills in background
        void get().checkAllEligibility();
      } catch (error) {
        set({
          isDiscovering: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },

    // ========================================================================
    // Installation
    // ========================================================================

    installSkill: async (skillId) => {
      set((state) => ({
        isInstalling: new Set([...state.isInstalling, skillId]),
        error: null,
      }));

      try {
        await invoke('agent_install_skill', { skillId });

        // Find the skill manifest
        const skill = get().availableSkills.find((s) => s.id === skillId);
        if (skill) {
          // After install, the skill becomes managed with a new ID
          const managedSkillId = `managed:${skill.frontmatter.name}`;

          // Add to installed configs in settings store
          const config: InstalledSkillConfig = {
            id: managedSkillId,
            name: skill.frontmatter.name,
            enabled: true,
            installedAt: Date.now(),
            source: 'managed',
          };
          useSettingsStore.getState().addInstalledSkillConfig(config);
        }

        // Re-discover to update skill list
        const rediscoverWorkingDirectory = get().lastWorkingDirectory || undefined;
        await get().discoverSkills(rediscoverWorkingDirectory, { force: true });
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        set((state) => {
          const newInstalling = new Set(state.isInstalling);
          newInstalling.delete(skillId);
          return { isInstalling: newInstalling };
        });
      }
    },

    uninstallSkill: async (skillId) => {
      const { availableSkills } = get();

      // Find the skill to get its name
      const skill = availableSkills.find((s) => s.id === skillId);
      if (!skill) {
        set({ error: `Skill not found: ${skillId}` });
        return;
      }

      // Find the managed version of this skill (for uninstall)
      const managedSkillId = `managed:${skill.frontmatter.name}`;
      const managedSkill = availableSkills.find((s) => s.id === managedSkillId);

      set((state) => ({
        isInstalling: new Set([...state.isInstalling, skillId]),
        error: null,
      }));

      try {
        // Only call backend if managed skill exists on disk
        if (managedSkill) {
          await invoke('agent_uninstall_skill', { skillId: managedSkillId });
        }

        // Always clean up configs (handles stale configs)
        const settingsStore = useSettingsStore.getState();
        settingsStore.removeInstalledSkillConfig(skillId);
        settingsStore.removeInstalledSkillConfig(managedSkillId);

        // Close the details panel
        set({ selectedSkillId: null });

        // Re-discover to update skill list
        const rediscoverWorkingDirectory = get().lastWorkingDirectory || undefined;
        await get().discoverSkills(rediscoverWorkingDirectory, { force: true });
      } catch (error) {
        // Even if backend fails, try to clean up the config
        const settingsStore = useSettingsStore.getState();
        settingsStore.removeInstalledSkillConfig(skillId);
        settingsStore.removeInstalledSkillConfig(managedSkillId);

        set({
          error: error instanceof Error ? error.message : String(error),
        });

        // Re-discover to sync state
        const rediscoverWorkingDirectory = get().lastWorkingDirectory || undefined;
        await get().discoverSkills(rediscoverWorkingDirectory, { force: true });
      } finally {
        set((state) => {
          const newInstalling = new Set(state.isInstalling);
          newInstalling.delete(skillId);
          return { isInstalling: newInstalling };
        });
      }
    },

    // ========================================================================
    // Creation
    // ========================================================================

    createSkill: async (params) => {
      set({ error: null });

      try {
        const skillId = await invoke<string>('agent_create_skill', {
          name: params.name,
          description: params.description,
          emoji: params.emoji,
          category: params.category,
          content: params.content,
          requirements: params.requirements,
        });

        // Auto-install the created skill by adding to settings
        const config: InstalledSkillConfig = {
          id: skillId,
          name: params.name,
          enabled: true,
          installedAt: Date.now(),
          source: 'managed',
        };
        useSettingsStore.getState().addInstalledSkillConfig(config);

        // Refresh skill list to include the new skill
        const rediscoverWorkingDirectory = get().lastWorkingDirectory || undefined;
        await get().discoverSkills(rediscoverWorkingDirectory, { force: true });

        return skillId;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        set({ error: errorMessage });
        throw error;
      }
    },

    // ========================================================================
    // Eligibility
    // ========================================================================

    checkEligibility: async (skillId) => {
      set((state) => ({
        isCheckingEligibility: new Set([...state.isCheckingEligibility, skillId]),
      }));

      try {
        const eligibility = await invoke<SkillEligibility>('agent_check_skill_eligibility', {
          skillId,
        });

        set((state) => {
          const newMap = new Map(state.eligibilityMap);
          newMap.set(skillId, eligibility);
          return { eligibilityMap: newMap };
        });

        return eligibility;
      } catch (error) {
        console.warn(`Failed to check eligibility for ${skillId}:`, error);
        return null;
      } finally {
        set((state) => {
          const newChecking = new Set(state.isCheckingEligibility);
          newChecking.delete(skillId);
          return { isCheckingEligibility: newChecking };
        });
      }
    },

    checkAllEligibility: async () => {
      const { availableSkills, checkEligibility } = get();

      // Check in batches to avoid overwhelming the system
      const BATCH_SIZE = 5;
      for (let i = 0; i < availableSkills.length; i += BATCH_SIZE) {
        const batch = availableSkills.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map((skill) => checkEligibility(skill.id)));
      }
    },

    // ========================================================================
    // Enable/Disable
    // ========================================================================

    toggleSkill: (skillId) => {
      const { availableSkills } = get();
      const skill = availableSkills.find((s) => s.id === skillId);
      if (!skill) return;

      // Find config by name
      const { installedSkillConfigs } = useSettingsStore.getState();
      const config = installedSkillConfigs.find((c) => c.name === skill.frontmatter.name);
      if (config) {
        useSettingsStore.getState().toggleInstalledSkillEnabled(config.id);
      }
    },

    enableSkill: (skillId) => {
      const { availableSkills } = get();
      const skill = availableSkills.find((s) => s.id === skillId);
      if (!skill) return;

      const { installedSkillConfigs, addInstalledSkillConfig, updateInstalledSkillConfig } = useSettingsStore.getState();
      const config = installedSkillConfigs.find((c) => c.name === skill.frontmatter.name);
      if (config) {
        updateInstalledSkillConfig(config.id, { enabled: true });
      } else if (skill.source.type === 'platform') {
        // Auto-create config for platform skill on enable
        addInstalledSkillConfig({
          id: skill.id,
          name: skill.frontmatter.name,
          enabled: true,
          installedAt: Date.now(),
          source: 'platform',
        });
      }
    },

    disableSkill: (skillId) => {
      const { availableSkills } = get();
      const skill = availableSkills.find((s) => s.id === skillId);
      if (!skill) return;

      const { installedSkillConfigs } = useSettingsStore.getState();
      const config = installedSkillConfigs.find((c) => c.name === skill.frontmatter.name);
      if (config) {
        useSettingsStore.getState().updateInstalledSkillConfig(config.id, { enabled: false });
      }
    },

    // ========================================================================
    // UI Actions
    // ========================================================================

    setSearchQuery: (query) => {
      set({ searchQuery: query });
    },

    setCategory: (category) => {
      set({ selectedCategory: category });
    },

    setActiveTab: (tab) => {
      set({ activeTab: tab });
    },

    selectSkill: (skillId) => {
      set({ selectedSkillId: skillId });
    },

    // ========================================================================
    // Selectors
    // ========================================================================

    getFilteredSkills: () => {
      const { availableSkills, searchQuery, selectedCategory, activeTab, eligibilityMap } = get();
      const { installedSkillConfigs, skillsSettings } = useSettingsStore.getState();
      const installedNames = new Set(installedSkillConfigs.map((c) => c.name));
      const enabledPlatformNames = new Set(
        installedSkillConfigs.filter((c) => c.source === 'platform' && c.enabled).map((c) => c.name)
      );

      let skills = availableSkills;

      // Filter by tab
      if (activeTab === 'available') {
        // Show bundled + platform skills (not managed)
        // Platform skills that are disabled show here for enabling
        skills = skills.filter((s) => {
          if (s.source.type === 'managed') return false;
          // Hide enabled platform skills from available (they show in installed)
          if (s.source.type === 'platform' && enabledPlatformNames.has(s.frontmatter.name)) return false;
          return true;
        });
      } else if (activeTab === 'installed') {
        // Show managed skills + enabled platform skills
        skills = skills.filter((s) => {
          if (s.source.type === 'managed' && installedNames.has(s.frontmatter.name)) return true;
          if (s.source.type === 'platform' && enabledPlatformNames.has(s.frontmatter.name)) return true;
          return false;
        });
      }

      // Filter by search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        skills = skills.filter(
          (s) =>
            s.frontmatter.name.toLowerCase().includes(query) ||
            s.frontmatter.description.toLowerCase().includes(query) ||
            s.frontmatter.metadata?.tags?.some((t) => t.toLowerCase().includes(query))
        );
      }

      // Filter by category
      if (selectedCategory !== 'all') {
        skills = skills.filter(
          (s) => s.frontmatter.metadata?.category === selectedCategory
        );
      }

      // Filter out unavailable skills if setting is disabled
      if (!skillsSettings.showUnavailable) {
        skills = skills.filter((s) => {
          const eligibility = eligibilityMap.get(s.id);
          return !eligibility || eligibility.eligible;
        });
      }

      return skills;
    },

    getInstalledSkills: () => {
      const { availableSkills } = get();
      const { installedSkillConfigs } = useSettingsStore.getState();
      const installedNames = new Set(installedSkillConfigs.map((c) => c.name));
      const enabledPlatformNames = new Set(
        installedSkillConfigs.filter((c) => c.source === 'platform' && c.enabled).map((c) => c.name)
      );

      // Return managed skills + enabled platform skills
      return availableSkills.filter((s) => {
        if (s.source.type === 'managed' && installedNames.has(s.frontmatter.name)) return true;
        if (s.source.type === 'platform' && enabledPlatformNames.has(s.frontmatter.name)) return true;
        return false;
      });
    },

    getInstalledCount: () => {
      const { availableSkills } = get();
      const { installedSkillConfigs } = useSettingsStore.getState();
      const enabledPlatformNames = new Set(
        installedSkillConfigs.filter((c) => c.source === 'platform' && c.enabled).map((c) => c.name)
      );

      // Count managed skills + enabled platform skills
      return availableSkills.filter((s) => {
        if (s.source.type === 'managed') return true;
        if (s.source.type === 'platform' && enabledPlatformNames.has(s.frontmatter.name)) return true;
        return false;
      }).length;
    },

    getEnabledCount: () => {
      const { availableSkills } = get();
      const { installedSkillConfigs } = useSettingsStore.getState();

      // Count managed + platform skills that are enabled in configs
      const enabledNames = new Set(
        installedSkillConfigs.filter((c) => c.enabled).map((c) => c.name)
      );
      return availableSkills.filter((s) => {
        if (s.source.type === 'managed' && enabledNames.has(s.frontmatter.name)) return true;
        if (s.source.type === 'platform' && enabledNames.has(s.frontmatter.name)) return true;
        return false;
      }).length;
    },

    isSkillInstalled: (skillId) => {
      const { availableSkills } = get();
      const { installedSkillConfigs } = useSettingsStore.getState();

      const skill = availableSkills.find((s) => s.id === skillId);
      if (!skill) return false;

      // Platform skills are "installed" when their config is enabled
      if (skill.source.type === 'platform') {
        const config = installedSkillConfigs.find((c) => c.name === skill.frontmatter.name);
        return config?.enabled ?? false;
      }

      // A managed skill is installed if it exists on disk
      const managedSkillExists = availableSkills.some(
        (s) => s.source.type === 'managed' && s.frontmatter.name === skill.frontmatter.name
      );

      return managedSkillExists;
    },

    isSkillEnabled: (skillId) => {
      const { availableSkills } = get();
      const { installedSkillConfigs } = useSettingsStore.getState();

      const skill = availableSkills.find((s) => s.id === skillId);
      if (!skill) return false;

      // Look up config by name since IDs differ between bundled and managed
      const config = installedSkillConfigs.find((c) => c.name === skill.frontmatter.name);
      return config?.enabled ?? false;
    },

    getSkillEligibility: (skillId) => {
      return get().eligibilityMap.get(skillId);
    },

    clearError: () => {
      set({ error: null });
    },

    reset: () => {
      set(initialState);
    },
  })
);

// ============================================================================
// Selector Hooks
// ============================================================================

export const useAvailableSkills = () => useSkillStore((state) => state.availableSkills);
export const useIsDiscoveringSkills = () => useSkillStore((state) => state.isDiscovering);
export const useSkillSearchQuery = () => useSkillStore((state) => state.searchQuery);
export const useSkillCategory = () => useSkillStore((state) => state.selectedCategory);
export const useSkillActiveTab = () => useSkillStore((state) => state.activeTab);
export const useSelectedSkillId = () => useSkillStore((state) => state.selectedSkillId);
export const useSkillError = () => useSkillStore((state) => state.error);
