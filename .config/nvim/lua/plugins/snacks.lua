---@diagnostic disable: missing-fields
return {
	"folke/snacks.nvim",
	priority = 1000,
	lazy = false,
	---@type snacks.Config
	opts = {
		quickfile = {},
		bigfile = {},
		input = {},
		notifier = {
			top_down = false,
			margin = { top = 0, right = 1, bottom = 1 },
		},
		lazygit = {
			theme = {
				inactiveBorderColor = { fg = "Comment" },
			},
		},
		styles = {
			input = {
				backdrop = false,
				border = "single",
				title_pos = "left",
				wo = {
					winhighlight = "NormalFloat:Special,FloatBorder:FloatBorder,FloatTitle:Special",
					cursorline = false,
				},
			},
		},
	},
	keys = {
		{
			"<leader>lg",
			function()
				Snacks.lazygit()
			end,
			desc = "Lazygit",
		},
	},
}
