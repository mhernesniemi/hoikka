/**
 * Hoikka store configuration — the one file that defines what this store
 * sells and how it behaves. Project-owned in both distribution modes.
 *
 * Everything has a sensible default; delete any section you don't need to
 * change. Custom fields declared on product types, content-page templates and
 * collections get admin form inputs and typed storefront access automatically.
 */
import { defineHoikkaConfig } from "@hoikka/core/config/index";
import { stripe, mockPayment, flatRate } from "@hoikka/core/config/providers";

export default defineHoikkaConfig({
	store: {
		name: "Hoikka",
		supportEmail: "privacy@hoikka.dev",
		emailFrom: "noreply@example.com"
	},
	locales: {
		defaultLanguage: "en",
		languages: [
			{ code: "en", name: "English" },
			{ code: "fi", name: "Finnish" }
		],
		dateLocale: "fi-FI"
	},
	currency: { code: "EUR", locale: "fi-FI" },
	tax: {
		defaultRate: "standard",
		rates: [
			{ code: "standard", rate: 0.255, name: "Standard VAT (25.5%)" },
			{ code: "food", rate: 0.135, name: "Food VAT (13.5%)" },
			{ code: "books", rate: 0.135, name: "Books VAT (13.5%)" },
			{ code: "zero", rate: 0, name: "Zero VAT (0%)" }
		]
	},
	countries: { default: "FI", shipping: ["FI"] },
	payments: [stripe(), mockPayment()],
	shipping: [flatRate({ amount: 590, estimatedDeliveryDays: 5 })],
	productTypes: {
		physical: {
			label: "Physical",
			fields: [
				{ key: "material", label: "Material", type: "text" },
				{
					key: "careInstructions",
					label: "Care instructions",
					type: "richtext",
					help: "Shown on the product page under the description"
				},
				{ key: "weightGrams", label: "Weight (g)", type: "number" }
			]
		}
		// Enable digital products (delivered as downloads after payment):
		// digital: { label: "Digital", fields: [] }
	},
	contentPages: {
		templates: {
			default: { label: "Default", fields: [] },
			campaign: {
				label: "Campaign",
				fields: [
					{ key: "heroImage", label: "Hero image", type: "image" },
					{ key: "endsAt", label: "Campaign ends", type: "date" }
				]
			}
		}
	},
	collections: {
		fields: [{ key: "subtitle", label: "Subtitle", type: "text" }]
	}
});
