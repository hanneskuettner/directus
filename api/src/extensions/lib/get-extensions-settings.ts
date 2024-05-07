import type { BundleExtension, Extension, ExtensionSettings } from '@directus/extensions';
import { randomUUID } from 'node:crypto';
import getDatabase from '../../database/index.js';
import { ExtensionsService } from '../../services/extensions.js';
import { getSchema } from '../../utils/get-schema.js';

/**
 * Loads stored settings for all extensions. Creates empty new rows in extensions tables for
 * extensions that don't have settings yet, and remove any settings for extensions that are no
 * longer installed.
 */
export const getExtensionsSettings = async ({
	local,
	module,
	registry,
}: {
	local: Map<string, Extension>;
	module: Map<string, Extension>;
	registry: Map<string, Extension>;
}) => {
	const database = getDatabase();

	const service = new ExtensionsService({
		knex: database,
		schema: await getSchema(),
	});

	const existingSettings = await service.extensionsItemService.readByQuery({ limit: -1 });

	const newSettings: ExtensionSettings[] = [];
	const removedSettingIds: string[] = [];

	const localSettings = existingSettings.filter(({ source }) => source === 'local');
	const registrySettings = existingSettings.filter(({ source }) => source === 'registry');
	const moduleSettings = existingSettings.filter(({ source }) => source === 'module');

	const updateBundleEntriesSettings = (
		extensionSettings: ExtensionSettings,
		extension: BundleExtension,
		settings: ExtensionSettings[],
	) => {
		const bundleEntriesSettings = settings.filter(({ bundle }) => bundle === extensionSettings.id);

		// Remove settings of removed bundle entries from the DB
		for (const entry of bundleEntriesSettings) {
			const entryInBundle = extension.entries.some(({ name }) => name === entry.folder);
			if (entryInBundle) continue;

			removedSettingIds.push(entry.id);
		}

		// Add new bundle entries to the settings
		for (const entry of extension.entries) {
			const settingsExist = bundleEntriesSettings.some(({ folder }) => folder === entry.name);
			if (settingsExist) continue;

			newSettings.push({
				id: randomUUID(),
				enabled: true,
				source: extensionSettings.source,
				bundle: extensionSettings.id,
				folder: entry.name,
			});
		}
	};

	const generateSettingsEntry = (folder: string, extension: Extension, source: 'local' | 'registry' | 'module') => {
		if (extension.type === 'bundle') {
			const bundleId = randomUUID();

			newSettings.push({
				id: bundleId,
				enabled: true,
				source: source,
				bundle: null,
				folder: folder,
			});

			for (const entry of extension.entries) {
				newSettings.push({
					id: randomUUID(),
					enabled: true,
					source: source,
					bundle: bundleId,
					folder: entry.name,
				});
			}
		} else {
			newSettings.push({
				id: randomUUID(),
				enabled: true,
				source: source,
				bundle: null,
				folder: folder,
			});
		}
	};

	for (const [folder, extension] of local.entries()) {
		const existingSettings = localSettings.find((settings) => settings.folder === folder);

		if (existingSettings && extension.type === 'bundle') {
			updateBundleEntriesSettings(existingSettings, extension, localSettings);
			continue;
		}

		const settingsForName = localSettings.find((settings) => settings.folder === extension.name);

		/*
		 * TODO: Consider removing this in follow-up versions after v10.10.0
		 *
		 * Previously, the package name (from package.json) was used to identify
		 * local extensions - now it's the folder name.
		 * If those two are different, we need to check for existing settings
		 * with the package name, too. On a match and if there's no other local extension
		 * with such a folder name, these settings can be taken over with the folder updated.
		 */
		if (settingsForName && !local.has(extension.name)) {
			await service.extensionsItemService.updateOne(settingsForName.id, { folder });
			continue;
		}

		generateSettingsEntry(folder, extension, 'local');
	}

	for (const [folder, extension] of module.entries()) {
		const existingSettings = moduleSettings.find((settings) => settings.folder === folder);

		if (!existingSettings) {
			generateSettingsEntry(folder, extension, 'module');
		} else if (extension.type === 'bundle') {
			updateBundleEntriesSettings(existingSettings, extension, moduleSettings);
		}
	}

	for (const [folder, extension] of registry.entries()) {
		const existingSettings = registrySettings.find((settings) => settings.folder === folder);

		if (!existingSettings) {
			generateSettingsEntry(folder, extension, 'registry');
		} else if (extension.type === 'bundle') {
			updateBundleEntriesSettings(existingSettings, extension, registrySettings);
		}
	}

	if (removedSettingIds.length > 0) {
		await service.extensionsItemService.deleteMany(removedSettingIds);
	}

	if (newSettings.length > 0) {
		await service.extensionsItemService.createMany(newSettings);
	}

	return [...existingSettings.filter(({ id }) => !removedSettingIds.includes(id)), ...newSettings];
};
