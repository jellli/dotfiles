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
	-- "https://github.com/stevearc/oil.nvim",

	"https://github.com/romgrk/barbar.nvim",
	"https://github.com/bassamsdata/namu.nvim",

	"https://github.com/rachartier/tiny-inline-diagnostic.nvim",
	"https://github.com/Wansmer/treesj",
	"https://github.com/keaising/im-select.nvim",
	"https://github.com/folke/flash.nvim",
	"https://github.com/nvim-mini/mini.nvim",

	"https://github.com/JoosepAlviste/nvim-ts-context-commentstring",
	"https://github.com/numToStr/Comment.nvim",

	"https://github.com/dmtrKovalenko/fff.nvim",
	"https://github.com/A7Lavinraj/fyler.nvim",
	"https://github.com/kdheepak/lazygit.nvim",

	"https://github.com/oribarilan/lensline.nvim",
	"https://github.com/windwp/nvim-ts-autotag",
	"https://github.com/windwp/nvim-autopairs",
	"https://github.com/rafamadriz/friendly-snippets",
	"https://github.com/christoomey/vim-tmux-navigator",
})

require("nvim-autopairs").setup({})
require("nvim-ts-autotag").setup({
	opts = {
		-- Defaults
		enable_close = true, -- Auto close tags
		enable_rename = true, -- Auto rename pairs of tags
		enable_close_on_slash = false, -- Auto close on trailing </
	},
	-- Also override individual filetype configs, these take priority.
	-- Empty by default, useful if one of the "opts" global settings
	-- doesn't work well in a specific filetype
	per_filetype = {
		["html"] = {
			enable_close = false,
		},
	},
})

-- require("lensline").setup()
local fyler = require("fyler")
fyler.setup({
	explorer = {
		confirm_simple = true,
	},
})

vim.g.fff = {
	lazy_sync = true, -- start syncing only when the picker is open
	debug = {
		enabled = true,
		show_scores = true,
	},
}

-- stylua: ignore start
vim.keymap.set("n", "<leader>e", function() fyler.open({ kind = "split_left_most" }) end, { desc = "Fyler Open" })
vim.keymap.set("n", "-", function() fyler.open() end, { desc = "Fyler Open" })
vim.keymap.set("n", "<leader>lg", "<cmd>LazyGit<cr>", { desc = "LazyGit" })
vim.keymap.set("n", "ff", function() require("fff").find_files() end, { desc = "FFFind files" })
vim.keymap.set("n", "<leader><leader>", function() require("fff").find_files() end, { desc = "FFFind files" })
vim.keymap.set("n", "<c-h>", "<cmd><C-U>TmuxNavigateLeft<cr>")
vim.keymap.set("n","<c-j>", "<cmd><C-U>TmuxNavigateDown<cr>")
vim.keymap.set("n", "<c-k>", "<cmd><C-U>TmuxNavigateUp<cr>")
vim.keymap.set("n", "<c-l>", "<cmd><C-U>TmuxNavigateRight<cr>" )
-- stylua: ignore end

local opts = { noremap = true, silent = true }
---@diagnostic disable-next-line: missing-fields
require("Comment").setup({
	padding = true,
	sticky = true,
	pre_hook = require("ts_context_commentstring.integrations.comment_nvim").create_pre_hook(),
})
-- stylua: ignore start
vim.keymap.set( "v", "<C-_>", "<esc><cmd>lua require('Comment.api').toggle.linewise(vim.fn.visualmode())<cr>", opts)
vim.keymap.set("v", "<C-/>", "<esc><cmd>lua require('Comment.api').toggle.linewise(vim.fn.visualmode())<cr>", opts)
vim.keymap.set({ "n", "i" }, "<C-_>", require("Comment.api").toggle.linewise.current, opts)
vim.keymap.set({ "n", "i" }, "<C-/>", require("Comment.api").toggle.linewise.current, opts)
-- stylua: ignore end
require("treesj").setup({})
require("mini.ai").setup({ n_lines = 500 })
require("mini.surround").setup()
require("im_select").setup({})
require("tiny-inline-diagnostic").setup({
	preset = "ghost",
	-- transparent_bg = true,
	options = {
		show_source = true,
		show_all_diags_on_cursorline = true,
		multilines = {
			enabled = true,
			always_show = true,
		},
	},
})

--[[ require("oil").setup({
	default_file_explorer = true,
	columns = { "icon" },
	delete_to_trash = true,
	skip_confirm_for_simple_edits = true,
}) ]]
require("barbar").setup({
	insert_at_end = true,
})

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
