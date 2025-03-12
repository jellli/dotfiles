return {
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
	{
		"OXY2DEV/helpview.nvim",
		lazy = false,
	},
	-- {
	-- 	"sphamba/smear-cursor.nvim",
	-- 	opts = { -- Default  Range
	-- 		stiffness = 0.8, -- 0.6      [0, 1]
	-- 		trailing_stiffness = 0.5, -- 0.3      [0, 1]
	-- 		distance_stop_animating = 0.5, -- 0.1      > 0
	-- 	},
	-- },
	{
		-- Highlight todo, notes, etc in comments
		"folke/todo-comments.nvim",
		event = "VimEnter",
		dependencies = { "nvim-lua/plenary.nvim" },
		opts = { signs = false },
	},
	{
		"aidancz/buvvers.nvim",
		config = function()
			require("buvvers").setup()
		end,
	},
}
