return {
	{ "sindrets/diffview.nvim" },
	{
		"bassamsdata/namu.nvim",
		config = function()
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
			-- === Suggested Keymaps: ===
			vim.keymap.set("n", "<leader>ds", ":Namu symbols<cr>", {
				desc = "Jump to LSP symbol",
				silent = true,
			})
			vim.keymap.set("n", "<leader>st", ":Namu colorscheme<cr>", {
				desc = "Colorscheme Picker",
				silent = true,
			})
		end,
	},
	{
		"zeioth/garbage-day.nvim",
		dependencies = "neovim/nvim-lspconfig",
		event = "VeryLazy",
		opts = {
			-- your options here
		},
	},
	{
		"romgrk/barbar.nvim",
		dependencies = {
			"lewis6991/gitsigns.nvim", -- OPTIONAL: for git status
			"nvim-tree/nvim-web-devicons", -- OPTIONAL: for file icons
		},
		init = function()
			vim.g.barbar_auto_setup = false
		end,
		opts = {
			-- lazy.nvim will automatically call setup for you. put your options here, anything missing will use the default:
			-- animation = true,
			-- insert_at_start = true,
			-- …etc.
		},
		version = "^1.0.0", -- optional: only update when a new 1.x version is released
	},
	{
		"MagicDuck/grug-far.nvim",
		config = function()
			-- optional setup call to override plugin options
			-- alternatively you can set options with vim.g.grug_far = { ... }
			require("grug-far").setup({
				-- options, see Configuration section below
				-- there are no required options atm
				-- engine = 'ripgrep' is default, but 'astgrep' or 'astgrep-rules' can
				-- be specified
			})
		end,
	},
	--[[ {
		"sphamba/smear-cursor.nvim",
		opts = { -- Default  Range
			stiffness = 0.8, -- 0.6      [0, 1]
			trailing_stiffness = 0.5, -- 0.3      [0, 1]
			distance_stop_animating = 0.5, -- 0.1      > 0
		}, 
	},]]
	{
		-- Highlight todo, notes, etc in comments
		"folke/todo-comments.nvim",
		event = "VimEnter",
		dependencies = { "nvim-lua/plenary.nvim" },
		opts = { signs = false },
	},
}
