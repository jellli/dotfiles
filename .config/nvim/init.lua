require("lsp")
require("options")
require("autocmd")
require("keymap")
require("plugins")

require("namu").setup({
	-- Enable the modules you want
	namu_symbols = {
		enable = true,
		options = {}, -- here you can configure namu
	},
	-- Optional: Enable other modules if needed
	ui_select = { enable = false }, -- vim.ui.select() wrapper
	colorscheme = {
		enable = false,
		options = {
			-- NOTE: if you activate persist, then please remove any vim.cmd("colorscheme ...") in your config, no needed anymore
			persist = true, -- very efficient mechanism to Remember selected colorscheme
			write_shada = false, -- If you open multiple nvim instances, then probably you need to enable this
		},
	},
})

require("blink.cmp").setup({
	snippets = {
		preset = "luasnip",
	},
	signature = {
		enabled = true,
	},
	appearance = {
		use_nvim_cmp_as_default = false,
		nerd_font_variant = "mono",
	},
	sources = {
		default = { "lsp", "path", "snippets", "buffer" },
		providers = {
			cmdline = {
				min_keyword_length = 3,
			},
		},
	},
	keymap = {
		["<C-f>"] = {},
	},
	cmdline = {
		enabled = true,
		completion = {
			menu = {
				auto_show = true,
			},
		},
		keymap = {
			["<CR>"] = { "accept_and_enter", "fallback" },
		},
	},
	completion = {
		ghost_text = {
			enabled = vim.g.ai_cmp,
		},
		menu = {
			border = "none",
			scrolloff = 1,
			scrollbar = false,
			draw = {
				treesitter = { "lsp" },
				columns = {
					{ "kind_icon" },
					{
						"label",
						"label_description",
						gap = 1,
					},
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

local webdev_opts = {
	stop_after_first = true,
	"biome",
	"prettier",
}

require("conform").setup({
	formatters_by_ft = {
		lua = { "stylua" },
		rust = { "rustfmt" },
		css = webdev_opts,
		html = webdev_opts,
		scss = webdev_opts,
		markdown = webdev_opts,

		["javascript"] = webdev_opts,
		["javascriptreact"] = webdev_opts,
		["typescript"] = webdev_opts,
		["typescriptreact"] = webdev_opts,
	},
	format_on_save = {
		enabled = true,
		lsp_fallback = true,
		async = false,
	},
})
