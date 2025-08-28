require("options")
require("keymap")
require("autocmd")
vim.pack.add({
	"https://github.com/nvim-lua/plenary.nvim",
	"https://github.com/nvim-tree/nvim-web-devicons",
	"https://github.com/neovim/nvim-lspconfig",
	"https://github.com/mason-org/mason.nvim",
	"https://github.com/WhoIsSethDaniel/mason-tool-installer.nvim",
	"https://github.com/nvim-treesitter/nvim-treesitter",
	{ src = "https://github.com/rebelot/kanagawa.nvim", name = "kanagawa" },
	"https://github.com/L3MON4D3/LuaSnip",
	{ src = "https://github.com/Saghen/blink.cmp", version = "v1.6.0" },
	"https://github.com/stevearc/conform.nvim",
	"https://github.com/folke/lazydev.nvim",
	"https://github.com/stevearc/oil.nvim",

	"https://github.com/romgrk/barbar.nvim",
	"https://github.com/bassamsdata/namu.nvim",
})
require("barbar").setup({
	insert_at_end = true,
})
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
require("oil").setup({
	default_file_explorer = true,
	columns = { "icon" },
	delete_to_trash = true,
	skip_confirm_for_simple_edits = true,
})
vim.keymap.set("n", "-", "<CMD>Oil<CR>", { desc = "Open parent directory" })

require("lazydev").setup()
require("kanagawa").setup({
	transparent = true,
	terminalColors = false,
	commentStyle = { italic = false },
	colors = {
		theme = {
			all = {
				ui = {
					bg_gutter = "none",
				},
			},
		},
	},
	overrides = function(colors)
		local theme = colors.theme
		return {
			NormalFloat = { bg = "none" },
			FloatBorder = { bg = "none" },
			FloatTitle = { bg = "none" },

			-- Save an hlgroup with dark background and dimmed foreground
			-- so that you can use it where your still want darker windows.
			-- E.g.: autocmd TermOpen * setlocal winhighlight=Normal:NormalDark
			NormalDark = { fg = theme.ui.fg_dim, bg = theme.ui.bg_m3 },

			-- Popular plugins that open floats will link to NormalFloat by default;
			-- set their background accordingly if you wish to keep them dark and borderless
			LazyNormal = { bg = theme.ui.bg_m3, fg = theme.ui.fg_dim },
			MasonNormal = { bg = theme.ui.bg_m3, fg = theme.ui.fg_dim },
		}
	end,
})
vim.cmd.colorscheme("kanagawa")

require("nvim-treesitter.configs").setup({
	ensure_installed = { "lua", "vim", "vimdoc" },
	sync_install = false,
	auto_install = true,
	highlight = {
		enable = true,
		additional_vim_regex_highlighting = false,
	},
})

require("mason").setup()
require("mason-tool-installer").setup({
	ensure_installed = {
		"rust-analyzer",
		"cssmodules-language-server",
		"html-lsp",
		"css-lsp",
		"tailwindcss-language-server",
		"emmet-ls",
		"stylua",
		"biome",
		"marksman",
		"typescript-language-server",
		"lua-language-server",
	},
})
vim.lsp.enable({ "lua_ls" })

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
