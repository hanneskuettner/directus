import { defineInterface } from '@directus/shared/utils';
import InterfaceSelectIcon from './select-icon.vue';
import PreviewSVG from './preview.svg?raw';

export default defineInterface({
	id: 'select-icon',
	name: '$t:interfaces.select-icon.icon',
	description: '$t:interfaces.select-icon.description',
	icon: 'mood',
	component: InterfaceSelectIcon,
	types: ['string'],
	group: 'selection',
	options: [],
	recommendedDisplays: ['icon'],
	preview: PreviewSVG,
});
