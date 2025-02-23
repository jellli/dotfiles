return {
	{
		"y3owk1n/undo-glow.nvim",
		version = "*",
		event = { "VeryLazy" },
		---@type UndoGlow.Config
		opts = {
			animation = {
				enabled = true,
				duration = 100,
			},
			highlights = {
				undo = {
					hl_color = { bg = "#48384B" },
				},
				redo = {
					hl_color = { bg = "#3B474A" },
				},
				yank = {
					hl_color = { bg = "#5A513C" },
				},
				paste = {
					hl_color = { bg = "#5A496E" },
				},
				search = {
					hl_color = { bg = "#6D4B5E" },
				},
				comment = {
					hl_color = { bg = "#6D5640" },
				},
			},
		},
		---@param _ any
		---@param opts UndoGlow.Config
		config = function(_, opts)
			local undo_glow = require("undo-glow")

			undo_glow.setup(opts)

			vim.keymap.set("n", "u", undo_glow.undo, { noremap = true, desc = "Undo with highlight" })
			vim.keymap.set("n", "U", undo_glow.redo, { noremap = true, desc = "Redo with highlight" })
			vim.keymap.set("n", "p", undo_glow.paste_below, { noremap = true, desc = "Paste below with highlight" })
			vim.keymap.set("n", "P", undo_glow.paste_above, { noremap = true, desc = "Paste above with highlight" })
			vim.keymap.set("n", "n", undo_glow.search_next, { noremap = true, desc = "Search next with highlight" })
			vim.keymap.set("n", "N", undo_glow.search_prev, { noremap = true, desc = "Search previous with highlight" })
			vim.keymap.set("n", "*", undo_glow.search_star, { noremap = true, desc = "Search * with highlight" })
			vim.keymap.set(
				{ "n", "x" },
				"gc",
				undo_glow.comment,
				{ expr = true, noremap = true, desc = "Toggle comment with highlight" }
			)

			vim.keymap.set(
				"o",
				"gc",
				undo_glow.comment_textobject,
				{ noremap = true, desc = "Comment textobject with highlight" }
			)

			vim.keymap.set(
				"n",
				"gcc",
				undo_glow.comment_line,
				{ expr = true, noremap = true, desc = "Toggle comment line with highlight" }
			)

			vim.api.nvim_create_autocmd("TextYankPost", {
				desc = "Highlight when yanking (copying) text",
				callback = require("undo-glow").yank,
			})
		end,
	},
	{
		"rachartier/tiny-inline-diagnostic.nvim",
		event = "VeryLazy", -- Or `LspAttach`
		priority = 1000, -- needs to be loaded in first
		config = function()
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
			vim.diagnostic.config({ virtual_text = false }) -- Only if needed in your configuration, if you already have native LSP diagnostics
		end,
	},
	{
		"OXY2DEV/markview.nvim",
		lazy = false,
	},
	{
		"OXY2DEV/helpview.nvim",
		lazy = false,
	},
	{
		"sphamba/smear-cursor.nvim",
		opts = {},
	},
	{
		"m4xshen/hardtime.nvim",
		dependencies = { "MunifTanjim/nui.nvim" },
		opts = {},
	},
	{
		"windwp/nvim-ts-autotag",
		config = function()
			require("nvim-ts-autotag").setup({
				opts = {
					enable_close = true, -- Auto close tags
					enable_rename = true, -- Auto rename pairs of tags
					enable_close_on_slash = true, -- Auto close on trailing </
				},
			})
		end,
	},
	{
		-- Autoclose parentheses, brackets, quotes, etc.
		"windwp/nvim-autopairs",
		event = "InsertEnter",
		config = true,
		opts = {},
	},
	{
		-- Highlight todo, notes, etc in comments
		"folke/todo-comments.nvim",
		event = "VimEnter",
		dependencies = { "nvim-lua/plenary.nvim" },
		opts = { signs = false },
	},
	{
		-- High-performance color highlighter
		"norcalli/nvim-colorizer.lua",
		config = function()
			require("colorizer").setup()
		end,
	},
	{
		"max397574/better-escape.nvim",
		config = function()
			require("better_escape").setup()
		end,
	},
}
