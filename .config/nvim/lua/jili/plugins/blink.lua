return {
	"saghen/blink.cmp",
	dependencies = { "rafamadriz/friendly-snippets", "onsails/lspkind.nvim" },
	version = "*",
	---@module 'blink.cmp'
	---@type blink.cmp.Config
	opts = {
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
			["<C-f>"] = {},
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
					border = "rounded",
				},
				auto_show = true,
				auto_show_delay_ms = 500,
			},
		},
	},
	opts_extend = { "sources.default" },
}
