return {
	"saghen/blink.cmp",
	dependencies = {
		"rafamadriz/friendly-snippets",
		"L3MON4D3/LuaSnip",
	},
	version = "*",
	config = function()
		require("blink.cmp").setup({
			snippets = { preset = "luasnip" },
			signature = { enabled = true },
			appearance = {
				use_nvim_cmp_as_default = true,
				nerd_font_variant = "mono",
			},
			sources = {
				default = { "lsp", "path", "snippets", "buffer" },
			},
			fuzzy = { implementation = "prefer_rust_with_warning" },
			keymap = {
				preset = "enter",
				["<C-f>"] = {},
				["<C-y>"] = { "select_and_accept", "fallback" },
			},
			cmdline = {
				enabled = true,
				completion = { menu = { auto_show = true } },
				keymap = {
					["<CR>"] = { "accept_and_enter", "fallback" },
				},
			},
			completion = {
				menu = {
					border = "single",
					draw = {
						columns = {
							{ "kind_icon" },
							{ "label", "label_description", gap = 1 },
							{ "kind" },
							{ "source_name" },
						},
					},
				},
				documentation = {
					window = {
						border = "single",
					},
					auto_show = true,
					auto_show_delay_ms = 500,
				},
			},
		})
		require("luasnip.loaders.from_vscode").lazy_load()
	end,
	opts_extend = { "sources.default" },
}
