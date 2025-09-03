return {
	"A7Lavinraj/fyler.nvim",
	branch = "stable",
	dependencies = { "nvim-mini/mini.icons" },
	---@module 'fyler'
	---@type FylerSetupOptions
	opts = {
		explorer = {
			confirm_simple = true,
		},
		views = {
			mappings = {
				explorer = {
					["<leader>e"] = "CloseView",
					["<C-h>"] = "SelectSplit",
					["<C-v>"] = "SelectVSplit",
				},
			},
		},
	},
	keys = { {
		"-",
		function()
			require("fyler").open()
		end,
		{
			desc = "Fyler Open",
		},
	} },
	--					{ "<leader>e", function() fyler.open({ kind = "split_left_most" }) end, { desc = "Fyler Open" }},
}
