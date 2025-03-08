return {
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
