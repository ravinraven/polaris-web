<template>
	<div class="flex flex-col min-h-0" data-pw="api-keys-page">
		<div class="flex flex-col gap-8 grow overflow-y-auto -mx-4 px-4">

			<p class="max-w-3xl text-sm text-ls-600 dark:text-ds-300">
				API keys let other apps that support the OpenSubsonic API sign in as you without knowing your
				password. A key is shown only once, when you create it. If you lose it, revoke it and create a new one.
			</p>

			<Section v-if="createdKey" class="flex flex-col gap-4 !border-accent-500" data-pw="created-key">
				<div class="font-medium text-ls-700 dark:text-ds-200">
					Copy your new key for "{{ createdKey.label }}" now
				</div>
				<div class="text-sm text-ls-600 dark:text-ds-300">
					You will not be able to see it again.
				</div>
				<code data-pw="new-key-value" class="block break-all select-all rounded-md p-4 font-mono text-sm
						text-ls-800 dark:text-ds-100
						bg-ls-100 dark:bg-ds-800" v-text="createdKey.key" />
				<div class="flex gap-4 items-center">
					<Button :label="copied ? 'Copied' : 'Copy'" :icon="copied ? 'check' : 'content_copy'"
						severity="secondary" size="base" data-pw="copy-key" @click="copyKey" />
					<Button label="Done" icon="done" severity="primary" size="base" data-pw="dismiss-key"
						@click="dismissCreatedKey" />
					<span v-if="copyFailed" class="text-sm text-ls-500 dark:text-ds-400">
						Could not copy automatically. Select the key above and copy it.
					</span>
				</div>
			</Section>

			<Section v-for="key in apiKeys.listing" :key="key.id" data-pw="api-key"
				class="flex gap-4 items-center justify-between">
				<div class="flex gap-4 items-center min-w-0">
					<span class="material-icons-round
                        rounded-full p-2
                        flex items-center justify-center
                        text-ls-500 dark:text-ds-400
                        bg-ls-200 dark:bg-ds-700" v-text="'vpn_key'" />
					<div class="min-w-0">
						<div v-text="key.label" data-pw="api-key-label"
							class="font-medium truncate text-ls-600 dark:text-ds-300" />
						<div class="text-xs text-ls-500 dark:text-ds-400">
							Created {{ formatDate(key.created_at) }} &middot;
							{{ key.last_used_at ? 'Last used ' + formatDate(key.last_used_at) : 'Never used' }}
						</div>
					</div>
				</div>

				<div class="flex gap-2 shrink-0">
					<template v-if="confirmingRevoke == key.id">
						<Button label="Revoke" icon="delete" severity="danger" size="base" data-pw="confirm-revoke"
							@click="revoke(key.id)" />
						<Button label="Cancel" severity="tertiary" size="base" @click="confirmingRevoke = undefined" />
					</template>
					<Button v-else label="Revoke" icon="delete" severity="secondary" size="base"
						data-pw="revoke-api-key" @click="confirmingRevoke = key.id" />
				</div>
			</Section>

			<p v-if="apiKeys.listing && !apiKeys.listing.length && !creating" data-pw="no-api-keys"
				class="text-sm italic text-ls-500 dark:text-ds-400">
				You have no API keys.
			</p>

			<Button v-if="!creating" label="Create API Key" icon="vpn_key" severity="secondary" size="xl"
				data-pw="add-api-key" class="self-start" @click="beginCreate" />

			<Section v-else class="flex flex-col gap-8">
				<form @submit.prevent="endCreate" class="flex flex-col gap-8">
					<InputText v-model="newLabel" id="api-key-label-input" label="Label (eg. the name of the app)"
						icon="label" autofocus class="w-80" :error="tooLong" />
					<div class="flex gap-4 self-end">
						<Button label="Cancel" severity="tertiary" size="xl" @click="creating = false" />
						<Button label="Create Key" type="submit" icon="vpn_key" severity="primary" size="xl"
							data-pw="create-api-key" :disabled="!validLabel" />
					</div>
				</form>
			</Section>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, Ref } from "vue";

import { CreatedApiKey } from "@/api/dto";
import Button from "@/components/basic/Button.vue";
import InputText from "@/components/basic/InputText.vue";
import Section from "@/components/basic/Section.vue";
import { useApiKeysStore } from "@/stores/apiKeys";

const MAX_LABEL_LENGTH = 100;

const apiKeys = useApiKeysStore();

onMounted(() => {
	apiKeys.refresh();
});

// The secret lives only in this component, so leaving the page discards it.
const createdKey: Ref<CreatedApiKey | undefined> = ref(undefined);
const copied = ref(false);
const copyFailed = ref(false);
const creating = ref(false);
const newLabel = ref("");
const confirmingRevoke: Ref<string | undefined> = ref(undefined);

onUnmounted(() => {
	createdKey.value = undefined;
});

const tooLong = computed(() => newLabel.value.trim().length > MAX_LABEL_LENGTH);
const validLabel = computed(() => newLabel.value.trim().length > 0 && !tooLong.value);

function beginCreate() {
	newLabel.value = "";
	creating.value = true;
}

async function endCreate() {
	if (!validLabel.value) {
		return;
	}
	createdKey.value = await apiKeys.create(newLabel.value.trim());
	copied.value = false;
	copyFailed.value = false;
	creating.value = false;
}

function dismissCreatedKey() {
	createdKey.value = undefined;
}

async function copyKey() {
	if (!createdKey.value) {
		return;
	}
	try {
		await navigator.clipboard.writeText(createdKey.value.key);
		copied.value = true;
		copyFailed.value = false;
	} catch {
		// The clipboard API needs a secure context (https or localhost).
		copied.value = false;
		copyFailed.value = true;
	}
}

async function revoke(id: string) {
	confirmingRevoke.value = undefined;
	await apiKeys.revoke(id);
}

function formatDate(secondsSinceEpoch: number): string {
	return new Date(secondsSinceEpoch * 1000).toLocaleDateString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}
</script>
