return {
	{ "stevearc/dressing.nvim", opts = {} },
	{
		"rcarriga/nvim-notify",
		config = function()
			local nvim_notify = require("notify")
			vim.notify = nvim_notify
			nvim_notify.setup({
				render = "compact",
				stages = "static",
			})
		end,
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
	--[[ {
		"tris203/precognition.nvim",
		config = function()
			require("precognition").setup({})
		end,
	}, ]]
	--[[ {
		"kosayoda/nvim-lightbulb",
		config = function()
			require("nvim-lightbulb").setup({
				autocmd = { enabled = true },
			})
		end,
	}, ]]
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
		"OXY2DEV/helpview.nvim",
		lazy = false,
	}, ]]
	--[[ {
		"sphamba/smear-cursor.nvim",
		opts = { -- Default  Range
			stiffness = 0.8, -- 0.6      [0, 1]
			trailing_stiffness = 0.5, -- 0.3      [0, 1]
			distance_stop_animating = 0.5, -- 0.1      > 0
		},
	}, ]]
	{
		-- Highlight todo, notes, etc in comments
		"folke/todo-comments.nvim",
		event = "VimEnter",
		dependencies = { "nvim-lua/plenary.nvim" },
		opts = { signs = false },
	},
}
