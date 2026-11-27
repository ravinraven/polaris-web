import { defineStore, acceptHMRUpdate } from "pinia";
import { ShallowRef, shallowRef } from "vue";

import { createApiKey, deleteApiKey, getApiKeys } from "@/api/endpoints";
import { ApiKey, CreatedApiKey } from "@/api/dto";

// Only the key listing lives here. The secret of a newly created key is handed back to the
// caller and deliberately not stored, so it disappears as soon as the page is left.
export const useApiKeysStore = defineStore("apiKeys", () => {

	const listing: ShallowRef<ApiKey[] | undefined> = shallowRef(undefined);

	async function refresh() {
		listing.value = await getApiKeys();
	}

	async function create(label: string): Promise<CreatedApiKey> {
		const created = await createApiKey({ label });
		await refresh();
		return created;
	}

	async function revoke(id: string) {
		await deleteApiKey(id);
		await refresh();
	}

	return {
		listing,

		create,
		refresh,
		revoke,
	};
});

if (import.meta.hot) {
	import.meta.hot.accept(acceptHMRUpdate(useApiKeysStore, import.meta.hot));
}
