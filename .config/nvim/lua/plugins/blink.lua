return {
	"L3MON4D3/LuaSnip",
	{
		"saghen/blink.cmp",
		dependencies = {
			"rafamadriz/friendly-snippets",
		},
		event = { "InsertEnter", "CmdlineEnter" },
		opts_extend = { "sources.default", "cmdline.sources", "term.sources" },
		version = "*",
		config = function()
			require("blink.cmp").setup({
				snippets = { preset = "luasnip" },
				signature = { enabled = true },
				appearance = {
					use_nvim_cmp_as_default = false,
					nerd_font_variant = "mono",
				},
				sources = {
					default = { "lsp", "path", "snippets", "buffer" },
					providers = {
						cmdline = {
							min_keyword_length = 2,
						},
					},
				},
				keymap = {
					--[[ ["<Tab>"] = {
						function()
							local tabout = require("tabout")
							return tabout.tabout()
						end,
						"snippet_forward",
						"fallback",
					},
					["<S-Tab>"] = {
						function()
							local tabout = require("tabout")
							return tabout.taboutBack()
						end,
						"snippet_backward",
						"fallback",
					}, ]]
					["<C-f>"] = {},
				},
				cmdline = {
					enabled = true,
					completion = { menu = { auto_show = true } },
					keymap = {
						["<CR>"] = {},
					},
				},
				completion = {
					list = {
						selection = {
							auto_insert = true,
						},
					},
					ghost_text = {
						enabled = vim.g.ai_cmp,
					},
					menu = {
						-- border = "none",
						scrolloff = 1,
						scrollbar = false,
						draw = {
							treesitter = { "lsp" },
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
							scrollbar = false,
						},
						auto_show = true,
						auto_show_delay_ms = 200,
					},
				},
			})
			require("luasnip.loaders.from_vscode").lazy_load()
		end,
	},
}
